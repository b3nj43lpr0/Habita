import { catalog } from '../catalog.js';
import { esc } from './dom.js';
import { icon } from './icons.js';

export function shell(project, version) {
  return `
 <header class="topbar">
  <div class="brand"><span class="brand-mark">${icon('home', 25)}</span><span>habita<span class="brand-sub">studio</span></span></div>
  <div class="project-title">
   <input id="project-name" aria-label="Nombre del proyecto" maxlength="120" value="${esc(project.name)}">
   <span id="save-status">${icon('check', 12)} Guardado en este equipo</span>
  </div>
  <div class="header-actions">
   <button id="control-mode" class="icon-button" title="Modo control a pantalla completa" aria-label="Modo control a pantalla completa" aria-pressed="false">${icon('tablet')}</button>
   <button id="home-assistant" class="icon-button" title="Conectar dispositivos reales" aria-label="Conectar dispositivos reales">${icon('plug')}</button>
   <button id="open" class="icon-button" title="Abrir proyecto" aria-label="Abrir proyecto">${icon('folder')}</button>
   <button id="help" class="icon-button" title="Cómo usar el editor" aria-label="Cómo usar el editor">${icon('help')}</button>
   <button id="save" class="primary">${icon('save', 16)} Guardar proyecto</button>
  </div>
 </header>
 <div class="workspace">
  <aside class="library">
   <div class="library-title"><h1>Tu biblioteca</h1><span class="count">${catalog.length}</span></div>
   <nav class="library-tabs" aria-label="Biblioteca">
    <button class="active" data-tab="objects">Objetos</button><button data-tab="rooms">Espacios</button><button data-tab="materials">Materiales</button>
   </nav>
   <div id="library-content"></div>
   <div class="library-foot"><span class="local-dot"></span>Todo se queda en tu computador</div>
  </aside>
  <main class="viewport" aria-label="Editor de la casa">
   <div id="scene"></div><div id="room-labels" aria-hidden="true"></div>
   <div id="home-status"></div><section id="ambience-dock" aria-label="Ambiente de la maqueta"></section>
   <div class="scene-toolbar">
    <div class="segmented">
     <button data-view="2d">${icon('plan', 16)} Plano 2D</button>
     <button class="active" data-view="3d">${icon('cube', 16)} Maqueta 3D</button>
     <button data-view="walk">${icon('eye', 16)} Recorrido</button>
    </div>
    <div class="tool-group">
     <button id="undo" class="icon-button" title="Deshacer (Ctrl+Z)" aria-label="Deshacer">${icon('undo')}</button>
     <button id="redo" class="icon-button" title="Rehacer (Ctrl+Y)" aria-label="Rehacer">${icon('redo')}</button>
     <span class="tool-divider"></span>
     <button id="snapshot" class="icon-button" title="Exportar imagen PNG" aria-label="Exportar imagen">${icon('image')}</button>
    </div>
   </div>
   <div class="scene-heading"><span class="overline">Un lugar para imaginar</span><h2>Tu casa, a tu manera.</h2><p>Explora. Mueve. Hazla tuya.</p></div>
   <div class="scene-right">
    <button id="light" class="float-button" title="Cambiar iluminación">${icon('sun')}<span>Día</span></button>
    <button id="walls" class="float-button" title="Cambiar visualización de paredes">${icon('layers')}<span>Paredes bajas</span></button>
    <button id="energy" class="float-button" title="Colorear las habitaciones según su consumo" aria-pressed="false">${icon('bolt')}<span>Consumo</span></button>
   </div>
   <div id="drawing-hint" hidden></div>
   <div id="walk-overlay" hidden>
    <h2>Recorre tu casa</h2><p>Camina a escala real con WASD y mira con el mouse.</p>
    <button id="walk-start" class="primary">Entrar al recorrido</button>
    <button id="walk-free" class="secondary full">Recorrer con cursor libre</button>
    <small>Esc libera el cursor. Con cursor libre, arrastra para mirar. Usa Plano 2D o Maqueta 3D para salir.</small>
   </div>
   <div id="walk-reticle" hidden>+</div>
   <div id="walk-instructions" hidden>
    <strong>W A S D</strong> Caminar <span>·</span> Mouse para mirar <span>·</span> Shift para ir más rápido
    <small>Escala 1:1 · Ojos a 1,65 m · Puertas abiertas</small>
   </div>
   <div class="zoom-controls">
    <button id="zoom-in" aria-label="Acercar">+</button>
    <button id="fit" aria-label="Encuadrar casa" title="Encuadrar casa">${icon('focus', 17)}</button>
    <button id="zoom-out" aria-label="Alejar">−</button>
   </div>
   <div class="scene-bottom"><div id="room-chips"></div><div class="scene-hint" id="scene-hint">${icon('rotate', 14)} Arrastra para girar <span>·</span> Rueda para acercar</div></div>
  </main>
  <aside class="inspector"><div id="inspector-content"></div></aside>
 </div>
 <footer class="statusbar">
  <div><span class="live-dot"></span><span id="project-stats"></span></div>
  <div>
   <span id="energy-total" hidden></span>
   <button id="device-status" class="device-status" data-status="disconnected">Sin dispositivos</button>
   <button id="snap" aria-pressed="true">${icon('ruler', 13)} Ajuste a 10 cm</button>
   <span>Medidas en metros</span><span class="version">Habita ${version}</span>
  </div>
 </footer>
 <div id="toast" role="status" aria-live="polite"></div>
 <dialog id="dialog"><div id="dialog-body"></div></dialog><input type="file" id="file-input" accept=".habita,.json" hidden>
`;
}

export const helpDialog = () => `
 <span class="dialog-emblem">${icon('home', 32)}</span>
 <h2>Una casa que se siente tuya.</h2>
 <p>Empieza con la casa de ejemplo o dibuja la tuya desde <strong>Espacios</strong>.</p>
 <ul>
  <li><strong>Añade</strong> objetos haciendo clic en el catálogo.</li>
  <li><strong>Mueve</strong> los muebles arrastrándolos en 2D o 3D.</li>
  <li><strong>Edita</strong> medidas, posición, color y variantes en el panel derecho.</li>
  <li><strong>Gira</strong> la maqueta arrastrando un espacio libre. Desplaza con el botón derecho.</li>
  <li><strong>Guarda</strong> un archivo .habita para conservar o compartir tu proyecto.</li>
  <li><strong>Conecta</strong> Home Assistant con el botón del enchufe para controlar luces, aires y televisores reales.</li>
  <li><strong>Agrega pisos</strong> con el botón + junto a los espacios; la escalera conecta los pisos en el recorrido.</li>
  <li><strong>Importa</strong> el plano de tu casa como imagen desde <strong>Espacios</strong> y calíbralo con una medida conocida.</li>
 </ul>
 <div class="shortcut-list"><span>Ctrl + Z · Deshacer</span><span>R · Girar</span><span>Supr · Eliminar objeto</span><span>Esc · Cancelar herramienta</span></div>
 <p class="library-note">Medidas de muebles orientativas. Esta versión comprueba límites y superposición de objetos; aún no valida circulación, estructura ni normativa.</p>
 <button data-close class="primary full">Empezar a diseñar</button>`;
