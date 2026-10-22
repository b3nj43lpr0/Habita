// Pisos de la casa. Cada habitación y objeto pertenece a un piso por `level`; sin ese campo es
// el primer piso ('base'), así los proyectos anteriores a 0.7.0 siguen igual. Un piso se trabaja
// como una vista del proyecto con solo sus habitaciones y objetos, para que paredes, alertas y
// recorrido funcionen piso por piso sin cambios.
export const baseLevel = 'base';
export const levelLimit = 8;
export const levelsOf = project => project.levels?.length ? project.levels : [{ id: baseLevel, name: 'Primer piso' }];
export const levelOf = o => o?.level || baseLevel;
export const sameLevel = (a, b) => levelOf(a) === levelOf(b);
// Entre pisos: la altura de las paredes más 20 cm de losa.
export const levelGap = project => project.wallHeight + .2;
export const levelElevation = (project, id) => Math.max(0, levelsOf(project).findIndex(l => l.id === id)) * levelGap(project);
export const onLevel = (project, id) => ({ ...project, rooms: project.rooms.filter(r => levelOf(r) === id), items: project.items.filter(i => levelOf(i) === id) });
export const inRoom = (item, room) => sameLevel(item, room) &&
  item.x >= room.x - room.w / 2 && item.x <= room.x + room.w / 2 && item.z >= room.z - room.d / 2 && item.z <= room.z + room.d / 2;

export function validLevels(levels) {
  if (levels === undefined) return true;
  if (!Array.isArray(levels) || !levels.length || levels.length > levelLimit || levels[0]?.id !== baseLevel) return false;
  const ids = new Set();
  return levels.every(l => l && typeof l.id === 'string' && /^[\w-]{1,60}$/.test(l.id) && !ids.has(l.id) && ids.add(l.id) &&
    typeof l.name === 'string' && l.name.trim() && l.name.length <= 60);
}
