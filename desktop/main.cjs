const { app, BrowserWindow, ipcMain, dialog, safeStorage, clipboard, shell, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { HomeAssistantClient } = require('./home-assistant.cjs');
const { HueClient } = require('./hue.cjs');
const { browse } = require('./mdns.cjs');
const { validLightState } = require('./ha-mapping.cjs');
const { createRemote, remoteTools } = require('./remote.cjs');
const { createEventLog } = require('./event-log.cjs');
const { createAiBridge } = require('./ai-bridge.cjs');
const { createTray } = require('./tray.cjs');
const { createUpdater } = require('./updater.cjs');

let win;
const homeAssistant = new HomeAssistantClient();
const hue = new HueClient();
const hueConfigPath = () => path.join(app.getPath('userData'), 'hue.json');
const configPath = () => path.join(app.getPath('userData'), 'home-assistant.json');
let eventLog = null;
const events = () => (eventLog ??= createEventLog(path.join(app.getPath('userData'), 'events.log')));
const logEvent = fields => events().append(fields);
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
let settings = {};
let tray = null;
let quitting = false;

// Una sola instancia: abrir Habita otra vez muestra la ventana que ya está en la bandeja.
// `exit` y no `quit`: quit dispararía will-quit, que borra el acceso de IA de la instancia abierta.
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', showWindow);

function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function quit() {
  quitting = true;
  app.quit();
}

async function saveSettings() {
  await fs.writeFile(settingsPath(), JSON.stringify(settings), 'utf8').catch(() => {});
}

app.whenReady().then(() => {
  try { settings = JSON.parse(require('node:fs').readFileSync(settingsPath(), 'utf8')) || {}; } catch {}
  win = new BrowserWindow({ width: 1500, height: 960, minWidth: 1000, minHeight: 700, backgroundColor: '#151a22', title: 'Habita Studio', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.loadFile(path.join(__dirname, '../dist/index.html'));
  // Con la casa conectada o la IA con acceso, cerrar la ventana deja Habita en la bandeja.
  win.on('close', event => {
    if (quitting || !tray || !(homeAssistant.url || aiBridge.running)) return;
    event.preventDefault();
    win.hide();
    if (!settings.trayNoticeShown) {
      settings.trayNoticeShown = true;
      saveSettings();
      tray.notify('Habita sigue en la bandeja', 'Tu casa sigue conectada. Para cerrar Habita, usa «Salir de Habita» en su ícono.');
    }
  });
  tray = createTray({ show: showWindow, togglePanel, activateScene: id => { notify('tray:scene', id); peek(); }, aiAccess: () => aiBridge.running, setAiAccess, aiEdit: () => settings.aiEdit === true, setAiEdit, aiAutoStop: () => settings.aiAutoStop || 0, setAiAutoStop, copyMcpConfig, phoneAccess: () => remote.running, setPhoneAccess, showPhoneCode: () => { showWindow(); notify('remote:show'); }, quit });
  if (settings.remote) setPhoneAccess(true).catch(() => {});
  restoreHomeAssistant();
  if (settings.aiAccess) setAiAccess(true).catch(() => {});
  updater.start();
});

// Versión nueva: se descarga sola y se instala al reiniciar (ver updater.cjs).
const updater = createUpdater({ notify: (channel, payload) => notify(channel, payload), trayNotify: (title, body) => tray?.notify(title, body), beforeInstall: () => { quitting = true; } });
ipcMain.handle('update:status', event => { trusted(event); return updater.status(); });
ipcMain.handle('update:check', event => { trusted(event); return updater.check(); });
ipcMain.handle('update:install', event => { trusted(event); return updater.install(); });

function trusted(event) {
  if (!win || event.sender !== win.webContents) throw new Error('Origen inválido');
}

ipcMain.handle('open-link', async (event, url) => {
  trusted(event);
  if (typeof url !== 'string' || url.length > 500 || !/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Enlace inválido.');
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('save-project', async (event, contents) => {
  if (event.sender !== win.webContents || typeof contents !== 'string' || contents.length > 30_000_000) throw new Error('Proyecto inválido');
  const result = await dialog.showSaveDialog(win, { defaultPath: 'Mi casa.habita', filters: [{ name: 'Proyecto Habita', extensions: ['habita'] }] });
  if (result.canceled) return false;
  await fs.writeFile(result.filePath, contents, 'utf8');
  return true;
});
ipcMain.handle('open-project', async (event) => {
  if (event.sender !== win.webContents) throw new Error('Origen inválido');
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Proyecto Habita', extensions: ['habita', 'json'] }] });
  if (result.canceled) return null;
  const stat = await fs.stat(result.filePaths[0]);
  if (stat.size > 25_000_000) throw new Error('El archivo supera 25 MB');
  return fs.readFile(result.filePaths[0], 'utf8');
});

// Informe en PDF: el HTML (sin scripts) se abre en una ventana oculta, sin acceso a nada, y Chromium
// lo imprime a PDF en tamaño carta A4.
ipcMain.handle('export-pdf', async (event, html, name) => {
  trusted(event);
  if (typeof html !== 'string' || html.length > 30_000_000 || typeof name !== 'string') throw new Error('Informe inválido.');
  const result = await dialog.showSaveDialog(win, { defaultPath: `${name.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'Mi casa'}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (result.canceled) return false;
  const file = path.join(app.getPath('temp'), `habita-informe-${crypto.randomUUID()}.html`);
  const printer = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  printer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  printer.webContents.on('will-navigate', e => e.preventDefault());
  try {
    await fs.writeFile(file, html, 'utf8');
    await printer.loadFile(file);
    const pdf = await printer.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: .5, bottom: .5, left: .5, right: .5 } });
    await fs.writeFile(result.filePath, pdf);
  } finally {
    printer.destroy();
    fs.rm(file, { force: true }).catch(() => {});
  }
  shell.openPath(result.filePath).catch(() => {});
  return true;
});

// Modelo 3D (.glb) elegido en el diálogo nativo; vuelve como data URL.
ipcMain.handle('open-model', async (event) => {
  trusted(event);
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Modelo 3D (GLB)', extensions: ['glb'] }] });
  if (result.canceled) return null;
  const stat = await fs.stat(result.filePaths[0]);
  if (stat.size > 3_000_000) throw new Error('El modelo supera 3 MB. Busca una versión más liviana.');
  const data = await fs.readFile(result.filePaths[0]);
  if (data.subarray(0, 4).toString() !== 'glTF') throw new Error('El archivo no es un modelo GLB.');
  return { name: path.basename(result.filePaths[0], path.extname(result.filePaths[0])).slice(0, 80), data: `data:model/gltf-binary;base64,${data.toString('base64')}` };
});

ipcMain.handle('open-image', async (event) => {
  trusted(event);
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Imagen del plano', extensions: ['png', 'jpg', 'jpeg'] }] });
  if (result.canceled) return null;
  const stat = await fs.stat(result.filePaths[0]);
  if (stat.size > 15_000_000) throw new Error('La imagen supera 15 MB');
  const data = await fs.readFile(result.filePaths[0]);
  // El tipo se decide por la firma del archivo, no por su extensión.
  const type = data[0] === 0x89 && data.subarray(1, 4).toString() === 'PNG' ? 'png' : data[0] === 0xff && data[1] === 0xd8 ? 'jpeg' : null;
  if (!type) throw new Error('El archivo no es una imagen PNG o JPG.');
  return `data:image/${type};base64,${data.toString('base64')}`;
});

// Home Assistant: el token se cifra con la cuenta de Windows (DPAPI) y nunca sale de este proceso.
async function readConfig() {
  try {
    const saved = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    if (typeof saved.url !== 'string' || typeof saved.token !== 'string') return null;
    return { url: saved.url, token: safeStorage.decryptString(Buffer.from(saved.token, 'base64')) };
  } catch {
    return null;
  }
}

async function writeConfig(url, token) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows no permite cifrar el token en este equipo.');
  const encrypted = safeStorage.encryptString(token).toString('base64');
  await fs.writeFile(configPath(), JSON.stringify({ url, token: encrypted }), 'utf8');
}

function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length > 300) throw new Error('Dirección inválida.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Escribe una dirección como http://homeassistant.local:8123'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('La dirección debe empezar con http:// o https://');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

async function restoreHomeAssistant() {
  const config = await readConfig();
  if (config) homeAssistant.connect(config.url, config.token, { persistent: true }).catch(() => {});
  const bridge = await readHueConfig();
  if (bridge) hue.connect(bridge.host, bridge.username).catch(() => {});
}

// Philips Hue: el usuario que entrega el puente se cifra igual que el token de Home Assistant.
async function readHueConfig() {
  try {
    const saved = JSON.parse(await fs.readFile(hueConfigPath(), 'utf8'));
    return typeof saved.host === 'string' && typeof saved.username === 'string' ? { host: saved.host, username: safeStorage.decryptString(Buffer.from(saved.username, 'base64')) } : null;
  } catch {
    return null;
  }
}

// Sin Home Assistant, el estado de la casa es el del puente Hue (si está vinculado).
function status() {
  const hueState = { paired: !!hue.host, status: hue.state.status, message: hue.state.message, host: hue.host };
  if (!homeAssistant.url && hue.host) return { available: true, configured: true, url: '', ...hue.state, hue: hueState };
  return { available: true, configured: !!homeAssistant.url || !!hue.host, url: homeAssistant.url || '', ...homeAssistant.state, hue: hueState };
}
const allDevices = () => [...(homeAssistant.state.status === 'connected' ? homeAssistant.devices() : []), ...(hue.state.status === 'connected' ? hue.devices() : [])];

const notify = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
homeAssistant.on('status', state => { notify('ha:status', status()); logEvent(['conexión', state.status, state.message || '']); });
homeAssistant.on('command', c => logEvent([c.entityId, c.service, JSON.stringify(c.data), c.ok ? 'ok' : `error: ${c.error}`, `${c.ms} ms`]));
homeAssistant.on('devices', () => notify('ha:devices', allDevices()));
hue.on('devices', () => notify('ha:devices', allDevices()));
hue.on('device', device => notify('ha:device', device));
hue.on('status', state => { notify('ha:status', status()); logEvent(['Hue', state.status, state.message || '']); if (state.status !== 'connected') notify('ha:devices', allDevices()); });
hue.on('command', c => logEvent([c.entityId, c.service, JSON.stringify(c.data), c.ok ? 'ok' : `error: ${c.error}`, `${c.ms} ms`]));
homeAssistant.on('device', device => notify('ha:device', device));

ipcMain.handle('ha:status', event => { trusted(event); return status(); });
ipcMain.handle('ha:devices', event => { trusted(event); return allDevices(); });
// Buscar Home Assistant en la red: mDNS y, si no responde, el nombre habitual homeassistant.local.
ipcMain.handle('ha:discover', async event => {
  trusted(event);
  const found = (await browse('_home-assistant._tcp.local')).map(s => ({ name: s.txt.location_name || s.name, url: /^https?:\/\//.test(s.txt.internal_url || '') ? s.txt.internal_url.replace(/\/+$/, '') : `http://${s.address || s.host}:${s.port || 8123}` }));
  if (!found.length) {
    try {
      const response = await fetch('http://homeassistant.local:8123/manifest.json', { signal: AbortSignal.timeout(1500) });
      if (response.ok && /home assistant/i.test(JSON.stringify(await response.json()))) found.push({ name: 'Home Assistant', url: 'http://homeassistant.local:8123' });
    } catch {}
  }
  return [...new Map(found.map(f => [f.url, f])).values()].slice(0, 5);
});
// Puentes Hue en la red (mDNS _hue._tcp).
ipcMain.handle('hue:discover', async event => {
  trusted(event);
  return (await browse('_hue._tcp.local')).map(s => ({ name: s.name, host: s.address || s.host })).slice(0, 5);
});
ipcMain.handle('hue:pair', async (event, host) => {
  trusted(event);
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows no permite cifrar la clave del puente en este equipo.');
  const pairing = new HueClient();
  const username = await pairing.pair(host);
  await hue.connect(pairing.host, username);
  await fs.writeFile(hueConfigPath(), JSON.stringify({ host: hue.host, username: safeStorage.encryptString(username).toString('base64') }), 'utf8');
  logEvent(['Hue', 'puente vinculado']);
  return status();
});
ipcMain.handle('hue:forget', async event => {
  trusted(event);
  hue.disconnect();
  hue.host = '';
  await fs.rm(hueConfigPath(), { force: true });
  notify('ha:devices', allDevices());
  return status();
});
ipcMain.handle('ha:configure', async (event, input) => {
  trusted(event);
  const url = normalizeUrl(input?.url);
  let token = typeof input?.token === 'string' ? input.token.trim() : '';
  // El token guardado solo se reutiliza con la misma dirección: nunca viaja a otro servidor.
  if (!token) { const saved = await readConfig(); if (saved?.url === url) token = saved.token; }
  if (token.length < 20 || token.length > 4096) throw new Error('Pega el token de acceso de larga duración.');
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Home Assistant no respondió en 15 segundos.')), 15000); });
  try {
    await Promise.race([homeAssistant.connect(url, token), timeout]);
  } catch (error) {
    // Volver a la conexión guardada, si existía, para no perderla por un intento fallido.
    homeAssistant.url = '';
    homeAssistant.disconnect();
    restoreHomeAssistant();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  await writeConfig(url, token);
  return status();
});
ipcMain.handle('ha:log', async event => {
  trusted(event);
  return events().read(150);
});
ipcMain.handle('ha:forget', async event => {
  trusted(event);
  homeAssistant.url = '';
  homeAssistant.disconnect();
  await fs.rm(configPath(), { force: true });
  return status();
});
ipcMain.handle('ha:set-light', async (event, entityId, state) => {
  trusted(event);
  if (typeof entityId === 'string' && entityId.startsWith('hue.')) {
    if (!validLightState(state)) throw new Error('Estado de luz inválido.');
    await hue.setLight(entityId, state);
  }
  else await homeAssistant.setLight(entityId, state);
  return true;
});
ipcMain.handle('ha:set-cover', async (event, entityId, state) => {
  trusted(event);
  await homeAssistant.setCover(entityId, state);
  return true;
});
ipcMain.handle('ha:set-vacuum', async (event, entityId, state) => {
  trusted(event);
  await homeAssistant.setVacuum(entityId, state);
  return true;
});
ipcMain.handle('ha:set-tv', async (event, entityId, state) => {
  trusted(event);
  await homeAssistant.setTv(entityId, state);
  return true;
});
ipcMain.handle('ha:set-climate', async (event, entityId, state) => {
  trusted(event);
  await homeAssistant.setClimate(entityId, state);
  return true;
});

// Acceso para asistentes de IA (MCP): desactivado hasta que el usuario lo permite desde la bandeja.
const pendingCalls = new Map();
const mcpServerPath = () => path.join(app.getPath('userData'), 'mcp-server.cjs');
const aiAccessPath = () => path.join(app.getPath('userData'), 'ai-access.json');
// La ventana tiene el proyecto: las órdenes de la IA, del panel rápido y del celular se resuelven
// allí, igual que un cambio del usuario.
const windowCall = (tool, args) => new Promise((resolve, reject) => {
  if (!win || win.isDestroyed()) return reject(new Error('La ventana de Habita no está disponible.'));
  const id = crypto.randomUUID();
  const timer = setTimeout(() => { pendingCalls.delete(id); reject(new Error('Habita no respondió a tiempo.')); }, 10000);
  pendingCalls.set(id, reply => { clearTimeout(timer); resolve(reply); });
  notify('ai:call', { id, tool, args });
});
const aiBridge = createAiBridge({
  accessFile: aiAccessPath(),
  call: async (tool, args) => { const reply = await windowCall(tool, args); if (tool !== 'get_home') peek(); return reply; },
  onCall: c => logEvent(['IA', c.name, c.ok ? 'ok' : `error: ${c.error}`, `${c.ms} ms`]),
  canEdit: () => settings.aiEdit === true
});

// Permisos del asistente: editar el plano va aparte de controlar equipos, y el acceso puede
// apagarse solo después de un tiempo (como el temporizador de house-control).
let aiStopTimer = null;
async function setAiEdit(enabled) {
  settings.aiEdit = enabled;
  await saveSettings();
  logEvent(['IA', enabled ? 'puede editar el plano' : 'ya no puede editar el plano']);
  tray?.refresh();
}
async function setAiAutoStop(minutes) {
  settings.aiAutoStop = minutes;
  await saveSettings();
  scheduleAiStop();
  tray?.refresh();
}
function scheduleAiStop() {
  clearTimeout(aiStopTimer);
  aiStopTimer = null;
  if (!aiBridge.running || !settings.aiAutoStop) return;
  aiStopTimer = setTimeout(() => {
    setAiAccess(false).then(() => tray?.notify('Acceso de IA apagado', `Pasaron ${settings.aiAutoStop} minutos. Vuelve a activarlo desde este ícono cuando lo necesites.`)).catch(() => {});
  }, settings.aiAutoStop * 60000);
}

// Control desde el celular (red de la casa, clave en el QR).
const remote = createRemote({
  call: async (tool, args) => { const reply = await windowCall(tool, args); if (!tool.startsWith('get_')) peek(); return reply; },
  onCall: c => logEvent(['celular', c.name, c.ok ? 'ok' : `error: ${c.error}`, `${c.ms} ms`])
});
async function setPhoneAccess(enabled) {
  if (enabled) { await remote.start(settings.remoteKey); settings.remoteKey = remote.key; }
  else await remote.stop();
  settings.remote = enabled;
  await saveSettings();
  logEvent(['celular', enabled ? `control activado en ${remote.address()}` : 'control desactivado']);
  tray?.refresh();
  return phoneStatus();
}
async function phoneStatus() {
  const link = remote.link();
  return { running: remote.running, address: remote.address(), link, qr: link ? await require('qrcode').toDataURL(link, { margin: 1, width: 280, color: { dark: '#151a2b', light: '#ffffff' } }) : null };
}
ipcMain.handle('remote:status', event => { trusted(event); return phoneStatus(); });
ipcMain.handle('remote:set', (event, enabled) => { trusted(event); return setPhoneAccess(enabled === true); });
ipcMain.handle('remote:rotate', async event => {
  trusted(event);
  settings.remoteKey = remote.rotate();
  await saveSettings();
  logEvent(['celular', 'clave renovada: los celulares anteriores quedan desvinculados']);
  return phoneStatus();
});

// Panel rápido de la bandeja (la «isla» de house-control en Windows): se abre junto al ícono, se
// cierra al hacer clic fuera y se asoma unos segundos cuando algo cambia desde fuera.
let panel = null, peekTimer = null;
function ensurePanel() {
  if (panel && !panel.isDestroyed()) return panel;
  panel = new BrowserWindow({ width: 380, height: 620, show: false, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#151a2b', title: 'Habita', webPreferences: { preload: path.join(__dirname, 'remote-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panel.webContents.on('will-navigate', event => event.preventDefault());
  panel.loadFile(path.join(__dirname, 'remote', 'remote.html'));
  panel.on('blur', () => { if (!peekTimer) panel.hide(); });
  return panel;
}
function placePanel() {
  const bounds = tray?.tray.getBounds?.() || { x: 0, y: 0, width: 0, height: 0 };
  const area = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea, [w, h] = panel.getSize();
  const x = Math.round(Math.min(area.x + area.width - w - 8, Math.max(area.x + 8, bounds.x + bounds.width / 2 - w / 2)));
  const y = bounds.y > area.y + area.height / 2 ? Math.round(area.y + area.height - h - 8) : Math.round(area.y + 8);
  panel.setPosition(x, y);
}
function togglePanel() {
  ensurePanel();
  if (panel.isVisible()) { panel.hide(); return; }
  clearTimeout(peekTimer); peekTimer = null;
  placePanel();
  panel.show();
  panel.focus();
}
function peek() {
  if (win?.isFocused() || panel?.isFocused()) return;
  ensurePanel();
  if (panel.isVisible() && !peekTimer) return;
  placePanel();
  panel.showInactive();
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => { peekTimer = null; if (!panel.isFocused()) panel.hide(); }, 3500);
}
ipcMain.handle('remote:call', async (event, name, args) => {
  if (!panel || event.sender !== panel.webContents) throw new Error('Origen inválido');
  if (!remoteTools.has(name) || !args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'Orden no permitida.' };
  return windowCall(name, args);
});

async function setAiAccess(enabled) {
  if (enabled) {
    // El servidor MCP se copia fuera del ejecutable para que Node pueda abrirlo.
    const source = await fs.readFile(path.join(__dirname, 'mcp-server.cjs'), 'utf8');
    await fs.writeFile(mcpServerPath(), source.replace("version: 'dev'", `version: '${app.getVersion()}'`), 'utf8');
    await aiBridge.start();
  } else {
    await aiBridge.stop();
  }
  logEvent(['IA', enabled ? 'acceso permitido' : 'acceso desactivado']);
  if (settings.aiAccess !== enabled) { settings.aiAccess = enabled; await saveSettings(); }
  scheduleAiStop();
  tray?.refresh();
  return aiBridge.running;
}

function mcpConfig() {
  return { mcpServers: { habita: { command: 'node', args: [mcpServerPath()], env: { HABITA_ACCESS_FILE: aiAccessPath() } } } };
}

function copyMcpConfig() {
  clipboard.writeText(JSON.stringify(mcpConfig(), null, 2));
  tray?.notify('Configuración MCP copiada', 'Pégala en la configuración de tu asistente, por ejemplo claude_desktop_config.json. Requiere Node.js instalado.');
}

ipcMain.on('ai:reply', (event, id, reply) => {
  if (!win || event.sender !== win.webContents) return;
  const done = pendingCalls.get(id);
  if (!done) return;
  pendingCalls.delete(id);
  done(reply && typeof reply === 'object' ? { ok: !!reply.ok, result: reply.result, error: typeof reply.error === 'string' ? reply.error : undefined } : { ok: false, error: 'Respuesta inválida.' });
});
ipcMain.on('tray:scenes', (event, scenes) => {
  if (!win || event.sender !== win.webContents || !Array.isArray(scenes)) return;
  tray?.setScenes(scenes.slice(0, 30).filter(s => typeof s?.id === 'string' && typeof s?.name === 'string').map(s => ({ id: s.id, name: s.name.slice(0, 60) })));
});

ipcMain.on('tray:status', (event, status) => {
  if (!win || event.sender !== win.webContents || typeof status?.text !== 'string') return;
  tray?.setStatus({ text: status.text.slice(0, 100), lit: status.lit === true });
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { remote.stop().catch(() => {}); require('node:fs').rmSync(aiAccessPath(), { force: true }); aiBridge.stop().catch(() => {}); });
app.on('window-all-closed', () => { homeAssistant.disconnect(); app.quit(); });

module.exports = { setAiAccess, setAiEdit, setPhoneAccess, phoneStatus, togglePanel, panelContents: () => panel?.webContents, aiAccessPath, mcpServerPath, mcpConfig };
