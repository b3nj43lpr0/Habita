// La IA también puede editar el plano (si el usuario lo permite): ver los espacios y muebles,
// agregar, mover, cambiar o quitar. Cada orden se aplica sobre el proyecto que recibe y devuelve
// un resumen; quien llama la prueba antes en una copia y la valida como proyecto completo.
// Idea de house-control (MIT): «el asistente puede reconstruir habitaciones en 3D desde fotos».
import { listed, byId, makeItem, isOpening } from '../model/catalog.js';
import { round, overlaps, alignOpening } from '../model/model.js';
import { inRoom, levelOf, levelsOf, baseLevel } from '../model/levels.js';

const num = (value, name, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`«${name}» debe ser un número entre ${min} y ${max}.`);
  return round(value);
};
const text = (value, name, max = 120) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`«${name}» debe ser un texto de hasta ${max} caracteres.`);
  return value.trim();
};
const findRoom = (project, id) => project.rooms.find(r => r.id === id) || (() => { throw new Error(`No existe la habitación «${id}». Usa get_plan para ver los identificadores.`); })();
const findItem = (project, id) => project.items.find(i => i.id === id) || (() => { throw new Error(`No existe el objeto «${id}». Usa get_plan para ver los identificadores.`); })();
const level = (project, value) => {
  if (value === undefined) return baseLevel;
  if (!levelsOf(project).some(l => l.id === value)) throw new Error(`No existe el piso «${value}».`);
  return value;
};

export function planSnapshot(project) {
  return {
    units: 'metros; x hacia la derecha y z hacia abajo en el plano; rotation en grados',
    wallHeight: project.wallHeight,
    levels: levelsOf(project).map(l => ({ id: l.id, name: l.name })),
    rooms: project.rooms.map(r => ({ id: r.id, name: r.name, x: r.x, z: r.z, w: r.w, d: r.d, level: levelOf(r) })),
    items: project.items.map(i => ({ id: i.id, name: i.name, asset: i.asset, x: i.x, z: i.z, w: i.w, d: i.d, h: i.h, rotation: i.rotation, level: levelOf(i), room: project.rooms.find(r => inRoom(i, r))?.name || null })),
    catalog: listed.map(a => ({ asset: a.id, name: a.name, category: a.category, w: a.w, d: a.d, h: a.h }))
  };
}

function overlapping(project, room) {
  return project.rooms.find(r => r.id !== room.id && levelOf(r) === levelOf(room) && overlaps({ ...r, rotation: 0 }, { ...room, rotation: 0 }));
}

export const planTools = {
  add_room(project, args) {
    const room = { id: crypto.randomUUID(), name: text(args.name ?? 'Habitación', 'name'), x: num(args.x, 'x', -100, 100), z: num(args.z, 'z', -100, 100), w: num(args.w, 'w', .5, 50), d: num(args.d, 'd', .5, 50), color: '#c5ad8e' };
    const at = level(project, args.level);
    if (at !== baseLevel) room.level = at;
    const clash = overlapping(project, room);
    if (clash) throw new Error(`Se superpone con «${clash.name}». Las habitaciones comparten muros, pero no se enciman.`);
    project.rooms.push(room);
    project.items.filter(isOpening).forEach(o => alignOpening(o, project));
    return { message: `Habitación «${room.name}» agregada (${room.w} × ${room.d} m).`, id: room.id };
  },
  update_room(project, args) {
    const room = findRoom(project, args.id), next = { ...room };
    if (args.name !== undefined) next.name = text(args.name, 'name');
    for (const [key, min, max] of [['x', -100, 100], ['z', -100, 100], ['w', .5, 50], ['d', .5, 50]]) if (args[key] !== undefined) next[key] = num(args[key], key, min, max);
    const clash = overlapping(project, next);
    if (clash) throw new Error(`Con esas medidas se superpone con «${clash.name}».`);
    Object.assign(room, next);
    project.items.filter(isOpening).forEach(o => alignOpening(o, project));
    return { message: `Habitación «${room.name}» actualizada.`, id: room.id };
  },
  remove_room(project, args) {
    const room = findRoom(project, args.id);
    project.rooms = project.rooms.filter(r => r !== room);
    return { message: `Habitación «${room.name}» eliminada; sus muebles se conservan.`, id: room.id };
  },
  add_item(project, args) {
    const asset = byId(args.asset);
    if (!asset || asset.kind === 'custom') throw new Error(`No existe el modelo «${args.asset}». Usa get_plan: la lista «catalog» trae los disponibles.`);
    const room = args.room !== undefined ? project.rooms.find(r => r.id === args.room || r.name.toLowerCase() === String(args.room).toLowerCase()) : null;
    if (args.room !== undefined && !room) throw new Error(`No existe la habitación «${args.room}».`);
    const x = args.x !== undefined ? num(args.x, 'x', -100, 100) : room?.x, z = args.z !== undefined ? num(args.z, 'z', -100, 100) : room?.z;
    if (x === undefined || z === undefined) throw new Error('Indica x y z, o una habitación («room») para ponerlo al centro.');
    const item = makeItem(asset.id, x, z);
    if (args.name !== undefined) item.name = text(args.name, 'name');
    if (args.rotation !== undefined) item.rotation = num(args.rotation, 'rotation', -360, 360);
    for (const [key, min, max] of [['w', .05, 50], ['d', .01, 50], ['h', .01, 10]]) if (args[key] !== undefined) item[key] = num(args[key], key, min, max);
    const at = room ? levelOf(room) : level(project, args.level);
    if (at !== baseLevel) item.level = at;
    project.items.push(item);
    if (isOpening(item) && !alignOpening(item, project)) throw new Error('Las puertas y ventanas van sobre un muro y esta casa aún no tiene muros.');
    return { message: `«${item.name}» agregado en x ${item.x}, z ${item.z}${isOpening(item) ? ' (sobre el muro más cercano)' : ''}.`, id: item.id };
  },
  update_item(project, args) {
    const item = findItem(project, args.id);
    if (args.name !== undefined) item.name = text(args.name, 'name');
    for (const [key, min, max] of [['x', -100, 100], ['z', -100, 100], ['rotation', -360, 360], ['w', .05, 50], ['d', .01, 50], ['h', .01, 10]]) if (args[key] !== undefined) item[key] = num(args[key], key, min, max);
    if (args.color !== undefined) {
      if (typeof args.color !== 'string' || !/^#[\da-f]{6}$/i.test(args.color)) throw new Error('«color» debe tener la forma #rrggbb.');
      item.color = args.color.toLowerCase();
    }
    if (isOpening(item)) alignOpening(item, project);
    return { message: `«${item.name}» actualizado.`, id: item.id };
  },
  remove_item(project, args) {
    const item = findItem(project, args.id);
    project.items = project.items.filter(i => i !== item);
    return { message: `«${item.name}» eliminado.`, id: item.id };
  }
};
