import { newPlan, planImageLimit } from '../plan.js';
import { $, fmt, toast } from './dom.js';
import { icon } from './icons.js';

const maxSide = 2000;

// Reduce la imagen y la vuelve a codificar en JPEG: acota el tamaño del archivo .habita y descarta
// cualquier dato que no sea la imagen misma.
async function prepareImage(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  try { await image.decode(); } catch { throw new Error('No se pudo leer la imagen.'); }
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const draw = canvas.getContext('2d');
  draw.fillStyle = '#ffffff';
  draw.fillRect(0, 0, canvas.width, canvas.height);
  draw.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [.85, .7, .5]) {
    const result = canvas.toDataURL('image/jpeg', quality);
    if (result.length <= planImageLimit) return { image: result, width: canvas.width, height: canvas.height };
  }
  throw new Error('La imagen es demasiado detallada. Prueba con una de menor resolución.');
}

// Sin la app de escritorio, el navegador abre la imagen con su propio selector de archivos.
function pickInBrowser() {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg' });
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      if (file.size > 15_000_000) { toast('La imagen supera 15 MB.'); return resolve(null); }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

// Sección «Plano de referencia» de la pestaña Espacios.
export function mountPlanTools(container, ctx) {
  const { state, actions } = ctx;
  const plan = state.project.plan;
  const section = document.createElement('div');
  section.className = 'plan-tools';
  section.innerHTML = plan ? `
    <div class="section-label">Plano de referencia</div>
    <label>Opacidad <input id="plan-opacity" type="range" min="0.1" max="1" step="0.05" value="${plan.opacity}" style="--fill:${(plan.opacity - .1) / .9 * 100}%" aria-label="Opacidad del plano"></label>
    <button id="plan-calibrate" class="secondary full">${icon('ruler', 15)} Calibrar escala con una medida</button>
    <label class="plan-lock"><input id="plan-lock" type="checkbox" ${plan.locked ? 'checked' : ''}> Bloquear posición</label>
    <small>${fmt(plan.w)} × ${fmt(plan.d)} m · ${plan.locked ? 'Desbloquéalo para moverlo.' : 'Arrástralo en el plano 2D para moverlo.'}</small>
    <button id="plan-remove" class="danger full">${icon('trash', 15)} Quitar plano</button>`
    : `
    <div class="section-label">Plano de referencia</div>
    <button id="plan-import" class="secondary full">${icon('image', 15)} Importar plano (PNG o JPG)</button>
    <small>Se muestra en el plano 2D para dibujar encima. Después, calíbralo con una medida conocida.</small>`;
  container.append(section);

  if (!plan) { $('#plan-import').onclick = () => importPlan(ctx); return; }
  const opacity = $('#plan-opacity');
  opacity.oninput = () => {
    opacity.style.setProperty('--fill', `${(opacity.value - .1) / .9 * 100}%`);
    ctx.scene.plan({ ...plan, opacity: Number(opacity.value) });
  };
  opacity.onchange = () => { actions.checkpoint(); plan.opacity = Number(opacity.value); actions.changed(); };
  $('#plan-lock').onchange = event => { actions.checkpoint(); plan.locked = event.target.checked; actions.changed(); };
  $('#plan-calibrate').onclick = actions.startCalibration;
  $('#plan-remove').onclick = () => { actions.checkpoint(); delete state.project.plan; actions.changed(); toast('Plano de referencia quitado. Deshacer lo recupera.'); };
}

async function importPlan(ctx) {
  const { state, actions } = ctx;
  try {
    const source = window.habita?.openImage ? await window.habita.openImage() : await pickInBrowser();
    if (!source) return;
    const { image, width, height } = await prepareImage(source);
    actions.checkpoint();
    state.project.plan = newPlan(image, width, height, state.project);
    actions.changed();
    actions.setView('2d');
    toast('Plano importado. Calibra la escala marcando una medida conocida.');
  } catch (error) {
    toast(String(error?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  }
}
