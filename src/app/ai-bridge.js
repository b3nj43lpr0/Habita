// Atiende las órdenes que llegan desde fuera de la ventana: asistentes de IA (MCP, solo en este
// equipo y si el usuario lo permite) y el menú de la bandeja de Windows. Cada cambio pasa por el
// historial, la maqueta y la cola de envío como si lo hiciera el usuario.
import { toast } from './dom.js';
import { clone } from '../model.js';
import { applyScene } from '../scenes.js';
import { homeSnapshot, applyLights, applyClimates, applyTvs, findScene } from '../ai-home.js';

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

  const tools = {
    get_home: () => homeSnapshot(state.project, id => ctx.devices.describe(id)),
    set_lights: args => run(project => applyLights(project, args), changed => `Asistente de IA: ${names(changed)}.`),
    set_air_conditioners: args => run(project => applyClimates(project, args), changed => `Asistente de IA: ${names(changed)}.`),
    set_tvs: args => run(project => applyTvs(project, args), changed => `Asistente de IA: ${names(changed)}.`),
    activate_scene: args => {
      const scene = findScene(state.project, args?.scene);
      return run(project => applyScene(project, scene), () => `Escena «${scene.name}» activada.`);
    }
  };

  function publishScenes() {
    desktop?.setScenes((state.project.scenes || []).map(scene => ({ id: scene.id, name: scene.name })));
  }

  if (desktop) {
    desktop.onAiCall(({ id, tool, args }) => {
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

  return { publishScenes };
}
