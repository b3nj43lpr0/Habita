const { contextBridge, ipcRenderer } = require('electron');

// Cada suscripción entrega solo los datos del mensaje y devuelve cómo cancelarla.
const listen = channel => callback => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('habita', {
  saveProject: (contents) => ipcRenderer.invoke('save-project', contents),
  openProject: () => ipcRenderer.invoke('open-project'),
  // Imagen de un plano (PNG o JPG) elegida en el diálogo nativo; vuelve como data URL.
  openImage: () => ipcRenderer.invoke('open-image'),
  // Modelo 3D .glb elegido en el diálogo nativo: { name, data } con data como data URL.
  openModel: () => ipcRenderer.invoke('open-model'),
  // Informe HTML a PDF: pregunta dónde guardarlo y lo abre al terminar.
  exportPdf: (html, name) => ipcRenderer.invoke('export-pdf', html, name),
  // Enlaces de tiendas: se abren en el navegador del sistema (solo http y https).
  openLink: url => ipcRenderer.invoke('open-link', url),
  // Actualizaciones desde los Releases de GitHub.
  updates: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: listen('update:status')
  },
  homeAssistant: {
    status: () => ipcRenderer.invoke('ha:status'),
    devices: () => ipcRenderer.invoke('ha:devices'),
    configure: (url, token) => ipcRenderer.invoke('ha:configure', { url, token }),
    forget: () => ipcRenderer.invoke('ha:forget'),
    discover: () => ipcRenderer.invoke('ha:discover'),
    discoverHue: () => ipcRenderer.invoke('hue:discover'),
    pairHue: host => ipcRenderer.invoke('hue:pair', host),
    forgetHue: () => ipcRenderer.invoke('hue:forget'),
    log: () => ipcRenderer.invoke('ha:log'),
    setLight: (entityId, state) => ipcRenderer.invoke('ha:set-light', entityId, state),
    setClimate: (entityId, state) => ipcRenderer.invoke('ha:set-climate', entityId, state),
    setTv: (entityId, state) => ipcRenderer.invoke('ha:set-tv', entityId, state),
    setCover: (entityId, state) => ipcRenderer.invoke('ha:set-cover', entityId, state),
    setVacuum: (entityId, state) => ipcRenderer.invoke('ha:set-vacuum', entityId, state),
    onStatus: listen('ha:status'),
    onDevices: listen('ha:devices'),
    onDevice: listen('ha:device')
  },
  // Órdenes de asistentes de IA y del menú de la bandeja; la ventana las resuelve con el proyecto.
  desktop: {
    onAiCall: listen('ai:call'),
    aiReply: (id, reply) => ipcRenderer.send('ai:reply', id, reply),
    onScene: listen('tray:scene'),
    setScenes: scenes => ipcRenderer.send('tray:scenes', scenes),
    setStatus: status => ipcRenderer.send('tray:status', status),
    phone: {
      status: () => ipcRenderer.invoke('remote:status'),
      set: enabled => ipcRenderer.invoke('remote:set', enabled),
      rotate: () => ipcRenderer.invoke('remote:rotate'),
      onShow: listen('remote:show')
    }
  }
});
