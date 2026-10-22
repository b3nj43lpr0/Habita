// Acceso para asistentes de IA (MCP): la IA ve y cambia la casa a través de los objetos del
// plano, nunca de los dispositivos reales. Recibe identificadores de objetos y habitaciones del
// proyecto; los equipos vinculados reciben el cambio por la misma vía que los controles de la app.
// Herramientas inspiradas en house-control (MIT, Copyright (c) 2026 0xProbability).
import { isLamp, lightFor } from './lighting.js';
import { inRoom } from '../model/levels.js';
import { isTv, tvFor } from './tv.js';
import { isClimate, climateFor, climateModes, fanSpeeds, climateRange } from './climate.js';

const inside = inRoom;
const roomOf = (project, item) => project.rooms.find(room => inside(item, room)) || null;
const plain = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Estado de la casa para la IA. `describe(itemId)` informa el equipo real vinculado, si lo hay.
export function homeSnapshot(project, describe = () => null) {
  const real = item => {
    const info = describe(item.id);
    return info ? { linked: true, available: info.available, status: info.label, ...(info.current != null ? { currentTemperature: info.current } : {}) } : { linked: false };
  };
  const base = item => ({ id: item.id, name: item.name, room: roomOf(project, item)?.name || null });
  return {
    name: project.name,
    rooms: project.rooms.map(room => ({ id: room.id, name: room.name, area: Math.round(room.w * room.d * 10) / 10 })),
    lights: project.items.filter(isLamp).map(item => ({ ...base(item), ...lightFor(item), device: real(item) })),
    airConditioners: project.items.filter(isClimate).map(item => ({ ...base(item), ...climateFor(item), device: real(item) })),
    tvs: project.items.filter(isTv).map(item => ({ ...base(item), ...tvFor(item), device: real(item) })),
    scenes: (project.scenes || []).map(scene => ({ id: scene.id, name: scene.name }))
  };
}

// Objetos de un tipo elegidos por id, por habitación (id o nombre) o, sin filtros, todos.
export function selectItems(project, isKind, { ids, room } = {}) {
  let items = project.items.filter(isKind);
  if (ids !== undefined) {
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) throw new Error('«ids» debe ser una lista de identificadores de objetos.');
    const unknown = ids.filter(id => !items.some(item => item.id === id));
    if (unknown.length) throw new Error(`No existen en la casa: ${unknown.join(', ')}. Usa get_home para ver los identificadores.`);
    items = items.filter(item => ids.includes(item.id));
  }
  if (room !== undefined) {
    const found = project.rooms.find(r => r.id === room || plain(r.name) === plain(room));
    if (!found) throw new Error(`No hay una habitación «${room}». Habitaciones: ${project.rooms.map(r => r.name).join(', ')}.`);
    items = items.filter(item => inside(item, found));
  }
  if (!items.length) throw new Error('Ningún objeto coincide con la selección.');
  return items;
}

const percent = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error(`«${name}» debe ser un número entre 0 y 100.`);
  return Math.round(value);
};

// Aplica un cambio de luces y devuelve los objetos que cambiaron.
export function applyLights(project, args = {}) {
  const items = selectItems(project, isLamp, args);
  const patch = {};
  if (args.on !== undefined) {
    if (typeof args.on !== 'boolean') throw new Error('«on» debe ser verdadero o falso.');
    patch.on = args.on;
  }
  if (args.brightness !== undefined) patch.brightness = percent(args.brightness, 'brightness');
  if (args.warmth !== undefined) { patch.warmth = percent(args.warmth, 'warmth'); patch.mode = 'temperature'; }
  if (args.color !== undefined) {
    if (typeof args.color !== 'string' || !/^#[\da-f]{6}$/i.test(args.color)) throw new Error('«color» debe tener la forma #rrggbb.');
    patch.color = args.color.toLowerCase();
    patch.mode = 'color';
  }
  // Pedir brillo o color a una luz apagada la enciende, como al mover su slider.
  if (patch.on === undefined && (patch.brightness || patch.color || patch.warmth !== undefined)) patch.on = true;
  if (!Object.keys(patch).length) throw new Error('Indica qué cambiar: on, brightness, warmth o color.');
  return change(items, 'light', lightFor, patch);
}

// Aplica un cambio de aires acondicionados y devuelve los objetos que cambiaron.
export function applyClimates(project, args = {}) {
  const items = selectItems(project, isClimate, args);
  const patch = {};
  if (args.on !== undefined) {
    if (typeof args.on !== 'boolean') throw new Error('«on» debe ser verdadero o falso.');
    patch.on = args.on;
  }
  if (args.mode !== undefined) {
    if (!climateModes.includes(args.mode)) throw new Error(`«mode» debe ser uno de: ${climateModes.join(', ')}.`);
    patch.mode = args.mode;
  }
  if (args.fan !== undefined) {
    if (!fanSpeeds.includes(args.fan)) throw new Error(`«fan» debe ser uno de: ${fanSpeeds.join(', ')}.`);
    patch.fan = args.fan;
  }
  if (args.swing !== undefined) {
    if (typeof args.swing !== 'boolean') throw new Error('«swing» debe ser true o false.');
    patch.swing = args.swing;
  }
  if (args.target !== undefined) {
    const { min, max, step } = climateRange;
    if (typeof args.target !== 'number' || !Number.isFinite(args.target) || args.target < min || args.target > max) throw new Error(`«target» debe estar entre ${min} y ${max} °C.`);
    patch.target = Math.round(args.target / step) * step;
  }
  if (!Object.keys(patch).length) throw new Error('Indica qué cambiar: on, mode, target, fan o swing.');
  return change(items, 'climate', climateFor, patch);
}

// Aplica un cambio de televisores y devuelve los objetos que cambiaron.
export function applyTvs(project, args = {}) {
  const items = selectItems(project, isTv, args);
  const patch = {};
  for (const key of ['on', 'muted']) if (args[key] !== undefined) {
    if (typeof args[key] !== 'boolean') throw new Error(`«${key}» debe ser verdadero o falso.`);
    patch[key] = args[key];
  }
  if (args.volume !== undefined) patch.volume = percent(args.volume, 'volume');
  if (args.source !== undefined) {
    if (typeof args.source !== 'string' || !args.source.trim() || args.source.length > 80) throw new Error('«source» debe ser el nombre de una entrada, por ejemplo HDMI 1 o Netflix.');
    patch.source = args.source.trim();
  }
  // Cambiar volumen o entrada de un televisor apagado lo enciende, como en el control remoto.
  if (patch.on === undefined && (patch.volume !== undefined || patch.source)) patch.on = true;
  if (!Object.keys(patch).length) throw new Error('Indica qué cambiar: on, volume, muted o source.');
  return change(items, 'tv', tvFor, patch);
}

function change(items, field, current, patch) {
  const changed = [];
  for (const item of items) {
    const next = { ...current(item), ...patch };
    if (JSON.stringify(next) === JSON.stringify(current(item))) continue;
    item[field] = next;
    changed.push(item);
  }
  return changed;
}

export function findScene(project, scene) {
  const scenes = project.scenes || [];
  const found = typeof scene === 'string' && scenes.find(s => s.id === scene || plain(s.name) === plain(scene));
  if (!found) throw new Error(scenes.length ? `No hay una escena «${scene}». Escenas: ${scenes.map(s => s.name).join(', ')}.` : 'La casa no tiene escenas guardadas.');
  return found;
}
