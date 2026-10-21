import { vacuumFor, vacuumNames } from './vacuum.js';

// Controles de la aspiradora seleccionada: limpiar, pausar y volver a la base. Cada botón es una
// orden completa (sin sliders), así que se guarda y se envía al pulsarlo. Con un robot real
// vinculado, solo aparecen las órdenes que admite y su batería.
export function mountVacuumControls(host, item, { commit, supports = null, battery = null }) {
  const state = vacuumFor(item);
  const allowed = { cleaning: !supports || supports.start, paused: !supports || supports.pause, docked: !supports || supports.dock };
  const labels = { cleaning: 'Limpiar', paused: 'Pausar', docked: 'A la base' };
  const pressed = status => status === state.status || (status === 'docked' && state.status === 'returning');
  host.innerHTML = `
   <div class="light-heading"><span>Aspiradora de la maqueta</span><small>${vacuumNames[state.status]}${battery != null ? ` · batería ${battery}%` : ''}</small></div>
   <div class="light-modes" role="group" aria-label="Órdenes de la aspiradora">${Object.keys(labels).filter(s => allowed[s]).map(s => `<button data-vacuum="${s}" aria-pressed="${pressed(s)}">${labels[s]}</button>`).join('')}</div>`;
  host.querySelectorAll('[data-vacuum]').forEach(b => b.onclick = () => {
    if (pressed(b.dataset.vacuum)) return;
    // Sin robot real, «A la base» lo deja directamente en la base; uno real informa «volviendo».
    commit({ status: b.dataset.vacuum });
  });
}
