// Estado de un aire acondicionado de la maqueta. Igual que las luces, se guarda por objeto
// en el archivo .habita; cuando está vinculado a un equipo real, la maqueta muestra su estado.
import { inRoom } from '../model/levels.js';
export const isClimate = item => item?.asset === 'ac';
export const climateModes = ['cool', 'heat', 'dry', 'fan', 'auto'];
export const fanSpeeds = ['auto', 'low', 'medium', 'high'];
export const modeNames = { cool: 'Frío', heat: 'Calor', dry: 'Seco', fan: 'Ventilar', auto: 'Auto' };
export const fanNames = { auto: 'Auto', low: 'Baja', medium: 'Media', high: 'Alta' };
export const modeColors = { cool: '#5db2ff', heat: '#ff8c3a', dry: '#62e0cf', fan: '#cfdcff', auto: '#9bd28a' };
export const climateRange = { min: 16, max: 30, step: .5 };
export const defaultClimate = Object.freeze({ on: false, mode: 'cool', target: 23, fan: 'auto', swing: false });

export const climateFor = item => ({ ...defaultClimate, ...item.climate });

export function validClimate(state) {
  return !!state && typeof state === 'object' && typeof state.on === 'boolean' &&
    climateModes.includes(state.mode) && fanSpeeds.includes(state.fan) && (state.swing === undefined || typeof state.swing === 'boolean') &&
    typeof state.target === 'number' && Number.isFinite(state.target) && state.target >= 10 && state.target <= 35;
}

export function climateInRoom(project, room) {
  return project.items.filter(item => isClimate(item) && inRoom(item, room));
}
