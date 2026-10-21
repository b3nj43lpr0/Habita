// Etiqueta flotante al pasar el mouse sobre un equipo de la maqueta: nombre y estado, con un
// punto del color del equipo. Idea de house-control (MIT); implementación propia.
import { esc } from './dom.js';
import { isLamp, lightFor } from '../lighting.js';
import { isClimate, climateFor, modeNames, modeColors } from '../climate.js';
import { isTv, tvFor } from '../tv.js';
import { isCover, coverFor } from '../cover.js';
import { isVacuum, vacuumFor, vacuumNames, vacuumBusy } from '../vacuum.js';

const degrees = n => `${Number(n).toLocaleString('es-CL', { maximumFractionDigits: 1 })}°`;

// [encendido, estado, color del punto] según el diseño; null si el objeto no es un equipo.
export function deviceStatus(item) {
  if (isLamp(item)) { const s = lightFor(item); return [s.on, s.on ? `${s.brightness}%` : 'Apagada', s.mode === 'color' ? s.color : '#ffc98a']; }
  if (isClimate(item)) { const s = climateFor(item); return [s.on, s.on ? `${modeNames[s.mode]} ${degrees(s.target)}` : 'Apagado', modeColors[s.mode]]; }
  if (isTv(item)) { const s = tvFor(item); return [s.on, s.on ? `Volumen ${s.volume}%` : 'Apagado', '#8fc3ff']; }
  if (isCover(item)) { const s = coverFor(item); return [s.position > 0, s.position ? `Abierta ${s.position}%` : 'Cerrada', '#cfdcff']; }
  if (isVacuum(item)) { const s = vacuumFor(item); return [vacuumBusy(s), vacuumNames[s.status], '#5be38c']; }
  return null;
}

export function createDeviceTip(host, ctx) {
  const tip = document.createElement('div');
  tip.className = 'device-tip';
  tip.setAttribute('aria-hidden', 'true');
  host.append(tip);
  return function show(item, x, y) {
    const status = item && deviceStatus(item);
    if (!status) { tip.classList.remove('visible'); return; }
    const [on, label, color] = status;
    // Si está vinculado, manda el estado del equipo real.
    const real = ctx.devices.describe(item.id)?.label;
    tip.innerHTML = `<i></i>${esc(item.name)}<span>${esc(real || label)}</span>`;
    tip.style.setProperty('--dot', color);
    tip.classList.toggle('on', on);
    const rect = host.getBoundingClientRect();
    tip.style.left = `${Math.min(rect.width - 90, Math.max(90, x - rect.left))}px`;
    tip.style.top = `${Math.max(60, y - rect.top - 18)}px`;
    tip.classList.add('visible');
  };
}
