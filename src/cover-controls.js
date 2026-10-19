import { coverFor } from './cover.js';

// Controles de la cortina seleccionada. Si el motor real no admite posición, solo abre y cierra.
// Los motores no se controlan en vivo: el slider se previsualiza y se envía al soltar.
export function mountCoverControls(host, item, { preview, commit, supports = null }) {
  let state = coverFor(item);
  const slider = !supports || supports.position;
  host.innerHTML = `
   <div class="light-heading"><span>Cortina de la maqueta</span></div>
   ${slider ? '<div class="lamp-range"><span>Apertura <output></output></span><div class="range-row"><button type="button" class="range-step" data-step="-1" aria-label="Bajar" title="Bajar">−</button><input data-cover="position" type="range" min="0" max="100" step="5" aria-label="Apertura de la cortina"><button type="button" class="range-step" data-step="1" aria-label="Subir" title="Subir">+</button></div></div>' : ''}
   <div class="light-modes" role="group" aria-label="Abrir o cerrar"><button data-position="100">Abrir</button><button data-position="0">Cerrar</button></div>`;
  const range = host.querySelector('[data-cover="position"]');
  function paint() {
    if (range) {
      range.value = state.position;
      range.closest('.lamp-range').querySelector('output').textContent = `${state.position}%`;
      range.style.setProperty('--fill', `${state.position}%`);
    }
    host.querySelectorAll('[data-position]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.position) === state.position)));
  }
  const save = () => commit({ ...state });
  host.querySelectorAll('[data-position]').forEach(b => b.onclick = () => { state.position = Number(b.dataset.position); save(); });
  if (range) {
    range.oninput = () => { state.position = Number(range.value); paint(); preview({ ...state }); };
    range.onchange = save;
    const cancel = () => { state = coverFor(item); preview(state); paint(); };
    range.onpointercancel = cancel;
    range.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } };
  }
  paint();
}
