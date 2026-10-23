import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeItem } from '../src/model/catalog.js';
import { alignOpening, validateProject, wallsFor, warningsFor, exampleProject } from '../src/model/model.js';
import { doorSwing, circulationIssues, polygonsOverlap } from '../src/model/circulation.js';
import { materialEstimate, materialRows } from '../src/model/materials.js';
import { sunPosition, sunDirection, daylight } from '../src/model/sun.js';
import { shoppingList } from '../src/model/shopping.js';

const room = (id, x, z, w, d, extra = {}) => ({ id, name: id, x, z, w, d, color: '#c5ad8e', ...extra });
const house = (rooms, items = []) => ({ version: 1, name: 'Casa', wallHeight: 2.5, wallThickness: .1, rooms, items });

test('el arco de una puerta barre su ancho y cambia de lado con el sentido', () => {
  const door = { ...makeItem('door', 0, -2), w: .8, d: .1, rotation: 0 };
  const a = doorSwing(door), b = doorSwing({ ...door, swing: 2 });
  assert.equal(Math.round(Math.hypot(a.leaf[0] - a.hinge[0], a.leaf[1] - a.hinge[1]) * 100) / 100, .8);
  assert.ok(a.leaf[1] > -2 && b.leaf[1] < -2, 'abre hacia lados opuestos del muro');
  assert.notEqual(doorSwing({ ...door, swing: 1 }).hinge[0], a.hinge[0]);
});

test('una puerta que choca con un mueble al abrirse lo avisa', () => {
  const p = house([room('a', 0, 0, 4, 4)]);
  const door = makeItem('door', 0, -2); alignOpening(door, p); p.items.push(door);
  const side = doorSwing(door).leaf[1] > -2 ? 1 : -1;
  const cabinet = { ...makeItem('dresser', door.x, -2 + side * .5), rotation: 0 };
  p.items.push(cabinet);
  assert.match(warningsFor(door, p).join(' '), /choca con Cómoda/);
  assert.equal(circulationIssues(p).filter(i => i.kind === 'door').length, 1);
  assert.ok(polygonsOverlap([[0, 0], [1, 0], [0, 1]], [[.2, .2], [2, .2], [2, 2]]));
  assert.ok(!polygonsOverlap([[0, 0], [1, 0], [0, 1]], [[1, 1], [2, 1], [2, 2]]));
});

test('detecta pasos angostos entre muebles grandes y contra la pared', () => {
  const p = house([room('a', 0, 0, 5, 5)]);
  p.items.push({ ...makeItem('bed', -1, 0), rotation: 0 }, { ...makeItem('wardrobe', .5, 0), rotation: 90 });
  const issues = circulationIssues(p).filter(i => i.kind === 'passage');
  assert.ok(issues.some(i => i.items.length === 2), 'cama y clóset a menos de 60 cm');
  p.items[1].x = 2.1;
  assert.ok(!circulationIssues(p).some(i => i.items.length === 2));
});

test('dos habitaciones unidas forman un espacio en L sin muro entre ellas', () => {
  const rooms = [room('a', 0, 0, 4, 4), room('b', 3, -1, 2, 2)];
  const shared = p => wallsFor(p).filter(w => w.axis === 'z' && w.c === 2 && w.a >= -2 && w.b <= 0);
  assert.equal(shared(house(rooms)).length, 1);
  const joined = house(rooms.map(r => ({ ...r, join: 'l' })));
  assert.equal(shared(joined).length, 0);
  assert.doesNotThrow(() => validateProject(joined));
  assert.throws(() => validateProject(house([{ ...rooms[0], join: '<b>' }])));
});

test('la calculadora descuenta aberturas, suma margen y entra a la lista de compras', () => {
  const p = house([room('a', 0, 0, 4, 3)]);
  const door = makeItem('door', 0, -1.5); alignOpening(door, p); p.items.push(door);
  const { rows, totals } = materialEstimate(p);
  assert.equal(rows[0].floor, 12);
  assert.equal(rows[0].floorBuy, 13.2);
  assert.equal(rows[0].walls, Math.round((14 * 2.5 - door.w * door.h) * 100) / 100);
  assert.equal(rows[0].skirting, Math.round((14 - door.w) * 100) / 100);
  assert.equal(totals.paint, Math.round(rows[0].walls * 2 / 10 * 100) / 100);
  assert.equal(materialRows(p).length, 0);
  p.materials = { floorPrice: 10000, paintPrice: 5000 };
  assert.doesNotThrow(() => validateProject(p));
  const list = shoppingList(p);
  assert.equal(list.rows.filter(r => r.material).length, 2);
  assert.equal(list.total, 132000 + Math.ceil(totals.paint) * 5000);
  assert.throws(() => validateProject({ ...p, materials: { coats: 9 } }));
});

test('el sol de Santiago: alto al mediodía de verano, bajo en invierno y al norte', () => {
  const summer = sunPosition({ lat: -33.45, month: 12, hour: 12 }), winter = sunPosition({ lat: -33.45, month: 6, hour: 12 });
  assert.ok(summer.altitude > 75 && winter.altitude < 35 && winter.altitude > 30);
  assert.ok(Math.abs(winter.azimuth) < 1 || Math.abs(winter.azimuth - 360) < 1, 'en el hemisferio sur el sol de invierno está al norte');
  assert.ok(sunPosition({ lat: -33.45, month: 6, hour: 9 }).azimuth < 90, 'en la mañana viene del noreste');
  const dir = sunDirection({ lat: -33.45, month: 6, hour: 12, north: 0 });
  assert.ok(dir.z < -.8, 'con el norte hacia arriba del plano, el sol entra por arriba (−z)');
  const day = daylight({ lat: -33.45, month: 6, north: 0 });
  assert.ok(day.rise > 6.5 && day.set < 17.5);
  assert.doesNotThrow(() => validateProject({ ...exampleProject(), sun: { on: true, lat: -33.45, north: 30, month: 6, hour: 10 } }));
  assert.throws(() => validateProject({ ...exampleProject(), sun: { on: true, lat: 100, north: 0, month: 6, hour: 10 } }));
});
