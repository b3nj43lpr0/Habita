const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('habita', {
  saveProject: (contents) => ipcRenderer.invoke('save-project', contents),
  openProject: () => ipcRenderer.invoke('open-project')
});
