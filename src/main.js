import './styles/style.css';
import './styles/soft-theme.css';
import './styles/glass-controls.css';
import './styles/interaction-details.css';
import './styles/sliders.css';
import './styles/devices.css';
import './styles/control-panel.css';
import './styles/features.css';
import * as THREE from 'three';
import { version } from '../package.json';
import { isOpening } from './model/catalog.js';
import { clone, exampleProject, round, snap, totalArea, validateProject, alignOpening, overlaps } from './model/model.js';
import { createScene } from './scene3d/scene.js';
import { calibratePlan } from './model/plan.js';
import { baseLevel, levelLimit, levelsOf, levelOf, onLevel, sameLevel } from './model/levels.js';
import { roomCandidate, roomEditError, applyRoomEdit } from './model/room-edit.js';
import { snapToWalls } from './model/wall-snap.js';
import { createAmbienceUI } from './ui/ambience-ui.js';
import { createDimensions } from './ui/dimensions.js';
import { templates, templatePreview } from './model/templates.js';
import { createNotesUI } from './ui/notes-ui.js';
import { createPhone } from './ui/phone.js';
import { createVideo } from './ui/video.js';
import { createFeedback } from './ui/interaction-feedback.js';
import { $, esc, fmt, toast, modal, download, scrollHints } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { shell, helpDialog } from './ui/layout.js';
import { createHistory } from './ui/history.js';
import { loadSavedProject, createAutosave } from './ui/storage.js';
import { createLibrary } from './ui/library.js';
import { createInspector } from './ui/inspector.js';
import { createSelectionActions } from './ui/selection-actions.js';
import { createDevices } from './ui/devices.js';
import { createAiBridge } from './ui/ai-bridge.js';
import { createAutomations } from './ui/automations.js';
import { applyScene } from './model/scenes.js';
import { createDeviceTip } from './ui/device-tip.js';
import { createControlPanel } from './ui/control-panel.js';
import { createUpdates } from './ui/updates.js';

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
  // Selección múltiple (Shift o Ctrl + clic, Ctrl + A): ids de los objetos del grupo; vacía si hay uno
  // solo. state.selected sigue siendo el objeto principal, el que muestra la barra de acciones.
  selection: [],
  // Huincha de medir: la última medida y la que sigue al mouse (no se guardan en el proyecto).
  measure: null,
  measurePreview: null,
  roomDragOriginal: null
};
// Objetos sobre los que actúan las órdenes: el grupo si lo hay; si no, el objeto seleccionado.
const selectedItems = () => state.project.items.filter(o => state.selection.length > 1 ? state.selection.includes(o.id) : o.id === state.selected);
const history = createHistory();
const persist = createAutosave(() => state.project);
const ctx = { state, actions: {} };
let selectionActions = null, library = null, inspector = null, dimensions = null, notesUI = null;

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
  state.selection = state.selection.filter(id => state.project.items.some(o => o.id === id));
  if (state.selection.length < 2) state.selection = [];
  ctx.scene.setGroup(state.selection);
  ctx.devices.applyLive();
  ctx.scene.rebuild(state.project, state.selected);
  inspector.render();
  renderRooms();
  renderStats();
  selectionActions.render();
  if (state.tab === 'rooms') library.render();
  persist();
  ctx.aiBridge?.publishScenes();
  // El sonido dice qué pasó: equipos que se encienden (sube), que se apagan (baja) o una escena.
  const powered = poweredDevices(), before = lastPowered;
  lastPowered = powered;
  const sound = state.sound || (powered.size > before.size ? 'on' : powered.size < before.size ? 'off' : 'place');
  state.sound = null;
  ctx.feedback.play(sound);
}
// Lámparas, aires y televisores encendidos (por id), para elegir el sonido de un cambio.
const poweredDevices = () => new Set(state.project.items.filter(item => item.light?.on && item.light.brightness > 0 || item.climate?.on || item.tv?.on).map(item => item.id));
let lastPowered = new Set();

// Activa una escena como un solo paso de Deshacer; los objetos vinculados envían el cambio a sus equipos.
function activateScene(scene, message = `Escena «${scene.name}» activada.`) {
  if (!applyScene(clone(state.project), scene).length) { toast(`La casa ya está en «${scene.name}».`); return; }
  checkpoint();
  ctx.devices.sendMany(applyScene(state.project, scene));
  state.sound = 'scene';
  changed();
  toast(message);
}

function select(id, { additive = false } = {}) {
  const isItem = key => !!key && state.project.items.some(o => o.id === key);
  if (additive && isItem(id) && isItem(state.selected)) {
    const group = new Set(state.selection.length ? state.selection : [state.selected]);
    if (group.has(id)) { group.delete(id); id = [...group].at(-1) ?? null; } else group.add(id);
    state.selection = group.size > 1 ? [...group] : [];
  } else if (!state.selection.includes(id)) state.selection = [];
  // Pulsar un objeto del grupo conserva el grupo, para poder arrastrarlo entero.
  ctx.scene.setGroup(state.selection);
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
    // En grupo, todos se mueven lo mismo que el objeto arrastrado y conservan su distancia.
    const dx = snap(x, state.snapping) - item.x, dz = snap(z, state.snapping) - item.z;
    const moving = state.selection.includes(id) ? selectedItems() : [item];
    for (const o of moving) { o.x = round(o.x + dx); o.z = round(o.z + dz); }
    // Un mueble solo se pega a la pared cercana; en movimiento libre no hay imán.
    if (state.snapping && moving.length === 1 && !isOpening(item)) {
      const { x: sx, z: sz, rotation } = snapToWalls(item, state.project);
      Object.assign(item, { x: sx, z: sz, rotation });
    }
    if (moving.some(isOpening)) {
      moving.filter(isOpening).forEach(o => alignOpening(o, state.project));
      ctx.scene.rebuild(state.project, id);
    } else moving.forEach(o => ctx.scene.moveItem(o));
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
    if (state.tool === 'note') {
      const moving = state.noteMove;
      stopDrawing();
      notesUI.place({ x: round(p.x), z: round(p.z) }, moving);
      return;
    }
    if (state.tool === 'measure') {
      const start = state.drawStart, point = measurePoint(p, start);
      if (!start) { state.drawStart = point; state.measure = null; $('#drawing-hint').textContent = 'Marca el segundo punto · Shift para medir recto · Esc para terminar'; }
      else { state.measure = { a: start, b: point }; state.measurePreview = null; state.drawStart = null; $('#drawing-hint').textContent = `Midió ${measureLabel(start, point)} · Marca otro punto para medir de nuevo · Esc para terminar`; }
      dimensions?.refresh();
      return;
    }
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
      if (state.tool === 'measure') {
        const b = measurePoint(p, state.drawStart);
        state.measurePreview = { a: state.drawStart, b };
        $('#drawing-hint').textContent = `${measureLabel(state.drawStart, b)} · Marca el segundo punto · Shift para medir recto · Esc para terminar`;
        dimensions?.refresh();
      } else if (state.tool === 'calibrate') ctx.scene.ghost(state.drawStart, p, true);
      else ctx.scene.ghost(state.drawStart, { x: snap(p.x, state.snapping), z: snap(p.z, state.snapping) });
    }
  },
  frame(camera, rect) {
    // El primer frame del motor ocurre antes de montar la barra contextual.
    selectionActions?.position(camera, rect);
    dimensions?.render(camera, rect);
    notesUI?.position(camera, rect);
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
createUpdates($('.statusbar>div:last-child'));
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

Object.assign(ctx.actions, { undo, replaceProject, startNote, selectedItems, alignGroup, checkpoint, changed, select, activateScene, setView, setLevel, addLevel, deleteLevel, renameLevel, startDrawing, startCalibration, rotateItem, duplicateItem, deleteSelected });
selectionActions = createSelectionActions(ctx);
dimensions = createDimensions(ctx);
notesUI = createNotesUI(ctx);
ctx.phone = createPhone();
const video = createVideo(ctx);
$('#record-video').onclick = () => video.open();
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
    lastPowered = poweredDevices();
    ctx.aiBridge?.publishStatus();
  },
  onContact: (itemIds, open) => ctx.automations?.contact(itemIds, open)
});
ctx.automations = createAutomations(ctx);

// Asistentes de IA (MCP) y menú de la bandeja de Windows.
ctx.aiBridge = createAiBridge(ctx);

function renderRooms() {
  notesUI?.render();
  const { selected } = state, project = onLevel(state.project, state.level);
  const levels = levelsOf(state.project);
  const climate = r => ctx.devices?.roomSensors(r.id) || '';
  $('#room-chips').innerHTML = levels.map(l => `<button data-level="${esc(l.id)}" class="level-chip ${l.id === state.level ? 'active' : ''}" title="Ver ${esc(l.name)}">${icon('layers', 13)} ${esc(l.name)}</button>`).join('') +
    `<button data-add-level class="level-chip" title="Agregar un piso" aria-label="Agregar un piso">${icon('plus', 13)}</button><span class="tool-divider"></span>` +
    `<button data-room="" class="${!selected ? 'active' : ''}">${icon('home', 14)} Toda la casa</button>` +
    project.rooms.map(r => `<button data-room="${esc(r.id)}" class="${selected === r.id ? 'active' : ''}">${esc(r.name)}${climate(r) ? ` <small class="room-sensor">${esc(climate(r))}</small>` : ''}</button>`).join('');
  // En la maqueta, elegir un espacio vuela hacia él; «Toda la casa» vuelve a encuadrarla.
  $('#room-chips').querySelectorAll('[data-room]').forEach(b => b.onclick = () => {
    select(b.dataset.room || null);
    if (state.view !== 'walk') b.dataset.room ? ctx.scene.focusRoom(b.dataset.room) : ctx.scene.fit(true);
  });
  $('#room-chips').querySelectorAll('[data-level]').forEach(b => b.onclick = () => setLevel(b.dataset.level));
  $('#room-chips').querySelector('[data-add-level]').onclick = addLevel;
  $('#room-labels').innerHTML = onLevel(project, state.level).rooms.map(r => `<span class="room-label" data-room="${esc(r.id)}">${esc(r.name)}<small>${fmt(r.w)} × ${fmt(r.d)} m · ${fmt(r.w * r.d)} m²${climate(r) ? ` · ${esc(climate(r))}` : ''}</small></span>`).join('');
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
  // La selección se conserva si el objeto o la habitación sigue existiendo (el grupo, no).
  state.selection = [];
  if (![...state.project.items, ...state.project.rooms].some(o => o.id === state.selected)) state.selected = null;
  $('#project-name').value = state.project.name;
  stopDrawing();
  changed();
  if (state.tab === 'rooms') library.render();
  toast(redo ? 'Cambio rehecho.' : 'Cambio deshecho.', { label: redo ? 'Deshacer' : 'Rehacer', run: () => undo(!redo) });
}

// En grupo, cada objeto gira sobre su propio centro; las puertas y ventanas siguen a su pared.
function rotateItem() {
  const items = selectedItems(), turning = items.filter(o => !isOpening(o));
  if (!items.length) return;
  if (!turning.length) { toast('Las puertas y ventanas se orientan automáticamente a la pared.'); return; }
  checkpoint();
  for (const item of turning) item.rotation = (item.rotation + 90) % 360;
  // Un mueble que estaba pegado a la pared vuelve a apoyarse en ella con su nueva orientación.
  if (turning.length === 1 && state.snapping) Object.assign(turning[0], (({ x, z }) => ({ x, z }))(snapToWalls(turning[0], state.project, { turn: false })));
  changed();
}

// Copias desplazadas 40 cm; con un grupo, el grupo de copias queda seleccionado.
function placeCopies(sources, level = null) {
  checkpoint();
  const copies = sources.map(item => {
    const copy = { ...clone(item), id: crypto.randomUUID(), x: round(item.x + .4), z: round(item.z + .4) };
    if (level) { if (level !== baseLevel) copy.level = level; else delete copy.level; }
    if (isOpening(copy)) alignOpening(copy, state.project);
    return copy;
  });
  state.project.items.push(...copies);
  state.selection = copies.length > 1 ? copies.map(c => c.id) : [];
  state.selected = copies.at(-1).id;
  changed();
  return copies;
}

function duplicateItem() {
  const items = selectedItems();
  if (items.length) placeCopies(items);
}

// Alinear o repartir el grupo según el contorno de cada objeto en planta (girado). En el plano,
// «arriba» es hacia el fondo (−z).
function alignGroup(mode) {
  const items = selectedItems().filter(o => !isOpening(o));
  if (items.length < 2) return;
  const half = o => {
    const a = o.rotation * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    return { x: o.w / 2 * c + o.d / 2 * s, z: o.w / 2 * s + o.d / 2 * c };
  };
  const axis = ['left', 'center-x', 'right', 'spread-x'].includes(mode) ? 'x' : 'z';
  const min = Math.min(...items.map(o => o[axis] - half(o)[axis])), max = Math.max(...items.map(o => o[axis] + half(o)[axis]));
  checkpoint();
  if (mode.startsWith('spread')) {
    // Mismo espacio libre entre objetos, de un extremo al otro.
    const sorted = [...items].sort((a, b) => a[axis] - b[axis]);
    const gap = (max - min - sorted.reduce((n, o) => n + half(o)[axis] * 2, 0)) / (sorted.length - 1);
    let at = min;
    for (const o of sorted) { o[axis] = round(at + half(o)[axis]); at += half(o)[axis] * 2 + gap; }
  } else for (const o of items) {
    const h = half(o)[axis];
    o[axis] = round(['left', 'top'].includes(mode) ? min + h : ['right', 'bottom'].includes(mode) ? max - h : (min + max) / 2);
  }
  changed();
}

// Ctrl + A: todos los objetos del piso activo.
function selectAll() {
  const ids = onLevel(state.project, state.level).items.map(o => o.id);
  if (!ids.length) return;
  state.selection = ids.length > 1 ? ids : [];
  select(ids.at(-1));
  toast(`${ids.length} ${ids.length === 1 ? 'objeto seleccionado' : 'objetos seleccionados'}. Arrastra uno para moverlos juntos.`);
}

// Mover con las flechas: 10 cm (1 cm sin ajuste a la cuadrícula, 50 cm con Shift). Las pulsaciones
// seguidas sobre el mismo objeto cuentan como un solo paso de Deshacer.
let lastNudge = { id: null, time: 0 };
function nudgeItem(arrow, large) {
  const items = selectedItems(), item = items.at(-1);
  if (!item) return false;
  const { right, up } = ctx.scene.screenAxes();
  const step = large ? .5 : state.snapping ? .1 : .01;
  const [dx, dz] = { ArrowRight: [right.x, right.z], ArrowLeft: [-right.x, -right.z], ArrowUp: [up.x, up.z], ArrowDown: [-up.x, -up.z] }[arrow];
  const now = performance.now();
  if (lastNudge.id !== item.id || now - lastNudge.time > 1500) checkpoint();
  lastNudge = { id: item.id, time: now };
  for (const o of items) {
    o.x = round(o.x + dx * step);
    o.z = round(o.z + dz * step);
    if (isOpening(o)) alignOpening(o, state.project);
  }
  changed();
  return true;
}

// Portapapeles propio: copia lo seleccionado y lo pega 40 cm más allá, en el piso activo. Pegar
// varias veces deja cada copia junto a la anterior.
let clipboard = [];
function copyItem() {
  const items = selectedItems();
  if (!items.length) return;
  clipboard = clone(items);
  toast(items.length === 1 ? `«${items[0].name}» copiado. Pégalo con Ctrl + V.` : `${items.length} objetos copiados. Pégalos con Ctrl + V.`);
}
function pasteItem() {
  if (clipboard.length) clipboard = clone(placeCopies(clipboard, state.level));
}

function deleteSelected() {
  if (!state.selected) return;
  if (state.selection.length > 1) {
    const ids = new Set(state.selection);
    checkpoint();
    state.project.items = state.project.items.filter(o => !ids.has(o.id));
    state.selection = [];
    state.selected = null;
    changed();
    toast(`Se eliminaron ${ids.size} objetos.`, { label: 'Deshacer', run: () => undo() });
    return;
  }
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
  dimensions?.refresh();
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

// Huincha de medir: dos clics miden en el plano. Los puntos se pegan a las esquinas de los espacios
// cercanas (a menos de 15 cm) y con Shift la medida queda recta. Sigue activa para medir otra vez
// hasta pulsar Esc o el botón; la última medida queda a la vista mientras tanto.
let shiftDown = false;
addEventListener('keydown', event => { if (event.key === 'Shift') shiftDown = true; });
addEventListener('keyup', event => { if (event.key === 'Shift') shiftDown = false; });
addEventListener('blur', () => { shiftDown = false; });
// Notas: un clic en el plano marca dónde va la nota (o adónde se mueve la elegida).
function startNote(moveId = null) {
  startDrawing();
  state.tool = 'note';
  state.noteMove = moveId;
  $('#drawing-hint').textContent = moveId ? 'Marca el nuevo lugar de la nota · Esc para cancelar' : 'Marca dónde va la nota · Esc para cancelar';
}
function startMeasure() {
  if (state.tool === 'measure' && state.drawing) { stopDrawing(); return; }
  startDrawing();
  state.tool = 'measure';
  state.measure = null;
  $('#measure-tool').setAttribute('aria-pressed', 'true');
  $('#drawing-hint').textContent = 'Marca el primer punto · Shift para medir recto · Esc para terminar';
}
function measurePoint(p, start = null) {
  const corners = onLevel(state.project, state.level).rooms.flatMap(r => [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x - r.w / 2, r.z + r.d / 2], [r.x + r.w / 2, r.z + r.d / 2]]);
  const near = corners.find(([x, z]) => Math.hypot(x - p.x, z - p.z) < .15);
  let point = near ? { x: near[0], z: near[1] } : { x: round(Math.round(p.x * 100) / 100), z: round(Math.round(p.z * 100) / 100) };
  if (start && shiftDown) point = Math.abs(point.x - start.x) >= Math.abs(point.z - start.z) ? { x: point.x, z: start.z } : { x: start.x, z: point.z };
  return point;
}
function measureLabel(a, b) { return `${fmt(Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 100) / 100)} m`; }

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
  const measuring = state.tool === 'measure' && state.drawing;
  state.drawing = false;
  state.drawStart = null;
  if (measuring) { state.measure = null; state.measurePreview = null; $('#measure-tool').setAttribute('aria-pressed', 'false'); dimensions?.refresh(); }
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

// Reemplaza la casa entera (plantilla o versión guardada) como un paso de Deshacer.
function replaceProject(next, message) {
  checkpoint();
  state.project = next;
  state.selected = null;
  state.selection = [];
  if (!levelsOf(next).some(l => l.id === state.level)) state.level = baseLevel;
  $('#project-name').value = state.project.name;
  stopDrawing();
  changed();
  ctx.scene.setLevel(state.level);
  ctx.scene.fit();
  library.render();
  toast(message, { label: 'Deshacer', run: () => undo() });
}

// Nueva casa desde una plantilla. Reemplazar la casa es un paso de Deshacer, como abrir un archivo.
function newHome() {
  modal(`
   <h2>Nueva casa</h2>
   <p>Elige cómo empezar. La casa actual se recupera con Deshacer; si quieres conservarla en un archivo, guárdala antes.</p>
   <div class="template-grid">${templates.map(t => `<button class="template-card" data-template="${t.id}">${templatePreview(t.make())}<strong>${esc(t.name)}</strong><small>${esc(t.detail)}</small></button>`).join('')}</div>
   <div class="dialog-actions"><button data-close class="secondary">Cancelar</button></div>`, () => {
    document.querySelectorAll('[data-template]').forEach(button => button.onclick = () => {
      const template = templates.find(t => t.id === button.dataset.template);
      $('#dialog').close();
      const next = validateProject(template.make());
      replaceProject(next, next.rooms.length ? `«${template.name}» lista para personalizar.` : 'Plano vacío: usa «Dibujar habitación» para crear tus espacios.');
      if (!next.rooms.length) $('[data-tab="rooms"]').click();
    });
  });
}
$('#new-home').onclick = newHome;
$('#measure-tool').onclick = startMeasure;

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
const wallModes = [['auto', 'Paredes según vista'], ['cut', 'Paredes bajas'], ['full', 'Paredes completas'], ['none', 'Sin paredes']];
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
  if (event.key === 'Escape') {
    if (!state.drawing && state.selection.length && !$('#dialog').open) select(null);
    stopDrawing();
    return;
  }
  if (state.view === 'walk' || state.control) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || $('#dialog').open) return;
  const key = event.key.toLowerCase(), command = event.ctrlKey || event.metaKey;
  if (command && key === 'z') { event.preventDefault(); undo(event.shiftKey); }
  else if (command && key === 'y') { event.preventDefault(); undo(true); }
  else if (command && key === 's') { event.preventDefault(); $('#save').click(); }
  else if (command && key === 'd') { event.preventDefault(); duplicateItem(); }
  else if (command && key === 'a') { event.preventDefault(); selectAll(); }
  else if (command && key === 'c') copyItem();
  else if (command && key === 'v') { event.preventDefault(); pasteItem(); }
  else if (event.key.startsWith('Arrow') && !command && !event.altKey) { if (nudgeItem(event.key, event.shiftKey)) event.preventDefault(); }
  else if (key === 'r' && !command) rotateItem();
  else if (key === 'm' && !command) startMeasure();
  else if (key === 'n' && !command) startNote();
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
});

ctx.scene.rebuild(state.project);
lastPowered = poweredDevices();
scrollHints($('#room-chips'));
updateInsets();
ctx.scene.fit();
library.render();
inspector.render();
renderRooms();
renderStats();
if (saved.issue) toast('No se pudo abrir el autoguardado; quedó respaldado en este equipo. Se abrió la casa de ejemplo.');
