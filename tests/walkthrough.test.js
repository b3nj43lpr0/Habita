import { test } from 'node:test';
import assert from 'node:assert/strict';
import {canWalkAt,findWalkStart} from '../src/walkthrough.js';
import {makeItem} from '../src/catalog.js';
import * as THREE from 'three';
import {createWalker} from '../src/walkthrough.js';
const room=(id,x)=>({id,x,z:0,w:4,d:4});
const fixture=()=>({rooms:[room('a',0),room('b',4)],items:[],wallThickness:.14,wallHeight:2.6});
test('el recorrido bloquea paredes y el exterior del piso',()=>{
  const p=fixture();assert.equal(canWalkAt(p,0,0),true);assert.equal(canWalkAt(p,-2,0),false);assert.equal(canWalkAt(p,2,0),false);assert.equal(canWalkAt(p,10,0),false);
});
test('se puede cruzar una puerta entre pisos contiguos, pero no una ventana',()=>{
  const p=fixture(),door=makeItem('door',2,0);door.rotation=90;p.items.push(door);
  assert.equal(canWalkAt(p,2,0),true);assert.equal(canWalkAt(p,2,.6),false);
  p.items=[{...makeItem('window',2,0),rotation:90}];assert.equal(canWalkAt(p,2,0),false);
});
test('el recorrido evita muebles y encuentra un punto de inicio libre',()=>{
  const p=fixture();p.items=[makeItem('dining',0,0)];
  assert.equal(canWalkAt(p,0,0),false);const start=findWalkStart(p,'a');assert.ok(start);assert.equal(canWalkAt(p,start.x,start.z),true);
  p.rooms=[];assert.equal(findWalkStart(p),null);
});
test('WASD avanza 1,8 metros por segundo, sin acelerar en diagonal, y se detiene al soltar',()=>{
  const oldDocument=globalThis.document,oldWindow=globalThis.window;
  const doc=new EventTarget(),win=new EventTarget(),canvas={};doc.pointerLockElement=canvas;
  globalThis.document=doc;globalThis.window=win;
  try{
    const camera=new THREE.PerspectiveCamera(),walker=createWalker(canvas,camera,()=>{});
    const p={rooms:[{id:'a',x:0,z:0,w:20,d:20}],items:[],wallHeight:2.6,wallThickness:.14};
    assert.equal(walker.enter(p),true);
    const key=(type,code)=>{const e=new Event(type);Object.defineProperty(e,'code',{value:code});doc.dispatchEvent(e);};
    key('keydown','KeyW');key('keydown','KeyD');
    for(let i=0;i<60;i++)walker.update(1/60);
    assert.ok(Math.abs(Math.hypot(camera.position.x,camera.position.z)-1.8)<.0001);
    assert.equal(camera.position.y,1.65);
    key('keyup','KeyW');key('keyup','KeyD');const before=camera.position.clone();walker.update(.05);assert.ok(camera.position.equals(before));
    assert.equal(findWalkStart({...p,wallHeight:1.5}),null);
  }finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
