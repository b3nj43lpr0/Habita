import './style.css';
import './soft-theme.css';
import './glass-controls.css';
import './interaction-details.css';
import './sliders.css';
import { createFeedback } from './interaction-feedback.js';
import { isLamp,lightFor,lampsInRoom } from './lighting.js';
import { mountLightControls } from './light-controls.js';
import { version } from '../package.json';
import * as THREE from 'three';
import { catalog,categories,byId,makeItem,isOpening } from './catalog.js';
import { clone,exampleProject,round,snap,totalArea,warningsFor,validateProject,alignOpening,overlaps } from './model.js';
import { thumbnail } from './furniture.js';
import { createScene } from './scene.js';
import { roomCandidate,roomEditError,applyRoomEdit } from './room-edit.js';
import { createAmbienceUI } from './ambience-ui.js';

const $=s=>document.querySelector(s);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={home:'m3 10 9-7 9 7v10H3Z M9 20v-7h6v7',sofa:'M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4 M4 11a2 2 0 0 0-2 2v5h20v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-2-2 M5 18v3 M19 18v3',plus:'M12 5v14 M5 12h14',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',undo:'M8 4 3 9l5 5 M3 9h11a6 6 0 0 1 0 12',redo:'m16 4 5 5-5 5 M21 9H10a6 6 0 0 0 0 12',save:'M4 3h14l3 3v15H3V3Z M7 3v6h10V3 M7 21v-8h10v8',folder:'M3 6h7l2 3h9v12H3Z M3 6V3h7l2 3h8v3',cube:'m12 2 10 5v10l-10 5-10-5V7Z M2 7l10 5 10-5 M12 12v10',plan:'M3 3h18v18H3Z M3 13h10V3 M13 13v8 M17 13h4',ruler:'m3 16 13-13 5 5L8 21Z M6 13l3 3 M10 9l3 3 M14 5l3 3',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',check:'m5 12 4 4L20 5',chevron:'m9 5 7 7-7 7',rotate:'M20 8V3l-4 4 M20 8a9 9 0 1 0 1 8',copy:'M8 8h13v13H8Z M16 8V3H3v13h5',trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',focus:'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',image:'M3 3h18v18H3Z M3 17l6-6 5 5 3-3 4 4 M16 7h.01',help:'M9 8a3 3 0 1 1 5 3c-2 1-2 2-2 3 M12 18h.01 M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',close:'m6 6 12 12 M18 6 6 18',layers:'m12 3 10 6-10 6L2 9Z M2 13l10 6 10-6 M2 17l10 6 10-6',arrow:'M5 12h14 M13 6l6 6-6 6'};
const icon=(name,size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.cube}"/></svg>`;
const fmt=n=>n.toLocaleString('es-CL',{maximumFractionDigits:2});
let project=exampleProject(),storageIssue=false;
try {const saved=localStorage.getItem('habita-project');if(saved)project=validateProject(JSON.parse(saved));}catch{storageIssue=true;}
let selected=null,category='Todos',query='',tab='objects',view='3d',snapping=true,drawing=false,drawStart=null;
const undoStack=[],redoStack=[];
let saveTimer;
let propertyPreviewFrame=null;
let roomDragOriginal=null,carryFurniture=true,walkLocked=false;

$('#app').innerHTML=`
 <header class="topbar">
  <div class="brand"><span class="brand-mark">${icon('home',25)}</span><span>habita<span class="brand-sub">studio</span></span></div>
  <div class="project-title"><input id="project-name" aria-label="Nombre del proyecto" maxlength="120" value="${esc(project.name)}"><span id="save-status">${icon('check',12)} Guardado en este equipo</span></div>
  <div class="header-actions"><button id="open" class="icon-button" title="Abrir proyecto" aria-label="Abrir proyecto">${icon('folder')}</button><button id="help" class="icon-button" title="Cómo usar el editor" aria-label="Cómo usar el editor">${icon('help')}</button><button id="save" class="primary">${icon('save',16)} Guardar proyecto</button></div>
 </header>
 <div class="workspace">
  <aside class="library">
   <div class="library-title"><h1>Tu biblioteca</h1><span class="count">${catalog.length}</span></div>
   <nav class="library-tabs" aria-label="Biblioteca"><button class="active" data-tab="objects">Objetos</button><button data-tab="rooms">Espacios</button><button data-tab="materials">Materiales</button></nav>
   <div id="library-content"></div>
   <div class="library-foot"><span class="local-dot"></span>Todo se queda en tu computador</div>
  </aside>
  <main class="viewport" aria-label="Editor de la casa">
   <div id="scene"></div><div id="room-labels" aria-hidden="true"></div>
   <div id="home-status"></div><section id="ambience-dock" aria-label="Ambiente de la maqueta"></section>
   <div class="scene-toolbar"><div class="segmented"><button data-view="2d">${icon('plan',16)} Plano 2D</button><button class="active" data-view="3d">${icon('cube',16)} Maqueta 3D</button><button data-view="walk">${icon('eye',16)} Recorrido</button></div><div class="tool-group"><button id="undo" class="icon-button" title="Deshacer (Ctrl+Z)" aria-label="Deshacer">${icon('undo')}</button><button id="redo" class="icon-button" title="Rehacer (Ctrl+Y)" aria-label="Rehacer">${icon('redo')}</button><span class="tool-divider"></span><button id="snapshot" class="icon-button" title="Exportar imagen PNG" aria-label="Exportar imagen">${icon('image')}</button></div></div>
   <div class="scene-heading"><span class="overline">Un lugar para imaginar</span><h2>Tu casa, a tu manera.</h2><p>Explora. Mueve. Hazla tuya.</p></div>
   <div class="scene-right"><button id="light" class="float-button" title="Cambiar iluminación">${icon('sun')}<span>Día</span></button><button id="walls" class="float-button" title="Cambiar visualización de paredes">${icon('layers')}<span>Paredes bajas</span></button></div>
   <div id="drawing-hint" hidden></div>
   <div id="walk-overlay" hidden><h2>Recorre tu casa</h2><p>Camina a escala real con WASD y mira con el mouse.</p><button id="walk-start" class="primary">Entrar al recorrido</button><button id="walk-free" class="secondary full">Recorrer con cursor libre</button><small>Esc libera el cursor. Con cursor libre, arrastra para mirar. Usa Plano 2D o Maqueta 3D para salir.</small></div>
   <div id="walk-reticle" hidden>+</div><div id="walk-instructions" hidden><strong>W A S D</strong> Caminar <span>·</span> Mouse para mirar <span>·</span> Shift para ir más rápido <small>Escala 1:1 · Ojos a 1,65 m · Puertas abiertas</small></div>
   <div class="zoom-controls"><button id="zoom-in" aria-label="Acercar">+</button><button id="fit" aria-label="Encuadrar casa" title="Encuadrar casa">${icon('focus',17)}</button><button id="zoom-out" aria-label="Alejar">−</button></div>
   <div class="scene-bottom"><div id="room-chips"></div><div class="scene-hint" id="scene-hint">${icon('rotate',14)} Arrastra para girar <span>·</span> Rueda para acercar</div></div>
  </main>
  <aside class="inspector"><div id="inspector-content"></div></aside>
 </div>
 <footer class="statusbar"><div><span class="live-dot"></span><span id="project-stats"></span></div><div><button id="snap" aria-pressed="true">${icon('ruler',13)} Ajuste a 10 cm</button><span>Medidas en metros</span><span class="version">Habita ${version}</span></div></footer>
 <div id="toast" role="status" aria-live="polite"></div>
 <dialog id="dialog"><div id="dialog-body"></div></dialog><input type="file" id="file-input" accept=".habita,.json" hidden>
`;

function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function persist(){clearTimeout(saveTimer);$('#save-status').innerHTML='Guardando…';saveTimer=setTimeout(()=>{try{localStorage.setItem('habita-project',JSON.stringify(project));$('#save-status').innerHTML=`${icon('check',12)} Guardado en este equipo`;}catch{$('#save-status').textContent='Sin autoguardado: guarda un archivo';}},250);}
function checkpoint(){undoStack.push(clone(project));if(undoStack.length>60)undoStack.shift();redoStack.length=0;}
function changed(){scene.rebuild(project,selected);renderInspector();renderRooms();renderStats();renderSelectionActions();if(tab==='rooms')renderLibrary();persist();feedback.play('place');}
function select(id){if(id&&id!==selected)feedback.play();selected=id;scene.setSelection(id);renderInspector();renderRooms();renderSelectionActions();}
const scene=createScene($('#scene'),{
  select,
  walkLock(locked){walkLocked=locked;$('#walk-overlay').hidden=view!=='walk'||locked;$('#walk-reticle').hidden=view!=='walk'||!locked;},
  walkUnavailable(){toast('El recorrido necesita espacio libre y paredes de al menos 1,85 m.');},
  isDrawing:()=>drawing,
  startDrag:checkpoint,
  move(id,x,z){const item=project.items.find(o=>o.id===id);item.x=snap(x,snapping);item.z=snap(z,snapping);if(isOpening(item)){alignOpening(item,project);scene.rebuild(project,id);}else scene.moveItem(item);renderInspector();},
  endDrag(){renderStats();persist();},
  startRoomDrag(){roomDragOriginal=clone(project);},
  editRoom(id,handle,dx,dz){
    if(!roomDragOriginal)return null;
    const candidate=roomCandidate(roomDragOriginal,id,handle,dx,dz,snapping);
    const error=roomEditError(roomDragOriginal,candidate);if(error)return error;
    project=applyRoomEdit(roomDragOriginal,id,candidate,carryFurniture);
    scene.rebuild(project,id);renderInspector();renderRooms();renderStats();return null;
  },
  endRoomDrag(cancel){
    if(!roomDragOriginal)return;
    const original=roomDragOriginal;roomDragOriginal=null;
    if(cancel){project=original;changed();return;}
    if(JSON.stringify(original)!==JSON.stringify(project)){
      undoStack.push(original);if(undoStack.length>60)undoStack.shift();redoStack.length=0;changed();
    }else renderStats();
  },
  drawPoint(p){
    if(!p)return;
    const point={x:snap(p.x,snapping),z:snap(p.z,snapping)};
    if(!drawStart){drawStart=point;$('#drawing-hint').textContent='Ahora marca la esquina opuesta · Esc para cancelar';return;}
    const w=round(Math.abs(point.x-drawStart.x)),d=round(Math.abs(point.z-drawStart.z));
    if(w<.5||d<.5){toast('La habitación debe medir al menos 50 cm por lado.');return;}
    const room={id:crypto.randomUUID(),name:'Nueva habitación',x:round((point.x+drawStart.x)/2),z:round((point.z+drawStart.z)/2),w,d,color:'#c5ad8e'};
    if(project.rooms.some(r=>overlaps({...r,rotation:0},{...room,rotation:0}))){toast('Las habitaciones no pueden superponerse. Marca otra esquina o pulsa Esc.');return;}
    checkpoint();project.rooms.push(room);selected=room.id;stopDrawing();changed();toast('Habitación creada. Puedes ajustar sus medidas a la derecha.');
  },
  pointer(p){if(p&&drawing&&drawStart)scene.ghost(drawStart,{x:snap(p.x,snapping),z:snap(p.z,snapping)});},
  frame(camera,rect){positionSelectionActions(camera,rect);if(view!=='2d')return;for(const label of $('#room-labels').children){const r=project.rooms.find(r=>r.id===label.dataset.room);if(!r)continue;const pos=new THREE.Vector3(r.x,.1,r.z).project(camera);label.style.transform=`translate(${(pos.x+1)*rect.width/2}px,${(-pos.y+1)*rect.height/2}px) translate(-50%,-50%)`;}}
});
// La geometría y la iluminación son independientes del archivo de proyecto.
scene.rebuild(project);
const ambienceUI=createAmbienceUI(scene,icon);
const soundButton=document.createElement('button');soundButton.id='sound-toggle';$('.statusbar>div:last-child').prepend(soundButton);
const feedback=createFeedback(soundButton);
$('#ambience-dock').addEventListener('click',event=>{if(event.target.closest('[data-mood]'))feedback.play('place');});
$('#ambience-dock').addEventListener('change',event=>{if(event.target.matches('input[type="range"]'))feedback.play();});
const focusButton=document.createElement('button');focusButton.id='focus-mode';focusButton.className='icon-button';focusButton.innerHTML=icon('focus');focusButton.title='Ampliar maqueta';focusButton.setAttribute('aria-label','Ampliar maqueta');focusButton.setAttribute('aria-pressed','false');$('.tool-group').prepend(focusButton);
focusButton.onclick=()=>{const active=$('.workspace').classList.toggle('focus-mode');focusButton.setAttribute('aria-pressed',String(active));focusButton.title=active?'Mostrar paneles':'Ampliar maqueta';focusButton.setAttribute('aria-label',focusButton.title);feedback.play();};
const selectionActions=document.createElement('div');selectionActions.className='selection-actions';selectionActions.hidden=true;selectionActions.setAttribute('role','toolbar');selectionActions.setAttribute('aria-label','Acciones del objeto');$('.viewport').append(selectionActions);
let selectionCamera=null,selectionRect=null;
function renderSelectionActions(){
  const item=project.items.find(o=>o.id===selected);
  selectionActions.classList.toggle('with-light',isLamp(item));
  selectionActions.hidden=!item||view==='walk';if(selectionActions.hidden)return;
  selectionActions.innerHTML=`<strong>${esc(item.name)}</strong><button data-action="focus" aria-label="Centrar objeto" title="Centrar objeto">${icon('focus',16)}</button>${!isOpening(item)?`<button data-action="rotate" aria-label="Girar objeto" title="Girar 90°">${icon('rotate',16)}</button>`:''}<button data-action="duplicate" aria-label="Duplicar objeto" title="Duplicar objeto">${icon('copy',16)}</button><button data-action="close" aria-label="Cerrar acciones" title="Cerrar selección">${icon('close',16)}</button>`;
  selectionActions.querySelector('[data-action="focus"]').onclick=()=>{scene.focusItem(selected);feedback.play();};
  const rotate=selectionActions.querySelector('[data-action="rotate"]');if(rotate)rotate.onclick=rotateItem;
  selectionActions.querySelector('[data-action="duplicate"]').onclick=duplicateItem;
  selectionActions.querySelector('[data-action="close"]').onclick=()=>select(null);
  if(isLamp(item)){
    const panel=document.createElement('section');panel.className='lamp-controls';panel.setAttribute('aria-label','Luz de la lámpara');selectionActions.append(panel);
    mountLightControls(panel,item,{preview:state=>scene.previewLight(item.id,state),commit:state=>{if(JSON.stringify(state)===JSON.stringify(lightFor(item)))return;const active=document.activeElement?.dataset.light;checkpoint();item.light=state;changed();if(active)selectionActions.querySelector(`[data-light="${active}"]`)?.focus({preventScroll:true});}});
  }
  if(selectionCamera)positionSelectionActions(selectionCamera,selectionRect);
}
function renderRoomLighting(container,room=null){
  const lamps=room?lampsInRoom(project,room):project.items.filter(isLamp);if(!lamps.length)return;
  const section=document.createElement('section');section.className='room-lighting property-section';
  section.innerHTML=`<h3>${room?'Luces de este espacio':'Luces de la casa'} <span>${lamps.filter(i=>lightFor(i).on&&lightFor(i).brightness>0).length}/${lamps.length}</span></h3><div class="room-light-actions"><button data-lights="on" class="secondary">Encender todas</button><button data-lights="off" class="secondary">Apagar todas</button></div><div class="room-lamp-list">${lamps.map(item=>`<button data-select-lamp="${esc(item.id)}"><span class="lamp-status ${lightFor(item).on&&lightFor(item).brightness>0?'on':''}"></span><span>${esc(item.name)}</span>${icon('chevron',13)}</button>`).join('')}</div>`;
  const anchor=container.querySelector('.overview-stats')||container.querySelector('.room-edit-tip');anchor.after(section);
  section.querySelectorAll('[data-select-lamp]').forEach(b=>b.onclick=()=>{select(b.dataset.selectLamp);if(view!=='walk')scene.focusItem(selected);});
  section.querySelectorAll('[data-lights]').forEach(b=>b.onclick=()=>{const on=b.dataset.lights==='on';if(lamps.every(item=>lightFor(item).on===on))return;checkpoint();for(const item of lamps)item.light={...lightFor(item),on};changed();});
}
function positionSelectionActions(camera,rect){
  // El primer frame del motor ocurre antes de montar la barra.
  const bar=document.querySelector('.selection-actions');if(!bar)return;
  selectionCamera=camera;selectionRect=rect;if(bar.hidden)return;
  const item=project.items.find(o=>o.id===selected);if(!item)return;
  const pos=new THREE.Vector3(item.x,(item.elevation||0)+item.h+.2,item.z).project(camera);
  bar.style.visibility=Math.abs(pos.x)>1.15||Math.abs(pos.y)>1.15||Math.abs(pos.z)>1?'hidden':'visible';
  const dock=$('#ambience-dock'),dockTop=dock.hidden?rect.height-53:dock.getBoundingClientRect().top-rect.top;
  const minTop=view==='3d'?140:78;bar.style.maxHeight=`${Math.max(100,dockTop-minTop-12)}px`;
  const x=Math.max(12,Math.min(rect.width-bar.offsetWidth-12,(pos.x+1)*rect.width/2-bar.offsetWidth/2));
  const y=Math.max(minTop,Math.min(dockTop-bar.offsetHeight-12,(-pos.y+1)*rect.height/2-bar.offsetHeight-12));
  bar.style.left=`${x}px`;bar.style.top=`${y}px`;
}

function renderLibrary(){
  const container=$('#library-content');
  if(tab==='objects'){
    container.innerHTML=`<div class="search-field">${icon('search',16)}<input id="search" placeholder="Busca un objeto…" aria-label="Buscar objetos" value="${esc(query)}"></div><div class="categories">${categories.map(c=>`<button data-category="${esc(c)}" class="${c===category?'active':''}">${c}</button>`).join('')}</div><div class="catalog-caption"><span id="catalog-total"></span><span>Medidas editables</span></div><div id="asset-grid" class="asset-grid"></div>`;
    $('#search').addEventListener('input',event=>{query=event.target.value;renderAssets();});
    container.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{category=button.dataset.category;container.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b===button));renderAssets();});renderAssets();
  }else if(tab==='rooms'){
    container.innerHTML=`<div class="library-description">Dibuja una habitación con dos clics en el plano. Sus paredes se generan al instante.</div><button class="primary full" id="draw-room">${icon('plus',16)} Dibujar habitación</button><div class="section-label">Tus espacios</div><div class="space-list">${project.rooms.map(r=>`<button data-room="${r.id}"><span class="room-dot" style="background:${r.color}"></span><span>${esc(r.name)}<small>${fmt(r.w)} × ${fmt(r.d)} m</small></span><b>${fmt(r.w*r.d)} m²</b></button>`).join('')}</div><button id="empty-project" class="secondary full">Empezar una casa vacía</button>`;
    $('#draw-room').onclick=startDrawing;container.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>select(b.dataset.room));$('#empty-project').onclick=()=>modal(`<h2>Empezar una casa vacía</h2><p>Guarda tu proyecto actual antes de continuar. También puedes recuperar este cambio con Deshacer.</p><div class="dialog-actions"><button data-close class="secondary">Cancelar</button><button id="confirm-empty" class="primary">Crear casa vacía</button></div>`,()=>{$('#confirm-empty').onclick=()=>{checkpoint();project={version:1,name:'Mi nueva casa',wallHeight:2.6,wallThickness:.14,rooms:[],items:[]};selected=null;$('#project-name').value=project.name;$('#dialog').close();changed();startDrawing();};});
  }else{
    const swatches=[['Roble natural','#c5ad8e'],['Nogal','#94795b'],['Madera clara','#d5c8ab'],['Cemento','#aeb3b0'],['Piedra gris','#929c9e'],['Salvia','#a7b9b3'],['Arena','#c9bfa7'],['Arcilla','#bd9a85']];
    container.innerHTML=`<div class="library-description">Selecciona una habitación para cambiar su suelo, o un objeto para cambiar su color.</div><div class="material-grid">${swatches.map(([name,color])=>`<button data-color="${color}"><span style="background:${color}"></span>${name}</button>`).join('')}</div><div class="library-note">Los acabados de esta versión son colores y un patrón de madera sencillo. Las texturas fotográficas se añadirán al catálogo.</div>`;
    container.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{const o=project.items.find(o=>o.id===selected)||project.rooms.find(r=>r.id===selected);if(!o){toast('Selecciona primero un objeto o habitación.');return;}checkpoint();o.color=b.dataset.color;changed();});
  }
}
function renderAssets(){
  const filtered=catalog.filter(a=>(category==='Todos'||category===a.category)&&`${a.name} ${a.category}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
  $('#catalog-total').textContent=`${filtered.length} objetos`;
  $('#asset-grid').innerHTML=filtered.length?filtered.map(a=>`<button class="asset-card" data-asset="${a.id}" aria-label="Añadir ${a.name}"><span class="asset-preview"><img src="${thumbnail(a)}" alt="" draggable="false"><span class="asset-add">+</span></span><strong>${a.name}</strong><span class="asset-size">${fmt(a.w)} × ${fmt(a.d)} m</span></button>`).join(''):'<p class="empty-state">No encontramos ese objeto. Prueba otra búsqueda.</p>';
  $('#asset-grid').querySelectorAll('[data-asset]').forEach(button=>button.onclick=()=>addAsset(button.dataset.asset));
}
function addAsset(assetId){
  const room=project.rooms.find(r=>r.id===selected)||project.rooms[0];
  if(!room){toast('Dibuja una habitación antes de añadir objetos.');return;}
  const item=makeItem(assetId,room.x,room.z);
  if(isOpening(item)){
    if(!alignOpening(item,project)){toast('No hay una pared suficientemente ancha para esta abertura.');return;}
  }else{
    // Buscar un lugar libre dentro del espacio seleccionado antes de superponer.
    const step=.25;let placed=false;
    for(let z=room.z-room.d/2+item.d/2+.15;z<=room.z+room.d/2-item.d/2-.15&&!placed;z+=step)for(let x=room.x-room.w/2+item.w/2+.15;x<=room.x+room.w/2-item.w/2-.15&&!placed;x+=step){item.x=snap(x,snapping);item.z=snap(z,snapping);if(!warningsFor(item,project).length)placed=true;}
    if(!placed){item.x=room.x;item.z=room.z;}
  }
  checkpoint();project.items.push(item);selected=item.id;changed();toast(`${item.name} añadido. Arrástralo para moverlo.`);
}
function numeric(label,key,value,min,max,step=.1){
  const lower=['x','z'].includes(key)?Math.max(min,value-8):min;
  const upper=['x','z'].includes(key)?Math.min(max,value+8):key==='rotation'?max:Math.min(max,Math.max(key==='wallThickness'?1:6,value*1.5));
  const fill=(value-lower)/(upper-lower)*100;
  return `<label class="field"><span>${label}</span><div><input type="number" data-field="${key}" value="${round(value)}" min="${min}" max="${max}" step="${step}" aria-label="${label}"><span>${key==='rotation'?'°':'m'}</span></div><input class="property-range" data-linked="${key}" type="range" min="${lower}" max="${upper}" step="${key==='rotation'?15:.01}" value="${value}" style="--fill:${fill}%" aria-label="${label} (deslizador)"></label>`;
}
function renderInspector(){
  if(propertyPreviewFrame!==null){cancelAnimationFrame(propertyPreviewFrame);propertyPreviewFrame=null;}
  const item=project.items.find(o=>o.id===selected),room=project.rooms.find(r=>r.id===selected),o=item||room;
  const container=$('#inspector-content');
  if(!o){
    container.innerHTML=`<div class="inspector-heading"><h2>Tu proyecto</h2>${icon('home',18)}</div><div class="project-overview"><div class="overview-house">${icon('home',38)}</div><h3>Espacio para tus ideas.</h3><p>Selecciona un objeto o una habitación para darle tu toque.</p></div><div class="overview-stats"><div><strong>${fmt(totalArea(project))}<small>m²</small></strong><span>Superficie interior</span></div><div><strong>${project.rooms.length}</strong><span>Habitaciones</span></div></div><div class="property-section"><h3>Construcción</h3>${numeric('Altura de paredes','wallHeight',project.wallHeight,1,10)}${numeric('Espesor de paredes','wallThickness',project.wallThickness,.05,1,.01)}</div><div class="inspector-tip">${icon('ruler',20)}<p>Empieza con las medidas de tu casa. Después, prueba muebles y distribuciones.</p></div><div class="prototype-note">Primera versión · Las alertas geométricas son orientativas y no validan estructura ni normativa.</div>`;
  }else{
    const a=item?byId(item.asset):null,warnings=item?warningsFor(item,project):[];
    container.innerHTML=`<div class="inspector-heading"><h2>${item?'Objeto seleccionado':'Habitación'}</h2><button id="deselect" class="icon-button" aria-label="Cerrar selección">${icon('close',16)}</button></div>${item?`<div class="selected-preview"><img src="${thumbnail(a)}" alt="${esc(a.name)}"><span>${a.category}</span></div>`:`<div class="room-overview" style="--floor:${room.color}">${icon('plan',35)}<strong>${fmt(room.w*room.d)} m²</strong></div>`}<input class="object-name" data-field="name" aria-label="Nombre" value="${esc(o.name)}" maxlength="120"><div class="property-section"><h3>Dimensiones</h3>${a&&a.presets.length>1?`<select id="preset" aria-label="Tamaño predefinido"><option value="">Elegir tamaño…</option>${a.presets.map((v,i)=>`<option value="${i}">${v.map(fmt).join(' × ')} m</option>`).join('')}</select>`:''}<div class="dimensions">${numeric('Ancho','w',o.w,room?.5:.05,50,.05)}${numeric('Fondo','d',o.d,room?.5:.01,50,.05)}${item?numeric('Alto','h',item.h,.01,10,.05):''}</div></div><div class="property-section"><h3>Posición</h3><div class="dimensions">${numeric('Eje X','x',o.x,-100,100)}${numeric('Eje Z','z',o.z,-100,100)}</div>${item?numeric('Rotación','rotation',item.rotation,-360,360,15):''}${item&&!isOpening(item)?numeric('Elevación','elevation',item.elevation,0,10,.05):''}${a?.kind==='window'?numeric('Altura de antepecho','sill',item.sill,0,10,.05):''}</div><div class="property-section"><h3>Acabado</h3><label class="color-field"><input type="color" data-field="color" value="${o.color}" aria-label="Color del objeto"><span>Color personalizado</span><span>${o.color}</span></label></div>${warnings.length?`<div class="warnings">${warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</div>`:`<div class="geometry-ok">${icon('check',14)} ${item?'Sin alertas de tamaño o superposición':'Medidas de la habitación'}</div>`}<div class="object-actions">${item?`<button id="rotate-item" class="secondary" title="Girar 90 grados (R)">${icon('rotate',16)} Girar</button><button id="duplicate-item" class="secondary">${icon('copy',16)} Duplicar</button>`:''}<button id="delete-item" class="danger">${icon('trash',16)} Eliminar ${item?'objeto':'habitación'}</button></div>`;
    if(room){
      const tip=document.createElement('div');tip.className='room-edit-tip';
      tip.innerHTML=`<button class="secondary full" id="edit-room-floor">${icon('plan',15)} Editar piso en plano 2D</button><p>Arrastra el piso para moverlo. Usa los puntos del borde para cambiar sus medidas.</p><label><input id="carry-furniture" type="checkbox" ${carryFurniture?'checked':''}> Mover los muebles con el piso</label><small>Al ajustar bordes, los muebles mantienen su tamaño y posición. Esc cancela el arrastre.</small>`;
      container.querySelector('.object-name').after(tip);
      $('#edit-room-floor').onclick=()=>{setView('2d');select(room.id);};
      $('#carry-furniture').onchange=event=>{carryFurniture=event.target.checked;};
    }
    $('#deselect').onclick=()=>select(null);
    if(item){$('#rotate-item').onclick=rotateItem;$('#duplicate-item').onclick=duplicateItem;}
    $('#delete-item').onclick=deleteSelected;
    if($('#preset'))$('#preset').onchange=event=>{if(event.target.value==='')return;const values=a.presets[Number(event.target.value)];checkpoint();[item.w,item.d,item.h]=values;if(isOpening(item))alignOpening(item,project);changed();};
  }
  const apply=document.createElement('button');apply.className='primary full apply-properties';apply.textContent='Aplicar cambios';
  if(!o||room)renderRoomLighting(container,room);
  const name=o||project;
  const section=container.querySelector('.property-section:not(.room-lighting)');
  section?.after(apply);
  apply.onclick=()=>{
    const values={};
    for(const input of container.querySelectorAll('[data-field]')){
      const key=input.dataset.field,value=input.type==='number'?Number(input.value):input.value.trim();
      if(input.type==='number'&&(input.value===''||!Number.isFinite(value)||value<Number(input.min)||value>Number(input.max))){toast(`Usa un valor entre ${input.min} y ${input.max} para ${input.getAttribute('aria-label')}.`);return;}
      if(key==='name'&&!value){toast('Escribe un nombre para continuar.');return;}
      values[key]=value;
    }
    if(room){const next={...room,...values,rotation:0};if(project.rooms.some(r=>r.id!==room.id&&overlaps({...r,rotation:0},next))){toast('Estas medidas superponen dos habitaciones.');return;}}
    if(Object.keys(values).every(key=>name[key]===values[key]))return;
    checkpoint();Object.assign(name,values);
    if(item&&isOpening(item))alignOpening(item,project);
    if(!item)project.items.filter(isOpening).forEach(o=>alignOpening(o,project));
    changed();toast('Cambios aplicados.');
  };
  container.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply.click();}}));
  container.querySelectorAll('[data-linked]').forEach(slider=>{
    const key=slider.dataset.linked,number=container.querySelector(`[data-field="${key}"]`);
    slider.oninput=()=>{
      number.value=slider.value;slider.style.setProperty('--fill',`${(Number(slider.value)-Number(slider.min))/(Number(slider.max)-Number(slider.min))*100}%`);
      if(propertyPreviewFrame!==null)cancelAnimationFrame(propertyPreviewFrame);
      propertyPreviewFrame=requestAnimationFrame(()=>{
        propertyPreviewFrame=null;if(!slider.isConnected)return;
        const preview=clone(project),target=o?(preview.items.find(i=>i.id===o.id)||preview.rooms.find(r=>r.id===o.id)):preview;
        for(const field of container.querySelectorAll('input[type="number"][data-field]')){const value=Number(field.value);if(field.value===''||!Number.isFinite(value)||value<Number(field.min)||value>Number(field.max))return;target[field.dataset.field]=value;}
        if(room&&preview.rooms.some(r=>r.id!==room.id&&overlaps({...r,rotation:0},{...target,rotation:0}))){slider.classList.add('invalid');return;}
        slider.classList.remove('invalid');if(item&&isOpening(target))alignOpening(target,preview);if(!item)preview.items.filter(isOpening).forEach(i=>alignOpening(i,preview));scene.rebuild(preview,selected);
      });
    };
    slider.onchange=()=>{const focused=document.activeElement===slider;if(propertyPreviewFrame!==null){cancelAnimationFrame(propertyPreviewFrame);propertyPreviewFrame=null;}scene.rebuild(project,selected);apply.click();if(focused)container.querySelector(`[data-linked="${key}"]`)?.focus({preventScroll:true});};
    slider.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();number.value=name[key];slider.value=name[key];slider.style.setProperty('--fill',`${(Number(slider.value)-Number(slider.min))/(Number(slider.max)-Number(slider.min))*100}%`);slider.classList.remove('invalid');if(propertyPreviewFrame!==null)cancelAnimationFrame(propertyPreviewFrame);propertyPreviewFrame=null;scene.rebuild(project,selected);}};
  });
}
function renderRooms(){
  $('#room-chips').innerHTML=`<button data-room="" class="${!selected?'active':''}">${icon('home',14)} Toda la casa</button>${project.rooms.map(r=>`<button data-room="${r.id}" class="${selected===r.id?'active':''}">${esc(r.name)}</button>`).join('')}`;
  $('#room-chips').querySelectorAll('button').forEach(b=>b.onclick=()=>select(b.dataset.room||null));
  $('#room-labels').innerHTML=project.rooms.map(r=>`<span class="room-label" data-room="${r.id}">${esc(r.name)}<small>${fmt(r.w*r.d)} m²</small></span>`).join('');
  $('#room-labels').hidden=view!=='2d';
}
function renderStats(){
  ambienceUI.refresh(project);
  $('#project-stats').textContent=`${fmt(totalArea(project))} m² · ${project.rooms.length} espacios · ${project.items.length} objetos`;
  $('#undo').disabled=!undoStack.length;$('#redo').disabled=!redoStack.length;
}
function undo(redo=false){const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;to.push(clone(project));project=from.pop();selected=null;$('#project-name').value=project.name;stopDrawing();changed();if(tab==='rooms')renderLibrary();}
function rotateItem(){const o=project.items.find(o=>o.id===selected);if(!o)return;if(isOpening(o)){toast('Las puertas y ventanas se orientan automáticamente a la pared.');return;}checkpoint();o.rotation=(o.rotation+90)%360;changed();}
function duplicateItem(){const item=project.items.find(o=>o.id===selected);if(!item)return;checkpoint();const copy={...clone(item),id:crypto.randomUUID(),x:round(item.x+.4),z:round(item.z+.4)};if(isOpening(copy))alignOpening(copy,project);project.items.push(copy);selected=copy.id;changed();}
function deleteSelected(){
  if(!selected)return;const room=project.rooms.find(r=>r.id===selected);
  const remove=()=>{checkpoint();project.items=project.items.filter(o=>o.id!==selected);project.rooms=project.rooms.filter(r=>r.id!==selected);selected=null;changed();if(tab==='rooms')renderLibrary();};
  if(room)modal(`<h2>Eliminar ${esc(room.name)}</h2><p>Se eliminarán el suelo y las paredes de esta habitación. Sus muebles se conservarán para que puedas reubicarlos.</p><div class="dialog-actions"><button data-close class="secondary">Cancelar</button><button id="confirm-delete" class="danger">Eliminar habitación</button></div>`,()=>{$('#confirm-delete').onclick=()=>{$('#dialog').close();remove();};});else remove();
}
function setView(next){
  if(!scene.setMode(next))return;view=next;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
  $('.scene-heading').hidden=next!=='3d';$('.viewport').classList.toggle('walk-mode',next==='walk');
  $('#walk-overlay').hidden=next!=='walk'||walkLocked;$('#walk-reticle').hidden=next!=='walk'||!walkLocked;$('#walk-instructions').hidden=next!=='walk';
  ambienceUI.setView(next);
  renderSelectionActions();
  $('#scene-hint').innerHTML=next==='2d'?`${icon('ruler',14)} Arrastra pisos y muebles <span>·</span> Usa los tiradores para ajustar`:`${icon('rotate',14)} Arrastra para girar <span>·</span> Rueda para acercar`;renderRooms();
}
function startDrawing(){drawing=true;drawStart=null;setView('2d');scene.drawing(true);$('#drawing-hint').hidden=false;$('#drawing-hint').textContent='Marca una esquina en el plano · Después, la esquina opuesta · Esc para cancelar';}
function stopDrawing(){drawing=false;drawStart=null;scene.ghost(null,null);scene.drawing(false);$('#drawing-hint').hidden=true;}
function modal(html,after){$('#dialog-body').innerHTML=html;$('#dialog').showModal();$('#dialog').querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#dialog').close());after?.();}
function download(data,filename,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function loadProject(text){try{const next=validateProject(JSON.parse(text));checkpoint();project=next;selected=null;$('#project-name').value=next.name;stopDrawing();changed();scene.fit();renderLibrary();toast('Proyecto abierto.');}catch(error){toast(error.message||'No pudimos abrir el proyecto.');}}
$('#save').onclick=async()=>{try{const data=JSON.stringify(project,null,2);if(window.habita){if(await window.habita.saveProject(data))toast('Proyecto guardado en un archivo.');}else{download(data,`${project.name.replace(/[^a-zA-Z0-9áéíóúñ _-]/g,'')||'Mi casa'}.habita`,'application/json');toast('Proyecto descargado.');}}catch{toast('No se pudo guardar el archivo. Inténtalo de nuevo.');}};
$('#open').onclick=async()=>{if(window.habita){try{const text=await window.habita.openProject();if(text!==null)loadProject(text);}catch(error){toast(error.message);}}else $('#file-input').click();};
$('#file-input').onchange=async event=>{const file=event.target.files[0];if(file){if(file.size>10_000_000)toast('El archivo supera 10 MB.');else loadProject(await file.text());}event.target.value='';};
$('#project-name').onchange=event=>{const name=event.target.value.trim();if(!name){event.target.value=project.name;return;}checkpoint();project.name=name;persist();renderStats();};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('active',t===b));renderLibrary();});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{stopDrawing();setView(b.dataset.view);});
$('#undo').onclick=()=>undo();$('#redo').onclick=()=>undo(true);
$('#zoom-in').onclick=()=>scene.zoom(1.2);$('#zoom-out').onclick=()=>scene.zoom(1/1.2);$('#fit').onclick=()=>scene.fit();
$('#walk-start').onclick=()=>scene.lockWalk();
$('#walk-free').onclick=()=>{scene.freeWalk();$('#walk-instructions').querySelector('small').textContent='Escala 1:1 · Ojos a 1,65 m · Arrastra para mirar';};
$('#snap').onclick=()=>{snapping=!snapping;$('#snap').setAttribute('aria-pressed',String(snapping));$('#snap').innerHTML=`${icon('ruler',13)} ${snapping?'Ajuste a 10 cm':'Movimiento libre'}`;};
let wallMode=0;$('#walls').onclick=()=>{wallMode=(wallMode+1)%3;scene.wallMode(['cut','full','none'][wallMode]);$('#walls').innerHTML=`${icon('layers')}<span>${['Paredes bajas','Paredes completas','Sin paredes'][wallMode]}</span>`;};
$('#snapshot').onclick=()=>{const a=document.createElement('a');a.href=scene.screenshot();a.download='Mi-casa.png';a.click();toast('Imagen exportada.');};
$('#help').onclick=()=>modal(`<span class="dialog-emblem">${icon('home',32)}</span><h2>Una casa que se siente tuya.</h2><p>Empieza con la casa de ejemplo o dibuja la tuya desde <strong>Espacios</strong>.</p><ul><li><strong>Añade</strong> objetos haciendo clic en el catálogo.</li><li><strong>Mueve</strong> los muebles arrastrándolos en 2D o 3D.</li><li><strong>Edita</strong> medidas, posición, color y variantes en el panel derecho.</li><li><strong>Gira</strong> la maqueta arrastrando un espacio libre. Desplaza con el botón derecho.</li><li><strong>Guarda</strong> un archivo .habita para conservar o compartir tu proyecto.</li></ul><div class="shortcut-list"><span>Ctrl + Z · Deshacer</span><span>R · Girar</span><span>Supr · Eliminar objeto</span><span>Esc · Cancelar herramienta</span></div><p class="library-note">Medidas de muebles orientativas. Esta primera versión comprueba límites y superposición de objetos; aún no valida circulación, estructura ni normativa. Domótica y nuevos catálogos están en la hoja de ruta.</p><button data-close class="primary full">Empezar a diseñar</button>`);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){stopDrawing();return;}
  if(view==='walk')return;
  if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)||$('#dialog').open)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);}
  else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();undo(true);}
  else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();$('#save').click();}
  else if(event.key.toLowerCase()==='r')rotateItem();else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelected();}
});
scene.rebuild(project);scene.fit();renderLibrary();renderInspector();renderRooms();renderStats();
if(storageIssue)toast('No se pudo recuperar el autoguardado. Se abrió la casa de ejemplo.');
