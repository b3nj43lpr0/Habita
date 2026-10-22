import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSnapshot, planTools } from '../src/devices/ai-plan.js';
import { exampleProject, validateProject } from '../src/model/model.js';

test('la IA ve el plano con el catálogo y edita espacios y muebles', () => {
  const project = exampleProject();
  const plan = planSnapshot(project);
  assert.equal(plan.rooms.length, 5);
  assert.ok(plan.catalog.some(a => a.asset === 'sofa'));
  assert.equal(plan.items.find(i => i.asset === 'bed').room, 'Dormitorio');

  const terrace = planTools.add_room(project, { name: 'Terraza', x: 7, z: 0, w: 4, d: 3 });
  assert.match(terrace.message, /Terraza/);
  assert.throws(() => planTools.add_room(project, { name: 'Choque', x: -2, z: 1.5, w: 2, d: 2 }), /Se superpone con «Living y comedor»/);
  const chair = planTools.add_item(project, { asset: 'outdoor-chair', room: 'terraza' });
  assert.deepEqual([project.items.at(-1).x, project.items.at(-1).z], [7, 0]);
  planTools.update_item(project, { id: chair.id, x: 6.5, rotation: 90, color: '#AA3300' });
  assert.equal(project.items.at(-1).color, '#aa3300');
  planTools.update_room(project, { id: terrace.id, w: 5, x: 7.5 });
  assert.throws(() => planTools.add_item(project, { asset: 'nave', x: 0, z: 0 }), /catalog/);
  // Una ventana se pega al muro más cercano, como al ponerla desde la biblioteca; sin muros, falla.
  const window = planTools.add_item(project, { asset: 'window', x: 60, z: 60 });
  assert.equal(project.items.find(i => i.id === window.id).d, project.wallThickness);
  planTools.remove_item(project, { id: window.id });
  assert.throws(() => planTools.add_item({ ...exampleProject(), rooms: [], items: [] }, { asset: 'window', x: 0, z: 0 }), /muro/);
  planTools.remove_item(project, { id: chair.id });
  planTools.remove_room(project, { id: terrace.id });
  assert.throws(() => planTools.update_item(project, { id: 'x' }), /get_plan/);
  validateProject(project);
});
