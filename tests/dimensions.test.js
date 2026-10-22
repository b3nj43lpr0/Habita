import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDimensions, dimLabel } from '../src/ui/dimensions.js';
import { makeItem } from '../src/model/catalog.js';

const view = items => ({ rooms: [{ id: 'a', x: 0, z: 0, w: 6, d: 4 }, { id: 'b', x: 4.5, z: 0, w: 3, d: 4 }], items });

test('las cotas exteriores encadenan los tramos entre muros y suman el total', () => {
  const dims = planDimensions(view([]), .14, null);
  assert.deepEqual(dims.filter(d => d.kind === 'chain').map(d => d.text), ['6 m', '3 m']);
  assert.deepEqual(dims.filter(d => d.kind === 'total').map(d => d.text), ['9 m', '4 m']);
  assert.equal(dimLabel(1.234), '1,23 m');
});

test('el objeto elegido muestra sus medidas y la distancia libre a cada muro', () => {
  const bed = { ...makeItem('bed', -1, 0), w: 1.6, d: 2 };
  const dims = planDimensions(view([bed]), .2, bed);
  assert.deepEqual(dims.filter(d => d.kind === 'focus').map(d => d.text), ['1,6 m', '2 m']);
  // Habitación de -3 a 3 en x y de -2 a 2 en z, muros de 20 cm: caras interiores a ±2,9 y ±1,9.
  assert.deepEqual(dims.filter(d => d.kind === 'clearance').map(d => d.text), ['1,1 m', '3,1 m', '0,9 m', '0,9 m']);
  // Girada 90°, ancho y fondo se intercambian en planta.
  assert.deepEqual(planDimensions(view([bed]), .2, { ...bed, rotation: 90 }).filter(d => d.kind === 'focus').map(d => d.text), ['2 m', '1,6 m']);
  // Contra el muro no hay distancia que mostrar; una ventana no muestra distancias.
  assert.equal(planDimensions(view([]), .2, { ...bed, z: 0.9 }).filter(d => d.kind === 'clearance').length, 3);
  assert.equal(planDimensions(view([]), .2, makeItem('window', 0, 2)).filter(d => d.kind === 'clearance').length, 0);
});
