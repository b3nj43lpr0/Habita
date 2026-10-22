import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleProject, validateProject } from '../src/model/model.js';
import { catalog, makeItem } from '../src/model/catalog.js';
import { newPlan, calibratePlan, validPlan, planImageLimit } from '../src/model/plan.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('el plano importado se centra en la casa y respeta la proporción de la imagen', () => {
  const plan = newPlan(png, 2000, 1000, exampleProject());
  assert.deepEqual({ w: plan.w, d: plan.d, opacity: plan.opacity, locked: plan.locked }, { w: 10, d: 5, opacity: .55, locked: false });
  assert.deepEqual([plan.x, plan.z], [-.5, -.5]);
  assert.deepEqual([newPlan(png, 10, 10, { rooms: [] }).x, newPlan(png, 10, 10, { rooms: [] }).z], [0, 0]);
});

test('calibrar con dos puntos escala el plano alrededor del primero', () => {
  const plan = { image: png, x: 0, z: 0, w: 10, d: 8, opacity: .5, locked: false };
  // Se marcaron 2 m en la imagen y en la realidad miden 5 m: todo crece 2,5 veces desde (1, 1).
  const next = calibratePlan(plan, { x: 1, z: 1 }, { x: 3, z: 1 }, 5);
  assert.deepEqual([next.x, next.z, next.w, next.d], [-1.5, -1.5, 25, 20]);
  assert.throws(() => calibratePlan(plan, { x: 1, z: 1 }, { x: 1, z: 1 }, 5), /dos puntos/);
  assert.throws(() => calibratePlan(plan, { x: 0, z: 0 }, { x: 1, z: 0 }, 0), /distancia/);
  assert.throws(() => calibratePlan(plan, { x: 0, z: 0 }, { x: .1, z: 0 }, 150), /rango/);
});

test('el plano viaja en el archivo .habita y se valida al abrirlo', () => {
  const project = exampleProject();
  project.plan = { image: png, x: 1, z: -2, w: 12, d: 9, opacity: .4, locked: true };
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))).plan, project.plan);
  for (const bad of [
    { image: 'data:image/svg+xml;base64,PHN2Zz4=' }, { image: 'https://example.com/plano.png' },
    { image: `${png}"<script>` }, { image: 'data:image/png;base64,' + 'A'.repeat(planImageLimit) },
    { opacity: 2 }, { w: 0 }, { locked: 'si' }, { x: Infinity }
  ]) {
    assert.equal(validPlan({ ...project.plan, ...bad }), false, JSON.stringify(bad).slice(0, 60));
    assert.throws(() => validateProject({ ...project, plan: { ...project.plan, ...bad } }), /Plano/);
  }
});

test('el catálogo amplía cada tipo de espacio con entradas válidas', () => {
  const ids = new Set(catalog.map(a => a.id));
  assert.equal(ids.size, catalog.length);
  assert.ok(catalog.length >= 33 + 20);
  for (const category of ['Living', 'Cocina', 'Baño', 'Dormitorio', 'Estudio', 'Exterior']) {
    assert.ok(catalog.filter(a => a.category === category).length >= 3, category);
  }
  for (const asset of catalog) {
    assert.ok([asset.w, asset.d, asset.h, asset.elevation].every(n => Number.isFinite(n) && n >= 0), asset.id);
    assert.ok(asset.presets.every(p => p.length === 3 && p.every(n => n > 0)), asset.id);
    // Cada entrada nueva produce un objeto que el validador de proyectos acepta.
    const project = exampleProject();
    project.items.push(makeItem(asset.id, 0, 0));
    assert.doesNotThrow(() => validateProject(project), asset.id);
  }
  assert.equal(makeItem('tv-wall').elevation, 1);
  assert.equal(makeItem('ac').elevation, 2);
});
