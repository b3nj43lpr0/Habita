import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { furniture,disposeTree } from './furniture.js';
import { wallsFor,wallPieces } from './model.js';
import { roomBounds,roomHandles } from './room-edit.js';
import { createWalker,stairTransition } from './walkthrough.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createVisualLook } from './visual-look.js';
import { glowTexture } from './surfaces.js';
import { viewBackground } from './view-background.js';
import { isLamp,lightFor,lightColor } from './lighting.js';
import { isClimate,climateFor,modeColors } from './climate.js';
import { createAirflow } from './airflow.js';
import { isTv,tvFor } from './tv.js';
import { levelsOf,levelOf,levelElevation,onLevel,inRoom } from './levels.js';
import { isCover,coverFor } from './cover.js';
import { isVacuum,vacuumFor } from './vacuum.js';

export function createScene(host, callbacks) {
  const scene=new THREE.Scene();scene.background=viewBackground('cozy');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
  host.append(renderer.domElement);
  const roomTools=document.createElement('div');roomTools.className='room-tools';roomTools.hidden=true;
  roomTools.innerHTML=`<div class="room-live-size"></div><button type="button" class="room-move-handle" data-handle="move" aria-label="Mover habitación" title="Arrastra para mover la habitación">✥ Mover piso</button>${roomHandles.map(h=>`<button type="button" class="room-resize-handle handle-${h}" data-handle="${h}" aria-label="Ajustar ${h}" title="Arrastra para ajustar el piso"></button>`).join('')}<span class="room-edit-feedback" role="status"></span>`;
  host.append(roomTools);
  let camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,200);camera.position.set(13,15,17);
  const orbitCamera=camera,walkCamera=new THREE.PerspectiveCamera(70,1,.03,200);
  const look=createVisualLook(renderer,scene,camera);
  let dirty=true,isNight=false,ambiencePreset='cozy';
  const walker=createWalker(renderer.domElement,walkCamera,locked=>callbacks.walkLock?.(locked),(x,z)=>{
    const next=stairTransition(project,activeLevel,x,z);if(!next)return;
    activeLevel=next.level;plane.constant=-levelElevation(project,next.level);rebuild(project,null);walker.place(next.x,next.z);callbacks.levelChanged?.(next.level);
  });
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.maxPolarAngle=Math.PI*.49;controls.minZoom=.3;controls.maxZoom=6;controls.target.set(-.5,0,-.5);
  let focusMotion=null,lightPreviewId=null,climatePreviewId=null;
  const airflows=new Map(),vacuums=new Map();
  controls.addEventListener('start',()=>{focusMotion=null;});
  controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
  controls.rotateSpeed=.65;controls.zoomSpeed=.75;controls.panSpeed=.8;
  controls.addEventListener('change',()=>{dirty=true;});
  const hemi=new THREE.HemisphereLight('#f1e8dc','#777b87',1.25);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe3be',2);sun.position.set(-5,10,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=15;sun.shadow.camera.bottom=-15;sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;sun.shadow.radius=4;sun.shadow.blurSamples=8;scene.add(sun);
  const fill=new THREE.DirectionalLight('#bfcee8',.65);fill.position.set(5,7,-8);scene.add(fill);
  const grid=new THREE.GridHelper(40,80,'#465061','#2b3543');grid.position.y=-.32;grid.visible=false;scene.add(grid);
  const stage=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:'#080d17',opacity:.27}));stage.rotation.x=-Math.PI/2;stage.position.y=-.29;stage.receiveShadow=true;scene.add(stage);
  let house=new THREE.Group(),selectedBox=null,project=null,mode='3d',wallMode='cut',selected=null,ghost=null,activeLevel='base',heat=null;
  // Mapa de consumo: verde (poco) → amarillo → rojo (lo que más consume la casa); gris sin sensor.
  const heatColor=watts=>{if(watts==null)return '#7d8590';const max=Math.max(1,...Object.values(heat)),t=watts/max;return '#'+new THREE.Color('#6fbf73').lerp(new THREE.Color('#f2c14e'),Math.min(1,t*2)).lerp(new THREE.Color('#e5534b'),Math.max(0,t*2-1)).getHexString();};
  // Altura del piso de un objeto o habitación sobre el suelo del primer piso.
  const lift=o=>levelElevation(project,levelOf(o)),baseY=item=>lift(item)+(item.elevation||0);
  scene.add(house);
  const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const floorMat=new Map();
  function floorTexture(color) {
    if(floorMat.has(color))return floorMat.get(color);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');
    ctx.fillStyle=color;ctx.fillRect(0,0,256,256);
    ctx.strokeStyle='#57462e12';ctx.lineWidth=.65;
    for(let y=0;y<256;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();for(let x=(y%64?60:0);x<256;x+=128){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+32);ctx.stroke();}}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,2);
    floorMat.set(color,texture);return texture;
  }
  function addBox(w,h,d,x,y,z,mat,roomId=null) {
    const m=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(w,h,d,.1)*.22),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;if(roomId)m.userData.roomId=roomId;house.add(m);return m;
  }
  // Plano de referencia: imagen sobre el suelo y bajo muebles y paredes, solo en el plano 2D.
  let planMesh=null;
  function syncPlan(plan){
    if(planMesh&&(!plan||planMesh.userData.image!==plan.image)){scene.remove(planMesh);planMesh.material.map.dispose();planMesh.material.dispose();planMesh.geometry.dispose();planMesh=null;}
    if(!plan)return;
    if(!planMesh){
      const map=new THREE.TextureLoader().load(plan.image,()=>{dirty=true;});map.colorSpace=THREE.SRGBColorSpace;
      planMesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false}));
      planMesh.rotation.x=-Math.PI/2;planMesh.renderOrder=1;planMesh.userData.image=plan.image;scene.add(planMesh);
    }
    planMesh.position.set(plan.x,levelElevation(project,activeLevel)+.012,plan.z);planMesh.scale.set(plan.w,plan.d,1);planMesh.material.opacity=plan.opacity;
    planMesh.visible=mode==='2d';planMesh.userData.locked=plan.locked;dirty=true;
  }
  function rebuild(data,id=selected) {
    const reusable=new Map(house.children.filter(o=>o.userData.itemId).map(o=>[o.userData.itemId,o]));
    for(const model of reusable.values())house.remove(model);
    project=data;selected=id;syncPlan(data.plan);const flowsBefore=new Map([...airflows].map(([key,flow])=>[key,flow.snapshot()]));scene.remove(house);disposeTree(house);house=new THREE.Group();scene.add(house);airflows.clear();
    dirty=true;
    if(mode==='walk')walker.setProject(onLevel(data,activeLevel),levelElevation(data,activeLevel));
    // En 3D se ven el piso activo y los de abajo (con paredes completas); en 2D y recorrido, solo el activo.
    const levels=levelsOf(data),active=Math.max(0,levels.findIndex(l=>l.id===activeLevel));
    const shown=new Set(levels.filter((l,i)=>mode==='3d'?i<=active:i===active).map(l=>l.id));
    const wallMat=new THREE.MeshStandardMaterial({color:'#ece6dc',roughness:.88});
    for(const level of levels.filter(l=>shown.has(l.id))) {
      const view=onLevel(data,level.id),y=levelElevation(data,level.id),below=level.id!==levels[active].id;
      for(const r of view.rooms) {
        const mat=heat?new THREE.MeshStandardMaterial({color:heatColor(heat[r.id]),roughness:.9}):new THREE.MeshStandardMaterial({map:floorTexture(r.color),roughness:.9});
        addBox(r.w,.16,r.d,r.x,y-.08,r.z,mat,r.id);
        const base=new THREE.MeshStandardMaterial({color:'#d2bd9d',roughness:.7});addBox(r.w+.08,.1,r.d+.08,r.x,y-.21,r.z,base);
        if(mode==='walk')addBox(r.w,.08,r.d,r.x,y+data.wallHeight+.04,r.z,new THREE.MeshStandardMaterial({color:'#e3ded0',roughness:1}));
      }
      if(wallMode!=='none'||mode==='walk') for(const w of wallsFor(view)) {
        const height=mode==='walk'||below?data.wallHeight:mode==='2d'?.09:wallMode==='cut'?.85:data.wallHeight;
        for(const p of wallPieces(w,view)) {
          const top=Math.min(height,p.top);if(top<=p.bottom)continue;
          const len=p.b-p.a, mid=(p.a+p.b)/2;
          addBox(w.axis==='x'?len+data.wallThickness:data.wallThickness,top-p.bottom,w.axis==='z'?len+data.wallThickness:data.wallThickness,w.axis==='x'?mid:w.c,y+(top+p.bottom)/2,w.axis==='z'?mid:w.c,wallMat);
        }
      }
    }
    for(const item of data.items){
      if(!shown.has(levelOf(item)))continue;
      const signature=JSON.stringify([item.asset,item.w,item.h,item.d,item.color]);
      let model=reusable.get(item.id);reusable.delete(item.id);
      if(model&&model.userData.signature!==signature){disposeTree(model);model=null;}
      if(!model){model=furniture(item);model.userData.signature=signature;}
      model.position.set(item.x,baseY(item)+(item.asset==='window'?(item.sill||0):0),item.z);model.rotation.y=item.rotation*Math.PI/180;
      // Un sensor de apertura vinculado abre la puerta (sin hoja) o la ventana (sin vidrio).
      const open=callbacks.isOpen?.(item.id);
      if(item.asset==='door'){model.children[0].visible=mode!=='walk'&&!open;model.children[1].visible=mode!=='walk'&&!open;}
      if(item.asset==='window')model.children[0].visible=!open;
      house.add(model);
    }
    for(const model of reusable.values())disposeTree(model);
    // Reservar las fuentes más próximas al foco; todas las pantallas conservan su emisión.
    const lamps=data.items.filter(i=>isLamp(i)&&shown.has(levelOf(i))),lit=lamps.filter(i=>lightFor(i).on&&lightFor(i).brightness>0).sort((a,b)=>(a.id===selected?-1:b.id===selected?1:Math.hypot(a.x-controls.target.x,a.z-controls.target.z)-Math.hypot(b.x-controls.target.x,b.z-controls.target.z)));
    const sources=new Set(lit.slice(0,16).map(i=>i.id));
    for(const item of lamps){
      if(sources.has(item.id)){
        const light=new THREE.PointLight('#ffd29b',0,4,2);light.position.set(item.x,baseY(item)+item.h*.84,item.z);house.add(light);light.userData.lightFor=item.id;
      }
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:'#ffe4b4',transparent:true,opacity:isNight?.7:.35,depthWrite:false,blending:THREE.AdditiveBlending}));
      glow.position.set(item.x,baseY(item)+item.h*.84,item.z);glow.scale.setScalar(Math.max(.6,item.w*2.8));house.add(glow);
      glow.userData.lightFor=item.id;
      applyLampState(item.id,lightFor(item));
    }
    for(const item of data.items.filter(i=>isClimate(i)&&shown.has(levelOf(i)))){const before=flowsBefore.get(item.id),flow=createAirflow(item,lift(item),house.children.find(o=>o.userData.itemId===item.id),before);airflows.set(item.id,flow);house.add(flow.group);applyClimateState(item.id,climateFor(item),!before);}
    for(const item of data.items.filter(isTv))applyTvState(item.id,tvFor(item));
    for(const item of data.items.filter(isCover))applyCoverState(item.id,coverFor(item));
    placeVacuums(data,shown);
    lightPreviewId=climatePreviewId=null;
    setSelection(mode==='walk'?null:id);
  }
  function applyLampState(id,state){
    const tint=lightColor(state),level=state.on?state.brightness/100:0;
    for(const node of house.children){
      if(node.userData.lightFor===id){if(node.isPointLight){node.color.set(tint);node.intensity=(isNight?9:3.5)*level;}else{node.material.color.set(tint);node.material.opacity=(isNight?.7:.35)*level;node.visible=level>0&&mode!=='2d';}}
      if(node.userData.itemId===id)node.traverse(child=>{if(child.userData.lampShade){child.material.emissive.set(tint);child.material.emissiveIntensity=1.15*level;}});
    }
    dirty=true;
  }
  // El flujo de aire se oculta en el plano 2D; la aleta, el piloto y el halo los anima el flujo.
  function applyClimateState(id,state,instant=false){
    const flow=airflows.get(id);if(!flow)return;
    flow.setState(state,mode!=='2d',instant);
    dirty=true;
  }
  // Un televisor encendido ilumina su pantalla.
  function applyTvState(id,state){
    house.children.find(o=>o.userData.itemId===id)?.traverse(child=>{if(child.userData.tvScreen)child.material.emissiveIntensity=state.on?.9:0;});
    dirty=true;
  }
  // Cortina: la tela abierta queda recogida en un 8 % de su largo, pegada a su borde fijo.
  function applyCoverState(id,state){
    house.children.find(o=>o.userData.itemId===id)?.traverse(child=>{
      const d=child.userData;if(!d.coverFabric)return;
      const axis=d.coverAxis,size=child.geometry.parameters[axis==='x'?'width':'height'];
      if(d.edge===undefined)d.edge=child.position[axis]+(axis==='x'?-size/2:size/2);
      const k=Math.max(.08,1-state.position/100);child.scale[axis]=k;child.position[axis]=d.edge+(axis==='x'?size*k/2:-size*k/2);
    });
    dirty=true;
  }
  // La aspiradora recorre su habitación mientras limpia y vuelve a su lugar (la base) al terminar.
  // El recorrido es una figura de Lissajous dentro de la habitación; no esquiva muebles.
  const vacuumLed={cleaning:'#5be38c',returning:'#ffc75a',paused:'#ffc75a',idle:'#9aa5ad',docked:'#5be38c'};
  function placeVacuums(data,shown){
    const before=new Map([...vacuums].map(([id,v])=>[id,v.offset]));vacuums.clear();
    for(const item of data.items.filter(i=>isVacuum(i)&&shown.has(levelOf(i)))){
      const model=house.children.find(o=>o.userData.itemId===item.id);if(!model)continue;
      const room=data.rooms.find(r=>inRoom(item,r)),m=Math.max(item.w,item.d)/2+.05;
      const bounds=room?{x0:room.x-room.w/2+m-item.x,x1:room.x+room.w/2-m-item.x,z0:room.z-room.d/2+m-item.z,z1:room.z+room.d/2-m-item.z}:{x0:-1,x1:1,z0:-1,z1:1};
      const offset=before.get(item.id)||{x:0,z:0};model.position.x+=offset.x;model.position.z+=offset.z;
      vacuums.set(item.id,{item,model,bounds,offset,state:vacuumFor(item),heading:item.rotation*Math.PI/180});
      applyVacuumState(item.id,vacuumFor(item));
    }
  }
  function applyVacuumState(id,state){
    const v=vacuums.get(id);if(!v)return;v.state=state;
    v.model.traverse(child=>{if(child.userData.vacuumLed){child.material.emissive.set(vacuumLed[state.status]);child.material.emissiveIntensity=state.status==='docked'?.35:1.2;}});
    dirty=true;
  }
  function moveVacuums(now,dt){
    for(const v of vacuums.values()){
      const {status}=v.state,b=v.bounds,o=v.offset;let goal=null;
      if(status==='cleaning'){const t=now/1000;goal={x:(b.x0+b.x1)/2+(b.x1-b.x0)/2*Math.sin(t*.23),z:(b.z0+b.z1)/2+(b.z1-b.z0)/2*Math.sin(t*.31+1)};}
      else if(['returning','docked'].includes(status))goal={x:0,z:0};
      if(!goal)continue;
      const dx=goal.x-o.x,dz=goal.z-o.z,dist=Math.hypot(dx,dz);if(dist<.002)continue;
      const step=Math.min(dist,.3*dt);o.x+=dx/dist*step;o.z+=dz/dist*step;v.heading=Math.atan2(dx,dz);
      v.model.position.x=v.item.x+o.x;v.model.position.z=v.item.z+o.z;v.model.rotation.y=v.heading;dirty=true;
    }
  }
  function setSelection(id) {
    if(climatePreviewId){const item=project?.items.find(i=>i.id===climatePreviewId);if(item)applyClimateState(item.id,climateFor(item));climatePreviewId=null;}
    if(lightPreviewId){const item=project?.items.find(i=>i.id===lightPreviewId);if(item)applyLampState(item.id,lightFor(item));lightPreviewId=null;}
    selected=id;
    dirty=true;
    updateRoomTools();
    if(selectedBox){scene.remove(selectedBox);selectedBox.geometry.dispose();selectedBox.material.dispose();selectedBox=null;}
    const item=project?.items.find(o=>o.id===id),room=project?.rooms.find(o=>o.id===id);
    if(isLamp(item)&&lightFor(item).on&&lightFor(item).brightness>0&&!house.children.some(n=>n.isPointLight&&n.userData.lightFor===id)){
      const lights=house.children.filter(n=>n.isPointLight);
      const source=lights.length<16?new THREE.PointLight('#ffffff',0,4,2):lights.sort((a,b)=>b.position.distanceToSquared(controls.target)-a.position.distanceToSquared(controls.target))[0];
      source.userData.lightFor=id;source.position.set(item.x,baseY(item)+item.h*.84,item.z);house.add(source);applyLampState(id,lightFor(item));
    }
    if(item){const group=house.children.find(g=>g.userData.itemId===id);if(group){selectedBox=new THREE.BoxHelper(group,'#f0c18b');selectedBox.material.depthTest=false;selectedBox.renderOrder=10;scene.add(selectedBox);}}
    else if(room){const y=lift(room),bounds=new THREE.Box3(new THREE.Vector3(room.x-room.w/2,y,room.z-room.d/2),new THREE.Vector3(room.x+room.w/2,y+.04,room.z+room.d/2));selectedBox=new THREE.Box3Helper(bounds,'#f0c18b');selectedBox.material.depthTest=false;scene.add(selectedBox);}
  }
  function composition(){const {width,height}=host.getBoundingClientRect();if(mode==='3d'&&height>450)orbitCamera.setViewOffset(width,height,0,height*.12,width,height);else orbitCamera.clearViewOffset();}
  function resize(){const {width,height}=host.getBoundingClientRect();const aspect=width/Math.max(height,1);orbitCamera.left=-8*aspect;orbitCamera.right=8*aspect;orbitCamera.top=8;orbitCamera.bottom=-8;orbitCamera.updateProjectionMatrix();composition();walkCamera.aspect=aspect;walkCamera.updateProjectionMatrix();renderer.setSize(width,height);look.resize(width,height);dirty=true;}
  new ResizeObserver(resize).observe(host);
  function point(event){const rect=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);return raycaster.ray.intersectPlane(plane,new THREE.Vector3());}
  function hit(event){point(event);const hits=raycaster.intersectObjects(house.children,true);return hits.find(h=>h.object.userData.itemId)||hits.find(h=>h.object.userData.roomId);}
  function updateRoomTools(){
    const r=project?.rooms.find(r=>r.id===selected);
    roomTools.hidden=mode!=='2d'||!r||callbacks.isDrawing();
    if(roomTools.hidden)return;
    const bounds=roomBounds(r),rect=host.getBoundingClientRect();
    const coords={nw:[bounds.left,bounds.top],n:[r.x,bounds.top],ne:[bounds.right,bounds.top],e:[bounds.right,r.z],se:[bounds.right,bounds.bottom],s:[r.x,bounds.bottom],sw:[bounds.left,bounds.bottom],w:[bounds.left,r.z],move:[r.x,r.z]};
    const place=(el,x,z,offset=0)=>{const p=new THREE.Vector3(x,.06,z).project(camera);el.style.left=`${(p.x+1)*rect.width/2}px`;el.style.top=`${(1-p.y)*rect.height/2+offset}px`;};
    roomTools.querySelectorAll('[data-handle]').forEach(el=>place(el,...coords[el.dataset.handle]));
    const size=roomTools.querySelector('.room-live-size');size.textContent=`${r.w.toFixed(2)} × ${r.d.toFixed(2)} m · ${(r.w*r.d).toFixed(2)} m²`;place(size,r.x,bounds.top,-27);
    place(roomTools.querySelector('.room-edit-feedback'),r.x,bounds.bottom,30);
  }
  let roomGesture=null;
  function beginRoomGesture(event,id,handle){
    const p=point(event);if(!p)return;
    callbacks.select(id);roomGesture={id,handle,x:p.x,z:p.z,clientX:event.clientX,clientY:event.clientY,active:false};
    controls.enabled=false;renderer.domElement.style.cursor=handle==='move'?'grabbing':'';
    (event.currentTarget||renderer.domElement).setPointerCapture(event.pointerId);
  }
  roomTools.querySelectorAll('[data-handle]').forEach(button=>button.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();beginRoomGesture(event,selected,button.dataset.handle);
  }));
  host.addEventListener('pointermove',event=>{
    if(!roomGesture)return;
    const g=roomGesture,p=point(event);if(!p)return;
    if(!g.active&&Math.hypot(event.clientX-g.clientX,event.clientY-g.clientY)<3)return;
    if(!g.active){callbacks.startRoomDrag(g.id);g.active=true;}
    const error=callbacks.editRoom(g.id,g.handle,p.x-g.x,p.z-g.z);
    roomTools.classList.toggle('invalid',!!error);roomTools.querySelector('.room-edit-feedback').textContent=error||'';
  });
  function finishRoomGesture(cancel=false){
    if(!roomGesture)return false;
    if(roomGesture.active)callbacks.endRoomDrag(cancel);
    roomGesture=null;controls.enabled=!callbacks.isDrawing();renderer.domElement.style.cursor='';roomTools.classList.remove('invalid');roomTools.querySelector('.room-edit-feedback').textContent='';return true;
  }
  host.addEventListener('pointerup',()=>finishRoomGesture());
  host.addEventListener('pointercancel',()=>finishRoomGesture(true));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')finishRoomGesture(true);});
  let start=null,dragId=null,dragging=false,offset=null,drawClick=false,planDrag=null,hoverQueued=false;
  renderer.domElement.addEventListener('pointerleave',()=>callbacks.hover?.(null));
  renderer.domElement.addEventListener('pointerdown',event=>{
    if(mode==='walk'){event.stopImmediatePropagation();if(!walker.beginLook(event))walker.lock();return;}
    if(event.button!==0)return;
    start={x:event.clientX,y:event.clientY};
    const p=point(event);
    drawClick=callbacks.isDrawing();
    if(drawClick) {controls.enabled=false;callbacks.drawPoint(p);return;}
    const h=hit(event),id=h?.object.userData.itemId;
    if(mode==='2d'&&!id&&planMesh&&!planMesh.userData.locked&&raycaster.intersectObject(planMesh).length){planDrag={x:p.x,z:p.z,active:false};controls.enabled=false;renderer.domElement.setPointerCapture(event.pointerId);return;}
    if(mode==='2d'&&!id&&h?.object.userData.roomId){beginRoomGesture(event,h.object.userData.roomId,'move');start=null;return;}
    if(id){dragId=id;const item=project.items.find(o=>o.id===id);offset={x:item.x-p.x,z:item.z-p.z};controls.enabled=false;renderer.domElement.setPointerCapture(event.pointerId);callbacks.select(id);}
    else dragId=null;
  },true);
  renderer.domElement.addEventListener('pointermove',event=>{
    if(mode==='walk')return;
    const p=point(event);callbacks.pointer(p);
    // Etiqueta del equipo bajo el mouse: una consulta por cuadro y nunca mientras se arrastra.
    if(event.buttons||dragging)callbacks.hover?.(null);
    else if(!hoverQueued){hoverQueued=true;const at={clientX:event.clientX,clientY:event.clientY};requestAnimationFrame(()=>{hoverQueued=false;callbacks.hover?.(hit(at)?.object.userData.itemId||null,at.clientX,at.clientY);});}
    if(planDrag&&p&&start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>4){if(!planDrag.active){callbacks.startPlanDrag();planDrag.active=true;}callbacks.movePlan(p.x-planDrag.x,p.z-planDrag.z);}
    if(dragId&&start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>4){if(!dragging){callbacks.startDrag();dragging=true;}callbacks.move(dragId,p.x+offset.x,p.z+offset.z);}
  });
  renderer.domElement.addEventListener('pointerup',event=>{
    if(mode==='walk'){walker.endLook();return;}
    if(!start)return;
    if(planDrag){if(planDrag.active)callbacks.endPlanDrag();else callbacks.select(null);planDrag=null;start=null;controls.enabled=!callbacks.isDrawing();return;}
    if(drawClick){drawClick=false;start=null;controls.enabled=!callbacks.isDrawing();return;}
    if(!dragging&&!callbacks.isDrawing()&&!dragId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<5){const h=hit(event);callbacks.select(h?.object.userData.itemId||h?.object.userData.roomId||null);}
    if(dragging)callbacks.endDrag();
    dragging=false;dragId=null;start=null;controls.enabled=!callbacks.isDrawing();
  });
  function softenChange(){if(!matchMedia('(prefers-reduced-motion: reduce)').matches)renderer.domElement.animate([{opacity:.45},{opacity:1}],{duration:280,easing:'cubic-bezier(.2,.7,.3,1)'});}
  function setMode(next){
    focusMotion=null;
    if(next==='walk'){
      if(!walker.enter(onLevel(project,activeLevel),selected,levelElevation(project,activeLevel))){callbacks.walkUnavailable?.();return false;}
      mode='walk';camera=walkCamera;controls.enabled=false;grid.visible=false;roomTools.hidden=true;rebuild(project,null);softenChange();return true;
    }
    walker.exit();mode=next;camera=orbitCamera;controls.enabled=!callbacks.isDrawing();grid.visible=mode==='2d';
    controls.enableRotate=mode==='3d';composition();camera.position.copy(controls.target).add(mode==='2d'?new THREE.Vector3(0,25,.001):new THREE.Vector3(13,15,17));camera.up.set(0,1,0);controls.update();rebuild(project);softenChange();return true;
  }
  let lastTime=performance.now(),vacuumTime=lastTime;const lastPosition=new THREE.Vector3(),lastRotation=new THREE.Quaternion();
  function frame(){requestAnimationFrame(frame);const now=performance.now();walker.update((now-lastTime)/1000);lastTime=now;if(mode!=='walk')controls.update();
    if(focusMotion){const t=Math.min(1,(now-focusMotion.start)/360),ease=1-Math.pow(1-t,3),target=new THREE.Vector3().lerpVectors(focusMotion.from,focusMotion.to,ease),delta=target.sub(controls.target);controls.target.add(delta);camera.position.add(delta);controls.update();dirty=true;if(t===1)focusMotion=null;}
    // El aire se anima aunque Windows tenga las animaciones apagadas: es la señal de que el equipo
    // está funcionando (y muchos equipos las apagan por rendimiento, no por accesibilidad).
    for(const flow of airflows.values())if(flow.active){flow.update(now/1000);dirty=true;}
    moveVacuums(now,Math.min(.1,(now-vacuumTime)/1000));vacuumTime=now;
    if(dirty||!lastPosition.equals(camera.position)||!lastRotation.equals(camera.quaternion)){
      updateRoomTools();look.render(camera,mode);callbacks.frame?.(camera,host.getBoundingClientRect());lastPosition.copy(camera.position);lastRotation.copy(camera.quaternion);dirty=false;
    }
  }resize();frame();
  return {
    rebuild,setSelection,setMode,
    focusItem(id){const item=project.items.find(o=>o.id===id)||project.rooms.find(r=>r.id===id);if(!item||mode==='walk')return;const to=new THREE.Vector3(item.x,0,item.z);if(matchMedia('(prefers-reduced-motion: reduce)').matches){const delta=to.sub(controls.target);controls.target.add(delta);camera.position.add(delta);controls.update();dirty=true;}else focusMotion={start:performance.now(),from:controls.target.clone(),to};},
    previewLight(id,state){lightPreviewId=id;applyLampState(id,state);},
    previewClimate(id,state){climatePreviewId=id;applyClimateState(id,state);},
    previewCover(id,state){applyCoverState(id,state);},
    previewVacuum(id,state){applyVacuumState(id,state);},
    moveItem(item){const model=house.children.find(o=>o.userData.itemId===item.id);if(!model)return;model.position.set(item.x,baseY(item),item.z);model.rotation.y=item.rotation*Math.PI/180;for(const o of house.children.filter(o=>o.userData.lightFor===item.id))o.position.set(item.x,baseY(item)+item.h*.84,item.z);airflows.get(item.id)?.place();const v=vacuums.get(item.id);if(v)v.offset={x:0,z:0};setSelection(item.id);},
    lockWalk(){walker.lock();},
    freeWalk(){walker.free();},
    wallMode(value){wallMode=value;rebuild(project);},
    drawing(value){controls.enabled=!value;renderer.domElement.style.cursor=value?'crosshair':'';},
    ambience(preset){ambiencePreset=preset;isNight=['night','cinema'].includes(preset);hemi.intensity=isNight?.45:preset==='cozy'?.95:1.25;sun.intensity=isNight?.6:preset==='cozy'?1.5:2;fill.intensity=preset==='cinema'?.9:.55;fill.color.set(preset==='cinema'?'#879bff':'#bfcee8');scene.background=viewBackground(preset);look.night(isNight);rebuild(project);},
    visualTuning(brightness,warmth){renderer.toneMappingExposure=.35+brightness*.008;sun.color.copy(new THREE.Color('#b7d7ff').lerp(new THREE.Color('#ffd09b'),warmth/100));scene.environmentIntensity=(ambiencePreset==='night'?.16:.3)*(.6+brightness/100*.6);dirty=true;},
    zoom(factor){camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.3,6);camera.updateProjectionMatrix();dirty=true;},
    fit(){if(!project.rooms.length)return;const minX=Math.min(...project.rooms.map(r=>r.x-r.w/2)),maxX=Math.max(...project.rooms.map(r=>r.x+r.w/2)),minZ=Math.min(...project.rooms.map(r=>r.z-r.d/2)),maxZ=Math.max(...project.rooms.map(r=>r.z+r.d/2));controls.target.set((minX+maxX)/2,0,(minZ+maxZ)/2);const span=Math.max(maxX-minX,maxZ-minZ);camera.zoom=Math.min(1.3,11/span);camera.updateProjectionMatrix();setMode(mode);},
    plan(value){syncPlan(value);},
    setHeat(values){heat=values;rebuild(project);},
    // Piso activo: el que se edita, se recorre y recibe los clics (el plano de apoyo sube con él).
    setLevel(id){activeLevel=id;plane.constant=-levelElevation(project,id);if(mode==='walk')walker.enter(onLevel(project,id),null,levelElevation(project,id));rebuild(project,mode==='walk'?null:selected);},
    ghost(a,b,line=false){dirty=true;if(ghost){scene.remove(ghost);disposeTree(ghost);ghost=null;}if(a&&b&&line){ghost=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x,.06,a.z),new THREE.Vector3(b.x,.06,b.z)]),new THREE.LineBasicMaterial({color:'#e9b87e',depthTest:false}));ghost.renderOrder=11;scene.add(ghost);}else if(a&&b){const geo=new THREE.BoxGeometry(Math.max(.01,Math.abs(a.x-b.x)),.04,Math.max(.01,Math.abs(a.z-b.z)));ghost=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:'#e9b87e',transparent:true,opacity:.4,depthTest:false}));ghost.position.set((a.x+b.x)/2,.03,(a.z+b.z)/2);scene.add(ghost);}},
    screenshot(){look.render(camera,mode);return renderer.domElement.toDataURL('image/png');}
  };
}
