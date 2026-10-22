import { climateFor, climateModes, fanSpeeds, modeNames, fanNames, climateRange } from '../devices/climate.js';

const format = n => `${Number(n).toLocaleString('es-CL', { maximumFractionDigits: 1 })} °C`;

// Controles del aire acondicionado seleccionado. Si está vinculado, `supports` limita los modos,
// velocidades y el rango a lo que el equipo real admite.
export function mountClimateControls(host, item, { preview, commit, supports = null, current = null }) {
  let state = climateFor(item);
  const modes = supports?.modes?.length ? climateModes.filter(m => supports.modes.includes(m)) : climateModes;
  const fans = supports ? fanSpeeds.filter(f => supports.fans.includes(f)) : fanSpeeds;
  const min = supports?.min ?? climateRange.min, max = supports?.max ?? climateRange.max, step = supports?.step || climateRange.step;
  host.innerHTML = `
   <div class="light-heading"><span>Clima de la maqueta</span><button class="light-power" aria-pressed="false"></button></div>
   <div class="lamp-range climate-target"><span>Temperatura <output></output></span><div class="range-row"><button type="button" class="range-step" data-step="-1" aria-label="Bajar" title="Bajar">−</button><input data-climate="target" type="range" min="${min}" max="${max}" step="${step}" aria-label="Temperatura objetivo"><button type="button" class="range-step" data-step="1" aria-label="Subir" title="Subir">+</button></div></div>
   ${current != null ? `<p class="climate-current">Ahora en la habitación: <strong>${format(current)}</strong></p>` : ''}
   <div class="light-modes climate-modes" role="group" aria-label="Modo">${modes.map(m => `<button data-mode="${m}">${modeNames[m]}</button>`).join('')}</div>
   ${fans.length ? `<div class="climate-fan"><span>Ventilador</span><div class="light-modes" role="group" aria-label="Velocidad del ventilador">${fans.map(f => `<button data-fan="${f}">${fanNames[f]}</button>`).join('')}</div></div>` : ''}
   ${!supports || supports.swing ? `<div class="climate-fan"><span>Aleta</span><div class="light-modes" role="group" aria-label="Aleta"><button data-swing="false">Fija</button><button data-swing="true">Oscilar</button></div></div>` : ''}`;

  const range = host.querySelector('[data-climate="target"]');
  function paint() {
    const power = host.querySelector('.light-power');
    power.textContent = state.on ? 'Encendido' : 'Apagado';
    power.setAttribute('aria-pressed', String(state.on));
    power.setAttribute('aria-label', state.on ? 'Apagar aire acondicionado' : 'Encender aire acondicionado');
    range.value = state.target;
    range.closest('.lamp-range').querySelector('output').textContent = format(state.target);
    range.style.setProperty('--fill', `${(state.target - min) / (max - min) * 100}%`);
    host.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
    host.querySelectorAll('[data-fan]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fan === state.fan)));
    host.querySelectorAll('[data-swing]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.swing === String(!!state.swing))));
    host.dataset.mode = state.mode;
    host.classList.toggle('climate-off', !state.on);
  }
  const save = () => commit({ ...state });
  host.querySelector('.light-power').onclick = () => { state.on = !state.on; save(); };
  host.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { state.mode = b.dataset.mode; save(); });
  host.querySelectorAll('[data-fan]').forEach(b => b.onclick = () => { state.fan = b.dataset.fan; save(); });
  host.querySelectorAll('[data-swing]').forEach(b => b.onclick = () => { state.swing = b.dataset.swing === 'true'; save(); });
  range.oninput = () => { state.target = Number(range.value); paint(); preview({ ...state }); };
  range.onchange = save;
  const cancel = () => { state = climateFor(item); preview(state); paint(); };
  range.onpointercancel = cancel;
  range.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } };
  paint();
}
