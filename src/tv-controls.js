import { tvFor } from './tv.js';
import { esc } from './app/dom.js';

// Controles del televisor seleccionado. Vinculado, `supports` deja solo lo que el equipo admite
// (supported_features de Home Assistant); sin vínculo se muestran encendido, volumen y silencio.
export function mountTvControls(host, item, { preview, commit, end, supports = null }) {
  let state = tvFor(item);
  const power = !supports || supports.power, volume = !supports || supports.volume, mute = !supports || supports.mute;
  const sources = supports?.sources || [];
  host.innerHTML = `
   <div class="light-heading"><span>Televisor de la maqueta</span>${power ? '<button class="light-power" aria-pressed="false"></button>' : ''}</div>
   ${volume ? '<div class="lamp-range"><span>Volumen <output></output></span><div class="range-row"><button type="button" class="range-step" data-step="-1" aria-label="Bajar" title="Bajar">−</button><input data-tv="volume" type="range" min="0" max="100" step="1" aria-label="Volumen del televisor"><button type="button" class="range-step" data-step="1" aria-label="Subir" title="Subir">+</button></div></div>' : ''}
   ${mute ? '<div class="light-modes" role="group" aria-label="Sonido"><button data-mute="false">Con sonido</button><button data-mute="true">Silencio</button></div>' : ''}
   ${sources.length ? `<label class="tv-source"><span>Entrada</span><select data-tv="source" aria-label="Entrada del televisor"><option value="" disabled>Elegir entrada…</option>${sources.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></label>` : ''}`;

  const range = host.querySelector('[data-tv="volume"]');
  function paint() {
    const button = host.querySelector('.light-power');
    if (button) {
      button.textContent = state.on ? 'Encendido' : 'Apagado';
      button.setAttribute('aria-pressed', String(state.on));
      button.setAttribute('aria-label', state.on ? 'Apagar televisor' : 'Encender televisor');
    }
    if (range) {
      range.value = state.volume;
      range.closest('.lamp-range').querySelector('output').textContent = `${state.volume}%`;
      range.style.setProperty('--fill', `${state.volume}%`);
    }
    host.querySelectorAll('[data-mute]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mute === String(state.muted))));
    const select = host.querySelector('[data-tv="source"]');
    if (select) select.value = state.source;
    host.classList.toggle('climate-off', !state.on);
  }
  const save = () => commit({ ...state });
  const button = host.querySelector('.light-power');
  if (button) button.onclick = () => { state.on = !state.on; save(); };
  host.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { state.muted = b.dataset.mute === 'true'; save(); });
  const select = host.querySelector('[data-tv="source"]');
  if (select) select.onchange = () => { state.source = select.value; save(); };
  if (range) {
    range.oninput = () => { state.volume = Number(range.value); paint(); preview({ ...state }); };
    range.onchange = save;
    const cancel = () => { state = tvFor(item); preview(state); paint(); end?.(); };
    range.onpointercancel = cancel;
    range.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } };
  }
  paint();
}
