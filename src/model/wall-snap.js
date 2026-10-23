// Imán de paredes: al arrastrar un mueble cerca de una pared, su respaldo queda pegado a la cara
// interior del muro (sin hueco ni solape) y, si hace falta, gira para dar la espalda a la pared.
// Cerca de una esquina, o junto a otro mueble pegado a la misma pared, también ajusta el costado.
import { byId, isOpening, flatKinds } from './catalog.js';
import { round } from './model.js';
import { onLevel, levelOf } from './levels.js';

// Distancia (m) a la que el imán empieza a actuar.
export const wallReach = .25;
// Objetos cuya orientación no importa o que no conviene girar solos: solo se pegan, sin girar.
const keepRotation = ['rug', 'round', 'plant', 'lamp', 'vacuum', 'pouf', 'stool', 'chair', 'coatrack'];
// Estructura y exterior: se ubican a mano, en cualquier ángulo; el imán no los mueve.
const free = ['partition', 'fence', 'tree', 'grass', 'pool'];
// En el modelo, con rotación 0 el respaldo mira hacia -z; cada lado de la habitación tiene su giro.
const sides = [
  { side: 'n', axis: 'z', sign: -1, rotation: 0 },
  { side: 'w', axis: 'x', sign: -1, rotation: 90 },
  { side: 's', axis: 'z', sign: 1, rotation: 180 },
  { side: 'e', axis: 'x', sign: 1, rotation: 270 }
];
const norm = r => ((Math.round(r) % 360) + 360) % 360;
const extents = (item, rotation) => {
  const a = rotation * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { x: (item.w * c + item.d * s) / 2, z: (item.w * s + item.d * c) / 2 };
};

// Devuelve { x, z, rotation, wall } con la posición ajustada; `wall` es el lado pegado (o null).
export function snapToWalls(item, project, { x = item.x, z = item.z, turn = true } = {}) {
  const result = { x, z, rotation: item.rotation, wall: null };
  if (isOpening(item) || free.includes(byId(item.asset)?.kind)) return result;
  const level = onLevel(project, levelOf(item));
  const room = level.rooms.find(r => x >= r.x - r.w / 2 && x <= r.x + r.w / 2 && z >= r.z - r.d / 2 && z <= r.z + r.d / 2);
  if (!room) return result;
  const t = (project.wallThickness ?? .14) / 2;
  // Caras interiores de los muros de la habitación.
  const face = { n: room.z - room.d / 2 + t, s: room.z + room.d / 2 - t, w: room.x - room.w / 2 + t, e: room.x + room.w / 2 - t };
  const pos = { x, z };
  const gap = (s, ext) => s.sign < 0 ? (pos[s.axis] - ext[s.axis]) - face[s.side] : face[s.side] - (pos[s.axis] + ext[s.axis]);
  const fits = (ext, axis) => 2 * ext[axis] <= (axis === 'x' ? face.e - face.w : face.s - face.n) + .001;
  const turns = turn && !keepRotation.includes(byId(item.asset)?.kind);
  const current = norm(item.rotation);

  let rotation = current;
  let ext = extents(item, rotation);
  let primary = null;
  if (turns) {
    // Se prefiere la pared a la que ya da la espalda, así el mueble no salta al rozar una esquina.
    const near = sides.filter(s => gap(s, ext) < wallReach).sort((a, b) => gap(a, ext) - gap(b, ext));
    primary = near.find(s => s.rotation === current) || near[0] || null;
    if (primary) {
      const turned = extents(item, primary.rotation);
      if (fits(turned, primary.axis) && fits(turned, primary.axis === 'x' ? 'z' : 'x')) { rotation = primary.rotation; ext = turned; }
      else primary = null;
    }
  }
  const pinned = new Set();
  const stick = s => { pos[s.axis] = s.sign < 0 ? face[s.side] + ext[s.axis] : face[s.side] - ext[s.axis]; pinned.add(s.axis); };
  if (primary) stick(primary);
  // Resto de lados (costados en una esquina, o los cuatro si el objeto no gira).
  for (const axis of ['x', 'z']) {
    if (pinned.has(axis) || !fits(ext, axis)) continue;
    const best = sides.filter(s => s.axis === axis && gap(s, ext) < wallReach).sort((a, b) => gap(a, ext) - gap(b, ext))[0];
    if (best) stick(best);
  }
  // Junto a la pared, el costado se apoya en el mueble vecino pegado al mismo muro (módulos de cocina, etc.).
  if (primary) {
    const along = primary.axis === 'x' ? 'z' : 'x';
    if (!pinned.has(along)) {
      let snapTo = null, best = wallReach / 2;
      for (const o of level.items) {
        if (o.id === item.id || isOpening(o) || flatKinds.includes(byId(o.asset)?.kind) || norm(o.rotation) % 90) continue;
        if (o.elevation >= item.elevation + item.h || item.elevation >= o.elevation + o.h) continue;
        const oe = extents(o, norm(o.rotation));
        const oBack = primary.sign < 0 ? o[primary.axis] - oe[primary.axis] : o[primary.axis] + oe[primary.axis];
        if (Math.abs(oBack - face[primary.side]) > .02) continue;
        for (const [mine, theirs] of [[-1, 1], [1, -1]]) {
          const edge = o[along] + theirs * oe[along], target = edge - mine * ext[along];
          const distance = Math.abs(pos[along] - target);
          if (distance < best) { best = distance; snapTo = target; }
        }
      }
      if (snapTo !== null) pos[along] = snapTo;
    }
  }
  return { x: round(pos.x), z: round(pos.z), rotation: rotation === current ? item.rotation : rotation, wall: primary?.side || null };
}
