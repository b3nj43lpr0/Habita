// Lista de compras y presupuesto: cada mueble puede llevar un precio (en pesos) y un enlace a la
// tienda. La lista se agrupa por espacio, suma el total y se exporta como CSV para planillas.
import { byId, isOpening } from './catalog.js';
import { inRoom } from './levels.js';

export const validPrice = n => n === undefined || (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e10);
export const validLink = url => url === undefined || (typeof url === 'string' && url.length <= 500 && /^https?:\/\/[^\s]+$/i.test(url));
export const money = n => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

// Muebles y equipos de la casa (sin puertas, ventanas ni escaleras), con su espacio.
export function shoppingList(project) {
  const rows = project.items.filter(item => !isOpening(item) && byId(item.asset)?.kind !== 'stairs').map(item => ({
    id: item.id, name: item.name, room: project.rooms.find(r => inRoom(item, r))?.name || 'Sin espacio',
    size: `${fmt(item.w)} × ${fmt(item.d)} × ${fmt(item.h)} m`, price: item.price, link: item.link
  })).sort((a, b) => a.room.localeCompare(b.room, 'es') || a.name.localeCompare(b.name, 'es'));
  const priced = rows.filter(r => r.price !== undefined);
  return { rows, total: priced.reduce((n, r) => n + r.price, 0), missing: rows.length - priced.length };
}
const fmt = n => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

// CSV con punto y coma (lo que espera Excel en español) y comillas cuando hacen falta.
export function shoppingCsv(list) {
  const cell = value => { const text = String(value ?? ''); return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  const lines = [['Espacio', 'Objeto', 'Medidas', 'Precio (CLP)', 'Enlace'], ...list.rows.map(r => [r.room, r.name, r.size, r.price ?? '', r.link ?? '']), ['', 'Total', '', list.total, '']];
  return '﻿' + lines.map(line => line.map(cell).join(';')).join('\r\n');
}
