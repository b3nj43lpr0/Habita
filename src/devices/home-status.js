// Resumen corto del estado de la casa para la bandeja de Windows (y otros resúmenes): cuántas luces
// están encendidas y a qué temperatura funciona el aire, como el ícono de house-control (MIT).
import { isLamp, lightFor } from './lighting.js';
import { isClimate, climateFor } from './climate.js';

const degrees = n => `${Number(n).toLocaleString('es-CL', { maximumFractionDigits: 1 })}°`;

export function homeStatus(project) {
  const lamps = project.items.filter(isLamp);
  const lit = lamps.filter(item => lightFor(item).on && lightFor(item).brightness > 0).length;
  const running = project.items.filter(item => isClimate(item) && climateFor(item).on);
  const parts = [];
  if (lamps.length) parts.push(lit ? `${lit} de ${lamps.length} ${lamps.length === 1 ? 'luz encendida' : 'luces encendidas'}` : 'Luces apagadas');
  if (running.length) parts.push(`Aire ${degrees(climateFor(running[0]).target)}${running.length > 1 ? ` (+${running.length - 1})` : ''}`);
  return { lit, lamps: lamps.length, climates: running.length, text: parts.join(' · ') || 'Sin equipos en la maqueta' };
}
