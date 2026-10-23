// Informe para imprimir o guardar en PDF: plano de cada piso con medidas, puertas y muebles,
// tabla de espacios, revisión de circulación, materiales y lista de compras. Es HTML autónomo
// (sin scripts ni archivos externos) que la app de escritorio convierte a PDF.
import { byId, isOpening } from './catalog.js';
import { corners, totalArea, wallsFor, wallPieces } from './model.js';
import { levelsOf, onLevel } from './levels.js';
import { doorSwing, isDoor, circulationIssues } from './circulation.js';
import { materialEstimate, floorName } from './materials.js';
import { shoppingList, money } from './shopping.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const cm = n => Math.round(n * 100);

// Plano de un piso en SVG, en centímetros.
export function planSvg(project, levelId, { north } = {}) {
  const view = onLevel(project, levelId);
  const points = [...view.rooms.flatMap(r => [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2]]), ...view.items.flatMap(corners)];
  if (!points.length) return '';
  const pad = 1.3, minX = Math.min(...points.map(p => p[0])) - pad, maxX = Math.max(...points.map(p => p[0])) + pad;
  const minZ = Math.min(...points.map(p => p[1])) - pad, maxZ = Math.max(...points.map(p => p[1])) + pad;
  const w = maxX - minX, h = maxZ - minZ, t = project.wallThickness;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cm(minX)} ${cm(minZ)} ${cm(w)} ${cm(h)}" class="plan">`];
  for (const r of view.rooms) out.push(`<rect x="${cm(r.x - r.w / 2)}" y="${cm(r.z - r.d / 2)}" width="${cm(r.w)}" height="${cm(r.d)}" fill="${esc(r.color)}" fill-opacity=".28"/>`);
  // Muros: solo los tramos que llegan al suelo (los huecos de puertas y ventanas quedan abiertos).
  for (const wall of wallsFor(view)) for (const p of wallPieces(wall, view).filter(p => p.bottom === 0)) {
    const [x1, z1, x2, z2] = wall.axis === 'x' ? [p.a, wall.c, p.b, wall.c] : [wall.c, p.a, wall.c, p.b];
    out.push(`<line x1="${cm(x1)}" y1="${cm(z1)}" x2="${cm(x2)}" y2="${cm(z2)}" stroke="#2b2f36" stroke-width="${cm(t)}" stroke-linecap="square"/>`);
  }
  for (const item of view.items) {
    const kind = byId(item.asset)?.kind, poly = corners(item).map(p => `${cm(p[0])},${cm(p[1])}`).join(' ');
    if (kind === 'window') { out.push(`<polygon points="${poly}" fill="#dff1f6" stroke="#2b2f36" stroke-width="2"/>`); continue; }
    if (isDoor(item)) {
      const { hinge, arc, leaf } = doorSwing(item);
      out.push(`<path d="M${cm(hinge[0])} ${cm(hinge[1])} L${cm(leaf[0])} ${cm(leaf[1])} M${arc.map(p => `${cm(p[0])} ${cm(p[1])}`).join(' L')}" fill="none" stroke="#7a5b3d" stroke-width="2"/>`);
      continue;
    }
    if (isOpening(item)) continue;
    const wallLike = ['partition', 'fence'].includes(kind);
    out.push(`<polygon points="${poly}" fill="${wallLike ? '#2b2f36' : '#ffffff'}" fill-opacity="${wallLike ? 1 : .85}" stroke="#56606c" stroke-width="1.5"/>`);
    const big = Math.min(item.w, item.d) > .45 && item.w * item.d > .5;
    if (big && !wallLike) out.push(`<text x="${cm(item.x)}" y="${cm(item.z) + 5}" class="item">${esc(item.name)}</text>`);
  }
  for (const r of view.rooms) out.push(`<text x="${cm(r.x)}" y="${cm(r.z) - 6}" class="room">${esc(r.name)}</text><text x="${cm(r.x)}" y="${cm(r.z) + 16}" class="area">${fmt(Math.round(r.w * r.d * 100) / 100)} m²</text>`);
  // Medidas totales arriba y a la izquierda, y escala de 1 m.
  if (view.rooms.length) {
    const x0 = Math.min(...view.rooms.map(r => r.x - r.w / 2)), x1 = Math.max(...view.rooms.map(r => r.x + r.w / 2));
    const z0 = Math.min(...view.rooms.map(r => r.z - r.d / 2)), z1 = Math.max(...view.rooms.map(r => r.z + r.d / 2));
    const y = cm(z0 - .6), x = cm(x0 - .6);
    out.push(`<g class="dim"><line x1="${cm(x0)}" y1="${y}" x2="${cm(x1)}" y2="${y}"/><line x1="${cm(x0)}" y1="${y - 8}" x2="${cm(x0)}" y2="${y + 8}"/><line x1="${cm(x1)}" y1="${y - 8}" x2="${cm(x1)}" y2="${y + 8}"/><text x="${cm((x0 + x1) / 2)}" y="${y - 8}">${fmt(Math.round((x1 - x0) * 100) / 100)} m</text></g>`);
    out.push(`<g class="dim"><line x1="${x}" y1="${cm(z0)}" x2="${x}" y2="${cm(z1)}"/><line x1="${x - 8}" y1="${cm(z0)}" x2="${x + 8}" y2="${cm(z0)}"/><line x1="${x - 8}" y1="${cm(z1)}" x2="${x + 8}" y2="${cm(z1)}"/><text transform="translate(${x - 10} ${cm((z0 + z1) / 2)}) rotate(-90)">${fmt(Math.round((z1 - z0) * 100) / 100)} m</text></g>`);
    const sx = cm(x1 - 1), sy = cm(z1 + .7);
    out.push(`<g class="dim"><line x1="${sx}" y1="${sy}" x2="${sx + 100}" y2="${sy}" stroke-width="4"/><text x="${sx + 50}" y="${sy - 10}">1 m</text></g>`);
  }
  if (north !== undefined) {
    const cx = cm(maxX - .6), cy = cm(minZ + .7);
    out.push(`<g class="north" transform="translate(${cx} ${cy}) rotate(${north})"><path d="M0 -40 L14 16 L0 6 L-14 16 Z"/><text y="-48">N</text></g>`);
  }
  out.push('</svg>');
  return out.join('');
}

export function reportHtml(project, { image = null, date = new Date() } = {}) {
  const levels = levelsOf(project), issues = circulationIssues(project), materials = materialEstimate(project), list = shoppingList(project);
  const levelName = id => levels.find(l => l.id === id)?.name || '';
  const north = project.sun?.on ? project.sun.north : undefined;
  const plans = levels.map(l => {
    const svg = planSvg(project, l.id, { north });
    return svg ? `<section class="page"><h2>Plano${levels.length > 1 ? ` · ${esc(l.name)}` : ''}</h2>${svg}<p class="note">Medidas en metros, a ejes de muro. Los arcos muestran por dónde abre cada puerta.</p></section>` : '';
  }).join('');
  const rooms = project.rooms.map(r => `<tr><td>${esc(r.name)}</td>${levels.length > 1 ? `<td>${esc(levelName(r.level || 'base'))}</td>` : ''}<td>${fmt(r.w)} × ${fmt(r.d)} m</td><td>${esc(floorName(r.floor))}</td><td class="n">${fmt(Math.round(r.w * r.d * 100) / 100)} m²</td></tr>`).join('');
  const m = materials;
  const groups = [...new Set(list.rows.map(r => r.room))];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(project.name)}</title><style>
  @page{size:A4}
  *{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;color:#22252b;font-size:10.5pt;margin:0}
  h1{font-size:20pt;margin:0 0 2mm}h2{font-size:13pt;margin:0 0 4mm;color:#5a4630}h3{font-size:11pt;margin:5mm 0 2mm}
  .page{page-break-after:always}.page:last-child{page-break-after:auto}
  .meta{color:#6b6f78;margin-bottom:6mm}.stats{display:flex;gap:8mm;margin:4mm 0 6mm}.stats div{border:1px solid #e1d8ca;border-radius:3mm;padding:3mm 5mm}.stats b{display:block;font-size:15pt}
  img.view{width:100%;border-radius:3mm;border:1px solid #e1d8ca}
  svg.plan{width:100%;max-height:220mm;display:block;margin:0 auto}
  svg .room{font-size:22px;font-weight:600;text-anchor:middle;fill:#2b2f36}svg .area{font-size:17px;text-anchor:middle;fill:#5c6370}
  svg .item{font-size:12px;text-anchor:middle;fill:#56606c}svg .dim line{stroke:#8a6a48;stroke-width:2}svg .dim text{font-size:17px;text-anchor:middle;fill:#8a6a48}
  svg .north path{fill:#8a6a48}svg .north text{font-size:20px;text-anchor:middle;font-weight:700;fill:#8a6a48}
  table{width:100%;border-collapse:collapse;margin-bottom:4mm}th,td{text-align:left;padding:1.6mm 2mm;border-bottom:1px solid #ece5da}th{font-size:9pt;color:#6b6f78;font-weight:600}td.n,th.n{text-align:right;white-space:nowrap}
  tr.total td{font-weight:700;border-top:2px solid #c9b79d}
  .ok{color:#2f7d4f}.warn li{margin-bottom:1.5mm}.note{color:#6b6f78;font-size:9pt}
  </style></head><body>
  <section class="page">
   <h1>${esc(project.name)}</h1>
   <div class="meta">Habita Studio · ${esc(date.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
   <div class="stats"><div><b>${fmt(Math.round(totalArea(project) * 100) / 100)} m²</b>Superficie interior</div><div><b>${project.rooms.length}</b>Espacios</div><div><b>${levels.length}</b>${levels.length === 1 ? 'Piso' : 'Pisos'}</div><div><b>${fmt(project.wallHeight)} m</b>Altura de muros</div></div>
   ${image ? `<img class="view" src="${esc(image)}" alt="Maqueta 3D">` : ''}
  </section>
  ${plans}
  <section class="page">
   <h2>Espacios</h2>
   <table><tr><th>Espacio</th>${levels.length > 1 ? '<th>Piso</th>' : ''}<th>Medidas</th><th>Piso</th><th class="n">Superficie</th></tr>${rooms}
    <tr class="total"><td colspan="${levels.length > 1 ? 4 : 3}">Total</td><td class="n">${fmt(Math.round(totalArea(project) * 100) / 100)} m²</td></tr></table>
   <h2>Revisión de circulación</h2>
   ${issues.length ? `<ul class="warn">${issues.map(i => `<li>${esc(i.text)}</li>`).join('')}</ul><p class="note">Se recomiendan al menos 60 cm libres para pasar y que las puertas abran sin chocar.</p>` : '<p class="ok">No se encontraron pasos angostos ni puertas que choquen al abrirse.</p>'}
   <h2>Materiales estimados</h2>
   <table><tr><th>Espacio</th><th>Piso</th><th class="n">Piso a comprar</th><th class="n">Muros a pintar</th><th class="n">Pintura</th><th class="n">Guardapolvo</th></tr>
    ${m.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.finish)}</td><td class="n">${fmt(r.floorBuy)} m²</td><td class="n">${fmt(r.walls)} m²</td><td class="n">${fmt(r.paint)} L</td><td class="n">${fmt(r.skirting)} m</td></tr>`).join('')}
    <tr class="total"><td colspan="2">Total</td><td class="n">${fmt(m.totals.floorBuy)} m²</td><td class="n">${fmt(m.totals.walls)} m²</td><td class="n">${Math.ceil(m.totals.paint)} L</td><td class="n">${fmt(m.totals.skirting)} m</td></tr></table>
   <p class="note">Piso con ${m.settings.waste} % de margen por cortes. Pintura: ${m.settings.coats} ${m.settings.coats === 1 ? 'mano' : 'manos'}, ${m.settings.paintYield} m² por litro, sin puertas ni ventanas.</p>
  </section>
  ${list.rows.length ? `<section class="page"><h2>Lista de compras</h2><table><tr><th>Objeto</th><th>Medidas</th><th class="n">Precio</th></tr>
   ${groups.map(g => `<tr><td colspan="3"><b>${esc(g)}</b></td></tr>${list.rows.filter(r => r.room === g).map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.size)}</td><td class="n">${r.price !== undefined ? money(r.price) : '—'}</td></tr>`).join('')}`).join('')}
   <tr class="total"><td colspan="2">Total${list.missing ? ` (${list.missing} sin precio)` : ''}</td><td class="n">${money(list.total)}</td></tr></table></section>` : ''}
  </body></html>`;
}
