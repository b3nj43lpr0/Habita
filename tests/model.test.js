import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleProject,validateProject,wallsFor,wallPieces,overlaps,alignOpening,warningsFor } from '../src/model/model.js';
import { makeItem } from '../src/model/catalog.js';

test('un archivo de proyecto conserva las medidas al guardar y abrir',()=>{
  const p=exampleProject();assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  assert.throws(()=>validateProject({...p,wallHeight:Infinity}));
  const invalid=structuredClone(p);invalid.items[0].w=-2;assert.throws(()=>validateProject(invalid));
});
test('pared contigua se comparte sin duplicar y se divide en extremos',()=>{
  const p={rooms:[{x:0,z:0,w:4,d:4},{x:3,z:0,w:2,d:2}],items:[],wallHeight:2.6};
  const shared=wallsFor(p).filter(w=>w.axis==='z'&&w.c===2);
  assert.deepEqual(shared.map(w=>[w.a,w.b]),[[-2,-1],[-1,1],[1,2]]);
});
test('una puerta deja un hueco real y un dintel',()=>{
  const p={rooms:[{x:0,z:0,w:4,d:4}],items:[],wallHeight:2.6,wallThickness:.14};
  const door=makeItem('door',0,-2);assert.equal(alignOpening(door,p),true);p.items.push(door);
  const w=wallsFor(p).find(w=>w.axis==='x'&&w.c===-2);
  const pieces=wallPieces(w,p);assert.equal(pieces.length,3);
  assert.equal(pieces[1].bottom,2.1);assert.equal(pieces[1].top,2.6);
});
test('ventana conserva antepecho y dintel; aberturas demasiado anchas no se insertan',()=>{
  const p={rooms:[{x:0,z:0,w:4,d:4}],items:[],wallHeight:2.6,wallThickness:.14};
  const window=makeItem('window',0,-2);alignOpening(window,p);p.items.push(window);
  const pieces=wallPieces(wallsFor(p).find(w=>w.axis==='x'&&w.c===-2),p);
  assert.equal(pieces.length,4);assert.equal(pieces[1].top,.9);assert.equal(pieces[2].bottom,2.1);
  assert.equal(alignOpening({...window,w:5},p),false);
});
test('colisiones consideran la rotación y objetos apilados',()=>{
  const a={x:0,z:0,w:2,d:.5,rotation:45},b={x:0,z:1,w:2,d:.5,rotation:0};
  assert.equal(overlaps(a,b),true);assert.equal(overlaps(a,{...b,z:5}),false);
  const p={rooms:[{x:0,z:0,w:10,d:10}],items:[]};const table=makeItem('coffee'),lamp={...makeItem('lamp'),elevation:.4};p.items.push(table,lamp);
  assert.deepEqual(warningsFor(lamp,p),[]);assert.ok(warningsFor({...lamp,elevation:0},p).length);
});
