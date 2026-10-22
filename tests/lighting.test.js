import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleProject,validateProject } from '../src/model/model.js';
import { lightFor,lightColor,lampsInRoom } from '../src/devices/lighting.js';

test('proyectos anteriores siguen abiertos y las luces se guardan por objeto',()=>{
  const project=exampleProject(),lamp=project.items.find(i=>i.asset==='floor-lamp');
  assert.equal(lightFor(lamp).on,true);
  assert.deepEqual(validateProject(project),project);
  lamp.light={...lightFor(lamp),on:false,brightness:32,mode:'color',color:'#88baff'};
  const reopened=validateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(reopened.items.find(i=>i.id===lamp.id).light,lamp.light);
  assert.equal(lightColor(lamp.light),'#88baff');
});
test('se rechazan luces malformadas y configuraciones en muebles sin lámpara',()=>{
  for(const bad of [{brightness:-1},{brightness:Infinity},{on:'false'},{warmth:101},{color:'red'},{mode:'device'}]){
    const project=exampleProject(),lamp=project.items.find(i=>i.asset==='floor-lamp');
    lamp.light={...lightFor(lamp),...bad};assert.throws(()=>validateProject(project),/lámpara/);
  }
  const project=exampleProject();project.items[0].light=lightFor({});assert.throws(()=>validateProject(project),/lámpara/);
});
test('control por habitación usa la posición actual y no incluye habitaciones vecinas',()=>{
  const project=exampleProject(),living=project.rooms[0],bedroom=project.rooms[1],lamp=project.items.find(i=>i.asset==='floor-lamp');
  assert.deepEqual(lampsInRoom(project,living).map(i=>i.id),[lamp.id]);
  assert.equal(lampsInRoom(project,bedroom).length,0);
  lamp.x=bedroom.x;lamp.z=bedroom.z;
  assert.equal(lampsInRoom(project,living).length,0);assert.equal(lampsInRoom(project,bedroom).length,1);
  const before=lightFor(lamp);before.brightness=1;assert.equal(lightFor(lamp).brightness,100);
});
