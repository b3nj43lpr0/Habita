import { test } from 'node:test';
import assert from 'node:assert/strict';
import mapping from '../desktop/ha-mapping.cjs';
import lab from '../tools/lab/fake-home-assistant.cjs';
import { exampleProject, validateProject, warningsFor, wallsFor } from '../src/model/model.js';
import { makeItem } from '../src/model/catalog.js';
import { levelsOf, levelOf, levelElevation, onLevel, inRoom, validLevels } from '../src/model/levels.js';
import { stairTransition, canWalkAt } from '../src/scene3d/walkthrough.js';
import { applyRoomEdit } from '../src/model/room-edit.js';
import { lampsInRoom } from '../src/devices/lighting.js';
import { coverFor } from '../src/devices/cover.js';
import { captureScene, applyScene, validScenes } from '../src/model/scenes.js';

const { relevant, fromEntity, toCoverCalls } = mapping;

// Casa de ejemplo con un segundo piso que repite las habitaciones del primero.
function twoFloors() {
  const project = exampleProject();
  project.levels = [{ id: 'base', name: 'Primer piso' }, { id: 'up', name: 'Segundo piso' }];
  project.rooms.push(...project.rooms.map(r => ({ ...r, id: `${r.id}-up`, level: 'up' })));
  return project;
}

test('los pisos se validan y los proyectos sin pisos siguen siendo de un piso', () => {
  const single = exampleProject();
  assert.deepEqual(levelsOf(single).map(l => l.id), ['base']);
  assert.equal(levelOf(single.rooms[0]), 'base');
  const project = twoFloors();
  assert.doesNotThrow(() => validateProject(project));
  assert.equal(levelElevation(project, 'up'), project.wallHeight + .2);
  assert.equal(onLevel(project, 'up').rooms.length, 5);
  for (const bad of [[], [{ id: 'up', name: 'Sin base' }], [{ id: 'base', name: 'A' }, { id: 'base', name: 'B' }], [{ id: 'base', name: '' }]]) assert.equal(validLevels(bad), false);
  project.items.push({ ...makeItem('sofa', 0, 0), level: 'sotano' });
  assert.throws(() => validateProject(project), /piso que no existe/);
});

test('paredes, alertas y habitaciones se calculan piso por piso', () => {
  const project = twoFloors();
  // Las paredes del segundo piso coinciden con las del primero, pero cada piso tiene las suyas.
  assert.equal(wallsFor(onLevel(project, 'up')).length, wallsFor(onLevel(project, 'base')).length);
  const sofa = project.items.find(i => i.asset === 'sofa');
  const upstairs = { ...makeItem('sofa', sofa.x, sofa.z), level: 'up' };
  project.items.push(upstairs);
  // El sofá de arriba no choca con el de abajo aunque ocupen el mismo lugar en planta.
  assert.deepEqual(warningsFor(upstairs, project), []);
  const lamp = project.items.find(i => i.asset === 'floor-lamp');
  const living = project.rooms.find(r => r.id === 'living'), livingUp = project.rooms.find(r => r.id === 'living-up');
  assert.ok(inRoom(lamp, living) && !inRoom(lamp, livingUp));
  assert.deepEqual(lampsInRoom(project, livingUp), []);
  // Mover una habitación de arriba no arrastra muebles ni aberturas del primer piso.
  const moved = applyRoomEdit(project, 'living-up', { ...livingUp, x: livingUp.x - .5 }, true);
  assert.equal(moved.items.find(i => i.id === sofa.id).x, sofa.x);
  assert.equal(moved.items.find(i => i.id === upstairs.id).x, upstairs.x - .5);
});

test('una escalera lleva al piso de arriba y su hueco devuelve al de abajo', () => {
  const project = twoFloors();
  // Escalera en el living, subiendo hacia -z: del frente (z mayor) al fondo.
  const stairs = { ...makeItem('stairs', -.6, 2), w: .9, d: 2 };
  project.items = project.items.filter(i => Math.hypot(i.x - stairs.x, i.z - stairs.z) > 1.6);
  project.items.push(stairs);
  assert.ok(canWalkAt(onLevel(project, 'base'), -.6, 3.6, .2));
  assert.equal(stairTransition(project, 'base', -.6, 3.6), null);
  const up = stairTransition(project, 'base', -.6, 2);
  assert.deepEqual({ ...up, z: Math.round(up.z * 100) / 100 }, { level: 'up', x: -.6, z: .55 });
  const down = stairTransition(project, 'up', -.6, 2);
  assert.deepEqual({ ...down, z: Math.round(down.z * 100) / 100 }, { level: 'base', x: -.6, z: 3.45 });
  // Sin piso de arriba no hay a dónde subir.
  assert.equal(stairTransition({ ...project, levels: undefined, rooms: onLevel(project, 'base').rooms }, 'base', -.6, 2), null);
});

test('solo se cargan los sensores de temperatura, humedad y aperturas', () => {
  const sensor = (id, device_class, state = '21.5', unit = '°C') => ({ entity_id: id, state, attributes: { device_class, unit_of_measurement: unit, friendly_name: id } });
  assert.ok(relevant(sensor('sensor.living', 'temperature')));
  assert.ok(relevant(sensor('sensor.humedad', 'humidity')));
  assert.equal(relevant(sensor('sensor.energia', 'energy')), false);
  assert.ok(relevant({ entity_id: 'binary_sensor.puerta', state: 'on', attributes: { device_class: 'door' } }));
  assert.equal(relevant({ entity_id: 'binary_sensor.movimiento', state: 'on', attributes: { device_class: 'motion' } }), false);
  assert.deepEqual(fromEntity(sensor('sensor.living', 'temperature')).sensor, { measure: 'temperature', value: 21.5, unit: '°C' });
  assert.equal(fromEntity(sensor('sensor.living', 'temperature', 'unknown')).available, false);
  assert.deepEqual(fromEntity({ entity_id: 'binary_sensor.puerta', state: 'on', attributes: { device_class: 'door' } }).contact, { open: true });
});

test('las cortinas usan la posición si el motor la admite y si no, abrir o cerrar', () => {
  const cover = (state, attributes) => ({ entity_id: 'cover.living', state, attributes: { friendly_name: 'Cortina', ...attributes } });
  const smart = cover('open', { supported_features: 15, current_position: 100 });
  assert.deepEqual(fromEntity(smart).cover, { position: 100 });
  assert.deepEqual(fromEntity(smart).supports, { open: true, close: true, position: true });
  assert.deepEqual(toCoverCalls({ position: 40 }, smart), [{ service: 'set_cover_position', data: { position: 40 } }]);
  assert.deepEqual(toCoverCalls({ position: 100 }, smart), []);
  const simple = cover('closed', { supported_features: 3 });
  assert.deepEqual(fromEntity(simple).cover, { position: 0 });
  assert.deepEqual(toCoverCalls({ position: 70 }, simple), [{ service: 'open_cover', data: {} }]);
  assert.deepEqual(toCoverCalls({ position: 20 }, simple), []);
  const entity = cover('open', { supported_features: 15, current_position: 100 });
  lab.applyService(entity, 'cover', 'set_cover_position', { position: 30 });
  assert.equal(entity.attributes.current_position, 30);
  assert.throws(() => lab.applyService(cover('open', { supported_features: 3 }), 'cover', 'set_cover_position', { position: 30 }), /no soportado/);
});

test('las cortinas se guardan, se validan y entran en las escenas', () => {
  const project = exampleProject();
  const curtain = makeItem('curtain', -2.5, 3.9);
  project.items.push(curtain);
  assert.deepEqual(coverFor(curtain), { position: 100 });
  curtain.cover = { position: 30 };
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))).items.at(-1).cover, { position: 30 });
  const scene = captureScene(project, 'Noche');
  curtain.cover = { position: 100 };
  assert.deepEqual(applyScene(project, scene).map(i => i.id), [curtain.id]);
  assert.equal(curtain.cover.position, 30);
  assert.equal(validScenes([{ ...scene, covers: { [curtain.id]: { position: 150 } } }]), false);
  curtain.cover = { position: -1 };
  assert.throws(() => validateProject(project), /cortina/);
});
