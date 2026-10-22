import { catalog, categories, makeItem, isOpening } from '../catalog.js';
import { round, snap, warningsFor, alignOpening } from '../model.js';
import { thumbnail } from '../furniture.js';
import { isClimate } from '../climate.js';
import { $, esc, fmt, toast, modal, plain, scrollHints } from './dom.js';
import { icon } from './icons.js';
import { mountPlanTools } from './floor-plan.js';
import { baseLevel, levelsOf, onLevel } from '../levels.js';

const wallMounted = ['tv-wall', 'mirror', 'wall-cabinet', 'hood', 'towel-rail', 'curtain', 'blind'];
const swatches = [
  ['Roble natural', '#c5ad8e'], ['Nogal', '#94795b'], ['Madera clara', '#d5c8ab'], ['Cemento', '#aeb3b0'],
  ['Piedra gris', '#929c9e'], ['Salvia', '#a7b9b3'], ['Arena', '#c9bfa7'], ['Arcilla', '#bd9a85']
];

// Panel izquierdo: catálogo de objetos, lista de espacios y materiales.
export function createLibrary(ctx) {
  const { state, actions } = ctx;

  function render() {
    const container = $('#library-content');
    if (state.tab === 'objects') renderObjects(container);
    else if (state.tab === 'rooms') renderRooms(container);
    else renderMaterials(container);
  }

  function renderObjects(container) {
    container.innerHTML = `
     <div class="search-field">${icon('search', 16)}<input id="search" placeholder="Busca un objeto…" aria-label="Buscar objetos" value="${esc(state.query)}"></div>
     <div class="categories">${categories.map(c => `<button data-category="${esc(c)}" class="${c === state.category ? 'active' : ''}">${esc(c)}</button>`).join('')}</div>
     <div class="catalog-caption"><span id="catalog-total"></span><span>Medidas editables</span></div>
     <div id="asset-grid" class="asset-grid"></div>`;
    $('#search').addEventListener('input', event => { state.query = event.target.value; renderAssets(); });
    container.querySelectorAll('[data-category]').forEach(button => button.onclick = () => {
      state.category = button.dataset.category;
      container.querySelectorAll('[data-category]').forEach(b => b.classList.toggle('active', b === button));
      renderAssets();
    });
    const chips = container.querySelector('.categories');
    scrollHints(chips);
    chips.querySelector('.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    renderAssets();
  }

  function renderAssets() {
    const query = plain(state.query.trim());
    const filtered = catalog.filter(a =>
      (state.category === 'Todos' || state.category === a.category) && plain(`${a.name} ${a.category}`).includes(query));
    $('#catalog-total').textContent = `${filtered.length} objetos`;
    const grid = $('#asset-grid');
    grid.innerHTML = filtered.length
      ? filtered.map(a => `
         <button class="asset-card" data-asset="${a.id}" aria-label="Añadir ${esc(a.name)}">
          <span class="asset-preview"><img src="${thumbnail(a)}" alt="" draggable="false"><span class="asset-add">+</span></span>
          <strong>${esc(a.name)}</strong><span class="asset-size">${fmt(a.w)} × ${fmt(a.d)} m</span>
         </button>`).join('')
      : '<p class="empty-state">No encontramos ese objeto. Prueba otra búsqueda.</p>';
    grid.querySelectorAll('[data-asset]').forEach(button => button.onclick = () => addAsset(button.dataset.asset));
  }

  function renderRooms(container) {
    const levels = levelsOf(state.project);
    const rooms = onLevel(state.project, state.level).rooms.map(r => `
      <button data-room="${esc(r.id)}">
       <span class="room-dot" style="background:${r.color}"></span>
       <span>${esc(r.name)}<small>${fmt(r.w)} × ${fmt(r.d)} m</small></span><b>${fmt(r.w * r.d)} m²</b>
      </button>`).join('');
    container.innerHTML = `
     <div class="library-description">Dibuja una habitación con dos clics en el plano. Sus paredes se generan al instante.</div>
     <button class="primary full" id="draw-room">${icon('plus', 16)} Dibujar habitación</button>
     <button class="secondary full" id="add-note">${icon('note', 16)} Agregar nota al plano</button>
     <div class="section-label">Pisos</div>
     <div class="level-list">${levels.map(l => `
      <div class="level-row ${l.id === state.level ? 'active' : ''}">
       <button data-level="${esc(l.id)}" aria-label="Ver ${esc(l.name)}">${icon('layers', 14)}</button>
       <input data-level-name="${esc(l.id)}" value="${esc(l.name)}" maxlength="60" aria-label="Nombre del piso">
       ${l.id !== baseLevel ? `<button data-delete-level="${esc(l.id)}" class="icon-button" aria-label="Eliminar ${esc(l.name)}" title="Eliminar piso">${icon('trash', 14)}</button>` : ''}
      </div>`).join('')}</div>
     <button id="add-level" class="secondary full">${icon('plus', 15)} Agregar piso</button>
     <div class="section-label">Espacios de ${esc(levels.find(l => l.id === state.level)?.name || levels[0].name)}</div><div class="space-list">${rooms}</div>
     <button id="empty-project" class="secondary full">Empezar una casa vacía</button>`;
    $('#draw-room').onclick = actions.startDrawing;
    $('#add-note').onclick = () => actions.startNote();
    $('#add-level').onclick = actions.addLevel;
    container.querySelectorAll('[data-level]').forEach(b => b.onclick = () => actions.setLevel(b.dataset.level));
    container.querySelectorAll('[data-level-name]').forEach(input => input.onchange = () => actions.renameLevel(input.dataset.levelName, input.value));
    container.querySelectorAll('[data-delete-level]').forEach(b => b.onclick = () => actions.deleteLevel(b.dataset.deleteLevel));
    container.querySelectorAll('[data-room]').forEach(b => b.onclick = () => actions.select(b.dataset.room));
    $('#empty-project').onclick = confirmEmptyProject;
    mountPlanTools(container, ctx);
  }

  function confirmEmptyProject() {
    modal(`
     <h2>Empezar una casa vacía</h2>
     <p>Guarda tu proyecto actual antes de continuar. También puedes recuperar este cambio con Deshacer.</p>
     <div class="dialog-actions"><button data-close class="secondary">Cancelar</button><button id="confirm-empty" class="primary">Crear casa vacía</button></div>`, () => {
      $('#confirm-empty').onclick = () => {
        actions.checkpoint();
        state.project = { version: 1, name: 'Mi nueva casa', wallHeight: 2.6, wallThickness: .14, rooms: [], items: [] };
        state.selected = null;
        $('#project-name').value = state.project.name;
        $('#dialog').close();
        actions.changed();
        actions.startDrawing();
      };
    });
  }

  function renderMaterials(container) {
    container.innerHTML = `
     <div class="library-description">Selecciona una habitación para cambiar su suelo, o un objeto para cambiar su color.</div>
     <div class="material-grid">${swatches.map(([name, color]) => `<button data-color="${color}"><span style="background:${color}"></span>${name}</button>`).join('')}</div>
     <div class="library-note">Los acabados de esta versión son colores y un patrón de madera sencillo. Las texturas fotográficas se añadirán al catálogo.</div>`;
    container.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
      const { project, selected } = state;
      const target = project.items.find(o => o.id === selected) || project.rooms.find(r => r.id === selected);
      if (!target) { toast('Selecciona primero un objeto o habitación.'); return; }
      actions.checkpoint();
      target.color = b.dataset.color;
      actions.changed();
    });
  }

  function addAsset(assetId) {
    const { project } = state;
    const room = project.rooms.find(r => r.id === state.selected) || onLevel(project, state.level).rooms[0];
    if (!room) { toast('Dibuja una habitación en este piso antes de añadir objetos.'); return; }
    const item = makeItem(assetId, room.x, room.z);
    if (room.level) item.level = room.level;
    if (isOpening(item)) {
      if (!alignOpening(item, project)) { toast('No hay una pared suficientemente ancha para esta abertura.'); return; }
    } else if (isClimate(item) || wallMounted.includes(item.asset)) {
      // Un equipo split, un televisor de muro o un espejo van contra el muro del fondo del espacio, mirando hacia el interior.
      item.x = snap(room.x, state.snapping);
      item.z = round(room.z - room.d / 2 + item.d / 2 + project.wallThickness / 2);
      item.rotation = 0;
      if (isClimate(item)) item.elevation = round(Math.min(2, Math.max(0, project.wallHeight - item.h - .25)));
    } else {
      // Buscar un lugar libre dentro del espacio seleccionado antes de superponer.
      const step = .25, margin = .15;
      let placed = false;
      for (let z = room.z - room.d / 2 + item.d / 2 + margin; z <= room.z + room.d / 2 - item.d / 2 - margin && !placed; z += step) {
        for (let x = room.x - room.w / 2 + item.w / 2 + margin; x <= room.x + room.w / 2 - item.w / 2 - margin && !placed; x += step) {
          item.x = snap(x, state.snapping);
          item.z = snap(z, state.snapping);
          if (!warningsFor(item, project).length) placed = true;
        }
      }
      if (!placed) { item.x = round(room.x); item.z = round(room.z); }
    }
    actions.checkpoint();
    project.items.push(item);
    state.selected = item.id;
    actions.changed();
    toast(`${item.name} añadido. Arrástralo para moverlo.`);
  }

  return { render };
}
