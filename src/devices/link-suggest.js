// Vincular por habitación: propone qué dispositivo de Home Assistant corresponde a cada objeto de la
// maqueta, comparando el área del dispositivo con la habitación del objeto y las palabras de sus
// nombres (como «añadir varios dispositivos a una habitación» de house-control, MIT).
import { inRoom } from '../model/levels.js';

const plain = text => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
const ignored = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'en', 'luz', 'lampara', 'equipo']);
const words = text => new Set(plain(text).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !ignored.has(w)));
// Dos nombres de lugar coinciden si uno contiene al otro («Living» y «Living y comedor»).
const sameArea = (a, b) => { const x = plain(a).trim(), y = plain(b).trim(); return !!x && !!y && (x.includes(y) || y.includes(x)); };

export function linkScore(item, room, device) {
  let score = room && device.area && sameArea(room.name, device.area) ? 2 : 0;
  const name = words(device.name);
  for (const w of words(item.name)) if (name.has(w)) score += 1;
  // El nombre del dispositivo suele empezar con la habitación («Living · techo»).
  if (room && !device.area && [...words(room.name)].some(w => name.has(w))) score += 1;
  return score;
}

// { [itemId]: entityId } para los objetos sin vínculo; cada dispositivo se propone una sola vez y
// solo con evidencia suficiente (misma área, o área y nombre, o dos palabras en común).
export function suggestLinks(project, devices, kindFor, bindings = {}) {
  const taken = new Set(Object.values(bindings));
  const options = [];
  for (const item of project.items) {
    const kind = kindFor(item);
    if (!kind || bindings[item.id]) continue;
    const room = project.rooms.find(r => inRoom(item, r));
    for (const device of devices) {
      if (device.kind !== kind || taken.has(device.entityId)) continue;
      const score = linkScore(item, room, device);
      if (score >= 2) options.push({ item: item.id, entity: device.entityId, score });
    }
  }
  const result = {}, used = new Set();
  for (const option of options.sort((a, b) => b.score - a.score)) {
    if (result[option.item] || used.has(option.entity)) continue;
    result[option.item] = option.entity;
    used.add(option.entity);
  }
  return result;
}
