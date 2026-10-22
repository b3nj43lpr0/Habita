// Versiones de la distribución («Opción A», «Opción B»): una copia con nombre de los espacios, los
// muebles, los pisos y las notas, guardada dentro del mismo proyecto. No incluye escenas,
// automatizaciones ni la imagen del plano (que es de toda la casa y pesa mucho).
import { shoppingList } from './shopping.js';

export const versionLimit = 10;
const layoutKeys = ['rooms', 'items', 'levels', 'notes', 'wallHeight', 'wallThickness'];
const copy = value => JSON.parse(JSON.stringify(value));

export function captureVersion(project, name, date = new Date()) {
  const layout = Object.fromEntries(layoutKeys.filter(key => project[key] !== undefined).map(key => [key, copy(project[key])]));
  return { id: crypto.randomUUID(), name: name.trim().slice(0, 60), created: date.toISOString(), ...layout };
}

// Devuelve el proyecto con la distribución de la versión (lo demás se conserva).
export function restoreVersion(project, version) {
  const next = copy(project);
  for (const key of layoutKeys) { if (version[key] === undefined) delete next[key]; else next[key] = copy(version[key]); }
  return next;
}

export function versionStats(layout) {
  return { area: layout.rooms.reduce((n, r) => n + r.w * r.d, 0), rooms: layout.rooms.length, items: layout.items.length, budget: shoppingList({ rooms: layout.rooms, items: layout.items }).total };
}

// Validación de forma; el contenido de cada versión se valida como un proyecto (model.js).
export function validVersionsShape(versions) {
  if (versions === undefined) return true;
  if (!Array.isArray(versions) || versions.length > versionLimit) return false;
  const ids = new Set();
  return versions.every(v => {
    if (!v || typeof v.id !== 'string' || ids.has(v.id)) return false;
    ids.add(v.id);
    return typeof v.name === 'string' && !!v.name.trim() && v.name.length <= 60 && typeof v.created === 'string' &&
      !Number.isNaN(Date.parse(v.created)) && Array.isArray(v.rooms) && Array.isArray(v.items);
  });
}
