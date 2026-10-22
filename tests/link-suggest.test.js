import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestLinks } from '../src/link-suggest.js';
import { exampleProject } from '../src/model.js';
import { isLamp } from '../src/lighting.js';
import { isClimate } from '../src/climate.js';
import { isTv } from '../src/tv.js';

const kindFor = item => isLamp(item) ? 'light' : isClimate(item) ? 'climate' : isTv(item) ? 'tv' : null;

test('propone vínculos por área y nombre, sin repetir dispositivos', () => {
  const project = exampleProject();
  const ac = { id: 'ac', asset: 'ac', name: 'Aire acondicionado', x: -2, z: -3, w: .9, d: .24, h: .3, rotation: 0, color: '#ffffff', elevation: 2 };
  const lamp2 = { ...project.items.find(i => i.asset === 'floor-lamp'), id: 'lamp2', name: 'Velador lectura', x: -2, z: -3 };
  project.items.push(ac, lamp2);
  const devices = [
    { entityId: 'light.living_pie', name: 'Living · lámpara de pie', kind: 'light', area: 'Living' },
    { entityId: 'light.dormitorio', name: 'Velador', kind: 'light', area: 'Dormitorio' },
    { entityId: 'light.cocina', name: 'Cocina · techo', kind: 'light', area: 'Cocina' },
    { entityId: 'climate.dormitorio', name: 'Split', kind: 'climate', area: 'Dormitorio' },
    { entityId: 'media_player.tv', name: 'Living · televisor', kind: 'tv', area: null }
  ];
  const lamp = project.items.find(i => i.asset === 'floor-lamp' && i.id !== 'lamp2');
  const tv = project.items.find(i => i.asset === 'tv');
  const links = suggestLinks(project, devices, kindFor);
  assert.equal(links[lamp.id], 'light.living_pie', 'Área y nombre');
  assert.equal(links.lamp2, 'light.dormitorio', 'Misma área y «velador»');
  assert.equal(links.ac, 'climate.dormitorio', 'Misma área');
  assert.equal(links[tv.id], undefined, 'Una sola palabra en común no alcanza');
  // Lo ya vinculado se respeta y su dispositivo no se vuelve a proponer.
  const again = suggestLinks(project, devices, kindFor, { [lamp.id]: 'light.dormitorio' });
  assert.equal(again[lamp.id], undefined);
  assert.notEqual(again.lamp2, 'light.dormitorio');
});
