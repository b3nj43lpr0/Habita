// Estado de un televisor de la maqueta. Igual que las luces y los aires, se guarda por objeto en
// el archivo .habita; vinculado a un media_player real, la maqueta muestra su estado.
import { inRoom } from '../model/levels.js';
export const isTv = item => ['tv', 'tv-wall'].includes(item?.asset);
export const defaultTv = Object.freeze({ on: false, volume: 25, muted: false, source: '' });
export const tvFor = item => ({ ...defaultTv, ...item.tv });

export function validTv(state) {
  return !!state && typeof state === 'object' && typeof state.on === 'boolean' && typeof state.muted === 'boolean' &&
    typeof state.volume === 'number' && Number.isFinite(state.volume) && state.volume >= 0 && state.volume <= 100 &&
    typeof state.source === 'string' && state.source.length <= 80;
}

export function tvsInRoom(project, room) {
  return project.items.filter(item => isTv(item) && inRoom(item, room));
}
