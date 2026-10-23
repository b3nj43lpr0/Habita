// Calculadora de materiales: con las medidas de cada espacio estima el piso a comprar (con un
// margen por cortes), la pintura de los muros (descontando puertas y ventanas) y el guardapolvo
// (sin el ancho de las puertas). Con precios, el total se suma a la lista de compras.
import { isOpening, byId } from './catalog.js';
import { levelOf, levelsOf, sameLevel } from './levels.js';

// Terminaciones de piso: cambian la textura en la maqueta y el nombre en la lista.
export const floorFinishes = [
  ['wood', 'Piso de madera'], ['laminate', 'Piso flotante'], ['tile', 'Cerámica'], ['porcelain', 'Porcelanato'],
  ['carpet', 'Alfombra'], ['concrete', 'Cemento pulido'], ['deck', 'Deck exterior'], ['grass', 'Pasto']
];
export const floorName = id => (floorFinishes.find(([key]) => key === id) || floorFinishes[0])[1];
export const validFloor = value => value === undefined || floorFinishes.some(([key]) => key === value);

export const materialDefaults = Object.freeze({ coats: 2, waste: 10, paintYield: 10 });
const priceKeys = ['floorPrice', 'paintPrice', 'skirtingPrice'];
const num = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export function validMaterials(m) {
  if (m === undefined) return true;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  return Object.keys(m).every(k => ['coats', 'waste', 'paintYield', ...priceKeys].includes(k)) &&
    (m.coats === undefined || [1, 2, 3].includes(m.coats)) && (m.waste === undefined || num(m.waste, 0, 50)) &&
    (m.paintYield === undefined || num(m.paintYield, 4, 20)) && priceKeys.every(k => m[k] === undefined || num(m[k], 0, 1e8));
}
export const materialSettings = project => ({ ...materialDefaults, ...project.materials });

const round2 = n => Math.round(n * 100) / 100;
// Largo de un borde de la habitación que comparte con otra del mismo espacio unido (no lleva muro).
function joinedLength(project, room) {
  if (!room.join) return 0;
  const x0 = room.x - room.w / 2, x1 = room.x + room.w / 2, z0 = room.z - room.d / 2, z1 = room.z + room.d / 2;
  let length = 0;
  for (const r of project.rooms) {
    if (r.id === room.id || r.join !== room.join || !sameLevel(r, room)) continue;
    const rx0 = r.x - r.w / 2, rx1 = r.x + r.w / 2, rz0 = r.z - r.d / 2, rz1 = r.z + r.d / 2;
    const along = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    if (Math.abs(x1 - rx0) < .001 || Math.abs(x0 - rx1) < .001) length += along(z0, z1, rz0, rz1);
    if (Math.abs(z1 - rz0) < .001 || Math.abs(z0 - rz1) < .001) length += along(x0, x1, rx0, rx1);
  }
  return length;
}
// Puertas y ventanas insertas en algún muro de la habitación.
function roomOpenings(project, room) {
  const t = project.wallThickness / 2 + .02;
  const x0 = room.x - room.w / 2, x1 = room.x + room.w / 2, z0 = room.z - room.d / 2, z1 = room.z + room.d / 2;
  return project.items.filter(o => isOpening(o) && sameLevel(o, room) && (
    ((Math.abs(o.z - z0) < t || Math.abs(o.z - z1) < t) && o.x > x0 && o.x < x1) ||
    ((Math.abs(o.x - x0) < t || Math.abs(o.x - x1) < t) && o.z > z0 && o.z < z1)));
}

export function materialEstimate(project) {
  const s = materialSettings(project), levels = levelsOf(project);
  const rows = project.rooms.map(room => {
    const perimeter = 2 * (room.w + room.d) - joinedLength(project, room);
    const openings = roomOpenings(project, room);
    const doors = openings.filter(o => byId(o.asset).kind === 'door');
    const floor = room.w * room.d;
    const walls = Math.max(0, perimeter * project.wallHeight - openings.reduce((n, o) => n + o.w * o.h, 0));
    return {
      id: room.id, name: room.name, level: levels.length > 1 ? levels.find(l => l.id === levelOf(room))?.name : null,
      finish: floorName(room.floor), floor: round2(floor), floorBuy: round2(floor * (1 + s.waste / 100)),
      walls: round2(walls), paint: round2(walls * s.coats / s.paintYield),
      skirting: round2(Math.max(0, perimeter - doors.reduce((n, o) => n + o.w, 0)))
    };
  });
  const sum = key => round2(rows.reduce((n, r) => n + r[key], 0));
  const totals = { floor: sum('floor'), floorBuy: sum('floorBuy'), walls: sum('walls'), paint: sum('paint'), skirting: sum('skirting') };
  const cost = {
    floor: s.floorPrice !== undefined ? Math.round(totals.floorBuy * s.floorPrice) : undefined,
    paint: s.paintPrice !== undefined ? Math.round(Math.ceil(totals.paint) * s.paintPrice) : undefined,
    skirting: s.skirtingPrice !== undefined ? Math.round(totals.skirting * s.skirtingPrice) : undefined
  };
  return { settings: s, rows, totals, cost };
}

// Filas para la lista de compras (solo las que tienen precio).
export function materialRows(project) {
  if (!project.rooms.length) return [];
  const { totals, cost } = materialEstimate(project);
  const fmt = n => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
  return [
    ['floor', 'Piso', `${fmt(totals.floorBuy)} m² con margen`],
    ['paint', 'Pintura de muros', `${Math.ceil(totals.paint)} L`],
    ['skirting', 'Guardapolvo', `${fmt(totals.skirting)} m`]
  ].filter(([key]) => cost[key] !== undefined).map(([key, name, size]) => ({ id: `material-${key}`, name, room: 'Materiales', size, price: cost[key], material: true }));
}
