// Ícono de Habita en la bandeja de Windows: abrir la ventana, activar escenas sin abrirla y
// permitir o quitar el acceso de asistentes de IA. El ícono se dibuja aquí para no depender de
// archivos de imagen dentro del ejecutable.
const { Tray, Menu, nativeImage } = require('electron');

// Casa de 32×32 px (se muestra a 16 px lógicos) en ámbar sobre fondo transparente.
function houseIcon() {
  const size = 32, data = Buffer.alloc(size * size * 4);
  const paint = (x, y, [r, g, b]) => { const i = (y * size + x) * 4; data[i] = b; data[i + 1] = g; data[i + 2] = r; data[i + 3] = 255; };
  const amber = [255, 179, 107], dark = [36, 42, 54];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const roof = y >= 3 && y <= 15 && Math.abs(x - 15.5) <= (y - 3) * 1.2 + 1;
    const body = y > 15 && y <= 28 && x >= 6 && x <= 25;
    const door = y >= 19 && y <= 28 && x >= 13 && x <= 18;
    if (door) paint(x, y, dark);
    else if (roof || body) paint(x, y, amber);
  }
  return nativeImage.createFromBitmap(data, { width: size, height: size, scaleFactor: 2 });
}

function createTray({ show, activateScene, aiAccess, setAiAccess, copyMcpConfig, quit }) {
  const tray = new Tray(houseIcon());
  let scenes = [];
  tray.setToolTip('Habita Studio');

  function refresh() {
    const enabled = aiAccess();
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir Habita', click: show },
      { type: 'separator' },
      { label: 'Escenas', enabled: scenes.length > 0, submenu: scenes.length ? scenes.map(scene => ({ label: scene.name, click: () => activateScene(scene.id) })) : [{ label: 'Sin escenas', enabled: false }] },
      { type: 'separator' },
      { label: 'Permitir acceso para IA en este equipo', type: 'checkbox', checked: enabled, click: item => setAiAccess(item.checked).finally(refresh) },
      { label: 'Copiar configuración MCP', enabled, click: copyMcpConfig },
      { type: 'separator' },
      { label: 'Salir de Habita', click: quit }
    ]));
  }

  tray.on('click', show);
  refresh();

  return {
    tray,
    refresh,
    setScenes(list) { scenes = list; refresh(); },
    notify(title, content) { tray.displayBalloon?.({ title, content, iconType: 'info' }); },
    destroy() { tray.destroy(); }
  };
}

module.exports = { createTray };
