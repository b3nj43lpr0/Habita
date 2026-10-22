import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleProject } from '../src/model/model.js';
import { makeItem } from '../src/model/catalog.js';
import { lightFor } from '../src/devices/lighting.js';
import { climateFor } from '../src/devices/climate.js';
import { captureScene } from '../src/model/scenes.js';
import { homeSnapshot, applyLights, applyClimates, findScene } from '../src/devices/ai-home.js';

const home = () => {
  const project = exampleProject();
  const bedLamp = makeItem('lamp', -3.7, -4.1);
  const ac = makeItem('ac', -2, 3.8);
  project.items.push(bedLamp, ac);
  return { project, bedLamp, ac, livingLamp: project.items.find(i => i.asset === 'floor-lamp') };
};

test('la IA ve objetos y habitaciones del plano, nunca dispositivos reales', () => {
  const { project, livingLamp, ac } = home();
  const describe = id => id === livingLamp.id ? { entity: 'light.living_pie', available: true, label: 'Lámpara · encendida' } : null;
  const snapshot = homeSnapshot(project, describe);
  assert.equal(snapshot.rooms.length, 5);
  assert.deepEqual(snapshot.lights.map(l => l.room), ['Living y comedor', 'Dormitorio']);
  assert.equal(snapshot.airConditioners[0].id, ac.id);
  assert.deepEqual(snapshot.lights[0].device, { linked: true, available: true, status: 'Lámpara · encendida' });
  assert.deepEqual(snapshot.lights[1].device, { linked: false });
  assert.ok(!JSON.stringify(snapshot).includes('light.living_pie'), 'El id de Home Assistant no llega a la IA');
});

test('cambia luces por habitación sin tocar las demás y enciende al pedir brillo', () => {
  const { project, bedLamp, livingLamp } = home();
  bedLamp.light = { ...lightFor(bedLamp), on: false };
  const changed = applyLights(project, { room: 'dormitorio', brightness: 30 });
  assert.deepEqual(changed.map(i => i.id), [bedLamp.id]);
  assert.equal(bedLamp.light.on, true);
  assert.equal(bedLamp.light.brightness, 30);
  assert.equal(lightFor(livingLamp).brightness, 100);
  assert.equal(applyLights(project, { ids: [bedLamp.id], color: '#FF8800' })[0].light.mode, 'color');
  assert.equal(bedLamp.light.color, '#ff8800');
  assert.deepEqual(applyLights(project, { ids: [bedLamp.id], color: '#ff8800' }), [], 'Sin cambios no hay nada que enviar');
  assert.equal(applyLights(project, { on: false }).length, 2, 'Sin filtros se aplica a toda la casa');
});

test('rechaza órdenes inválidas con mensajes claros', () => {
  const { project, ac } = home();
  assert.throws(() => applyLights(project, { brightness: 140 }), /entre 0 y 100/);
  assert.throws(() => applyLights(project, { color: 'rojo' }), /#rrggbb/);
  assert.throws(() => applyLights(project, { room: 'Garaje', on: true }), /No hay una habitación «Garaje»/);
  assert.throws(() => applyLights(project, { ids: ['otro'], on: true }), /No existen en la casa: otro/);
  assert.throws(() => applyLights(project, { ids: [ac.id], on: true }), /No existen/, 'Un aire no es una luz');
  assert.throws(() => applyLights(project, {}), /Indica qué cambiar/);
  assert.throws(() => applyLights(project, { room: 'Baño', on: true }), /Ningún objeto/);
  assert.throws(() => applyClimates(project, { mode: 'turbo' }), /mode/);
  assert.throws(() => applyClimates(project, { target: 40 }), /entre 16 y 30/);
});

test('cambia aires acondicionados redondeando la temperatura a medio grado', () => {
  const { project, ac } = home();
  const changed = applyClimates(project, { room: 'living', on: true, mode: 'heat', target: 21.3, fan: 'low' });
  assert.deepEqual(changed, [ac]);
  assert.deepEqual(climateFor(ac), { on: true, mode: 'heat', target: 21.5, fan: 'low', swing: false });
});

test('encuentra escenas por id o por nombre sin importar tildes ni mayúsculas', () => {
  const { project } = home();
  assert.throws(() => findScene(project, 'Cine'), /no tiene escenas/);
  const scene = captureScene(project, 'Película');
  project.scenes = [scene];
  assert.equal(findScene(project, 'pelicula'), scene);
  assert.equal(findScene(project, scene.id), scene);
  assert.throws(() => findScene(project, 'Noche'), /Escenas: Película/);
});
