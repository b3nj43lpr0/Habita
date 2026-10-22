import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleProject, validateProject } from '../src/model/model.js';
import { makeItem } from '../src/model/catalog.js';
import { lightFor } from '../src/devices/lighting.js';
import { climateFor } from '../src/devices/climate.js';
import { captureScene, applyScene } from '../src/model/scenes.js';

const withAc = () => {
  const project = exampleProject();
  const ac = makeItem('ac', -2, 3.8);
  project.items.push(ac);
  return { project, ac, lamp: project.items.find(i => i.asset === 'floor-lamp') };
};

test('el aire acondicionado se guarda por objeto y se valida al abrir', () => {
  const { project, ac } = withAc();
  assert.equal(ac.elevation, 2);
  assert.deepEqual(climateFor(ac), { on: false, mode: 'cool', target: 23, fan: 'auto', swing: false });
  ac.climate = { on: true, mode: 'heat', target: 21.5, fan: 'high' };
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))).items.at(-1).climate, ac.climate);
  for (const bad of [{ mode: 'turbo' }, { target: 80 }, { on: 'si' }, { fan: 'max' }]) {
    const { project: p, ac: other } = withAc();
    other.climate = { ...climateFor(other), ...bad };
    assert.throws(() => validateProject(p), /aire acondicionado/);
  }
  const { project: p } = withAc();
  p.items[0].climate = climateFor({});
  assert.throws(() => validateProject(p), /aire acondicionado/);
});

test('una escena guarda luces y aires y los restaura sin tocar lo demás', () => {
  const { project, ac, lamp } = withAc();
  lamp.light = { ...lightFor(lamp), brightness: 20, mode: 'color', color: '#88baff' };
  ac.climate = { on: true, mode: 'cool', target: 22, fan: 'low' };
  const scene = captureScene(project, 'Película');
  project.scenes = [scene];
  assert.doesNotThrow(() => validateProject(JSON.parse(JSON.stringify(project))));

  lamp.light = { ...lightFor(lamp), on: false };
  ac.climate = { ...climateFor(ac), on: false };
  const sofa = project.items.find(i => i.asset === 'sofa'), before = JSON.stringify(sofa);
  const changed = applyScene(project, scene);
  assert.deepEqual(changed.map(i => i.id).sort(), [ac.id, lamp.id].sort());
  assert.equal(lightFor(lamp).brightness, 20);
  assert.equal(climateFor(ac).target, 22);
  assert.equal(JSON.stringify(sofa), before);
  assert.deepEqual(applyScene(project, scene), []);

  // Un objeto eliminado después de guardar la escena simplemente se omite.
  project.items = project.items.filter(i => i.id !== ac.id);
  assert.doesNotThrow(() => applyScene(project, scene));
});

test('se rechazan escenas malformadas', () => {
  const { project } = withAc();
  const many = Array.from({ length: 31 }, (_, i) => ({ id: String(i), name: 'x', lights: {}, climates: {} }));
  for (const scenes of [{}, [{ id: 'a', name: '', lights: {}, climates: {} }], [{ id: 'a', name: 'x', lights: { z: { on: 'no' } }, climates: {} }], many]) {
    project.scenes = scenes;
    assert.throws(() => validateProject(project), /Escenas/);
  }
});

test('una escena anterior a la aleta no cuenta como cambio si la casa ya está así', () => {
  const { project, ac } = withAc();
  ac.climate = { on: true, mode: 'cool', target: 22, fan: 'low', swing: false };
  // Escena guardada por 0.8.0: su aire no tiene «swing».
  const scene = { id: 's', name: 'Vieja', lights: {}, climates: { [ac.id]: { on: true, mode: 'cool', target: 22, fan: 'low' } } };
  assert.deepEqual(applyScene(project, scene), []);
  ac.climate = { ...ac.climate, swing: true };
  assert.deepEqual(applyScene(project, scene), [], 'una escena sin aleta no cambia la aleta');
  ac.climate = { ...ac.climate, target: 25 };
  assert.deepEqual(applyScene(project, scene).map(i => i.id), [ac.id]);
  assert.deepEqual(climateFor(ac), { on: true, mode: 'cool', target: 22, fan: 'low', swing: true });
});
