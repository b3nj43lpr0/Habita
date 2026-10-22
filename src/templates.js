// Casas para empezar («Nueva casa»), como los planos de demostración de house-control (MIT):
// la casa de ejemplo, un departamento, un estudio, una sola habitación o un plano vacío. Las
// puertas y ventanas se ajustan a su muro con alignOpening, igual que al ponerlas a mano.
import { makeItem } from './catalog.js';
import { exampleProject, alignOpening } from './model.js';

const room = (id, name, x0, z0, x1, z1, color) => ({ id, name, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, color });

function build(name, rooms, place) {
  const project = { version: 1, name, wallHeight: 2.6, wallThickness: .14, rooms, items: [] };
  const add = (id, x, z, rotation = 0, extra = {}) => {
    const item = { ...makeItem(id, x, z), rotation, ...extra };
    project.items.push(item);
    if (['door', 'window'].includes(id)) alignOpening(item, project);
    return item;
  };
  place(add);
  return project;
}

function apartment() {
  return build('Departamento', [
    room('living', 'Living, comedor y cocina', -5, -.5, 4, 3.5, '#c5ad8e'),
    room('bedroom', 'Dormitorio principal', -5, -4.5, -1.5, -.5, '#b5a68e'),
    room('hall', 'Pasillo', -1.5, -2, .5, -.5, '#bfb09b'),
    room('bathroom', 'Baño', -1.5, -4.5, .5, -2, '#a7b9b3'),
    room('bedroom-2', 'Dormitorio', .5, -4.5, 4, -.5, '#b9ab93')
  ], add => {
    add('rug', -3, 1.7, 0, { w: 2.7, d: 1.9 }); add('sofa', -3, .45); add('coffee', -3, 1.65); add('tv-wall', -3, 3.4, 180);
    add('floor-lamp', -4.6, .1); add('plant', -4.6, 3.1);
    add('dining', .1, 1.5, 0, { w: 1.4 }); add('chair', -.3, .75); add('chair', .5, .75); add('chair', -.3, 2.25, 180); add('chair', .5, 2.25, 180);
    add('fridge', 1.88, 3.1); add('kitchen', 2.76, 3.15); add('sink', 3.56, 3.15, 0, { w: .68 }); add('stove', 2.75, .15, 180);
    add('bed', -3.25, -3.45, 0, { w: 1.5 }); add('nightstand', -4.35, -4.2); add('nightstand', -2.15, -4.2); add('wardrobe', -4.65, -1.7, 90, { w: 1.8 });
    add('bed', 2.95, -3.5, 0, { w: .9, d: 1.9 }); add('desk', 1.3, -1, 180, { w: 1.2 }); add('office-chair', 1.3, -1.75);
    add('toilet', -1.1, -4.05); add('shower', -.05, -4.05, 0, { w: .8, d: .8 }); add('vanity', -.95, -2.35, 180, { w: .7 });
    add('door', -.5, -.5); add('door', -1.5, -1.25, 90); add('door', .5, -1.25, 90); add('door', -.5, -2); add('door', -4.2, 3.5);
    add('window', -2, 3.5); add('window', 4, 1.5, 90); add('window', -3.25, -4.5); add('window', 2.25, -4.5);
  });
}

function studio() {
  return build('Estudio', [
    room('main', 'Estudio', -3, -2, 2, 2, '#c5ad8e'),
    room('bathroom', 'Baño', 2, -2, 4, .5, '#a7b9b3'),
    room('entry', 'Acceso', 2, .5, 4, 2, '#bfb09b')
  ], add => {
    add('bed', -1.8, -.95, 0, { w: 1.4, d: 1.9 }); add('nightstand', -2.72, -1.7, 0, { w: .4 });
    add('sofa', -1.8, 1.55, 180, { w: 1.6 }); add('coffee', -1.8, .7, 0, { w: .8, d: .5 });
    add('kitchen', .55, 1.7); add('sink', 1.4, 1.7, 0, { w: .6 }); add('fridge', 1.6, -1.6);
    add('round', .4, -.2, 0, { w: .7, d: .7 }); add('stool', -.2, -.2); add('stool', 1, -.2);
    add('floor-lamp', -2.65, .6); add('plant-small', -.2, -1.7);
    add('toilet', 3.6, -1.55); add('shower', 2.5, -1.5, 0, { w: .8, d: .8 }); add('vanity', 3.65, -.4, 90, { w: .6 });
    add('door', 3, .5); add('door', 2, 1.25, 90); add('door', 3, 2);
    add('window', -.5, -2); add('window', -3, .3, 90);
  });
}

function singleRoom() {
  return build('Mi habitación', [room('room', 'Habitación', -2, -2, 2, 2, '#c5ad8e')], add => {
    add('door', 1.2, 2); add('window', 0, -2);
  });
}

export const templates = [
  { id: 'example', name: 'Casa de ejemplo', detail: '5 espacios amoblados · 78 m²', make: exampleProject },
  { id: 'apartment', name: 'Departamento', detail: '2 dormitorios · 72 m²', make: apartment },
  { id: 'studio', name: 'Estudio', detail: 'Un ambiente con baño · 28 m²', make: studio },
  { id: 'room', name: 'Una habitación', detail: '4 × 4 m, sin muebles', make: singleRoom },
  { id: 'empty', name: 'Plano vacío', detail: 'Dibuja tus espacios desde cero', make: () => build('Nueva casa', [], () => {}) }
];

// Miniatura en SVG con los espacios de la plantilla, para el diálogo «Nueva casa».
export function templatePreview(project) {
  if (!project.rooms.length) return '<svg viewBox="0 0 100 70" aria-hidden="true"><rect x="12" y="10" width="76" height="50" rx="6" fill="none" stroke="currentColor" stroke-dasharray="5 4" opacity=".55"/></svg>';
  const minX = Math.min(...project.rooms.map(r => r.x - r.w / 2)), maxX = Math.max(...project.rooms.map(r => r.x + r.w / 2));
  const minZ = Math.min(...project.rooms.map(r => r.z - r.d / 2)), maxZ = Math.max(...project.rooms.map(r => r.z + r.d / 2));
  const k = Math.min(84 / (maxX - minX), 58 / (maxZ - minZ)), ox = (100 - (maxX - minX) * k) / 2, oz = (70 - (maxZ - minZ) * k) / 2;
  return `<svg viewBox="0 0 100 70" aria-hidden="true">${project.rooms.map(r => `<rect x="${ox + (r.x - r.w / 2 - minX) * k}" y="${oz + (r.z - r.d / 2 - minZ) * k}" width="${r.w * k}" height="${r.d * k}" fill="${r.color}" stroke="#f4ede2" stroke-width="1.4"/>`).join('')}</svg>`;
}
