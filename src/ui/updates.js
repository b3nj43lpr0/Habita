// Aviso de versión nueva en la barra de estado: se descarga sola y un clic reinicia Habita ya
// actualizada. En la versión portable el botón abre la página de descarga.
import { esc, toast } from './dom.js';

export function createUpdates(statusbar) {
  const updates = window.habita?.updates;
  if (!updates) return;
  const button = document.createElement('button');
  button.id = 'update-status';
  button.hidden = true;
  statusbar.prepend(button);

  function paint(state) {
    const { status, version, progress, portable } = state || {};
    button.hidden = !['downloading', 'ready', 'available'].includes(status);
    button.dataset.status = status || '';
    if (status === 'downloading') button.innerHTML = `Descargando Habita ${esc(version || '')}… ${progress || 0}%`;
    else if (status === 'ready') button.innerHTML = `<b>Actualizar a ${esc(version)}</b> · reinicia Habita`;
    else if (status === 'available') button.innerHTML = `<b>Habita ${esc(version)} disponible</b> · ${portable ? 'Descargar' : 'Actualizar'}`;
    button.title = status === 'ready' ? 'Cierra Habita, instala la versión nueva y la vuelve a abrir. Tu casa queda guardada.' : '';
  }

  button.onclick = async () => {
    const state = await updates.status();
    if (state.status === 'downloading') { toast('La versión nueva se está descargando. Te avisaremos cuando esté lista.'); return; }
    if (state.portable) toast('Se abrió la página de descarga. Reemplaza el archivo portable por el nuevo.');
    await updates.install();
  };
  updates.onStatus(paint);
  updates.status().then(paint).catch(() => {});
}
