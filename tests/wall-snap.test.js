import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapToWalls } from '../src/model/wall-snap.js';
import { makeItem } from '../src/model/catalog.js';
import { warningsFor } from '../src/model/model.js';

// Habitación de 4 x 4 m centrada en el origen; las caras interiores de los muros quedan a ±1,93 m.
const project = (items = []) => ({ version: 1, name: 'p', wallHeight: 2.6, wallThickness: .14, rooms: [{ id: 'r', name: 'r', x: 0, z: 0, w: 4, d: 4, color: '#ffffff' }], items });
const at = (asset, x, z, rotation = 0) => ({ ...makeItem(asset, x, z), rotation });

test('un mueble cerca de la pared queda pegado a la cara interior, sin hueco ni solape', () => {
  const sofa = at('sofa', .3, -1.4); // respaldo a 8 cm de la pared norte
  const s = snapToWalls(sofa, project());
  assert.equal(s.rotation, 0);
  assert.equal(s.z, round(-1.93 + sofa.d / 2));
  assert.equal(s.x, .3);
  assert.equal(s.wall, 'n');
  // Si se arrastra dentro del muro, también vuelve a la cara.
  assert.equal(snapToWalls({ ...sofa, z: -1.6 }, project()).z, round(-1.93 + sofa.d / 2));
});

test('el mueble gira para dar la espalda a la pared a la que se acerca', () => {
  const bed = at('bed', 1.2, 0); // cama de 1,6 x 2 con el respaldo hacia el norte, cerca del muro este
  const s = snapToWalls(bed, project());
  assert.equal(s.rotation, 270);
  assert.equal(s.x, round(1.93 - bed.d / 2));
  assert.equal(s.wall, 'e');
});

test('en una esquina se pega a las dos paredes', () => {
  const wardrobe = at('wardrobe', -.95, -1.5);
  const s = snapToWalls(wardrobe, project());
  assert.equal(s.rotation, 0);
  assert.equal(s.z, round(-1.93 + .3));
  assert.equal(s.x, round(-1.93 + .9));
  assert.deepEqual(warningsFor({ ...wardrobe, ...s }, project()), []);
});

test('lejos de las paredes no cambia nada', () => {
  const table = at('coffee', .2, .3, 45);
  assert.deepEqual(snapToWalls(table, project()), { x: .2, z: .3, rotation: 45, wall: null });
});

test('objetos sin orientación se pegan sin girar', () => {
  const plant = at('plant', 1.6, .5, 0);
  const s = snapToWalls(plant, project());
  assert.equal(s.rotation, 0);
  assert.equal(s.x, round(1.93 - .3));
});

test('un módulo se apoya en el vecino pegado a la misma pared', () => {
  const first = at('kitchen', 0, round(-1.93 + .3));
  const second = at('kitchen', .97, -1.6);
  const s = snapToWalls(second, project([first]));
  assert.equal(s.z, first.z);
  assert.equal(s.x, .9);
  assert.deepEqual(warningsFor({ ...second, ...s }, project([first])), []);
});

test('puertas y ventanas no usan el imán de muebles', () => {
  const door = at('door', 0, -1.9);
  assert.deepEqual(snapToWalls(door, project()), { x: 0, z: -1.9, rotation: 0, wall: null });
});

function round(n) { return Math.round(n * 1000) / 1000; }
