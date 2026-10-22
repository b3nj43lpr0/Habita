// Aspiradora robot de la maqueta. Igual que los demás equipos, su estado se guarda por objeto en
// el archivo .habita; vinculada a un vacuum.* real, la maqueta muestra lo que hace el robot.
// Estados de Home Assistant: limpiando, en pausa, detenida, volviendo a la base y en la base.
export const isVacuum = item => item?.asset === 'vacuum';
export const vacuumStates = ['cleaning', 'paused', 'idle', 'returning', 'docked'];
export const vacuumNames = { cleaning: 'Limpiando', paused: 'En pausa', idle: 'Detenida', returning: 'Volviendo a la base', docked: 'En la base' };
export const defaultVacuum = Object.freeze({ status: 'docked' });
export const vacuumFor = item => ({ ...defaultVacuum, ...item.vacuum });
export const validVacuum = state => !!state && typeof state === 'object' && vacuumStates.includes(state.status);
// Activa mientras recorre la casa (limpiando o volviendo a la base).
export const vacuumBusy = state => ['cleaning', 'returning'].includes(state.status);
