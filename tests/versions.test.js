import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureVersion, restoreVersion, versionStats } from '../src/versions.js';
import { exampleProject, validateProject } from '../src/model.js';

test('una versión guarda la distribución y se restaura sin tocar escenas ni plano', () => {
  const project = exampleProject();
  project.scenes = [];
  const a = captureVersion(project, ' Opción A ', new Date('2026-10-22T12:00:00Z'));
  assert.equal(a.name, 'Opción A');
  assert.equal(a.created, '2026-10-22T12:00:00.000Z');
  project.items = project.items.slice(0, 5);
  project.versions = [a];
  const saved = validateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(saved.versions[0].items.length, 32);
  const back = restoreVersion(saved, a);
  assert.equal(back.items.length, 32);
  assert.deepEqual(back.versions, saved.versions, 'Las versiones siguen ahí');
  assert.deepEqual(back.scenes, []);
  assert.deepEqual(versionStats(a), { area: 78, rooms: 5, items: 32, budget: 0 });
});

test('una versión dañada no deja abrir el proyecto', () => {
  const project = exampleProject();
  const bad = captureVersion(project, 'Rota');
  bad.items[0].w = -1;
  project.versions = [bad];
  assert.throws(() => validateProject(project), /versión «Rota»/);
  project.versions = [captureVersion(project, 'A'), captureVersion(project, 'B')];
  project.versions[1].id = project.versions[0].id;
  assert.throws(() => validateProject(project), /Versiones/);
});
