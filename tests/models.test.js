import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleProject, validateProject } from '../src/model/model.js';
import { makeItem } from '../src/model/catalog.js';
import { isGlb, validModels } from '../src/model/models.js';
import { reportHtml, planSvg } from '../src/model/report.js';

const glb = 'data:model/gltf-binary;base64,Z2xURgIAAAA=';

test('un modelo importado viaja en el proyecto y el objeto debe apuntar a él', () => {
  const p = exampleProject();
  p.models = [{ id: 'm1', name: 'Sofá descargado', data: glb }];
  p.items.push({ ...makeItem('custom', 0, 0), model: 'm1' });
  assert.doesNotThrow(() => validateProject(p));
  assert.throws(() => validateProject({ ...p, models: [] }), /modelo 3D/);
  assert.throws(() => validateProject({ ...p, items: [...p.items, makeItem('custom', 1, 1)] }), /Modelo importado/);
  assert.ok(!validModels([{ id: 'm1', name: 'x', data: 'data:image/png;base64,AAAA' }]));
  assert.ok(isGlb(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, ...new Array(20).fill(0)])));
  assert.ok(!isGlb(new Uint8Array(30)));
});

test('el informe incluye plano, espacios, materiales y escapa los nombres', () => {
  const p = exampleProject();
  p.name = 'Casa <b>nueva</b>';
  p.sun = { on: true, lat: -33.45, north: 20, month: 6, hour: 12 };
  const html = reportHtml(p, { date: new Date(2026, 9, 23) });
  assert.match(html, /Casa &lt;b&gt;nueva&lt;\/b&gt;/);
  assert.ok(!html.includes('<b>nueva</b>'));
  for (const text of ['Plano', 'Espacios', 'Revisión de circulación', 'Materiales estimados', 'Lista de compras', 'Living y comedor', 'class="north"']) assert.ok(html.includes(text), text);
  assert.ok(!/<script/i.test(html));
  assert.equal(planSvg({ ...p, rooms: [], items: [] }, 'base'), '');
});
