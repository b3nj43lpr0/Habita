import { byId, isOpening, makeItem, flatKinds } from './catalog.js';
import { isLamp,validLight } from '../devices/lighting.js';
import { isClimate,validClimate } from '../devices/climate.js';
import { validScenes } from './scenes.js';
import { isTv,validTv } from '../devices/tv.js';
import { validPlan } from './plan.js';
import { isCover,validCover } from '../devices/cover.js';
import { isVacuum,validVacuum } from '../devices/vacuum.js';
import { validAutomations } from './automations.js';
import { validNotes } from './notes.js';
import { validPrice,validLink } from './shopping.js';
import { validVersionsShape,restoreVersion } from './versions.js';
import { onLevel,levelOf,levelsOf,validLevels } from './levels.js';
import { doorBlockers,validSwing } from './circulation.js';
import { validFloor,validMaterials } from './materials.js';
import { validSun } from './sun.js';
import { validModels } from './models.js';
export const round = n => Math.round(n * 1000) / 1000;
export const snap = (n, enabled = true) => enabled ? round(Math.round(n / .1) * .1) : round(n);
export const clone = data => structuredClone(data);
export const totalArea = project => project.rooms.reduce((n, r) => n + r.w * r.d, 0);

export function exampleProject() {
  const rooms = [
    { id:'living', name:'Living y comedor', x:-2, z:1.5, w:6, d:5, color:'#c5ad8e' },
    { id:'bedroom', name:'Dormitorio', x:-2, z:-3, w:6, d:4, color:'#b5a68e' },
    { id:'kitchen', name:'Cocina', x:2.5, z:2, w:3, d:4, color:'#b8b8a8' },
    { id:'bathroom', name:'Baño', x:2.5, z:-2.5, w:3, d:3, color:'#a7b9b3' },
    { id:'entry', name:'Acceso', x:2.5, z:-.5, w:3, d:1, color:'#bfb09b' }
  ];
  const items=[];
  const add=(id,x,z,rotation=0,extra={}) => items.push({...makeItem(id,x,z),rotation,...extra});
  add('rug',-2.7,1.6,0,{w:3.2,d:2.6});
  add('sofa',-3.1,.2); add('coffee',-3,1.65); add('tv',-3,3.68,180);
  add('armchair',-4.35,1.7,90); add('plant',-4.45,3.4); add('floor-lamp',-4.5,-.2);
  add('dining',-.1,2.4,90,{w:1.4});
  add('chair',-.8,2); add('chair',-.8,2.8); add('chair',.6,2,180); add('chair',.6,2.8,180);
  add('bed',-2.6,-3.7); add('nightstand',-3.7,-4.1); add('nightstand',-1.5,-4.1);
  add('wardrobe',-4.6,-2.4,90); add('desk',-.1,-4.5); add('office-chair',-.1,-3.75,180);
  add('plant-small',-.3,-1.4);
  add('kitchen',1.6,3.65); add('sink',2.5,3.65); add('stove',3.25,3.65); add('fridge',3.55,.6);
  add('toilet',3.5,-3.55); add('shower',1.55,-3.5); add('vanity',3.65,-2.1,90);
  add('door',1,-.5,90); add('door',-.1,-1); add('door',2.5,-1);
  add('window',-2.5,-5); add('window',-2.5,4); add('window',4,2,90);
  return { version:1, name:'Mi primera casa', wallHeight:2.6, wallThickness:.14, rooms, items };
}

// Dos habitaciones con el mismo `join` forman un solo espacio (en L, en T…): el muro que comparten
// no se levanta.
const insideRoom=(r,x,z)=>x>r.x-r.w/2&&x<r.x+r.w/2&&z>r.z-r.d/2&&z<r.z+r.d/2;
function joinedSegment(project,s) {
  const mid=(s.a+s.b)/2,points=s.axis==='x'?[[mid,s.c-.01],[mid,s.c+.01]]:[[s.c-.01,mid],[s.c+.01,mid]];
  const [p,q]=points.map(([x,z])=>project.rooms.find(r=>r.join&&insideRoom(r,x,z)));
  return !!p&&!!q&&p!==q&&p.join===q.join&&levelOf(p)===levelOf(q);
}
// Dividir en todos los extremos colineales permite compartir una pared entre habitaciones.
export function wallsFor(project) {
  const raw=[];
  for (const r of project.rooms) {
    const x0=round(r.x-r.w/2), x1=round(r.x+r.w/2), z0=round(r.z-r.d/2), z1=round(r.z+r.d/2);
    raw.push({axis:'x',c:z0,a:x0,b:x1},{axis:'x',c:z1,a:x0,b:x1},{axis:'z',c:x0,a:z0,b:z1},{axis:'z',c:x1,a:z0,b:z1});
  }
  const result=new Map();
  for (const s of raw) {
    const cuts=[s.a,s.b,...raw.filter(t=>t.axis===s.axis&&t.c===s.c).flatMap(t=>[t.a,t.b]).filter(v=>v>s.a&&v<s.b)].sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++) {
      if(cuts[i]-cuts[i-1]<.001) continue;
      const segment={axis:s.axis,c:s.c,a:cuts[i-1],b:cuts[i]};
      if(joinedSegment(project,segment)) continue;
      result.set(`${s.axis}:${s.c}:${segment.a}:${segment.b}`,segment);
    }
  }
  return [...result.values()];
}
export function nearestWall(item, project) {
  project=onLevel(project,levelOf(item));
  let best=null;
  for (const w of wallsFor(project)) {
    if(w.b-w.a<item.w+.04) continue;
    const along=w.axis==='x'?item.x:item.z;
    const at=Math.max(w.a+item.w/2+.02,Math.min(w.b-item.w/2-.02,along));
    const x=w.axis==='x'?at:w.c, z=w.axis==='z'?at:w.c;
    const distance=Math.hypot(item.x-x,item.z-z);
    if(!best||distance<best.distance) best={wall:w,x,z,distance,rotation:w.axis==='x'?0:90};
  }
  return best;
}
export function alignOpening(item, project) {
  const match=nearestWall(item,project);
  if(!match) return false;
  Object.assign(item,{x:round(match.x),z:round(match.z),rotation:match.rotation,d:project.wallThickness});
  return true;
}
export function openingOnWall(item,w) {
  if(!isOpening(item)) return false;
  const perpendicular=w.axis==='x'?item.z:item.x;
  const along=w.axis==='x'?item.x:item.z;
  const orientation=((item.rotation%180)+180)%180;
  return Math.abs(perpendicular-w.c)<.025 && Math.abs(orientation-(w.axis==='x'?0:90))<.01 && along-item.w/2>=w.a-.001&&along+item.w/2<=w.b+.001;
}
export function wallPieces(w, project) {
  const openings=project.items.filter(item=>openingOnWall(item,w));
  const cuts=[...new Set([w.a,w.b,...openings.flatMap(o=>{const c=w.axis==='x'?o.x:o.z;return [round(c-o.w/2),round(c+o.w/2)];})])].sort((a,b)=>a-b);
  const out=[];
  for(let i=1;i<cuts.length;i++) {
    const a=cuts[i-1], b=cuts[i], mid=(a+b)/2;
    const intervals=openings.filter(o=>{const c=w.axis==='x'?o.x:o.z;return mid>c-o.w/2&&mid<c+o.w/2;})
      .map(o=>[Math.max(0,o.sill||0),Math.min(project.wallHeight,(o.sill||0)+o.h)]).sort((a,b)=>a[0]-b[0]);
    let cursor=0;
    for(const [low,high] of intervals) { if(low>cursor) out.push({a,b,bottom:cursor,top:low});cursor=Math.max(cursor,high); }
    if(cursor<project.wallHeight) out.push({a,b,bottom:cursor,top:project.wallHeight});
  }
  return out;
}
export function corners(o) {
  const a=o.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return [[-o.w/2,-o.d/2],[o.w/2,-o.d/2],[o.w/2,o.d/2],[-o.w/2,o.d/2]].map(([x,z])=>[o.x+x*c+z*s,o.z-x*s+z*c]);
}
export function overlaps(a,b) {
  const ca=corners(a),cb=corners(b);
  for(const poly of [ca,cb]) for(let i=0;i<2;i++) {
    const p=poly[i],q=poly[i+1],axis=[q[1]-p[1],p[0]-q[0]];
    const pa=ca.map(p=>p[0]*axis[0]+p[1]*axis[1]),pb=cb.map(p=>p[0]*axis[0]+p[1]*axis[1]);
    if(Math.max(...pa)<=Math.min(...pb)+.001||Math.max(...pb)<=Math.min(...pa)+.001) return false;
  }
  return true;
}
export function warningsFor(item, project) {
  project=onLevel(project,levelOf(item));
  if(isOpening(item)) {
    const warnings=[];
    if(!wallsFor(project).some(w=>openingOnWall(item,w))) warnings.push('Esta abertura no está insertada en una pared. Acércala a una pared más ancha.');
    if((item.sill||0)+item.h>project.wallHeight) warnings.push('La abertura supera la altura de la pared.');
    if(project.items.some(o=>o.id!==item.id&&isOpening(o)&&overlaps(item,o))) warnings.push('Esta abertura se superpone con otra.');
    const blockers=doorBlockers(item,project);
    if(blockers.length) warnings.push(`Al abrirse choca con ${blockers.map(o=>o.name).join(', ')}. Cambia el sentido de apertura o mueve el mueble.`);
    return warnings;
  }
  const warnings=[];
  const kind=byId(item.asset).kind;
  // Un muro libre puede ir fuera de las habitaciones (por ejemplo, un muro en diagonal o un cerco).
  const inside=['partition','fence','pool','grass','tree'].includes(kind)||corners(item).every(([x,z])=>project.rooms.some(r=>x>=r.x-r.w/2-.01&&x<=r.x+r.w/2+.01&&z>=r.z-r.d/2-.01&&z<=r.z+r.d/2+.01));
  if(!inside) warnings.push('Parte del objeto queda fuera de las habitaciones.');
  if(!flatKinds.includes(kind)) {
    const collision=project.items.find(o=>o.id!==item.id&&!isOpening(o)&&!flatKinds.includes(byId(o.asset).kind)&&item.elevation<o.elevation+o.h-.02&&item.elevation+item.h>o.elevation+.02&&overlaps(item,o));
    if(collision) warnings.push(`Se superpone con ${collision.name}.`);
  }
  return warnings;
}
export function validateProject(input) {
  if(!input||input.version!==1||typeof input.name!=='string'||!Array.isArray(input.rooms)||!Array.isArray(input.items)) throw new Error('El archivo no es un proyecto Habita compatible.');
  if(input.rooms.length>150||input.items.length>1500) throw new Error('El proyecto supera el límite de esta versión.');
  const num=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  if(!num(input.wallHeight,1,10)||!num(input.wallThickness,.05,1)) throw new Error('Medidas de paredes inválidas.');
  const ids=new Set();
  for(const [list,isRoom] of [[input.rooms,true],[input.items,false]]) for(const o of list) {
    if(typeof o.id!=='string'||ids.has(o.id)||typeof o.name!=='string'||o.name.length>120||!/^#[\da-f]{6}$/i.test(o.color)) throw new Error('Identidad o color inválido.');
    ids.add(o.id);
    if(!num(o.x,-100,100)||!num(o.z,-100,100)||!num(o.w,.05,50)||!num(o.d,.01,50)) throw new Error('Dimensiones inválidas.');
    if(!isRoom&&(!byId(o.asset)||!num(o.h,.01,10)||!num(o.rotation,-3600,3600)||!num(o.elevation,0,10)||!num(o.sill??0,0,10))) throw new Error('Objeto inválido.');
    if(!isRoom&&o.light!==undefined&&(!isLamp(o)||!validLight(o.light)))throw new Error('Configuración de lámpara inválida.');
    if(!isRoom&&o.climate!==undefined&&(!isClimate(o)||!validClimate(o.climate)))throw new Error('Configuración de aire acondicionado inválida.');
    if(!isRoom&&o.tv!==undefined&&(!isTv(o)||!validTv(o.tv)))throw new Error('Configuración de televisor inválida.');
    if(!isRoom&&o.cover!==undefined&&(!isCover(o)||!validCover(o.cover)))throw new Error('Configuración de cortina inválida.');
    if(!isRoom&&(!validPrice(o.price)||!validLink(o.link)))throw new Error('Datos de compra inválidos.');
    if(isRoom&&(!validFloor(o.floor)||(o.join!==undefined&&(typeof o.join!=='string'||!/^[\w-]{1,60}$/.test(o.join)))))throw new Error('Habitación inválida.');
    if(!isRoom&&(!validSwing(o.swing)||(o.swing!==undefined&&byId(o.asset).kind!=='door')))throw new Error('Sentido de puerta inválido.');
    if(!isRoom&&(o.asset==='custom')!==(o.model!==undefined))throw new Error('Modelo importado inválido.');
    if(!isRoom&&o.vacuum!==undefined&&(!isVacuum(o)||!validVacuum(o.vacuum)))throw new Error('Configuración de aspiradora inválida.');
  }
  if(!validMaterials(input.materials)) throw new Error('Datos de materiales inválidos.');
  if(!validSun(input.sun)) throw new Error('Datos del sol inválidos.');
  if(!validModels(input.models)) throw new Error('Modelos 3D inválidos.');
  if(input.items.some(o=>o.model!==undefined&&!(input.models||[]).some(m=>m.id===o.model))) throw new Error('Un objeto usa un modelo 3D que no está en el proyecto.');
  if(!validScenes(input.scenes)) throw new Error('Escenas inválidas.');
  if(input.plan!==undefined&&!validPlan(input.plan)) throw new Error('Plano de referencia inválido.');
  if(!validLevels(input.levels)) throw new Error('Pisos inválidos.');
  if(!validAutomations(input.automations)) throw new Error('Automatizaciones inválidas.');
  const levelIds=new Set(levelsOf(input).map(l=>l.id));
  if(!validNotes(input.notes,levelIds)) throw new Error('Notas del plano inválidas.');
  // Cada versión guardada debe ser, a su vez, una distribución válida de esta casa.
  if(!validVersionsShape(input.versions)) throw new Error('Versiones inválidas.');
  for(const v of input.versions||[]){try{validateProject({...restoreVersion(input,v),versions:undefined,scenes:undefined,automations:undefined});}catch(error){throw new Error(`La versión «${v.name}» no es válida: ${error.message}`);}}
  if([...input.rooms,...input.items].some(o=>o.level!==undefined&&!levelIds.has(o.level))) throw new Error('Un objeto o habitación está en un piso que no existe.');
  return clone(input);
}
