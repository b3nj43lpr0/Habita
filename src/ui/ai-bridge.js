// Atiende las órdenes que llegan desde fuera de la ventana: asistentes de IA (MCP, solo en este
// equipo y si el usuario lo permite) y el menú de la bandeja de Windows. Cada cambio pasa por el
// historial, la maqueta y la cola de envío como si lo hiciera el usuario.
import { toast } from './dom.js';
import { clone } from '../model/model.js';
import { applyScene } from '../model/scenes.js';
import { homeSnapshot, applyLights, applyClimates, applyTvs, findScene } from '../devices/ai-home.js';
import { homeStatus } from '../devices/home-status.js';
import { planSnapshot, planTools } from '../devices/ai-plan.js';
import { validateProject } from '../model/model.js';

const names = items => items.map(item => item.name).join(', ');

export function createAiBridge(ctx) {
  const { state, actions } = ctx;
  const desktop = window.habita?.desktop;

  function commit(changed, message) {
    if (!changed.length) return { changed: [], message: 'La casa ya estaba así; no se envió nada.' };
    ctx.devices.sendMany(changed);
    actions.changed();
    toast(message);
    return { changed: changed.map(item => ({ id: item.id, name: item.name })), message };
  }

  // Aplica primero sobre una copia: si la orden no es válida, el proyecto y el historial no cambian.
  function run(apply, message) {
    // Sin cambios no hay paso de Deshacer.
    if (apply(clone(state.project)).length) actions.checkpoint();
    const changed = apply(state.project);
    return commit(changed, message(changed));
  }

  // Edición del plano: se prueba en una copia validada; si sirve, es un paso de Deshacer más.
  function editPlan(name, args) {
    const draft = clone(state.project);
    planTools[name](draft, args);
    validateProject(draft);
    actions.checkpoint();
    const result = planTools[name](state.project, args);
    actions.changed();
    toast(`Asistente de IA: ${result.message}`, { label: 'Deshacer', run: () => actions.undo() });
    return result;
  }

  const tools = {
    get_plan: () => planSnapshot(state.project),
    ...Object.fromEntries(Object.keys(planTools).map(name => [name, args => editPlan(name, args)])),
    get_home: () => homeSnapshot(state.project, id => ctx.devices.describe(id)),
    set_lights: args => run(project => applyLights(project, args), changed => `Asistente de IA: ${names(changed)}.`),
    set_air_conditioners: args => run(project => applyClimates(project, args), changed => `Asistente de IA: ${names(changed)}.`),
    set_tvs: args => run(project => applyTvs(project, args), changed => `Asistente de IA: ${names(changed)}.`),
    // Imagen de la maqueta para el panel rápido y el celular (no se ofrece a asistentes de IA).
    get_picture: () => ({ image: ctx.scene.screenshot('image/jpeg', .72) }),
    activate_scene: args => {
      const scene = findScene(state.project, args?.scene);
      return run(project => applyScene(project, scene), () => `Escena «${scene.name}» activada.`);
    }
  };

  // Escenas para el menú de la bandeja y el resumen de su ícono (luces encendidas, aire).
  let lastStatus = '';
  function publishScenes() {
    desktop?.setScenes((state.project.scenes || []).map(scene => ({ id: scene.id, name: scene.name })));
    publishStatus();
  }
  function publishStatus() {
    const status = homeStatus(state.project), key = JSON.stringify(status);
    if (!desktop?.setStatus || key === lastStatus) return;
    lastStatus = key;
    desktop.setStatus({ text: status.text, lit: status.lit > 0 });
  }

  if (desktop) {
    desktop.onAiCall(({ id, tool, args }) => {
      showActivity(tool);
      let reply;
      try {
        if (!Object.hasOwn(tools, tool)) throw new Error(`Herramienta desconocida: ${tool}`);
        reply = { ok: true, result: tools[tool](args || {}) };
      } catch (error) {
        reply = { ok: false, error: error.message };
      }
      desktop.aiReply(id, reply);
    });
    desktop.onScene(id => {
      try { tools.activate_scene({ scene: id }); } catch (error) { toast(error.message); }
    });
    publishScenes();
  }

  // Actividad en vivo: cada orden de la IA o del celular aparece un momento en la barra de estado.
  const activity = document.createElement('span');
  activity.id = 'ai-activity';
  activity.hidden = true;
  document.querySelector('.statusbar>div:last-child')?.prepend(activity);
  const labels = { get_home: 'consultó la casa', get_plan: 'consultó el plano', get_picture: '', set_lights: 'cambió luces', set_air_conditioners: 'cambió aires', set_tvs: 'cambió televisores', activate_scene: 'activó una escena', add_room: 'agregó una habitación', update_room: 'cambió una habitación', remove_room: 'quitó una habitación', add_item: 'agregó un objeto', update_item: 'movió o cambió un objeto', remove_item: 'quitó un objeto' };
  function showActivity(tool) {
    if (!labels[tool]) return;
    activity.textContent = `Control externo: ${labels[tool]}`;
    activity.hidden = false;
    activity.classList.remove('pulse'); void activity.offsetWidth; activity.classList.add('pulse');
    clearTimeout(showActivity.timer);
    showActivity.timer = setTimeout(() => { activity.hidden = true; }, 20000);
  }

  return { publishScenes, publishStatus };
}
