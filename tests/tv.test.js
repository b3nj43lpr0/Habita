import { test } from 'node:test';
import assert from 'node:assert/strict';
import mapping from '../desktop/ha-mapping.cjs';
import lab from '../tools/lab/fake-home-assistant.cjs';
import { exampleProject, validateProject } from '../src/model/model.js';
import { makeItem } from '../src/model/catalog.js';
import { isTv, tvFor } from '../src/devices/tv.js';
import { captureScene, applyScene, validScenes } from '../src/model/scenes.js';

const { fromEntity, toTvCalls, entityPattern } = mapping;
const tv = (state = 'on', attributes = {}) => ({
  entity_id: 'media_player.living_tv', state,
  attributes: { friendly_name: 'Living · televisor', supported_features: 3468, volume_level: .2, is_volume_muted: false, source: 'HDMI 1', source_list: ['HDMI 1', 'Netflix'], ...attributes }
});

test('un media_player se traduce al televisor de la maqueta con lo que admite', () => {
  assert.ok(entityPattern.test('media_player.living_tv'));
  const live = fromEntity(tv());
  assert.equal(live.kind, 'tv');
  assert.deepEqual(live.tv, { on: true, volume: 20, muted: false, source: 'HDMI 1' });
  assert.deepEqual(live.supports, { power: true, volume: true, mute: true, sources: ['HDMI 1', 'Netflix'] });
  assert.equal(fromEntity(tv('standby')).tv.on, false);
  // Sin select_source (2048) no se ofrecen entradas aunque haya lista; sin volume_set no hay volumen.
  assert.deepEqual(fromEntity(tv('on', { supported_features: 128 | 256 })).supports, { power: true, volume: false, mute: false, sources: [] });
});

test('el televisor solo recibe las llamadas que cambian algo y que admite', () => {
  const want = { on: true, volume: 20, muted: false, source: 'HDMI 1' };
  assert.deepEqual(toTvCalls(want, tv()), []);
  assert.deepEqual(toTvCalls({ ...want, on: false }, tv()), [{ service: 'turn_off', data: {} }]);
  assert.deepEqual(toTvCalls({ ...want, on: false }, tv('off')), []);
  assert.deepEqual(toTvCalls({ ...want, volume: 45, muted: true, source: 'Netflix' }, tv('off')), [
    { service: 'turn_on', data: {} },
    { service: 'volume_set', data: { volume_level: .45 } },
    { service: 'volume_mute', data: { is_volume_muted: true } },
    { service: 'select_source', data: { source: 'Netflix' } }
  ]);
  // Entradas desconocidas y funciones no admitidas no se envían.
  assert.deepEqual(toTvCalls({ ...want, volume: 80, source: 'Otra' }, tv('on', { supported_features: 128 | 256 })), []);
});

test('el laboratorio aplica los servicios de media_player y rechaza los no admitidos', () => {
  const entity = tv('off');
  lab.applyService(entity, 'media_player', 'turn_on', {});
  lab.applyService(entity, 'media_player', 'volume_set', { volume_level: .6 });
  lab.applyService(entity, 'media_player', 'select_source', { source: 'Netflix' });
  assert.deepEqual([entity.state, entity.attributes.volume_level, entity.attributes.source], ['on', .6, 'Netflix']);
  assert.throws(() => lab.applyService(entity, 'media_player', 'select_source', { source: 'VHS' }), /Entrada/);
  assert.throws(() => lab.applyService(tv('on', { supported_features: 0 }), 'media_player', 'turn_off', {}), /no soportado/);
});

test('el televisor se guarda por objeto, se valida y entra en las escenas', () => {
  const project = exampleProject();
  const item = project.items.find(isTv);
  assert.ok(item);
  assert.deepEqual(tvFor(item), { on: false, volume: 25, muted: false, source: '' });
  item.tv = { on: true, volume: 30, muted: false, source: 'Netflix' };
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))).items.find(isTv).tv, item.tv);
  const scene = captureScene(project, 'Cine');
  assert.deepEqual(scene.tvs[item.id], item.tv);
  item.tv = { ...item.tv, on: false };
  assert.deepEqual(applyScene(project, scene).map(i => i.id), [item.id]);
  assert.equal(item.tv.on, true);
  // Escenas guardadas antes de los televisores siguen siendo válidas.
  const { tvs, ...old } = scene;
  assert.ok(validScenes([old]));
  assert.equal(validScenes([{ ...scene, tvs: { [item.id]: { on: 'si' } } }]), false);
  for (const bad of [{ volume: 120 }, { muted: 1 }, { source: 'x'.repeat(81) }]) {
    const p = exampleProject();
    p.items.find(isTv).tv = { ...tvFor({}), ...bad };
    assert.throws(() => validateProject(p), /televisor/);
  }
  const p = exampleProject();
  p.items[0].tv = tvFor({});
  assert.throws(() => validateProject(p), /televisor/);
  assert.ok(isTv(makeItem('tv-wall')));
});
