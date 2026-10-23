// Actualizaciones: al abrir Habita (y cada 6 horas) se revisa si hay una versión nueva en los
// Releases de GitHub. Con el instalador se descarga sola y se instala al reiniciar; la versión
// portable no puede reemplazarse a sí misma, así que solo avisa y abre la página de descarga.
const { app, shell } = require('electron');

const owner = 'b3nj43lpr0', repo = 'Habita';
const releasesPage = `https://github.com/${owner}/${repo}/releases/latest`;
const every = 6 * 60 * 60 * 1000;

// Compara versiones «1.2.3» (con o sin «v»): positivo si a es más nueva que b.
function compareVersions(a, b) {
  const parts = v => String(v).replace(/^v/, '').split(/[.-]/).slice(0, 3).map(n => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function createUpdater({ notify, trayNotify, beforeInstall }) {
  let state = { status: 'idle', version: null, progress: 0, portable: !!process.env.PORTABLE_EXECUTABLE_DIR };
  let updater = null, timer = null;
  const set = fields => { state = { ...state, ...fields }; notify('update:status', state); };

  function autoUpdater() {
    if (updater) return updater;
    ({ autoUpdater: updater } = require('electron-updater'));
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => set({ status: 'checking' }));
    updater.on('update-not-available', () => set({ status: 'current' }));
    updater.on('update-available', info => set({ status: 'downloading', version: info.version, progress: 0 }));
    updater.on('download-progress', p => set({ status: 'downloading', progress: Math.round(p.percent || 0) }));
    updater.on('update-downloaded', info => {
      set({ status: 'ready', version: info.version, progress: 100 });
      trayNotify('Actualización lista', `Habita ${info.version} se instalará al reiniciar.`);
    });
    updater.on('error', () => set({ status: 'error' }));
    return updater;
  }

  // La portable consulta el último Release y, si es más nuevo, ofrece descargarlo.
  async function checkPortable() {
    set({ status: 'checking' });
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(String(response.status));
      const release = await response.json();
      if (compareVersions(release.tag_name, app.getVersion()) > 0) set({ status: 'available', version: String(release.tag_name).replace(/^v/, '').slice(0, 30) });
      else set({ status: 'current' });
    } catch {
      set({ status: 'error' });
    }
  }

  async function check() {
    if (!app.isPackaged) return state;
    if (['downloading', 'ready'].includes(state.status)) return state;
    if (state.portable) await checkPortable();
    else await autoUpdater().checkForUpdates().catch(() => set({ status: 'error' }));
    return state;
  }

  function start() {
    if (!app.isPackaged) return;
    setTimeout(check, 8000);
    timer = setInterval(check, every);
  }

  function install() {
    if (state.portable) { shell.openExternal(releasesPage); return false; }
    if (state.status !== 'ready') return false;
    beforeInstall();
    // Silencioso (sin el asistente) y abre Habita de nuevo al terminar.
    setImmediate(() => updater.quitAndInstall(true, true));
    return true;
  }

  return { start, check, install, status: () => state, stop: () => clearInterval(timer) };
}

module.exports = { createUpdater, compareVersions, releasesPage };
