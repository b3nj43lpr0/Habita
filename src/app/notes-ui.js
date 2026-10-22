import * as THREE from 'three';
import { $, esc, modal, toast } from './dom.js';
import { icon } from './icons.js';
import { levelOf, levelElevation, baseLevel } from '../levels.js';
import { makeNote, noteColors, noteLimit } from '../notes.js';

// Notas del plano en pantalla: etiquetas ancladas a su punto del suelo, en 2D y en la maqueta 3D
// (no en el recorrido). Pulsar una nota la edita; «Mover» vuelve a ubicarla con un clic en el plano.
export function createNotesUI(ctx) {
  const { state, actions } = ctx;
  const layer = document.createElement('div');
  layer.id = 'plan-notes';
  $('#room-labels').after(layer);
  let last = null;

  const visible = () => (state.project.notes || []).filter(note => levelOf(note) === state.level);

  function render() {
    layer.hidden = state.view === 'walk' || state.control;
    layer.innerHTML = visible().map(note => `<button class="plan-note" data-note="${esc(note.id)}" style="--note:${note.color}" title="Editar nota">${icon('note', 13)}<span>${esc(note.text)}</span></button>`).join('');
    layer.querySelectorAll('[data-note]').forEach(button => button.onclick = () => edit(state.project.notes.find(n => n.id === button.dataset.note)));
    if (last) position(...last);
  }

  function position(camera, rect) {
    last = [camera, rect];
    if (layer.hidden) return;
    const y = levelElevation(state.project, state.level) + .05;
    for (const element of layer.children) {
      const note = state.project.notes.find(n => n.id === element.dataset.note);
      if (!note) continue;
      const p = new THREE.Vector3(note.x, y, note.z).project(camera);
      element.style.transform = `translate(${(p.x + 1) * rect.width / 2}px,${(-p.y + 1) * rect.height / 2}px) translate(-50%,-100%)`;
    }
  }

  // Formulario de una nota nueva (en el punto marcado) o existente.
  function edit(note, point = null) {
    const color = note?.color || noteColors[0];
    modal(`
     <h2>${note ? 'Nota del plano' : 'Nueva nota'}</h2>
     <form id="note-form" class="ha-form">
      <label>Texto<textarea id="note-text" maxlength="200" rows="3" required placeholder="Por ejemplo: enchufe doble aquí">${esc(note?.text || '')}</textarea></label>
      <div class="note-colors" role="radiogroup" aria-label="Color">${noteColors.map(c => `<button type="button" role="radio" data-color="${c}" aria-checked="${c === color}" style="--note:${c}" aria-label="Color ${c}"></button>`).join('')}</div>
      <div class="dialog-actions">
       ${note ? `<button type="button" id="note-delete" class="danger">${icon('trash', 14)} Eliminar</button><button type="button" id="note-move" class="secondary">Mover</button>` : ''}
       <button type="button" data-close class="secondary">Cancelar</button><button type="submit" class="primary">Guardar</button>
      </div>
     </form>`, () => {
      let chosen = color;
      const text = $('#note-text');
      text.focus();
      document.querySelectorAll('.note-colors [data-color]').forEach(b => b.onclick = () => {
        chosen = b.dataset.color;
        document.querySelectorAll('.note-colors [data-color]').forEach(o => o.setAttribute('aria-checked', String(o === b)));
        text.focus();
      });
      text.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#note-form').requestSubmit(); } };
      $('#note-form').onsubmit = event => {
        event.preventDefault();
        const value = text.value.trim();
        if (!value) return;
        $('#dialog').close();
        if (note && note.text === value && note.color === chosen) return;
        actions.checkpoint();
        if (note) Object.assign(note, { text: value.slice(0, 200), color: chosen });
        else state.project.notes = [...(state.project.notes || []), makeNote(value, point.x, point.z, state.level !== baseLevel ? state.level : null, chosen)];
        actions.changed();
      };
      if (!note) return;
      $('#note-delete').onclick = () => {
        $('#dialog').close();
        actions.checkpoint();
        state.project.notes = state.project.notes.filter(n => n.id !== note.id);
        actions.changed();
        toast('Nota eliminada.', { label: 'Deshacer', run: () => actions.undo() });
      };
      $('#note-move').onclick = () => { $('#dialog').close(); actions.startNote(note.id); };
    });
  }

  // Punto marcado con la herramienta de notas: crea una nota o mueve la elegida.
  function place(point, movingId) {
    const moving = movingId && state.project.notes?.find(n => n.id === movingId);
    if (moving) { actions.checkpoint(); Object.assign(moving, point); actions.changed(); return; }
    if ((state.project.notes || []).length >= noteLimit) { toast(`Esta versión admite hasta ${noteLimit} notas.`); return; }
    edit(null, point);
  }

  return { render, position, place };
}
