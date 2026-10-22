import { $, esc, modal, toast, download } from './dom.js';
import { icon } from './icons.js';

// Video del recorrido: la cámara de la maqueta da una vuelta o pasea por los espacios y el
// resultado se guarda como MP4 con H.264 si el motor lo permite (lo abre cualquier reproductor) o
// como WebM. Solo se graba la maqueta, sin paneles ni controles.
const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'];

export function createVideo(ctx) {
  const { state, actions } = ctx;
  const badge = document.createElement('div');
  badge.id = 'recording';
  badge.hidden = true;
  $('.viewport').append(badge);

  function open() {
    if (typeof MediaRecorder === 'undefined') { toast('Este equipo no permite grabar video.'); return; }
    modal(`
     <h2>Video del recorrido</h2>
     <p>La cámara recorre la maqueta y Habita guarda el video para compartirlo. Usa el ambiente y la iluminación que tengas ahora.</p>
     <form id="video-form" class="ha-form">
      <div class="video-kinds" role="radiogroup" aria-label="Tipo de recorrido">
       <label><input type="radio" name="kind" value="orbit" checked><span>${icon('rotate', 18)}<b>Vuelta a la casa</b><small>Una vuelta completa alrededor de la maqueta.</small></span></label>
       <label><input type="radio" name="kind" value="rooms"><span>${icon('home', 18)}<b>Paseo por los espacios</b><small>Se acerca a cada habitación del piso actual.</small></span></label>
      </div>
      <label>Duración<select id="video-seconds"><option value="8">8 segundos</option><option value="15" selected>15 segundos</option><option value="25">25 segundos</option></select></label>
      <div class="dialog-actions"><button type="button" data-close class="secondary">Cancelar</button><button type="submit" class="primary">${icon('video', 15)} Grabar</button></div>
     </form>`, () => {
      $('#video-form').onsubmit = event => {
        event.preventDefault();
        const kind = new FormData(event.target).get('kind'), seconds = Number($('#video-seconds').value);
        $('#dialog').close();
        record(kind, seconds);
      };
    });
  }

  function record(kind, seconds) {
    if (state.view !== '3d') actions.setView('3d');
    actions.select(null);
    const type = types.find(t => MediaRecorder.isTypeSupported(t));
    const chunks = [];
    let recorder = null;
    const stream = ctx.scene.startTour(kind, seconds, () => recorder?.state === 'recording' && recorder.stop());
    if (!stream) { toast('No se pudo empezar el recorrido.'); return; }
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      clearInterval(timer);
      badge.hidden = true;
      stream.getTracks().forEach(track => track.stop());
      if (!chunks.length) { toast('El video quedó vacío.'); return; }
      const extension = type.startsWith('video/mp4') ? 'mp4' : 'webm';
      download(new Blob(chunks, { type: type.split(';')[0] }), `${state.project.name || 'Habita'} - recorrido.${extension}`, type.split(';')[0]);
      toast(`Video guardado (${extension.toUpperCase()}).`);
    };
    recorder.start(500);
    const started = Date.now();
    const paint = () => {
      const left = Math.max(0, Math.ceil(seconds - (Date.now() - started) / 1000));
      badge.innerHTML = `<i></i>Grabando video · ${left} s <button type="button">Detener</button>`;
      badge.querySelector('button').onclick = () => ctx.scene.stopTour();
    };
    badge.hidden = false;
    paint();
    const timer = setInterval(paint, 500);
  }

  return { open };
}
