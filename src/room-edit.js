import { clone, round, snap, overlaps, wallsFor, openingOnWall } from './model.js';
import { isOpening } from './catalog.js';
import { sameLevel } from './levels.js';

export const roomHandles = ['nw','n','ne','e','se','s','sw','w'];
export function roomBounds(r) {return {left:r.x-r.w/2,right:r.x+r.w/2,top:r.z-r.d/2,bottom:r.z+r.d/2};}
function magnet(value, candidates, enabled) {
  if(!enabled)return round(value);
  const nearest=candidates.reduce((best,v)=>Math.abs(value-v)<Math.abs(value-best)?v:best,Infinity);
  return Math.abs(value-nearest)<=.16 ? round(nearest) : snap(value);
}
export function roomCandidate(project,id,handle,dx,dz,snapping=true) {
  const r=project.rooms.find(r=>r.id===id);if(!r)return null;
  const others=project.rooms.filter(o=>o.id!==id&&sameLevel(o,r)),xs=others.flatMap(o=>[o.x-o.w/2,o.x+o.w/2]),zs=others.flatMap(o=>[o.z-o.d/2,o.z+o.d/2]);
  let {left,right,top,bottom}=roomBounds(r);
  if(handle==='move') {
    dx=snap(dx,snapping);dz=snap(dz,snapping);
    const adjust=(delta,a,b,edges)=>{
      if(!snapping)return delta;
      const choices=edges.flatMap(v=>[v-a,v-b]);
      return magnet(delta,choices,true);
    };
    dx=adjust(dx,left,right,xs);dz=adjust(dz,top,bottom,zs);
    left+=dx;right+=dx;top+=dz;bottom+=dz;
  } else {
    if(handle.includes('w'))left=Math.min(right-.5,magnet(left+dx,xs,snapping));
    if(handle.includes('e'))right=Math.max(left+.5,magnet(right+dx,xs,snapping));
    if(handle.includes('n'))top=Math.min(bottom-.5,magnet(top+dz,zs,snapping));
    if(handle.includes('s'))bottom=Math.max(top+.5,magnet(bottom+dz,zs,snapping));
  }
  return {...r,x:round((left+right)/2),z:round((top+bottom)/2),w:round(right-left),d:round(bottom-top)};
}
export function roomEditError(project,candidate) {
  if(!candidate||candidate.w<.5||candidate.d<.5||candidate.w>50||candidate.d>50||Math.abs(candidate.x)>100||Math.abs(candidate.z)>100)return 'Fuera de los límites de edición';
  if(project.rooms.some(r=>r.id!==candidate.id&&sameLevel(r,candidate)&&overlaps({...r,rotation:0},{...candidate,rotation:0})))return 'No puedes superponer habitaciones';
  return null;
}
export function applyRoomEdit(original,id,candidate,carryFurniture=true) {
  const result=clone(original),r=original.rooms.find(r=>r.id===id);
  if(!r||roomEditError(original,candidate))return null;
  result.rooms=result.rooms.map(o=>o.id===id?clone(candidate):o);
  const moved=Math.abs(candidate.w-r.w)<.001&&Math.abs(candidate.d-r.d)<.001;
  const dx=candidate.x-r.x,dz=candidate.z-r.z;
  const b=roomBounds(r),next=roomBounds(candidate),walls=wallsFor({rooms:[r]});
  for(const item of result.items) {
    if(!sameLevel(item,r))continue;
    if(isOpening(item)) {
      // Las aberturas compartidas permanecen con la habitación vecina, salvo que
      // esa pared siga compartida tras la edición.
      const wall=walls.find(w=>openingOnWall(item,w));if(!wall)continue;
      const shared=wallsFor({rooms:original.rooms.filter(o=>o.id!==id&&sameLevel(o,r))}).some(w=>openingOnWall(item,w));
      if(shared)continue;
      if(wall.axis==='x') {
        const ratio=(item.x-b.left)/r.w;
        item.x=round(next.left+ratio*candidate.w);item.z=round(Math.abs(wall.c-b.top)<.01?next.top:next.bottom);
        item.x=round(Math.max(next.left+item.w/2+.02,Math.min(next.right-item.w/2-.02,item.x)));
      }else{
        const ratio=(item.z-b.top)/r.d;
        item.z=round(next.top+ratio*candidate.d);item.x=round(Math.abs(wall.c-b.left)<.01?next.left:next.right);
        item.z=round(Math.max(next.top+item.w/2+.02,Math.min(next.bottom-item.w/2-.02,item.z)));
      }
    }else if(moved&&carryFurniture){
      const owner=original.rooms.find(o=>sameLevel(o,item)&&item.x>=o.x-o.w/2&&item.x<=o.x+o.w/2&&item.z>=o.z-o.d/2&&item.z<=o.z+o.d/2);
      if(owner?.id===id){item.x=round(item.x+dx);item.z=round(item.z+dz);}
    }
  }
  return result;
}
