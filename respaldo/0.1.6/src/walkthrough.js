import * as THREE from 'three';
import { wallsFor,wallPieces } from './model.js';
import { byId } from './catalog.js';

function circleRect(x,z,r,cx,cz,w,d,rotation=0){
  const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=x-cx,dz=z-cz;
  const localX=dx*c-dz*s,localZ=dx*s+dz*c;
  const qx=Math.max(-w/2,Math.min(w/2,localX)),qz=Math.max(-d/2,Math.min(d/2,localZ));
  return (localX-qx)**2+(localZ-qz)**2<r*r-.000001;
}
export function walkSolids(project){
  const walls=wallsFor(project).flatMap(w=>wallPieces(w,project).filter(p=>p.bottom<1.8&&p.top>.05).map(p=>({x:w.axis==='x'?(p.a+p.b)/2:w.c,z:w.axis==='z'?(p.a+p.b)/2:w.c,w:w.axis==='x'?p.b-p.a+project.wallThickness:project.wallThickness,d:w.axis==='z'?p.b-p.a+project.wallThickness:project.wallThickness,rotation:0})));
  const furniture=project.items.filter(o=>!['rug','door'].includes(byId(o.asset)?.kind)&&(o.elevation||0)<1.8&&(o.elevation||0)+o.h>.06);
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
export function findWalkStart(project,preferredRoom){
  if(project.wallHeight<1.85)return null;
  const solids=walkSolids(project),rooms=[...project.rooms].sort((a,b)=>(b.id===preferredRoom?1:0)-(a.id===preferredRoom?1:0));
  for(const r of rooms){
    if(canWalkAt(project,r.x,r.z,.2,solids))return {x:r.x,z:r.z};
    for(let z=r.z-r.d/2+.35;z<r.z+r.d/2-.25;z+=.35)for(let x=r.x-r.w/2+.35;x<r.x+r.w/2-.25;x+=.35)if(canWalkAt(project,x,z,.2,solids))return {x,z};
  }
  return null;
}
export function createWalker(canvas,camera,onLockChange){
  let active=false,project=null,solids=[],yaw=0,pitch=0,freeMode=false,looking=false;
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
    enter(data,preferredRoom){const start=findWalkStart(data,preferredRoom);if(!start)return false;project=data;solids=walkSolids(data);camera.position.set(start.x,1.65,start.z);yaw=-Math.PI*.65;pitch=-.12;camera.rotation.set(pitch,yaw,0);active=true;freeMode=false;looking=false;clear();onLockChange(false);return true;},
    setProject(data){project=data;solids=walkSolids(data);},
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
    }
  };
}
