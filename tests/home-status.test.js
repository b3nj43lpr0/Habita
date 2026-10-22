import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeStatus } from '../src/home-status.js';
import { makeItem } from '../src/catalog.js';

test('el resumen de la bandeja cuenta luces encendidas y la temperatura del aire', () => {
  const lamp = makeItem('lamp'), floor = makeItem('floor-lamp'), ac = makeItem('ac');
  lamp.light = { on: true, brightness: 60, warmth: 70, mode: 'temperature', color: '#ffffff' };
  floor.light = { on: false, brightness: 60, warmth: 70, mode: 'temperature', color: '#ffffff' };
  ac.climate = { on: true, mode: 'cool', target: 23.5, fan: 'auto' };
  assert.deepEqual(homeStatus({ items: [lamp, floor, ac] }), { lit: 1, lamps: 2, climates: 1, text: '1 de 2 luces encendidas · Aire 23,5°' });
  floor.light.on = lamp.light.on = false;
  ac.climate.on = false;
  assert.equal(homeStatus({ items: [lamp, floor, ac] }).text, 'Luces apagadas');
  assert.equal(homeStatus({ items: [] }).text, 'Sin equipos en la maqueta');
});
