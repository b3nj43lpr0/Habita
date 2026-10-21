import { test } from 'node:test';
import assert from 'node:assert/strict';
import mapping from '../desktop/ha-mapping.cjs';
import lab from '../tools/lab/fake-home-assistant.cjs';
import { exampleProject, validateProject } from '../src/model.js';
import { makeItem } from '../src/catalog.js';
import { vacuumFor } from '../src/vacuum.js';
import { captureScene, applyScene, validScenes } from '../src/scenes.js';

const { relevant, fromEntity, toVacuumCalls, validVacuumState } = mapping;
const robot = (state, attributes = {}) => ({ entity_id: 'vacuum.robot', state, attributes: { friendly_name: 'Robot', supported_features: 12380, battery_level: 64, ...attributes } });

test('las aspiradoras de Home Assistant informan estado, batería y órdenes admitidas', () => {
  assert.equal(relevant(robot('docked')), true);
  const live = fromEntity(robot('cleaning'));
  assert.equal(live.kind, 'vacuum');
  assert.deepEqual(live.vacuum, { status: 'cleaning' });
  assert.equal(live.battery, 64);
  assert.deepEqual(live.supports, { start: true, pause: true, stop: true, dock: true, battery: true });
  // Un error no cambia la maqueta, pero se informa.
  const failed = fromEntity(robot('error'));
  assert.deepEqual(failed.vacuum, {});
  assert.equal(failed.error, true);
  assert.equal(fromEntity(robot('docked', { battery_level: undefined })).battery, null);
});

test('las órdenes de la aspiradora solo se envían si cambian algo', () => {
  assert.deepEqual(toVacuumCalls({ status: 'cleaning' }, robot('docked')), [{ service: 'start', data: {} }]);
  assert.deepEqual(toVacuumCalls({ status: 'cleaning' }, robot('cleaning')), []);
  assert.deepEqual(toVacuumCalls({ status: 'paused' }, robot('cleaning')), [{ service: 'pause', data: {} }]);
  assert.deepEqual(toVacuumCalls({ status: 'paused' }, robot('docked')), []);
  assert.deepEqual(toVacuumCalls({ status: 'docked' }, robot('paused')), [{ service: 'return_to_base', data: {} }]);
  assert.deepEqual(toVacuumCalls({ status: 'docked' }, robot('returning')), []);
  assert.deepEqual(toVacuumCalls({ status: 'returning' }, robot('docked')), []);
  assert.throws(() => toVacuumCalls({ status: 'cleaning' }, robot('docked', { supported_features: 16 })), /no admite/);
  assert.equal(validVacuumState({ status: 'cleaning' }), true);
  assert.equal(validVacuumState({ status: 'error' }), false);
});

test('el laboratorio simula la aspiradora', () => {
  const entity = robot('docked');
  lab.applyService(entity, 'vacuum', 'start', {});
  assert.equal(entity.state, 'cleaning');
  lab.applyService(entity, 'vacuum', 'pause', {});
  assert.equal(entity.state, 'paused');
  lab.applyService(entity, 'vacuum', 'return_to_base', {});
  assert.equal(entity.state, 'returning');
  assert.throws(() => lab.applyService(robot('docked', { supported_features: 16 }), 'vacuum', 'start', {}), /no soportado/);
});

test('las aspiradoras se guardan, se validan y entran en las escenas', () => {
  const project = exampleProject();
  const vacuum = makeItem('vacuum', -2, 2);
  project.items.push(vacuum);
  assert.deepEqual(vacuumFor(vacuum), { status: 'docked' });
  vacuum.vacuum = { status: 'cleaning' };
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))).items.at(-1).vacuum, { status: 'cleaning' });
  const scene = captureScene(project, 'Limpieza');
  vacuum.vacuum = { status: 'docked' };
  assert.deepEqual(applyScene(project, scene).map(i => i.id), [vacuum.id]);
  assert.equal(vacuum.vacuum.status, 'cleaning');
  // Una escena «a la base» no vuelve a ordenar nada a un robot que ya va de regreso.
  const home = captureScene(project, 'Base');
  home.vacuums[vacuum.id] = { status: 'docked' };
  vacuum.vacuum = { status: 'returning' };
  assert.deepEqual(applyScene(project, home), []);
  assert.equal(validScenes([{ ...scene, vacuums: { [vacuum.id]: { status: 'volando' } } }]), false);
  // Proyectos y escenas anteriores a 0.9.0 siguen siendo válidos.
  assert.equal(validScenes([{ id: 'a', name: 'Vieja', lights: {}, climates: {} }]), true);
  vacuum.vacuum = { status: 'volando' };
  assert.throws(() => validateProject(project), /aspiradora/);
  const lamp = project.items.find(i => i.asset !== 'vacuum');
  lamp.vacuum = { status: 'docked' };
  delete vacuum.vacuum;
  assert.throws(() => validateProject(project), /aspiradora/);
});
