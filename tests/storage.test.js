import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleProject } from '../src/model/model.js';
import { loadSavedProject, backupKey } from '../src/ui/storage.js';

const memory = () => {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
};

test('un autoguardado ilegible se respalda antes de abrir la casa de ejemplo', () => {
  const store = globalThis.localStorage = memory();
  const unreadable = JSON.stringify({ ...exampleProject(), automations: [{ id: 'a', name: '   ', enabled: true, scene: 'x', trigger: { type: 'time', time: '22:00', days: [1] } }] });
  store.setItem('habita-project', unreadable);
  const fallback = exampleProject();
  const loaded = loadSavedProject(fallback);
  assert.equal(loaded.issue, true);
  assert.equal(loaded.project, fallback);
  assert.equal(store.getItem(backupKey), unreadable);
});

test('un autoguardado válido se abre sin respaldo', () => {
  const store = globalThis.localStorage = memory();
  store.setItem('habita-project', JSON.stringify(exampleProject()));
  const loaded = loadSavedProject(null);
  assert.equal(loaded.issue, false);
  assert.equal(loaded.project.name, exampleProject().name);
  assert.equal(store.getItem(backupKey), null);
});
