const { app, BrowserWindow, ipcMain, dialog, safeStorage, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { HomeAssistantClient } = require('./home-assistant.cjs');
const { createEventLog } = require('./event-log.cjs');
const { createAiBridge } = require('./ai-bridge.cjs');
const { createTray } = require('./tray.cjs');

let win;
const homeAssistant = new HomeAssistantClient();
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
  tray = createTray({ show: showWindow, activateScene: id => notify('tray:scene', id), aiAccess: () => aiBridge.running, setAiAccess, copyMcpConfig, quit });
  restoreHomeAssistant();
  if (settings.aiAccess) setAiAccess(true).catch(() => {});
});

function trusted(event) {
  if (!win || event.sender !== win.webContents) throw new Error('Origen inválido');
}

ipcMain.handle('save-project', async (event, contents) => {
  if (event.sender !== win.webContents || typeof contents !== 'string' || contents.length > 10_000_000) throw new Error('Proyecto inválido');
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
  if (stat.size > 10_000_000) throw new Error('El archivo supera 10 MB');
  return fs.readFile(result.filePaths[0], 'utf8');
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
}

function status() {
  return { available: true, configured: !!homeAssistant.url, url: homeAssistant.url || '', ...homeAssistant.state };
}

const notify = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
homeAssistant.on('status', state => { notify('ha:status', status()); logEvent(['conexión', state.status, state.message || '']); });
homeAssistant.on('command', c => logEvent([c.entityId, c.service, JSON.stringify(c.data), c.ok ? 'ok' : `error: ${c.error}`, `${c.ms} ms`]));
homeAssistant.on('devices', devices => notify('ha:devices', devices));
homeAssistant.on('device', device => notify('ha:device', device));

ipcMain.handle('ha:status', event => { trusted(event); return status(); });
ipcMain.handle('ha:devices', event => { trusted(event); return homeAssistant.state.status === 'connected' ? homeAssistant.devices() : []; });
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
  await homeAssistant.setLight(entityId, state);
  return true;
});
ipcMain.handle('ha:set-cover', async (event, entityId, state) => {
  trusted(event);
  await homeAssistant.setCover(entityId, state);
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
const aiBridge = createAiBridge({
  accessFile: aiAccessPath(),
  // La ventana tiene el proyecto: la orden se resuelve allí, igual que un cambio del usuario.
  call: (tool, args) => new Promise((resolve, reject) => {
    if (!win || win.isDestroyed()) return reject(new Error('La ventana de Habita no está disponible.'));
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pendingCalls.delete(id); reject(new Error('Habita no respondió a tiempo.')); }, 10000);
    pendingCalls.set(id, reply => { clearTimeout(timer); resolve(reply); });
    notify('ai:call', { id, tool, args });
  }),
  onCall: c => logEvent(['IA', c.name, c.ok ? 'ok' : `error: ${c.error}`, `${c.ms} ms`])
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

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { require('node:fs').rmSync(aiAccessPath(), { force: true }); aiBridge.stop().catch(() => {}); });
app.on('window-all-closed', () => { homeAssistant.disconnect(); app.quit(); });

module.exports = { setAiAccess, aiAccessPath, mcpServerPath, mcpConfig };
