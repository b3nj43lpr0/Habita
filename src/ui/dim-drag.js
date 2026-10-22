// Lámpara atenuable arrastrando a los lados (como HomeKit y house-control): la fila o tarjeta
// muestra el brillo en `--level`, previsualiza mientras se arrastra y guarda un solo paso de
// Deshacer al soltar. Bajo 4 % se apaga. Las flechas izquierda y derecha cambian de a 10 %.
// Tras un arrastre deja `data-dragged` para que el clic que sigue no cuente como toque.
import { lightFor } from '../devices/lighting.js';

export function dimByDragging(el, ctx, itemId) {
  const { state, actions } = ctx;
  const item = state.project.items.find(o => o.id === itemId);
  if (!item) return;
  const lightAt = level => ({ ...lightFor(item), on: level >= .04, brightness: Math.max(1, Math.round(level * 100)) });
  const show = light => {
    el.style.setProperty('--level', light.on ? light.brightness / 100 : 0);
    el.dispatchEvent(new CustomEvent('dimpreview', { detail: light }));
    ctx.scene.previewLight(item.id, light);
    ctx.devices.preview(item, light);
  };
  const save = light => {
    actions.checkpoint();
    item.light = light;
    ctx.devices.send(item);
    actions.changed();
  };
  let gesture = null;
  el.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('[data-no-dim]')) return;
    const now = lightFor(item);
    gesture = { x: event.clientX, y: event.clientY, start: now.on ? now.brightness / 100 : 0, light: null };
    el.classList.add('pressed');
  });
  el.addEventListener('pointermove', event => {
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    // Un movimiento sobre todo vertical es desplazar el panel, no atenuar.
    if (!gesture.light && (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(event.clientY - gesture.y))) return;
    if (!gesture.light) { el.setPointerCapture(event.pointerId); el.classList.add('dimming'); }
    gesture.light = lightAt(Math.min(1, Math.max(0, gesture.start + dx / el.clientWidth)));
    show(gesture.light);
  });
  const finish = event => {
    if (!gesture) return;
    const { light } = gesture;
    gesture = null;
    el.classList.remove('dimming', 'pressed');
    if (!light) return;
    if (event.type === 'pointercancel') { show(lightFor(item)); ctx.devices.endPreview(item); return; }
    el.dataset.dragged = '1';
    save(light);
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
  el.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const now = lightFor(item), level = (now.on ? now.brightness / 100 : 0) + (event.key === 'ArrowRight' ? .1 : -.1);
    save(lightAt(Math.min(1, Math.max(0, level))));
    document.querySelector(`[data-dim="${CSS.escape(item.id)}"]`)?.focus();
  });
}
