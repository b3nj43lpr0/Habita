const { contextBridge, ipcRenderer } = require('electron');

// Panel rápido de la bandeja: solo puede pedir las órdenes del control remoto.
contextBridge.exposeInMainWorld('habitaRemote', {
  call: (name, args) => ipcRenderer.invoke('remote:call', name, args)
});
