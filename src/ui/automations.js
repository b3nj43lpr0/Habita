import { isOpening } from '../model/catalog.js';
import { automationLimit, dayNames, dueAutomations, contactAutomations, describeTrigger } from '../model/automations.js';
import { $, esc, toast, modal } from './dom.js';
import { icon } from './icons.js';

// Ejecuta las automatizaciones y muestra su lista en el panel de la casa.
export function createAutomations(ctx) {
  const { state, actions } = ctx;
  const ran = new Map();

  function run(automation) {
    const scene = (state.project.scenes || []).find(s => s.id === automation.scene);
    if (!scene) { toast(`Automatización «${automation.name}»: su escena ya no existe.`); return; }
    actions.activateScene(scene, `Automatización «${automation.name}»: escena «${scene.name}» activada.`);
  }

  // Cada 15 s basta para no saltarse un minuto; la ventana sigue activa en la bandeja.
  setInterval(() => { for (const a of dueAutomations(state.project, new Date(), ran)) run(a); }, 15000);

  function contact(itemIds, open) {
    for (const id of itemIds) for (const a of contactAutomations(state.project, id, open)) run(a);
  }

  function mount(container) {
    const { project } = state;
    const scenes = project.scenes || [];
    if (!scenes.length) return;
    const list = project.automations || [];
    const section = document.createElement('section');
    section.className = 'scene-list automation-list property-section';
    section.innerHTML = `
     <h3>Automatizaciones <span>${list.filter(a => a.enabled).length}/${list.length}</span></h3>
     ${list.length ? `<div class="scene-buttons">${list.map(a => {
      const scene = scenes.find(s => s.id === a.scene);
      return `<div class="scene-row automation-row ${a.enabled ? '' : 'disabled'}">
        <label class="automation-toggle"><input type="checkbox" data-toggle-automation="${esc(a.id)}" ${a.enabled ? 'checked' : ''} aria-label="Activar ${esc(a.name)}">
         <span><strong>${esc(a.name)}</strong><small>${esc(describeTrigger(a, project))} → ${esc(scene?.name || 'escena eliminada')}</small></span></label>
        <button class="scene-delete icon-button" data-delete-automation="${esc(a.id)}" aria-label="Eliminar ${esc(a.name)}" title="Eliminar">${icon('close', 13)}</button></div>`;
     }).join('')}</div>` : '<p class="scene-empty">Activa una escena a una hora o al abrir una puerta o ventana con sensor.</p>'}
     <button id="new-automation" class="secondary full" ${list.length >= automationLimit ? 'disabled' : ''}>${icon('plus', 14)} Nueva automatización</button>`;
    container.querySelector('.scene-list:not(.automation-list)')?.after(section);
    section.querySelectorAll('[data-toggle-automation]').forEach(input => input.onchange = () => {
      actions.checkpoint();
      project.automations.find(a => a.id === input.dataset.toggleAutomation).enabled = input.checked;
      actions.changed();
    });
    section.querySelectorAll('[data-delete-automation]').forEach(b => b.onclick = () => {
      actions.checkpoint();
      project.automations = list.filter(a => a.id !== b.dataset.deleteAutomation);
      if (!project.automations.length) delete project.automations;
      actions.changed();
    });
    $('#new-automation').onclick = create;
  }

  function create() {
    const { project } = state;
    const openings = project.items.filter(item => isOpening(item) && ctx.devices.describe(item.id));
    modal(`
     <h2>Nueva automatización</h2>
     <p>Elige cuándo ocurre y qué escena activa. Funciona mientras Habita está abierto, también en la bandeja.</p>
     <form id="automation-form" class="ha-form">
      <label>Nombre<input id="automation-name" maxlength="60" placeholder="Por ejemplo: Noche de semana" required autocomplete="off"></label>
      <label>Cuándo<select id="automation-type">
       <option value="time">A una hora</option>
       <option value="contact" ${openings.length ? '' : 'disabled'}>Al abrir o cerrar una puerta o ventana${openings.length ? '' : ' (vincula un sensor primero)'}</option>
      </select></label>
      <div id="automation-time"><label>Hora<input id="automation-hour" type="time" value="22:00" required></label>
       <div class="automation-days" role="group" aria-label="Días">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" value="${d}" checked> ${dayNames[d]}</label>`).join('')}</div></div>
      <div id="automation-contact" hidden><label>Puerta o ventana<select id="automation-item">${openings.map(o => `<option value="${esc(o.id)}">${esc(o.name)} · ${esc(ctx.devices.describe(o.id).label)}</option>`).join('')}</select></label>
       <label>Momento<select id="automation-when"><option value="open">Al abrirse</option><option value="closed">Al cerrarse</option></select></label></div>
      <label>Activar la escena<select id="automation-scene">${(project.scenes || []).map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
      <div class="dialog-actions"><button type="button" data-close class="secondary">Cancelar</button><button type="submit" class="primary">Guardar</button></div>
     </form>`, () => {
      const type = $('#automation-type');
      type.onchange = () => { $('#automation-time').hidden = type.value !== 'time'; $('#automation-contact').hidden = type.value !== 'contact'; };
      $('#automation-name').focus();
      $('#automation-form').onsubmit = event => {
        event.preventDefault();
        const name = $('#automation-name').value.trim();
        // Un nombre de solo espacios dejaría el proyecto inválido al volver a abrirlo.
        if (!name) { toast('Escribe un nombre para la automatización.'); return; }
        const days = [...document.querySelectorAll('.automation-days input:checked')].map(i => Number(i.value));
        if (type.value === 'time' && !days.length) { toast('Elige al menos un día.'); return; }
        const trigger = type.value === 'time'
          ? { type: 'time', time: $('#automation-hour').value, days }
          : { type: 'contact', item: $('#automation-item').value, when: $('#automation-when').value };
        actions.checkpoint();
        project.automations = [...(project.automations || []), { id: crypto.randomUUID(), name, enabled: true, trigger, scene: $('#automation-scene').value }];
        $('#dialog').close();
        actions.changed();
        toast('Automatización guardada.');
      };
    });
  }

  return { mount, contact };
}
