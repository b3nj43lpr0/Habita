import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validNotes, makeNote } from '../src/notes.js';
import { exampleProject, validateProject } from '../src/model.js';

test('las notas del plano se guardan y se validan', () => {
  const project = exampleProject();
  project.notes = [makeNote('  Enchufe aquí  ', 1, 2)];
  assert.equal(validateProject(JSON.parse(JSON.stringify(project))).notes[0].text, 'Enchufe aquí');
  assert.equal(validNotes([{ ...project.notes[0], text: ' ' }]), false);
  assert.equal(validNotes([{ ...project.notes[0], color: '#000000' }]), false);
  assert.equal(validNotes([project.notes[0], project.notes[0]]), false);
  // Una nota en un piso que no existe invalida el proyecto.
  project.notes[0].level = 'otro';
  assert.throws(() => validateProject(project), /Notas/);
  assert.equal(validNotes(undefined), true);
});
