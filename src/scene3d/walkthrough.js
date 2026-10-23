import * as THREE from 'three';
import { wallsFor,wallPieces } from '../model/model.js';
import { byId } from '../model/catalog.js';
import { levelsOf,levelOf,onLevel } from '../model/levels.js';

function circleRect(x,z,r,cx,cz,w,d,rotation=0){
  const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=x-cx,dz=z-cz;
  const localX=dx*c-dz*s,localZ=dx*s+dz*c;
  const qx=Math.max(-w/2,Math.min(w/2,localX)),qz=Math.max(-d/2,Math.min(d/2,localZ));
  return (localX-qx)**2+(localZ-qz)**2<r*r-.000001;
}
export function walkSolids(project){
  const walls=wallsFor(project).flatMap(w=>wallPieces(w,project).filter(p=>p.bottom<1.8&&p.top>.05).map(p=>({x:w.axis==='x'?(p.a+p.b)/2:w.c,z:w.axis==='z'?(p.a+p.b)/2:w.c,w:w.axis==='x'?p.b-p.a+project.wallThickness:project.wallThickness,d:w.axis==='z'?p.b-p.a+project.wallThickness:project.wallThickness,rotation:0})));
  const furniture=project.items.filter(o=>!['rug','grass','pool','door','stairs'].includes(byId(o.asset)?.kind)&&(o.elevation||0)<1.8&&(o.elevation||0)+o.h>.06);
  return [...walls,...furniture];
}
export function canWalkAt(project,x,z,radius=.2,solids=walkSolids(project)){
  // El círculo de apoyo debe permanecer sobre la unión de los pisos.
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,px=x+Math.cos(a)*radius,pz=z+Math.sin(a)*radius;
    if(!project.rooms.some(r=>px>=r.x-r.w/2-.001&&px<=r.x+r.w/2+.001&&pz>=r.z-r.d/2-.001&&pz<=r.z+r.d/2+.001))return false;
  }
  return !solids.some(o=>circleRect(x,z,radius,o.x,o.z,o.w,o.d,o.rotation||0));
}
// Punto de partida del recorrido: la habitación elegida o, si no, la más grande. Se parte desde el
// rincón libre más alejado del centro (a 60 cm de los muros) mirando hacia el centro, para ver la
// habitación entera en vez de una pared. yaw sigue la convención de la cámara del recorrido.
export function findWalkStart(project,preferredRoom){
  if(project.wallHeight<1.85)return null;
  const solids=walkSolids(project),rooms=[...project.rooms].sort((a,b)=>(b.id===preferredRoom?1:0)-(a.id===preferredRoom?1:0)||b.w*b.d-a.w*a.d);
  const facing=(r,x,z)=>Math.atan2(-(r.x-x),-(r.z-z));
  for(const r of rooms){
    let best=null;
    for(let z=r.z-r.d/2+.6;z<=r.z+r.d/2-.6;z+=.3)for(let x=r.x-r.w/2+.6;x<=r.x+r.w/2-.6;x+=.3){
      const far=Math.hypot(x-r.x,z-r.z);
      if(far>(best?.far??-1)&&canWalkAt(project,x,z,.2,solids))best={x,z,far};
    }
    if(best&&best.far>.3)return {x:best.x,z:best.z,yaw:facing(r,best.x,best.z)};
    if(canWalkAt(project,r.x,r.z,.2,solids))return {x:r.x,z:r.z};
    for(let z=r.z-r.d/2+.35;z<r.z+r.d/2-.25;z+=.35)for(let x=r.x-r.w/2+.35;x<r.x+r.w/2-.25;x+=.35)if(canWalkAt(project,x,z,.2,solids))return {x,z};
  }
  return null;
}
// Escaleras: pisar una escalera sube al piso de arriba, junto a su extremo alto (el fondo, -z local);
// arriba, pisar el hueco de una escalera del piso de abajo baja junto a su extremo bajo.
export function stairTransition(project,levelId,x,z){
  const levels=levelsOf(project),i=levels.findIndex(l=>l.id===levelId);
  const stairs=id=>project.items.filter(o=>byId(o.asset)?.kind==='stairs'&&levelOf(o)===id);
  const on=s=>circleRect(x,z,.05,s.x,s.z,s.w,s.d,s.rotation||0);
  const toWorld=(s,lz)=>{const a=(s.rotation||0)*Math.PI/180;return {x:s.x+lz*Math.sin(a),z:s.z+lz*Math.cos(a)};};
  const go=(target,s,lz)=>{const p=toWorld(s,lz);return canWalkAt(onLevel(project,target),p.x,p.z)?{level:target,...p}:null;};
  if(i<0)return null;
  if(i+1<levels.length)for(const s of stairs(levelId))if(on(s)){const next=go(levels[i+1].id,s,-s.d/2-.45);if(next)return next;}
  if(i>0)for(const s of stairs(levels[i-1].id))if(on(s)){const next=go(levels[i-1].id,s,s.d/2+.45);if(next)return next;}
  return null;
}
export function createWalker(canvas,camera,onLockChange,onMove){
  let active=false,project=null,solids=[],yaw=0,pitch=0,freeMode=false,looking=false,base=0;
  const keys=new Set();camera.rotation.order='YXZ';
  const clear=()=>keys.clear();
  document.addEventListener('pointerlockchange',()=>{clear();onLockChange(active&&document.pointerLockElement===canvas);});
  document.addEventListener('pointerlockerror',()=>onLockChange(false));
  document.addEventListener('mousemove',event=>{
    if(!active||(document.pointerLockElement!==canvas&&!(freeMode&&looking)))return;
    yaw-=event.movementX*.002;pitch=THREE.MathUtils.clamp(pitch-event.movementY*.002,-1.45,1.45);camera.rotation.set(pitch,yaw,0);
  });
  document.addEventListener('keydown',event=>{
    if(active&&freeMode&&event.code==='Escape'){freeMode=false;looking=false;clear();onLockChange(false);return;}
    if(!active||(document.pointerLockElement!==canvas&&!freeMode)||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)||event.ctrlKey||event.metaKey||event.altKey)return;
    if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(event.code)){keys.add(event.code);event.preventDefault();}
  });
  document.addEventListener('keyup',event=>keys.delete(event.code));window.addEventListener('blur',clear);
  return {
    enter(data,preferredRoom,floor=0){const start=findWalkStart(data,preferredRoom);if(!start)return false;project=data;solids=walkSolids(data);base=floor;camera.position.set(start.x,base+1.65,start.z);yaw=start.yaw??-Math.PI*.65;pitch=-.12;camera.rotation.set(pitch,yaw,0);active=true;freeMode=false;looking=false;clear();onLockChange(false);return true;},
    setProject(data,floor=base){project=data;solids=walkSolids(data);base=floor;camera.position.y=base+1.65;},
    place(x,z){camera.position.x=x;camera.position.z=z;},
    lock(){if(!active)return;try{const promise=canvas.requestPointerLock();promise?.catch(()=>onLockChange(false));}catch{onLockChange(false);}},
    free(){if(!active)return;freeMode=true;clear();onLockChange(true);},
    beginLook(event){if(!freeMode)return false;looking=true;canvas.setPointerCapture(event.pointerId);return true;},
    endLook(){looking=false;},
    exit(){active=false;freeMode=false;looking=false;clear();if(document.pointerLockElement===canvas)document.exitPointerLock();},
    update(dt){
      if(!active||(document.pointerLockElement!==canvas&&!freeMode)||!project)return;
      let forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),right=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
      const length=Math.hypot(forward,right);if(!length)return;forward/=length;right/=length;
      const distance=Math.min(dt,.05)*(keys.has('ShiftLeft')||keys.has('ShiftRight')?3.2:1.8);
      const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*right)*distance,dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*right)*distance;
      const steps=Math.max(1,Math.ceil(distance/.04));
      for(let i=0;i<steps;i++){
        if(canWalkAt(project,camera.position.x+dx/steps,camera.position.z,.2,solids))camera.position.x+=dx/steps;
        if(canWalkAt(project,camera.position.x,camera.position.z+dz/steps,.2,solids))camera.position.z+=dz/steps;
      }
      onMove?.(camera.position.x,camera.position.z);
    }
  };
}
