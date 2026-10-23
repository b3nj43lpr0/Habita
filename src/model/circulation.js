// Circulación: por dónde abre cada puerta y si queda espacio para pasar entre los muebles.
// - doorSwing: el arco que barre la hoja de una puerta (para dibujarlo y detectar choques).
// - circulationIssues: pasos angostos entre muebles grandes, o entre un mueble y la pared, y
//   puertas que chocan con algo al abrirse. Son avisos orientativos, no normativa.
import { byId, isOpening, flatKinds } from './catalog.js';
import { corners } from './model.js';
import { levelsOf, onLevel, sameLevel } from './levels.js';

// Ancho mínimo cómodo para pasar (m). Un hueco de menos de 30 cm no es un paso (nadie camina por
// ahí): es un mueble casi pegado a otro o a la pared, y no se avisa.
export const passageMin = .6;
const touching = .3;
const swingSteps = 8;

// Sentido de apertura (0 a 3): el bit 1 elige la bisagra (izquierda o derecha) y el bit 2 el lado
// del muro hacia el que abre. Sin `swing`, la puerta abre hacia +z local con bisagra a la izquierda.
export const swingLabels = ['Bisagra izquierda, abre hacia un lado', 'Bisagra derecha, abre hacia un lado', 'Bisagra izquierda, abre hacia el otro lado', 'Bisagra derecha, abre hacia el otro lado'];
export const validSwing = value => value === undefined || (Number.isInteger(value) && value >= 0 && value <= 3);
export const isDoor = item => byId(item?.asset)?.kind === 'door';

// Punto local (x a lo largo del muro, z perpendicular) a coordenadas del plano, como corners().
function toWorld(item, x, z) {
  const a = item.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [item.x + x * c + z * s, item.z - x * s + z * c];
}

// { hinge, leaf, arc, polygon }: bisagra, extremo de la hoja abierta, puntos del arco y el sector
// completo (bisagra + arco), que es convexo.
export function doorSwing(door) {
  const swing = door.swing || 0, h = swing & 1 ? 1 : -1, side = swing & 2 ? -1 : 1;
  const face = side * door.d / 2, r = door.w;
  const arc = [];
  for (let i = 0; i <= swingSteps; i++) {
    const t = i / swingSteps * Math.PI / 2;
    arc.push(toWorld(door, h * door.w / 2 - h * r * Math.cos(t), face + side * r * Math.sin(t)));
  }
  const hinge = toWorld(door, h * door.w / 2, face);
  return { hinge, leaf: arc.at(-1), arc, polygon: [hinge, ...arc] };
}

// Dos polígonos convexos se tocan si ningún eje de sus lados los separa.
export function polygonsOverlap(a, b) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], axis = [q[1] - p[1], p[0] - q[0]];
    if (!axis[0] && !axis[1]) continue;
    const pa = a.map(v => v[0] * axis[0] + v[1] * axis[1]), pb = b.map(v => v[0] * axis[0] + v[1] * axis[1]);
    if (Math.max(...pa) <= Math.min(...pb) + .001 || Math.max(...pb) <= Math.min(...pa) + .001) return false;
  }
  return true;
}

// Muebles que estorban al pasar o al abrir una puerta: lo que está en el suelo y tiene cuerpo.
const lowKinds = [...flatKinds, 'vacuum'];
const blocks = item => !isOpening(item) && !lowKinds.includes(byId(item.asset)?.kind) && (item.elevation || 0) < 1.9;

export function doorBlockers(door, project) {
  if (!isDoor(door)) return [];
  const sector = doorSwing(door).polygon;
  return project.items.filter(o => o.id !== door.id && sameLevel(o, door) && blocks(o) && (o.elevation || 0) < door.h && polygonsOverlap(sector, corners(o)));
}

// Muebles grandes (los que forman pasillos): camas, sofás, mesas, clósets, cocina, etc.
const smallKinds = ['lamp', 'plant', 'chair', 'stool', 'pouf', 'speaker', 'towel', 'mirror', 'monitor', 'microwave', 'soundbar', 'screen', 'ac', 'hood', 'curtain', 'blind', 'parasol', 'frame', 'wallshelf', 'coatrack'];
// Los muebles bajos (mesas de centro, bancos, pufs) se rodean, no forman pasillos.
const isLarge = item => blocks(item) && (item.elevation || 0) < .5 && item.h >= .55 && !smallKinds.includes(byId(item.asset)?.kind) && (item.w * item.d >= .35 || Math.max(item.w, item.d) >= 1);
const box = o => {
  const a = o.rotation * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const hx = o.w / 2 * c + o.d / 2 * s, hz = o.w / 2 * s + o.d / 2 * c;
  return { x0: o.x - hx, x1: o.x + hx, z0: o.z - hz, z1: o.z + hz };
};
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
const contains = (r, x, z) => x > r.x - r.w / 2 && x < r.x + r.w / 2 && z > r.z - r.d / 2 && z < r.z + r.d / 2;
const cm = n => `${Math.round(n * 100)} cm`;

export function circulationIssues(project) {
  const issues = [];
  for (const level of levelsOf(project)) {
    const view = onLevel(project, level.id), t = project.wallThickness / 2;
    // Un espacio unido a otro (forma en L) cuenta como uno solo para buscar pasillos.
    const area = item => {
      const room = view.rooms.find(r => contains(r, item.x, item.z));
      return room ? room.join || room.id : null;
    };
    const large = view.items.filter(isLarge);
    for (let i = 0; i < large.length; i++) for (let j = i + 1; j < large.length; j++) {
      const a = large[i], b = large[j];
      if (!area(a) || area(a) !== area(b)) continue;
      const p = box(a), q = box(b);
      const gx = Math.max(q.x0 - p.x1, p.x0 - q.x1), gz = Math.max(q.z0 - p.z1, p.z0 - q.z1);
      const oz = overlap(p.z0, p.z1, q.z0, q.z1), ox = overlap(p.x0, p.x1, q.x0, q.x1);
      // La línea cruza el paso por el medio del tramo en que los muebles se enfrentan.
      let gap = null, line = null;
      if (oz >= .3) { gap = gx; const z = (Math.max(p.z0, q.z0) + Math.min(p.z1, q.z1)) / 2; line = q.x0 >= p.x1 ? [[p.x1, z], [q.x0, z]] : [[q.x1, z], [p.x0, z]]; }
      else if (ox >= .3) { gap = gz; const x = (Math.max(p.x0, q.x0) + Math.min(p.x1, q.x1)) / 2; line = q.z0 >= p.z1 ? [[x, p.z1], [x, q.z0]] : [[x, q.z1], [x, p.z0]]; }
      if (gap !== null && gap > touching && gap < passageMin) issues.push({ kind: 'passage', level: level.id, items: [a.id, b.id], width: gap, line, text: `Paso angosto entre ${a.name} y ${b.name}: ${cm(gap)}.` });
    }
    for (const item of large) {
      const room = view.rooms.find(r => contains(r, item.x, item.z));
      if (!room) continue;
      const p = box(item), wx0 = room.x - room.w / 2 + t, wx1 = room.x + room.w / 2 - t, wz0 = room.z - room.d / 2 + t, wz1 = room.z + room.d / 2 - t;
      const sides = [[p.x0 - wx0, wx0 - .1, item.z, [[wx0, item.z], [p.x0, item.z]]], [wx1 - p.x1, wx1 + .1, item.z, [[p.x1, item.z], [wx1, item.z]]],
        [p.z0 - wz0, item.x, wz0 - .1, [[item.x, wz0], [item.x, p.z0]]], [wz1 - p.z1, item.x, wz1 + .1, [[item.x, p.z1], [item.x, wz1]]]];
      for (const [gap, x, z, line] of sides) {
        if (gap <= touching || gap >= passageMin) continue;
        // Sin muro de ese lado (espacio unido), no hay pasillo contra la pared.
        if (room.join && view.rooms.some(r => r.id !== room.id && r.join === room.join && contains(r, x, z))) continue;
        issues.push({ kind: 'passage', level: level.id, items: [item.id], width: gap, line, text: `Paso angosto entre ${item.name} y la pared: ${cm(gap)}.` });
      }
    }
    for (const door of view.items.filter(isDoor)) {
      const hit = doorBlockers(door, view);
      if (hit.length) issues.push({ kind: 'door', level: level.id, items: [door.id, ...hit.map(o => o.id)], text: `${door.name} choca con ${hit.map(o => o.name).join(', ')} al abrirse.` });
    }
  }
  return issues;
}
