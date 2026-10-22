import './style.css';
import './soft-theme.css';
import './glass-controls.css';
import './interaction-details.css';
import './sliders.css';
import './devices.css';
import './control-panel.css';
import * as THREE from 'three';
import { version } from '../package.json';
import { isOpening } from './catalog.js';
import { clone, exampleProject, round, snap, totalArea, validateProject, alignOpening, overlaps } from './model.js';
import { createScene } from './scene.js';
import { calibratePlan } from './plan.js';
import { baseLevel, levelLimit, levelsOf, levelOf, onLevel, sameLevel } from './levels.js';
import { roomCandidate, roomEditError, applyRoomEdit } from './room-edit.js';
import { createAmbienceUI } from './ambience-ui.js';
import { createFeedback } from './interaction-feedback.js';
import { $, esc, fmt, toast, modal, download, scrollHints } from './app/dom.js';
import { icon } from './app/icons.js';
import { shell, helpDialog } from './app/layout.js';
import { createHistory } from './app/history.js';
import { loadSavedProject, createAutosave } from './app/storage.js';
import { createLibrary } from './app/library.js';
import { createInspector } from './app/inspector.js';
import { createSelectionActions } from './app/selection-actions.js';
import { createDevices } from './app/devices.js';
import { createAiBridge } from './app/ai-bridge.js';
import { createAutomations } from './app/automations.js';
import { applyScene } from './scenes.js';
import { createDeviceTip } from './app/device-tip.js';
import { createControlPanel } from './app/control-panel.js';

const saved = loadSavedProject(exampleProject());
const state = {
  project: saved.project,
  selected: null,
  category: 'Todos',
  query: '',
  tab: 'objects',
  view: '3d',
  snapping: true,
  drawing: false,
  // Herramienta de dos clics activa: 'room' dibuja una habitación, 'calibrate' mide el plano.
  tool: 'room',
  // Piso que se edita; no se guarda en el proyecto.
  level: baseLevel,
  drawStart: null,
  planOrigin: null,
  carryFurniture: true,
  walkLocked: false,
  control: false,
  energy: false,
  roomDragOriginal: null
};
const history = createHistory();
const persist = createAutosave(() => state.project);
const ctx = { state, actions: {} };
let selectionActions = null, library = null, inspector = null;

$('#app').innerHTML = shell(state.project, version);

function checkpoint() {
  history.record(clone(state.project));
}

// Tras deshacer o borrar un piso, el piso activo puede haber dejado de existir.
function syncLevel() {
  if (levelsOf(state.project).some(l => l.id === state.level)) return;
  state.level = baseLevel;
  ctx.scene.setLevel(baseLevel);
}

function setLevel(id) {
  if (id === state.level) return;
  state.level = id;
  const target = state.project.items.find(o => o.id === state.selected) || state.project.rooms.find(r => r.id === state.selected);
  if (target && levelOf(target) !== id) state.selected = null;
  ctx.scene.setLevel(id);
  inspector.render();
  renderRooms();
  selectionActions.render();
  if (state.tab === 'rooms') library.render();
}

function addLevel() {
  const levels = levelsOf(state.project);
  if (levels.length >= levelLimit) { toast(`Esta versión admite hasta ${levelLimit} pisos.`); return; }
  checkpoint();
  const id = crypto.randomUUID();
  // El piso nuevo parte con el contorno del piso activo: mismas habitaciones, sin muebles.
  const rooms = onLevel(state.project, state.level).rooms.map(r => ({ ...clone(r), id: crypto.randomUUID(), level: id }));
  state.project.levels = [...levels, { id, name: `Piso ${levels.length + 1}` }];
  state.project.rooms.push(...rooms);
  state.level = id;
  state.selected = null;
  ctx.scene.setLevel(id);
  changed();
  toast(rooms.length ? `Piso ${levels.length + 1} creado con el contorno del piso de abajo. Ajusta o elimina sus habitaciones.` : `Piso ${levels.length + 1} creado. Dibuja sus habitaciones.`);
}

function deleteLevel(id) {
  const level = levelsOf(state.project).find(l => l.id === id);
  if (!level || id === baseLevel) return;
  const view = onLevel(state.project, id);
  modal(`
   <h2>Eliminar ${esc(level.name)}</h2>
   <p>Se eliminarán sus ${view.rooms.length} habitaciones y ${view.items.length} objetos. Deshacer lo recupera.</p>
   <div class="dialog-actions"><button data-close class="secondary">Cancelar</button><button id="confirm-level" class="danger">Eliminar piso</button></div>`, () => {
    $('#confirm-level').onclick = () => {
      $('#dialog').close();
      checkpoint();
      const { project } = state;
      project.rooms = project.rooms.filter(r => levelOf(r) !== id);
      project.items = project.items.filter(i => levelOf(i) !== id);
      project.levels = project.levels.filter(l => l.id !== id);
      if (project.levels.length === 1) delete project.levels;
      state.selected = null;
      changed();
    };
  });
}

function renameLevel(id, name) {
  const level = levelsOf(state.project).find(l => l.id === id);
  if (!level || !name.trim() || name.trim() === level.name) return;
  checkpoint();
  if (!state.project.levels) state.project.levels = [{ ...level }];
  state.project.levels.find(l => l.id === id).name = name.trim().slice(0, 60);
  changed();
}

function changed() {
  syncLevel();
  ctx.devices.applyLive();
  ctx.scene.rebuild(state.project, state.selected);
  inspector.render();
  renderRooms();
  renderStats();
  selectionActions.render();
  if (state.tab === 'rooms') library.render();
  persist();
  ctx.aiBridge?.publishScenes();
  ctx.feedback.play('place');
}

// Activa una escena como un solo paso de Deshacer; los objetos vinculados envían el cambio a sus equipos.
function activateScene(scene, message = `Escena «${scene.name}» activada.`) {
  if (!applyScene(clone(state.project), scene).length) { toast(`La casa ya está en «${scene.name}».`); return; }
  checkpoint();
  ctx.devices.sendMany(applyScene(state.project, scene));
  changed();
  toast(message);
}

function select(id) {
  if (id && id !== state.selected) ctx.feedback.play();
  // Elegir algo de otro piso (por ejemplo desde la lista de luces) cambia al piso donde está.
  const target = state.project.items.find(o => o.id === id) || state.project.rooms.find(r => r.id === id);
  if (target && levelOf(target) !== state.level) { state.level = levelOf(target); ctx.scene.setLevel(state.level); if (state.tab === 'rooms') library.render(); }
  state.selected = id;
  if (state.control) ctx.controlPanel.focus(id);
  ctx.scene.setSelection(id);
  inspector.render();
  renderRooms();
  selectionActions.render();
}

ctx.scene = createScene($('#scene'), {
  select,
  hover(id, x, y) { showDeviceTip(id && !state.drawing ? state.project.items.find(o => o.id === id) : null, x, y); },
  walkLock(locked) {
    state.walkLocked = locked;
    $('#walk-overlay').hidden = state.view !== 'walk' || locked;
    $('#walk-reticle').hidden = state.view !== 'walk' || !locked;
  },
  levelChanged(id) { state.level = id; renderRooms(); },
  isOpen: id => ctx.devices?.isOpen(id),
  walkUnavailable() { toast('El recorrido necesita espacio libre y paredes de al menos 1,85 m.'); },
  isDrawing: () => state.drawing,
  startDrag: checkpoint,
  move(id, x, z) {
    if (state.control) return;
    const item = state.project.items.find(o => o.id === id);
    item.x = snap(x, state.snapping);
    item.z = snap(z, state.snapping);
    if (isOpening(item)) {
      alignOpening(item, state.project);
      ctx.scene.rebuild(state.project, id);
    } else ctx.scene.moveItem(item);
    inspector.render();
  },
  endDrag() { renderStats(); persist(); },
  startPlanDrag() { checkpoint(); state.planOrigin = { x: state.project.plan.x, z: state.project.plan.z }; },
  movePlan(dx, dz) {
    const plan = state.project.plan;
    plan.x = snap(state.planOrigin.x + dx, state.snapping);
    plan.z = snap(state.planOrigin.z + dz, state.snapping);
    ctx.scene.plan(plan);
  },
  endPlanDrag() { state.planOrigin = null; persist(); if (state.tab === 'rooms') library.render(); },
  startRoomDrag() { state.roomDragOriginal = clone(state.project); },
  editRoom(id, handle, dx, dz) {
    if (state.control) return 'En modo control no se edita la casa';
    const original = state.roomDragOriginal;
    if (!original) return null;
    const candidate = roomCandidate(original, id, handle, dx, dz, state.snapping);
    const error = roomEditError(original, candidate);
    if (error) return error;
    state.project = applyRoomEdit(original, id, candidate, state.carryFurniture);
    ctx.scene.rebuild(state.project, id);
    inspector.render();
    renderRooms();
    renderStats();
    return null;
  },
  endRoomDrag(cancel) {
    const original = state.roomDragOriginal;
    if (!original) return;
    state.roomDragOriginal = null;
    if (cancel) { state.project = original; changed(); return; }
    if (JSON.stringify(original) !== JSON.stringify(state.project)) {
      history.record(original);
      changed();
    } else renderStats();
  },
  drawPoint(p) {
    if (!p) return;
    if (state.tool === 'calibrate') { calibrationPoint(p); return; }
    const point = { x: snap(p.x, state.snapping), z: snap(p.z, state.snapping) };
    const start = state.drawStart;
    if (!start) {
      state.drawStart = point;
      $('#drawing-hint').textContent = 'Ahora marca la esquina opuesta · Esc para cancelar';
      return;
    }
    const w = round(Math.abs(point.x - start.x)), d = round(Math.abs(point.z - start.z));
    if (w < .5 || d < .5) { toast('La habitación debe medir al menos 50 cm por lado.'); return; }
    const room = { id: crypto.randomUUID(), name: 'Nueva habitación', x: round((point.x + start.x) / 2), z: round((point.z + start.z) / 2), w, d, color: '#c5ad8e', ...(state.level !== baseLevel ? { level: state.level } : {}) };
    if (state.project.rooms.some(r => sameLevel(r, room) && overlaps({ ...r, rotation: 0 }, { ...room, rotation: 0 }))) {
      toast('Las habitaciones no pueden superponerse. Marca otra esquina o pulsa Esc.');
      return;
    }
    checkpoint();
    state.project.rooms.push(room);
    state.selected = room.id;
    stopDrawing();
    changed();
    toast('Habitación creada. Puedes ajustar sus medidas a la derecha.');
  },
  pointer(p) {
    if (p && state.drawing && state.drawStart) {
      if (state.tool === 'calibrate') ctx.scene.ghost(state.drawStart, p, true);
      else ctx.scene.ghost(state.drawStart, { x: snap(p.x, state.snapping), z: snap(p.z, state.snapping) });
    }
  },
  frame(camera, rect) {
    // El primer frame del motor ocurre antes de montar la barra contextual.
    selectionActions?.position(camera, rect);
    if (state.view !== '2d') return;
    for (const label of $('#room-labels').children) {
      const room = state.project.rooms.find(r => r.id === label.dataset.room);
      if (!room) continue;
      const pos = new THREE.Vector3(room.x, .1, room.z).project(camera);
      label.style.transform = `translate(${(pos.x + 1) * rect.width / 2}px,${(-pos.y + 1) * rect.height / 2}px) translate(-50%,-50%)`;
    }
  }
});
// La geometría y la iluminación son independientes del archivo de proyecto.
ctx.scene.rebuild(state.project);

const ambienceUI = createAmbienceUI(ctx.scene, icon);
const soundButton = document.createElement('button');
soundButton.id = 'sound-toggle';
$('.statusbar>div:last-child').prepend(soundButton);
ctx.feedback = createFeedback(soundButton);
$('#ambience-dock').addEventListener('click', event => { if (event.target.closest('[data-mood]')) ctx.feedback.play('place'); });
$('#ambience-dock').addEventListener('change', event => { if (event.target.matches('input[type="range"]')) ctx.feedback.play(); });
// Botones − / + de los sliders: un paso, con los mismos eventos que arrastrar y soltar.
document.addEventListener('click', event => {
  const button = event.target.closest('.range-step');
  const range = button?.parentElement.querySelector('input[type="range"]');
  if (!range || range.disabled) return;
  const before = range.value;
  if (button.dataset.step > 0) range.stepUp(); else range.stepDown();
  if (range.value === before) return;
  range.dispatchEvent(new Event('input', { bubbles: true }));
  range.dispatchEvent(new Event('change', { bubbles: true }));
});

const focusButton = document.createElement('button');
focusButton.id = 'focus-mode';
focusButton.className = 'icon-button';
focusButton.innerHTML = icon('panels');
focusButton.title = 'Ocultar paneles laterales';
focusButton.setAttribute('aria-label', 'Ocultar paneles laterales');
focusButton.setAttribute('aria-pressed', 'false');
$('.tool-group').prepend(focusButton);
focusButton.onclick = () => {
  const active = $('.workspace').classList.toggle('focus-mode');
  focusButton.setAttribute('aria-pressed', String(active));
  focusButton.title = active ? 'Mostrar paneles laterales' : 'Ocultar paneles laterales';
  focusButton.setAttribute('aria-label', focusButton.title);
  ctx.feedback.play();
};

Object.assign(ctx.actions, { checkpoint, changed, select, activateScene, setView, setLevel, addLevel, deleteLevel, renameLevel, startDrawing, startCalibration, rotateItem, duplicateItem, deleteSelected });
selectionActions = createSelectionActions(ctx);
const showDeviceTip = createDeviceTip($('.viewport'), ctx);
library = createLibrary(ctx);
inspector = createInspector(ctx);
ctx.controlPanel = createControlPanel(ctx);
ctx.devices = createDevices(ctx, {
  // Un estado real llegó desde la casa: se refleja sin crear un paso de historial.
  onLiveChange(itemIds) {
    // Reconstruir crea o retira las fuentes puntuales de las lámparas que cambiaron de encendido.
    const interacting = selectionActions.isInteracting();
    if (itemIds.length && !interacting) ctx.scene.rebuild(state.project, state.selected);
    if (!interacting) selectionActions.render();
    if (!$('#inspector-content').contains(document.activeElement)) inspector.render();
    renderRooms();
    renderStats();
    if (state.energy) ctx.scene.setHeat(ctx.devices.roomPower());
    if (itemIds.length) persist();
  },
  onContact: (itemIds, open) => ctx.automations?.contact(itemIds, open)
});
ctx.automations = createAutomations(ctx);

// Asistentes de IA (MCP) y menú de la bandeja de Windows.
ctx.aiBridge = createAiBridge(ctx);

function renderRooms() {
  const { selected } = state, project = onLevel(state.project, state.level);
  const levels = levelsOf(state.project);
  const climate = r => ctx.devices?.roomSensors(r.id) || '';
  $('#room-chips').innerHTML = levels.map(l => `<button data-level="${esc(l.id)}" class="level-chip ${l.id === state.level ? 'active' : ''}" title="Ver ${esc(l.name)}">${icon('layers', 13)} ${esc(l.name)}</button>`).join('') +
    `<button data-add-level class="level-chip" title="Agregar un piso" aria-label="Agregar un piso">${icon('plus', 13)}</button><span class="tool-divider"></span>` +
    `<button data-room="" class="${!selected ? 'active' : ''}">${icon('home', 14)} Toda la casa</button>` +
    project.rooms.map(r => `<button data-room="${esc(r.id)}" class="${selected === r.id ? 'active' : ''}">${esc(r.name)}${climate(r) ? ` <small class="room-sensor">${esc(climate(r))}</small>` : ''}</button>`).join('');
  $('#room-chips').querySelectorAll('[data-room]').forEach(b => b.onclick = () => select(b.dataset.room || null));
  $('#room-chips').querySelectorAll('[data-level]').forEach(b => b.onclick = () => setLevel(b.dataset.level));
  $('#room-chips').querySelector('[data-add-level]').onclick = addLevel;
  $('#room-labels').innerHTML = project.rooms.map(r => `<span class="room-label" data-room="${esc(r.id)}">${esc(r.name)}<small>${fmt(r.w * r.d)} m²${climate(r) ? ` · ${esc(climate(r))}` : ''}</small></span>`).join('');
  $('#room-labels').hidden = state.view !== '2d';
}

function renderStats() {
  const { project } = state;
  const power = Object.values(ctx.devices?.roomPower() || {});
  $('#energy-total').hidden = !power.length;
  $('#energy-total').innerHTML = `${icon('bolt', 12)} ${fmt(Math.round(power.reduce((a, b) => a + b, 0)))} W en la casa`;
  ambienceUI.refresh(project);
  $('#project-stats').textContent = `${fmt(totalArea(project))} m² · ${project.rooms.length} espacios · ${project.items.length} objetos`;
  $('#undo').disabled = !history.canUndo;
  $('#redo').disabled = !history.canRedo;
}

function undo(redo = false) {
  const previous = redo ? history.redo(clone(state.project)) : history.undo(clone(state.project));
  if (!previous) return;
  state.project = previous;
  // La selección se conserva si el objeto o la habitación sigue existiendo.
  if (![...state.project.items, ...state.project.rooms].some(o => o.id === state.selected)) state.selected = null;
  $('#project-name').value = state.project.name;
  stopDrawing();
  changed();
  if (state.tab === 'rooms') library.render();
  toast(redo ? 'Cambio rehecho.' : 'Cambio deshecho.', { label: redo ? 'Deshacer' : 'Rehacer', run: () => undo(!redo) });
}

function rotateItem() {
  const item = state.project.items.find(o => o.id === state.selected);
  if (!item) return;
  if (isOpening(item)) { toast('Las puertas y ventanas se orientan automáticamente a la pared.'); return; }
  checkpoint();
  item.rotation = (item.rotation + 90) % 360;
  changed();
}

function duplicateItem() {
  const item = state.project.items.find(o => o.id === state.selected);
  if (!item) return;
  checkpoint();
  const copy = { ...clone(item), id: crypto.randomUUID(), x: round(item.x + .4), z: round(item.z + .4) };
  if (isOpening(copy)) alignOpening(copy, state.project);
  state.project.items.push(copy);
  state.selected = copy.id;
  changed();
}

// Mover con las flechas: 10 cm (1 cm sin ajuste a la cuadrícula, 50 cm con Shift). Las pulsaciones
// seguidas sobre el mismo objeto cuentan como un solo paso de Deshacer.
let lastNudge = { id: null, time: 0 };
function nudgeItem(arrow, large) {
  const item = state.project.items.find(o => o.id === state.selected);
  if (!item) return false;
  const { right, up } = ctx.scene.screenAxes();
  const step = large ? .5 : state.snapping ? .1 : .01;
  const [dx, dz] = { ArrowRight: [right.x, right.z], ArrowLeft: [-right.x, -right.z], ArrowUp: [up.x, up.z], ArrowDown: [-up.x, -up.z] }[arrow];
  const now = performance.now();
  if (lastNudge.id !== item.id || now - lastNudge.time > 1500) checkpoint();
  lastNudge = { id: item.id, time: now };
  item.x = round(item.x + dx * step);
  item.z = round(item.z + dz * step);
  if (isOpening(item)) alignOpening(item, state.project);
  changed();
  return true;
}

// Portapapeles propio: copia el objeto seleccionado y lo pega junto al original (o al centro de la
// vista si el original ya no existe), en el piso activo.
let clipboard = null;
function copyItem() {
  const item = state.project.items.find(o => o.id === state.selected);
  if (!item) return;
  clipboard = clone(item);
  toast(`«${item.name}» copiado. Pégalo con Ctrl + V.`);
}
function pasteItem() {
  if (!clipboard) return;
  checkpoint();
  const copy = { ...clone(clipboard), id: crypto.randomUUID(), x: round(clipboard.x + .4), z: round(clipboard.z + .4) };
  if (state.level !== baseLevel) copy.level = state.level; else delete copy.level;
  if (isOpening(copy)) alignOpening(copy, state.project);
  state.project.items.push(copy);
  clipboard = copy;
  state.selected = copy.id;
  changed();
}

function deleteSelected() {
  if (!state.selected) return;
  const room = state.project.rooms.find(r => r.id === state.selected);
  const target = room || state.project.items.find(o => o.id === state.selected);
  const remove = () => {
    checkpoint();
    state.project.items = state.project.items.filter(o => o.id !== state.selected);
    state.project.rooms = state.project.rooms.filter(r => r.id !== state.selected);
    state.selected = null;
    changed();
    if (state.tab === 'rooms') library.render();
    toast(`Se eliminó «${target.name}».`, { label: 'Deshacer', run: () => undo() });
  };
  if (!room) { remove(); return; }
  modal(`
   <h2>Eliminar ${esc(room.name)}</h2>
   <p>Se eliminarán el suelo y las paredes de esta habitación. Sus muebles se conservarán para que puedas reubicarlos.</p>
   <div class="dialog-actions"><button data-close class="secondary">Cancelar</button><button id="confirm-delete" class="danger">Eliminar habitación</button></div>`, () => {
    $('#confirm-delete').onclick = () => { $('#dialog').close(); remove(); };
  });
}

// Espacio que tapan los paneles flotantes sobre la maqueta, para centrar y encuadrar la casa en lo
// que queda libre. Cambia con la vista, al abrir o plegar Ambiente y al cambiar el tamaño.
function updateInsets() {
  const viewport = $('.viewport').getBoundingClientRect();
  if (!viewport.height) return;
  const dock = $('#ambience-dock');
  const below = !dock.hidden && !dock.classList.contains('collapsed') ? dock : $('.scene-bottom');
  const top = Math.max(0, $('.scene-toolbar').getBoundingClientRect().bottom - viewport.top + 8);
  const bottom = Math.max(0, viewport.bottom - below.getBoundingClientRect().top + 8);
  ctx.scene.setInsets(Math.round(top), Math.round(bottom));
}
$('.viewport').addEventListener('ambiencetoggle', () => { updateInsets(); ctx.scene.fit(true); });
new ResizeObserver(updateInsets).observe($('.viewport'));

function setView(next) {
  if (!ctx.scene.setMode(next)) return;
  state.view = next;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === next));
  $('.scene-heading').hidden = next !== '3d';
  $('.viewport').classList.toggle('walk-mode', next === 'walk');
  $('#walk-overlay').hidden = next !== 'walk' || state.walkLocked;
  $('#walk-reticle').hidden = next !== 'walk' || !state.walkLocked;
  $('#walk-instructions').hidden = next !== 'walk';
  ambienceUI.setView(next);
  updateInsets();
  selectionActions.render();
  $('#scene-hint').innerHTML = next === '2d'
    ? `${icon('ruler', 14)} Arrastra pisos y muebles <span>·</span> Usa los tiradores para ajustar`
    : `${icon('rotate', 14)} Arrastra para girar <span>·</span> Rueda para acercar`;
  renderRooms();
}

function startDrawing() {
  state.tool = 'room';
  state.drawing = true;
  state.drawStart = null;
  setView('2d');
  ctx.scene.drawing(true);
  $('#drawing-hint').hidden = false;
  $('#drawing-hint').textContent = 'Marca una esquina en el plano · Después, la esquina opuesta · Esc para cancelar';
}

// Calibración del plano: dos clics sobre una medida conocida (sin ajuste a la cuadrícula).
function startCalibration() {
  startDrawing();
  state.tool = 'calibrate';
  $('#drawing-hint').textContent = 'Marca el inicio de una medida conocida del plano · Esc para cancelar';
}

function calibrationPoint(p) {
  const point = { x: round(p.x), z: round(p.z) };
  const start = state.drawStart;
  if (!start) {
    state.drawStart = point;
    $('#drawing-hint').textContent = 'Ahora marca el final de esa medida · Esc para cancelar';
    return;
  }
  stopDrawing();
  const measured = Math.hypot(point.x - start.x, point.z - start.z);
  if (measured < .01) { toast('Marca dos puntos separados en el plano.'); return; }
  modal(`
   <h2>Calibrar el plano</h2>
   <p>En el plano marcaste ${fmt(measured)} m. Escribe cuánto mide esa distancia en la realidad; la imagen se escalará para coincidir.</p>
   <form id="plan-form" class="ha-form">
    <label>Distancia real (m)<input id="plan-distance" type="number" min="0.05" max="200" step="0.01" value="${round(measured).toFixed(2)}" required></label>
    <div class="dialog-actions"><button type="button" data-close class="secondary">Cancelar</button><button type="submit" class="primary">Calibrar</button></div>
   </form>`, () => {
    $('#plan-distance').select();
    $('#plan-form').onsubmit = event => {
      event.preventDefault();
      try {
        const next = calibratePlan(state.project.plan, start, point, Number($('#plan-distance').value));
        checkpoint();
        state.project.plan = next;
        $('#dialog').close();
        changed();
        toast(`Plano calibrado: ${fmt(next.w)} × ${fmt(next.d)} m.`);
      } catch (error) {
        toast(error.message);
      }
    };
  });
}

function stopDrawing() {
  state.drawing = false;
  state.drawStart = null;
  ctx.scene.ghost(null, null);
  ctx.scene.drawing(false);
  $('#drawing-hint').hidden = true;
}

function loadProject(text) {
  try {
    const next = validateProject(JSON.parse(text));
    checkpoint();
    state.project = next;
    state.selected = null;
    $('#project-name').value = next.name;
    stopDrawing();
    changed();
    ctx.scene.fit();
    library.render();
    toast('Proyecto abierto.');
  } catch (error) {
    toast(error.message || 'No pudimos abrir el proyecto.');
  }
}

$('#save').onclick = async () => {
  try {
    const data = JSON.stringify(state.project, null, 2);
    if (window.habita) {
      if (await window.habita.saveProject(data)) toast('Proyecto guardado en un archivo.');
    } else {
      download(data, `${state.project.name.replace(/[^a-zA-Z0-9áéíóúñ _-]/g, '') || 'Mi casa'}.habita`, 'application/json');
      toast('Proyecto descargado.');
    }
  } catch {
    toast('No se pudo guardar el archivo. Inténtalo de nuevo.');
  }
};
$('#open').onclick = async () => {
  if (!window.habita) { $('#file-input').click(); return; }
  try {
    const text = await window.habita.openProject();
    if (text !== null) loadProject(text);
  } catch (error) {
    toast(error.message);
  }
};
$('#file-input').onchange = async event => {
  const file = event.target.files[0];
  if (file) {
    if (file.size > 10_000_000) toast('El archivo supera 10 MB.');
    else loadProject(await file.text());
  }
  event.target.value = '';
};
$('#project-name').onchange = event => {
  const name = event.target.value.trim();
  if (!name) { event.target.value = state.project.name; return; }
  checkpoint();
  state.project.name = name;
  persist();
  renderStats();
};
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
  state.tab = b.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(t => t.classList.toggle('active', t === b));
  library.render();
});
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { stopDrawing(); setView(b.dataset.view); });
$('#undo').onclick = () => undo();
$('#redo').onclick = () => undo(true);
$('#zoom-in').onclick = () => ctx.scene.zoom(1.2);
$('#zoom-out').onclick = () => ctx.scene.zoom(1 / 1.2);
$('#fit').onclick = () => ctx.scene.fit();
$('#walk-start').onclick = () => ctx.scene.lockWalk();
$('#walk-free').onclick = () => {
  ctx.scene.freeWalk();
  $('#walk-instructions').querySelector('small').textContent = 'Escala 1:1 · Ojos a 1,65 m · Arrastra para mirar';
};
$('#snap').onclick = () => {
  state.snapping = !state.snapping;
  $('#snap').setAttribute('aria-pressed', String(state.snapping));
  $('#snap').innerHTML = `${icon('ruler', 13)} ${state.snapping ? 'Ajuste a 10 cm' : 'Movimiento libre'}`;
};
const wallModes = [['cut', 'Paredes bajas'], ['full', 'Paredes completas'], ['none', 'Sin paredes']];
let wallMode = 0;
$('#walls').onclick = () => {
  wallMode = (wallMode + 1) % wallModes.length;
  const [mode, label] = wallModes[wallMode];
  ctx.scene.wallMode(mode);
  $('#walls').innerHTML = `${icon('layers')}<span>${label}</span>`;
};
$('#snapshot').onclick = () => {
  const link = document.createElement('a');
  link.href = ctx.scene.screenshot();
  link.download = 'Mi-casa.png';
  link.click();
  toast('Imagen exportada.');
};
$('#help').onclick = () => modal(helpDialog());
$('#energy').onclick = () => {
  const values = ctx.devices.roomPower();
  if (!state.energy && !Object.keys(values).length) { toast('Elige el sensor de consumo de cada habitación en su panel para ver el mapa.'); return; }
  state.energy = !state.energy;
  $('#energy').setAttribute('aria-pressed', String(state.energy));
  ctx.scene.setHeat(state.energy ? values : null);
  if (state.energy) toast('Mapa de consumo: verde consume poco, rojo es lo que más consume ahora. Gris: sin sensor.');
};
// Modo control: la casa a pantalla completa solo con los equipos, por ejemplo en una tablet.
$('#control-mode').onclick = () => {
  state.control = !state.control;
  ctx.controlPanel.reset();
  document.body.classList.toggle('control-mode', state.control);
  $('#control-mode').setAttribute('aria-pressed', String(state.control));
  stopDrawing();
  if (state.control) {
    if (state.view === 'walk') setView('3d');
    document.documentElement.requestFullscreen?.().catch(() => {});
    toast('Modo control: toca una habitación o un equipo. El botón de la tableta vuelve al editor.');
  } else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  select(null);
};

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { stopDrawing(); return; }
  if (state.view === 'walk' || state.control) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || $('#dialog').open) return;
  const key = event.key.toLowerCase(), command = event.ctrlKey || event.metaKey;
  if (command && key === 'z') { event.preventDefault(); undo(event.shiftKey); }
  else if (command && key === 'y') { event.preventDefault(); undo(true); }
  else if (command && key === 's') { event.preventDefault(); $('#save').click(); }
  else if (command && key === 'd') { event.preventDefault(); duplicateItem(); }
  else if (command && key === 'c') copyItem();
  else if (command && key === 'v') { event.preventDefault(); pasteItem(); }
  else if (event.key.startsWith('Arrow') && !command && !event.altKey) { if (nudgeItem(event.key, event.shiftKey)) event.preventDefault(); }
  else if (key === 'r' && !command) rotateItem();
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
});

ctx.scene.rebuild(state.project);
scrollHints($('#room-chips'));
updateInsets();
ctx.scene.fit();
library.render();
inspector.render();
renderRooms();
renderStats();
if (saved.issue) toast('No se pudo abrir el autoguardado; quedó respaldado en este equipo. Se abrió la casa de ejemplo.');
