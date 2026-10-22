// Cortinas y persianas de la maqueta: apertura 0-100 (100 = abierta, como Home Assistant). Se guardan
// por objeto en el archivo .habita; vinculadas a un cover.* real, la maqueta muestra su estado.
import { inRoom } from '../model/levels.js';
export const isCover = item => ['curtain', 'blind'].includes(item?.asset);
export const defaultCover = Object.freeze({ position: 100 });
export const coverFor = item => ({ ...defaultCover, ...item.cover });
export const validCover = state => !!state && typeof state === 'object' && typeof state.position === 'number' &&
  Number.isFinite(state.position) && state.position >= 0 && state.position <= 100;
export const coversInRoom = (project, room) => project.items.filter(item => isCover(item) && inRoom(item, room));
