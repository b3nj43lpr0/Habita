const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
let win;
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1500, height: 960, minWidth: 1000, minHeight: 700, backgroundColor: '#151a22', title: 'Habita Studio', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.loadFile(path.join(__dirname, '../dist/index.html'));
});
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
app.on('window-all-closed', () => app.quit());
