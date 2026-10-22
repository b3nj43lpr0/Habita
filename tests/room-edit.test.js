import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeItem} from '../src/model/catalog.js';
import {roomCandidate,roomEditError,applyRoomEdit,roomBounds} from '../src/model/room-edit.js';
const fixture=()=>({version:1,name:'Prueba',wallHeight:2.6,wallThickness:.14,rooms:[{id:'a',name:'Living',x:0,z:0,w:4,d:4,color:'#c5ad8e'},{id:'b',name:'Cocina',x:4,z:0,w:4,d:4,color:'#c5ad8e'}],items:[makeItem('chair',-1,0),makeItem('window',0,-2),{...makeItem('door',2,0),rotation:90}]});

test('redimensionar desde un borde conserva el borde opuesto y mínimo de 50 cm',()=>{
  const p=fixture(),r=roomCandidate(p,'a','w',1,0,false);
  assert.equal(r.w,3);assert.equal(roomBounds(r).right,2);
  const minimum=roomCandidate(p,'a','nw',100,100,false);
  assert.equal(minimum.w,.5);assert.equal(minimum.d,.5);
});
test('se bloquea la superposición y se permite ampliar hacia espacio libre',()=>{
  const p=fixture();assert.ok(roomEditError(p,roomCandidate(p,'a','e',1,0,false)));
  assert.equal(roomEditError(p,roomCandidate(p,'a','w',-1,0,false)),null);
});
test('mover el piso transporta muebles y aberturas exteriores sin mutar la instantánea',()=>{
  const p=fixture(),original=JSON.stringify(p),next=applyRoomEdit(p,'a',roomCandidate(p,'a','move',-3,0,false));
  assert.equal(next.items[0].x,-4);assert.equal(next.items[1].x,-3);
  // La puerta compartida conserva su posición con la habitación vecina.
  assert.equal(next.items[2].x,2);assert.equal(JSON.stringify(p),original);
});
test('el tamaño del mobiliario no cambia al ampliar y su transporte es opcional',()=>{
  const p=fixture(),resized=applyRoomEdit(p,'a',roomCandidate(p,'a','n',0,-2,false));
  assert.deepEqual(resized.items[0],p.items[0]);assert.equal(resized.items[1].z,-4);
  const moved=applyRoomEdit(p,'a',roomCandidate(p,'a','move',-3,0,false),false);
  assert.equal(moved.items[0].x,-1);assert.equal(moved.items[1].x,-3);
});
test('el ajuste magnético permite encajar exactamente un piso junto a otro',()=>{
  const p=fixture();p.rooms[0].x=-3;
  const r=roomCandidate(p,'a','move',2.92,0,true);
  assert.equal(roomBounds(r).right,roomBounds(p.rooms[1]).left);
});
