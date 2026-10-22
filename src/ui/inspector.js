import { byId, isOpening } from '../model/catalog.js';
import { inRoom } from '../model/levels.js';
import { clone, round, totalArea, warningsFor, alignOpening, overlaps } from '../model/model.js';
import { isLamp, lightFor, lampsInRoom } from '../devices/lighting.js';
import { isClimate, climateFor, climateInRoom, modeNames } from '../devices/climate.js';
import { isTv, tvFor, tvsInRoom } from '../devices/tv.js';
import { sameLevel } from '../model/levels.js';
import { isCover, coverFor, coversInRoom } from '../devices/cover.js';
import { isVacuum, vacuumFor, vacuumNames, vacuumBusy } from '../devices/vacuum.js';
import { captureScene, sceneLimit } from '../model/scenes.js';
import { thumbnail } from '../scene3d/furniture.js';
import { $, esc, fmt, toast, modal, download } from './dom.js';
import { shoppingList, shoppingCsv, money, validLink } from '../model/shopping.js';
import { mountVersions } from './versions-ui.js';
import { dimByDragging } from './dim-drag.js';
import { icon } from './icons.js';

const isLit = item => lightFor(item).on && lightFor(item).brightness > 0;
const fillFor = slider => `${(Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min)) * 100}%`;

// Campo numérico exacto acompañado de un slider con rango adaptado al valor actual.
function numeric(label, key, value, min, max, step = .1) {
  const positional = ['x', 'z'].includes(key);
  const lower = positional ? Math.max(min, value - 8) : min;
  const upper = positional ? Math.min(max, value + 8)
    : key === 'rotation' ? max
    : Math.min(max, Math.max(key === 'wallThickness' ? 1 : 6, value * 1.5));
  const fill = (value - lower) / (upper - lower) * 100;
  return `
   <label class="field"><span>${label}</span>
    <div><input type="number" data-field="${key}" value="${round(value)}" min="${min}" max="${max}" step="${step}" aria-label="${label}"><span>${key === 'rotation' ? '°' : 'm'}</span></div>
    <input class="property-range" data-linked="${key}" type="range" min="${lower}" max="${upper}" step="${key === 'rotation' ? 15 : .01}" value="${value}" style="--fill:${fill}%" aria-label="${label} (deslizador)">
   </label>`;
}

// Panel derecho: resumen del proyecto o propiedades de la habitación u objeto seleccionado.
export function createInspector(ctx) {
  const { state, actions } = ctx;
  let previewFrame = null;

  function cancelPreview() {
    if (previewFrame !== null) cancelAnimationFrame(previewFrame);
    previewFrame = null;
  }

  function projectSummary() {
    const { project } = state;
    return `
     <div class="inspector-heading"><h2>Tu proyecto</h2>${icon('home', 18)}</div>
     <div class="project-overview"><div class="overview-house">${icon('home', 38)}</div><h3>Espacio para tus ideas.</h3><p>Selecciona un objeto o una habitación para darle tu toque.</p></div>
     <div class="overview-stats">
      <div><strong>${fmt(totalArea(project))}<small>m²</small></strong><span>Superficie interior</span></div>
      <div><strong>${project.rooms.length}</strong><span>Habitaciones</span></div>
     </div>
     <button id="shopping-list" class="secondary full shopping-button">${icon('cart', 16)} Lista de compras${shoppingList(project).total ? ` · ${money(shoppingList(project).total)}` : ''}</button>
     <div class="property-section"><h3>Construcción</h3>
      ${numeric('Altura de paredes', 'wallHeight', project.wallHeight, 1, 10)}${numeric('Espesor de paredes', 'wallThickness', project.wallThickness, .05, 1, .01)}
     </div>
     <div class="inspector-tip">${icon('ruler', 20)}<p>Empieza con las medidas de tu casa. Después, prueba muebles y distribuciones.</p></div>
     <div class="prototype-note">Primera versión · Las alertas geométricas son orientativas y no validan estructura ni normativa.</div>`;
  }

  function properties(item, room, asset, warnings) {
    const target = item || room;
    const preview = item
      ? `<div class="selected-preview"><img src="${thumbnail(asset)}" alt="${esc(asset.name)}"><span>${esc(asset.category)}</span></div>`
      : `<div class="room-overview" style="--floor:${room.color}">${icon('plan', 35)}<strong>${fmt(room.w * room.d)} m²</strong></div>`;
    const presets = asset && asset.presets.length > 1
      ? `<select id="preset" aria-label="Tamaño predefinido"><option value="">Elegir tamaño…</option>${asset.presets.map((v, i) => `<option value="${i}">${v.map(fmt).join(' × ')} m</option>`).join('')}</select>`
      : '';
    const status = warnings.length
      ? `<div class="warnings">${warnings.map(w => `<p>${esc(w)}</p>`).join('')}</div>`
      : `<div class="geometry-ok">${icon('check', 14)} ${item ? 'Sin alertas de tamaño o superposición' : 'Medidas de la habitación'}</div>`;
    return `
     <div class="inspector-heading"><h2>${item ? 'Objeto seleccionado' : 'Habitación'}</h2><button id="deselect" class="icon-button" aria-label="Cerrar selección">${icon('close', 16)}</button></div>
     ${preview}
     <input class="object-name" data-field="name" aria-label="Nombre" value="${esc(target.name)}" maxlength="120">
     <div class="property-section"><h3>Dimensiones</h3>${presets}
      <div class="dimensions">${numeric('Ancho', 'w', target.w, room ? .5 : .05, 50, .05)}${numeric('Fondo', 'd', target.d, room ? .5 : .01, 50, .05)}${item ? numeric('Alto', 'h', item.h, .01, 10, .05) : ''}</div>
     </div>
     <div class="property-section"><h3>Posición</h3>
      <div class="dimensions">${numeric('Eje X', 'x', target.x, -100, 100)}${numeric('Eje Z', 'z', target.z, -100, 100)}</div>
      ${item ? numeric('Rotación', 'rotation', item.rotation, -360, 360, 15) : ''}
      ${item && !isOpening(item) ? numeric('Elevación', 'elevation', item.elevation, 0, 10, .05) : ''}
      ${asset?.kind === 'window' ? numeric('Altura de antepecho', 'sill', item.sill, 0, 10, .05) : ''}
     </div>
     <div class="property-section"><h3>Acabado</h3>
      <label class="color-field"><input type="color" data-field="color" value="${target.color}" aria-label="Color del objeto"><span>Color personalizado</span><span>${target.color}</span></label>
     </div>
     ${item && !isOpening(item) ? `<div class="property-section purchase"><h3>Compra</h3>
      <label class="purchase-field"><span>Precio</span><input id="item-price" type="number" min="0" max="10000000000" step="1000" inputmode="numeric" placeholder="Sin precio" value="${item.price ?? ''}" aria-label="Precio en pesos"><span>CLP</span></label>
      <label class="purchase-field"><span>Tienda</span><input id="item-link" type="url" maxlength="500" placeholder="https://…" value="${esc(item.link || '')}" aria-label="Enlace de la tienda">${item.link ? `<button type="button" id="open-link" class="icon-button" aria-label="Abrir enlace" title="Abrir en el navegador">${icon('link', 14)}</button>` : ''}</label>
     </div>` : ''}
     ${status}
     <div class="object-actions">
      ${item ? `<button id="rotate-item" class="secondary" title="Girar 90 grados (R)">${icon('rotate', 16)} Girar</button><button id="duplicate-item" class="secondary">${icon('copy', 16)} Duplicar</button>` : ''}
      <button id="delete-item" class="danger">${icon('trash', 16)} Eliminar ${item ? 'objeto' : 'habitación'}</button>
     </div>`;
  }

  // Precio y enlace de compra del mueble: cada campo se guarda al confirmarlo; vacío lo quita.
  function bindPurchase(item) {
    const save = (key, value, valid) => {
      if (value === item[key]) return;
      if (!valid) { toast(key === 'price' ? 'Escribe un precio en pesos, sin puntos.' : 'El enlace debe empezar con http:// o https://.'); render(); return; }
      actions.checkpoint();
      if (value === undefined) delete item[key]; else item[key] = value;
      actions.changed();
    };
    $('#item-price').onchange = event => {
      const text = event.target.value.trim(), value = text === '' ? undefined : Math.round(Number(text));
      save('price', value, value === undefined || (Number.isFinite(value) && value >= 0 && value <= 1e10));
    };
    $('#item-link').onchange = event => {
      const text = event.target.value.trim(), value = text || undefined;
      save('link', value, validLink(value));
    };
    const open = $('#open-link');
    if (open) open.onclick = () => openLink(item.link);
  }
  const openLink = url => { if (window.habita?.openLink) window.habita.openLink(url); else window.open(url, '_blank', 'noopener'); };

  function showShopping() {
    const list = shoppingList(state.project);
    const groups = [...new Set(list.rows.map(r => r.room))];
    modal(`
     <h2>Lista de compras</h2>
     <p>Agrega precio y enlace a cada mueble desde su panel («Compra»). ${list.missing ? `${list.missing} de ${list.rows.length} objetos aún no tienen precio.` : 'Todos los objetos tienen precio.'}</p>
     <div class="shopping-table">${groups.map(room => `<h3>${esc(room)}</h3>${list.rows.filter(r => r.room === room).map(r => `
      <div class="shopping-row"><button data-pick="${esc(r.id)}" title="Elegir en la maqueta">${esc(r.name)}<small>${esc(r.size)}</small></button>
       <span>${r.price !== undefined ? money(r.price) : '<em>Sin precio</em>'}</span>${r.link ? `<button class="icon-button" data-link="${esc(r.id)}" aria-label="Abrir enlace de ${esc(r.name)}">${icon('link', 14)}</button>` : '<span></span>'}</div>`).join('')}`).join('')}</div>
     <div class="shopping-total"><span>Total</span><strong>${money(list.total)}</strong></div>
     <div class="dialog-actions"><button type="button" id="shopping-csv" class="secondary">Exportar CSV</button><button type="button" data-close class="primary">Cerrar</button></div>`, () => {
      $('#shopping-csv').onclick = () => download(shoppingCsv(list), `${state.project.name || 'habita'} - lista de compras.csv`, 'text/csv;charset=utf-8');
      document.querySelectorAll('.shopping-row [data-pick]').forEach(b => b.onclick = () => { $('#dialog').close(); actions.select(b.dataset.pick); ctx.scene.focusItem(b.dataset.pick); });
      document.querySelectorAll('.shopping-row [data-link]').forEach(b => b.onclick = () => openLink(list.rows.find(r => r.id === b.dataset.link).link));
    });
  }

  // Varios objetos elegidos: lista, alinear y repartir, y las acciones que valen para todos.
  function renderGroup(container) {
    const items = actions.selectedItems();
    const aligns = [['left', 'Alinear a la izquierda'], ['center-x', 'Centrar en horizontal'], ['right', 'Alinear a la derecha'],
      ['top', 'Alinear arriba'], ['center-z', 'Centrar en vertical'], ['bottom', 'Alinear abajo']];
    const iconFor = { 'center-x': 'align-center', 'center-z': 'align-middle', left: 'align-left', right: 'align-right', top: 'align-top', bottom: 'align-bottom' };
    container.innerHTML = `
     <div class="inspector-heading"><h2>${items.length} objetos seleccionados</h2><button id="deselect" class="icon-button" aria-label="Cerrar selección">${icon('close', 16)}</button></div>
     <p class="group-hint">Arrástralos o muévelos con las flechas: se mueven juntos. Shift + clic suma o quita un objeto.</p>
     <div class="group-list">${items.map(o => `<button data-pick="${esc(o.id)}" title="Elegir solo ${esc(o.name)}">${esc(o.name)}</button>`).join('')}</div>
     <div class="property-section"><h3>Alinear</h3>
      <div class="group-tools">${aligns.map(([mode, label]) => `<button class="icon-button" data-align="${mode}" aria-label="${label}" title="${label}">${icon(iconFor[mode], 18)}</button>`).join('')}</div>
      ${items.length > 2 ? `<h3>Repartir</h3><div class="group-tools"><button class="secondary" data-align="spread-x">${icon('spread-x', 16)} A lo ancho</button><button class="secondary" data-align="spread-z">${icon('spread-z', 16)} A lo largo</button></div>` : ''}
     </div>
     <div class="object-actions">
      <button id="rotate-item" class="secondary" title="Girar cada objeto 90 grados (R)">${icon('rotate', 16)} Girar</button><button id="duplicate-item" class="secondary" title="Duplicar (Ctrl + D)">${icon('copy', 16)} Duplicar</button>
      <button id="delete-item" class="danger">${icon('trash', 16)} Eliminar ${items.length} objetos</button>
     </div>`;
    $('#deselect').onclick = () => actions.select(null);
    $('#rotate-item').onclick = actions.rotateItem;
    $('#duplicate-item').onclick = actions.duplicateItem;
    $('#delete-item').onclick = actions.deleteSelected;
    container.querySelectorAll('[data-align]').forEach(b => b.onclick = () => actions.alignGroup(b.dataset.align));
    container.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { actions.select(null); actions.select(b.dataset.pick); });
  }

  function mountRoomTip(container, room) {
    const tip = document.createElement('div');
    tip.className = 'room-edit-tip';
    tip.innerHTML = `
     <button class="secondary full" id="edit-room-floor">${icon('plan', 15)} Editar piso en plano 2D</button>
     <p>Arrastra el piso para moverlo. Usa los puntos del borde para cambiar sus medidas.</p>
     <label><input id="carry-furniture" type="checkbox" ${state.carryFurniture ? 'checked' : ''}> Mover los muebles con el piso</label>
     <small>Al ajustar bordes, los muebles mantienen su tamaño y posición. Esc cancela el arrastre.</small>`;
    container.querySelector('.object-name').after(tip);
    $('#edit-room-floor').onclick = () => { actions.setView('2d'); actions.select(room.id); };
    $('#carry-furniture').onchange = event => { state.carryFurniture = event.target.checked; };
  }

  function mountRoomDevices(container, room = null) {
    const { project } = state;
    const lamps = room ? lampsInRoom(project, room) : project.items.filter(isLamp);
    const climates = room ? climateInRoom(project, room) : project.items.filter(isClimate);
    const tvs = room ? tvsInRoom(project, room) : project.items.filter(isTv);
    const covers = room ? coversInRoom(project, room) : project.items.filter(isCover);
    const vacuums = project.items.filter(item => isVacuum(item) && (!room || inRoom(item, room)));
    // Con la casa conectada, la habitación lista sus puertas y ventanas para vincular sensores; la casa completa, solo las vinculadas.
    const openings = project.items.filter(item => isOpening(item) && (room ? inRoom(item, room) && ctx.devices.linkable(item) : ctx.devices.describe(item.id)));
    if (!lamps.length && !climates.length && !tvs.length && !covers.length && !vacuums.length && !openings.length) return;
    const section = document.createElement('section');
    section.className = 'room-lighting property-section';
    const deviceButton = (item, on, detail) => {
      const device = ctx.devices.describe(item.id);
      const note = device ? `<small class="lamp-device ${device.available ? '' : 'offline'}">${esc(device.label)}</small>` : detail ? `<small class="lamp-device design">${esc(detail)}</small>` : '';
      // Las lámparas se atenúan arrastrando la fila a los lados (como HomeKit y house-control).
      const dim = isLamp(item) ? ` data-dim="${esc(item.id)}" style="--level:${isLit(item) ? lightFor(item).brightness / 100 : 0}" title="Arrastra a los lados para atenuar; flechas izquierda y derecha también"` : '';
      return `<button data-select-device="${esc(item.id)}"${dim}><span class="lamp-status ${on ? 'on' : ''}"></span><span>${esc(item.name)}${note}</span>${icon('chevron', 13)}</button>`;
    };
    const climateDetail = item => {
      const c = climateFor(item);
      return c.on ? `${modeNames[c.mode]} a ${c.target} °C` : 'Apagado';
    };
    section.innerHTML = `
     ${lamps.length ? `
      <h3>${room ? 'Luces de este espacio' : 'Luces de la casa'} <span>${lamps.filter(isLit).length}/${lamps.length}</span></h3>
      <div class="room-light-actions"><button data-lights="on" class="secondary">Encender todas</button><button data-lights="off" class="secondary">Apagar todas</button></div>
      <div class="room-lamp-list">${lamps.map(item => deviceButton(item, isLit(item))).join('')}</div>` : ''}
     ${climates.length ? `
      <h3 class="climate-heading">Climatización <span>${climates.filter(i => climateFor(i).on).length}/${climates.length}</span></h3>
      <div class="room-lamp-list">${climates.map(item => deviceButton(item, climateFor(item).on, climateDetail(item))).join('')}</div>` : ''}
     ${tvs.length ? `
      <h3 class="climate-heading">Televisores <span>${tvs.filter(i => tvFor(i).on).length}/${tvs.length}</span></h3>
      <div class="room-lamp-list">${tvs.map(item => deviceButton(item, tvFor(item).on, tvFor(item).on ? `Volumen ${tvFor(item).volume}%` : 'Apagado')).join('')}</div>` : ''}
     ${covers.length ? `
      <h3 class="climate-heading">Cortinas <span>${covers.filter(i => coverFor(i).position > 0).length}/${covers.length}</span></h3>
      <div class="room-lamp-list">${covers.map(item => deviceButton(item, coverFor(item).position > 0, coverFor(item).position ? `Abierta ${coverFor(item).position}%` : 'Cerrada')).join('')}</div>` : ''}
     ${vacuums.length ? `
      <h3 class="climate-heading">Aspiradoras <span>${vacuums.filter(i => vacuumBusy(vacuumFor(i))).length}/${vacuums.length}</span></h3>
      <div class="room-lamp-list">${vacuums.map(item => deviceButton(item, vacuumBusy(vacuumFor(item)), vacuumNames[vacuumFor(item).status])).join('')}</div>` : ''}
     ${openings.length ? `
      <h3 class="climate-heading">Puertas y ventanas <span>${openings.filter(i => ctx.devices.isOpen(i.id)).length} abiertas</span></h3>
      <div class="room-lamp-list">${openings.map(item => deviceButton(item, ctx.devices.isOpen(item.id), 'Sin sensor')).join('')}</div>` : ''}`;
    const anchor = container.querySelector('.overview-stats') || container.querySelector('.room-edit-tip') || container.querySelector('.control-heading');
    anchor.after(section);
    section.querySelectorAll('[data-dim]').forEach(row => dimByDragging(row, ctx, row.dataset.dim));
    section.querySelectorAll('[data-select-device]').forEach(b => b.onclick = () => {
      if (b.dataset.dragged) { delete b.dataset.dragged; return; }
      actions.select(b.dataset.selectDevice);
      if (state.view !== 'walk') ctx.scene.focusItem(state.selected);
    });
    section.querySelectorAll('[data-lights]').forEach(b => b.onclick = () => {
      const on = b.dataset.lights === 'on';
      if (lamps.every(item => lightFor(item).on === on)) return;
      actions.checkpoint();
      for (const item of lamps) item.light = { ...lightFor(item), on };
      ctx.devices.sendMany(lamps);
      actions.changed();
    });
  }

  // Escenas de la casa: guardan el estado de luces, aires y televisores y lo restauran de una vez.
  function mountScenes(container) {
    const { project } = state;
    const devices = project.items.filter(item => isLamp(item) || isClimate(item) || isTv(item) || isCover(item) || isVacuum(item));
    if (!devices.length) return;
    const scenes = project.scenes || [];
    const section = document.createElement('section');
    section.className = 'scene-list property-section';
    section.innerHTML = `
     <h3>Escenas <span>${scenes.length}</span></h3>
     ${scenes.length ? `<div class="scene-buttons">${scenes.map(scene => `
      <div class="scene-row"><button class="scene-activate" data-scene="${esc(scene.id)}">${icon('sun', 14)}<span>${esc(scene.name)}</span></button><button class="scene-delete icon-button" data-delete-scene="${esc(scene.id)}" aria-label="Eliminar escena ${esc(scene.name)}" title="Eliminar escena">${icon('close', 13)}</button></div>`).join('')}</div>`
      : '<p class="scene-empty">Ajusta las luces, los aires, los televisores, las cortinas y las aspiradoras como te gusten y guárdalos como una escena.</p>'}
     <button id="save-scene" class="secondary full" ${scenes.length >= sceneLimit ? 'disabled' : ''}>${icon('plus', 14)} Guardar el estado actual</button>`;
    (container.querySelector('.room-lighting') || container.querySelector('.overview-stats') || container.querySelector('.control-heading')).after(section);
    section.querySelectorAll('[data-scene]').forEach(b => b.onclick = () => activateScene(scenes.find(s => s.id === b.dataset.scene)));
    section.querySelectorAll('[data-delete-scene]').forEach(b => b.onclick = () => {
      actions.checkpoint();
      project.scenes = scenes.filter(s => s.id !== b.dataset.deleteScene);
      actions.changed();
    });
    section.querySelector('#save-scene').onclick = saveScene;
  }

  function activateScene(scene) {
    if (scene) actions.activateScene(scene);
  }

  function saveScene() {
    modal(`
     <h2>Guardar escena</h2>
     <p>Se guardará cómo están ahora todas las luces, aires acondicionados, televisores y cortinas de la casa.</p>
     <form id="scene-form" class="ha-form">
      <label>Nombre<input id="scene-name" maxlength="60" placeholder="Por ejemplo: Película" autocomplete="off" required></label>
      <div class="dialog-actions"><button type="button" data-close class="secondary">Cancelar</button><button type="submit" class="primary">Guardar escena</button></div>
     </form>`, () => {
      $('#scene-name').focus();
      $('#scene-form').onsubmit = event => {
        event.preventDefault();
        const name = $('#scene-name').value.trim();
        if (!name) return;
        actions.checkpoint();
        state.project.scenes = [...(state.project.scenes || []), captureScene(state.project, name)];
        $('#dialog').close();
        actions.changed();
        toast(`Escena «${name}» guardada.`);
      };
    });
  }

  function render() {
    cancelPreview();
    const { project } = state;
    const item = project.items.find(o => o.id === state.selected);
    const room = project.rooms.find(r => r.id === state.selected);
    const asset = item ? byId(item.asset) : null;
    const container = $('#inspector-content');
    // Modo control: solo equipos y escenas, sin edición. Un objeto elegido se controla en su barra.
    // Modo control: el panel de equipos al estilo house-control, sin edición.
    if (state.control) { ctx.controlPanel.render(container); return; }

    if (state.selection.length > 1) { renderGroup(container); return; }
    if (!item && !room) container.innerHTML = projectSummary();
    else {
      container.innerHTML = properties(item, room, asset, item ? warningsFor(item, project) : []);
      if (room) mountRoomTip(container, room);
      $('#deselect').onclick = () => actions.select(null);
      if (item) {
        $('#rotate-item').onclick = actions.rotateItem;
        $('#duplicate-item').onclick = actions.duplicateItem;
      }
      $('#delete-item').onclick = actions.deleteSelected;
      if ($('#preset')) $('#preset').onchange = event => {
        if (event.target.value === '') return;
        actions.checkpoint();
        [item.w, item.d, item.h] = asset.presets[Number(event.target.value)];
        if (isOpening(item)) alignOpening(item, project);
        actions.changed();
      };
    }
    if (!item) mountRoomDevices(container, room);
    if (room) ctx.devices.mountRoomSensors(container.querySelector('.room-edit-tip'), room);
    if (!item && !room) { mountScenes(container); mountVersions(container, ctx); ctx.automations?.mount(container); $('#shopping-list').onclick = showShopping; }
    if (item && $('#item-price')) bindPurchase(item);
    bindProperties(container, item, room);
  }

  function bindProperties(container, item, room) {
    const { project } = state;
    const target = item || room || project;

    // Cada campo se aplica al confirmarlo (Enter, salir del campo, soltar el slider o cerrar el
    // selector de color), como un paso de Deshacer. Un valor inválido vuelve al anterior.
    const revert = () => {
      for (const input of container.querySelectorAll('[data-field]')) {
        input.value = input.type === 'number' ? round(target[input.dataset.field]) : target[input.dataset.field];
        const slider = container.querySelector(`[data-linked="${input.dataset.field}"]`);
        if (slider) { slider.value = input.value; slider.style.setProperty('--fill', fillFor(slider)); }
      }
    };
    const commit = () => {
      const values = {};
      for (const input of container.querySelectorAll('[data-field]')) {
        const key = input.dataset.field;
        const value = input.type === 'number' ? Number(input.value) : input.value.trim();
        if (input.type === 'number' && (input.value === '' || !Number.isFinite(value) || value < Number(input.min) || value > Number(input.max))) {
          toast(`Usa un valor entre ${input.min} y ${input.max} para ${input.getAttribute('aria-label')}.`);
          revert();
          return;
        }
        if (key === 'name' && !value) { toast('El nombre no puede quedar vacío.'); revert(); return; }
        values[key] = value;
      }
      if (room && overlapsOtherRoom(project, room, { ...room, ...values })) { toast('Estas medidas superponen dos habitaciones.'); revert(); ctx.scene.rebuild(state.project, state.selected); return; }
      if (Object.keys(values).every(key => target[key] === values[key])) return;
      const focused = document.activeElement?.dataset.field || document.activeElement?.dataset.linked;
      actions.checkpoint();
      Object.assign(target, values);
      if (item && isOpening(item)) alignOpening(item, project);
      if (!item) project.items.filter(isOpening).forEach(o => alignOpening(o, project));
      actions.changed();
      // El panel se redibuja: el foco vuelve al mismo campo para seguir con el teclado.
      if (focused) $(`#inspector-content [data-field="${focused}"], #inspector-content [data-linked="${focused}"]`)?.focus({ preventScroll: true });
    };

    container.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('change', commit);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); commit(); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); revert(); input.blur(); }
      });
    });

    container.querySelectorAll('[data-linked]').forEach(slider => {
      const key = slider.dataset.linked;
      const number = container.querySelector(`[data-field="${key}"]`);
      slider.oninput = () => {
        number.value = slider.value;
        slider.style.setProperty('--fill', fillFor(slider));
        cancelPreview();
        previewFrame = requestAnimationFrame(() => {
          previewFrame = null;
          if (slider.isConnected) previewProperties(container, slider, item, room);
        });
      };
      slider.onchange = () => {
        cancelPreview();
        ctx.scene.rebuild(state.project, state.selected);
        commit();
      };
      slider.onkeydown = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        number.value = target[key];
        slider.value = target[key];
        slider.style.setProperty('--fill', fillFor(slider));
        slider.classList.remove('invalid');
        cancelPreview();
        ctx.scene.rebuild(state.project, state.selected);
      };
    });
  }

  // Dibuja una copia temporal del proyecto: el historial solo cambia al soltar el slider.
  function previewProperties(container, slider, item, room) {
    const preview = clone(state.project);
    const id = (item || room)?.id;
    const target = id ? (preview.items.find(i => i.id === id) || preview.rooms.find(r => r.id === id)) : preview;
    for (const field of container.querySelectorAll('input[type="number"][data-field]')) {
      const value = Number(field.value);
      if (field.value === '' || !Number.isFinite(value) || value < Number(field.min) || value > Number(field.max)) return;
      target[field.dataset.field] = value;
    }
    if (room && overlapsOtherRoom(preview, room, target)) { slider.classList.add('invalid'); return; }
    slider.classList.remove('invalid');
    if (item && isOpening(target)) alignOpening(target, preview);
    if (!item) preview.items.filter(isOpening).forEach(i => alignOpening(i, preview));
    ctx.scene.rebuild(preview, state.selected);
  }

  return { render };
}

function overlapsOtherRoom(project, room, candidate) {
  return project.rooms.some(r => r.id !== room.id && sameLevel(r, room) && overlaps({ ...r, rotation: 0 }, { ...candidate, rotation: 0 }));
}
