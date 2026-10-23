import * as THREE from 'three';
import { onLevel, inRoom } from '../model/levels.js';
import { isOpening } from '../model/catalog.js';
import { doorSwing, isDoor, circulationIssues } from '../model/circulation.js';

// Cotas del plano 2D, dibujadas en SVG sobre la maqueta y recalculadas con la cámara:
// - fuera de la casa, arriba y a la izquierda: una cadena con cada tramo entre muros y el total;
// - el objeto elegido: sus medidas y la distancia libre hasta cada muro de su habitación, que es lo
//   que importa para comprobar pasos y holguras mientras se arrastra.
// La habitación elegida ya muestra sus medidas en sus tiradores (scene.js).
const number = n => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
export const dimLabel = n => `${number(Math.round(n * 100) / 100)} m`;
const storageKey = 'habita-dimensions';

// Cotas en metros sobre el suelo: { a: [x, z], b: [x, z], text, kind }. gap es la separación entre
// cadenas y objeto, en metros (depende del zoom, para que en pantalla se vea siempre igual).
export function planDimensions(view, wallThickness, item, gap = .5) {
  const out = [];
  const dim = (a, b, value, kind) => out.push({ a, b, text: dimLabel(value), kind });
  if (view.rooms.length) {
    // Medidas a ejes de muro, como las de cada habitación: los tramos suman el total.
    const minX = Math.min(...view.rooms.map(r => r.x - r.w / 2)), maxX = Math.max(...view.rooms.map(r => r.x + r.w / 2));
    const minZ = Math.min(...view.rooms.map(r => r.z - r.d / 2)), maxZ = Math.max(...view.rooms.map(r => r.z + r.d / 2));
    const edges = (values, lo, hi) => [...new Set([lo, ...values.map(v => Math.round(v * 1000) / 1000), hi])].filter(v => v >= lo && v <= hi).sort((a, b) => a - b);
    const xs = edges(view.rooms.flatMap(r => [r.x - r.w / 2, r.x + r.w / 2]), minX, maxX);
    const zs = edges(view.rooms.flatMap(r => [r.z - r.d / 2, r.z + r.d / 2]), minZ, maxZ);
    const chain = (list, place) => list.length > 2 && list.slice(1).forEach((v, i) => { if (v - list[i] > .05) dim(...place(list[i], v), v - list[i], 'chain'); });
    chain(xs, (a, b) => [[a, minZ - gap], [b, minZ - gap]]);
    chain(zs, (a, b) => [[minX - gap, a], [minX - gap, b]]);
    dim([minX, minZ - gap * 2], [maxX, minZ - gap * 2], maxX - minX, 'total');
    dim([minX - gap * 2, minZ], [minX - gap * 2, maxZ], maxZ - minZ, 'total');
  }
  if (item) {
    const a = item.rotation * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const hx = item.w / 2 * c + item.d / 2 * s, hz = item.w / 2 * s + item.d / 2 * c;
    const x0 = item.x - hx, x1 = item.x + hx, z0 = item.z - hz, z1 = item.z + hz, near = gap / 2;
    dim([x0, z1 + near], [x1, z1 + near], x1 - x0, 'focus');
    dim([x1 + near, z0], [x1 + near, z1], z1 - z0, 'focus');
    // Distancias libres hasta la cara interior de cada muro (las aberturas están en el muro).
    const host = !isOpening(item) && view.rooms.find(r => inRoom(item, r));
    if (host) {
      const t = wallThickness / 2;
      const wx0 = host.x - host.w / 2 + t, wx1 = host.x + host.w / 2 - t, wz0 = host.z - host.d / 2 + t, wz1 = host.z + host.d / 2 - t;
      // Corridas a un cuarto del objeto para no cruzar el texto de sus medidas, que va al centro.
      const cx = x0 + (x1 - x0) / 4, cz = z0 + (z1 - z0) / 4;
      for (const [p, q] of [[[wx0, cz], [x0, cz]], [[x1, cz], [wx1, cz]], [[cx, wz0], [cx, z0]], [[cx, z1], [cx, wz1]]]) {
        const free = q[0] - p[0] + q[1] - p[1];
        if (free > .02) dim(p, q, free, 'clearance');
      }
    }
  }
  return out;
}

export function createDimensions(ctx) {
  const { state } = ctx;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'dimensions';
  svg.setAttribute('aria-hidden', 'true');
  document.querySelector('#room-labels').after(svg);
  let enabled = true, last = null;
  try { enabled = localStorage.getItem(storageKey) !== 'off'; } catch {}

  const button = document.querySelector('#dimensions-toggle');
  function paintButton() {
    button.hidden = state.view !== '2d';
    document.querySelector('#measure-tool').hidden = state.view !== '2d';
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? 'Ocultar cotas' : 'Mostrar cotas';
  }
  button.onclick = () => {
    enabled = !enabled;
    try { localStorage.setItem(storageKey, enabled ? 'on' : 'off'); } catch {}
    paintButton();
    if (last) render(...last);
  };

  function render(camera, rect) {
    last = [camera, rect];
    paintButton();
    // La huincha se ve aunque las cotas estén ocultas.
    const measures = [state.measure, state.measurePreview].filter(Boolean).map(({ a, b }) => ({ a: [a.x, a.z], b: [b.x, b.z], text: dimLabel(Math.hypot(b.x - a.x, b.z - a.z)), kind: 'measure' }));
    svg.style.display = state.view === '2d' && !state.control ? '' : 'none';
    if (svg.style.display) return;
    const view = onLevel(state.project, state.level);
    const at = (x, z) => {
      const p = new THREE.Vector3(x, 0, z).project(camera);
      return [(p.x + 1) * rect.width / 2, (-p.y + 1) * rect.height / 2];
    };
    // Metros a píxeles en esta vista (la cámara 2D mira desde arriba, sin perspectiva).
    const scale = Math.hypot(...at(1, 0).map((v, i) => v - at(0, 0)[i]));
    const item = state.selection.length < 2 ? view.items.find(o => o.id === state.selected) : null;
    const parts = [];
    // Arco de cada puerta: por dónde barre la hoja al abrirse (siempre visible en el plano).
    for (const door of view.items.filter(isDoor)) {
      const { hinge, arc } = doorSwing(door), points = arc.map(p => at(...p)), [hx, hy] = at(...hinge), [lx, ly] = points.at(-1);
      parts.push(`<path class="door-swing" d="M${hx} ${hy} L${lx} ${ly} M${points.map(p => p.join(' ')).join(' L')}"/>`);
    }
    // Revisión de circulación: los pasos angostos en rojo, con su ancho.
    const issues = state.circulation ? circulationIssues(state.project).filter(i => i.level === state.level && i.line) : [];
    const lines = [...(enabled ? planDimensions(view, state.project.wallThickness, item, 26 / scale) : []), ...measures,
      ...issues.map(i => ({ a: i.line[0], b: i.line[1], text: dimLabel(i.width), kind: 'issue' }))];
    for (const { a, b, text, kind } of lines) {
      const [x1, y1] = at(...a), [x2, y2] = at(...b), length = Math.hypot(x2 - x1, y2 - y1);
      if (length < 6) continue;
      // Línea con remates perpendiculares y el texto centrado sobre ella (si cabe).
      const nx = (y1 - y2) / length * 5, ny = (x2 - x1) / length * 5;
      parts.push(`<g class="dim ${kind}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` +
        `<line x1="${x1 - nx}" y1="${y1 - ny}" x2="${x1 + nx}" y2="${y1 + ny}"/><line x1="${x2 - nx}" y1="${y2 - ny}" x2="${x2 + nx}" y2="${y2 + ny}"/>`);
      if (length > text.length * 6.5 + 10) {
        let angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        if (angle > 90 || angle < -90) angle += 180;
        const w = text.length * 6.4 + 10;
        parts.push(`<g transform="translate(${(x1 + x2) / 2} ${(y1 + y2) / 2}) rotate(${angle})"><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="9"/><text y="4">${text}</text></g>`);
      }
      parts.push('</g>');
    }
    svg.innerHTML = parts.join('');
  }

  return { render, refresh: () => last && render(...last) };
}
