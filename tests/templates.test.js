import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templates, templatePreview } from '../src/templates.js';
import { validateProject, warningsFor, overlaps } from '../src/model.js';
import { isOpening } from '../src/catalog.js';
import { inRoom } from '../src/levels.js';

test('cada plantilla es un proyecto válido, sin habitaciones encimadas y con los muebles dentro', () => {
  for (const template of templates) {
    const project = validateProject(template.make());
    assert.ok(templatePreview(project).startsWith('<svg'), template.id);
    for (const a of project.rooms) for (const b of project.rooms) if (a !== b) assert.equal(overlaps({ ...a, rotation: 0 }, { ...b, rotation: 0 }), false, `${template.id}: ${a.name} y ${b.name}`);
    for (const item of project.items) {
      // Las aberturas quedan sobre un muro (giradas hacia él); el resto, dentro de un espacio y sin choques.
      if (isOpening(item)) { assert.equal(item.d, project.wallThickness, `${template.id}: ${item.name} en su muro`); continue; }
      assert.ok(project.rooms.some(r => inRoom(item, r)), `${template.id}: ${item.name} dentro de un espacio`);
      assert.deepEqual(warningsFor(item, project), [], `${template.id}: ${item.name}`);
    }
  }
});

test('cada plantilla crea identificadores nuevos', () => {
  const apartment = templates.find(t => t.id === 'apartment');
  assert.notEqual(apartment.make().items[0].id, apartment.make().items[0].id);
});
