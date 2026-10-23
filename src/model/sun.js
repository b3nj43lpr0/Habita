// Sol real: la posición del sol según la ciudad (latitud), el mes y la hora, y hacia dónde mira la
// casa (el norte del plano). Es la hora solar, que en Chile va 1 a 2 horas antes que el reloj.
export const cities = [
  ['Arica', -18.48], ['Antofagasta', -23.65], ['La Serena', -29.9], ['Valparaíso', -33.05], ['Santiago', -33.45],
  ['Talca', -35.43], ['Concepción', -36.83], ['Temuco', -38.74], ['Puerto Montt', -41.47], ['Punta Arenas', -53.16]
];
export const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const sunDefaults = Object.freeze({ on: false, lat: -33.45, north: 0, month: 12, hour: 15 });
const num = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export const validSun = s => s === undefined || (!!s && typeof s === 'object' && typeof s.on === 'boolean' && num(s.lat, -66, 66) &&
  num(s.north, 0, 360) && Number.isInteger(s.month) && s.month >= 1 && s.month <= 12 && num(s.hour, 4, 22));
export const sunFor = project => ({ ...sunDefaults, ...project.sun });

const rad = Math.PI / 180;
// Altura sobre el horizonte y acimut (desde el norte, hacia el este), en grados.
export function sunPosition({ lat, month, hour }) {
  const day = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344][month - 1];
  const declination = 23.44 * Math.sin(rad * 360 / 365 * (284 + day));
  const h = 15 * (hour - 12) * rad, phi = lat * rad, delta = declination * rad;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(h));
  const azimuth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)) + Math.PI;
  return { altitude: altitude / rad, azimuth: ((azimuth / rad) % 360 + 360) % 360 };
}

// Dirección hacia el sol en la maqueta (x a la derecha, z hacia abajo en el plano, y hacia arriba).
// `north` son los grados, en sentido horario, entre «arriba» del plano y el norte real.
export function sunDirection(sun) {
  const { altitude, azimuth } = sunPosition(sun);
  const n = sun.north * rad, north = [Math.sin(n), -Math.cos(n)], east = [Math.cos(n), Math.sin(n)];
  const a = azimuth * rad, flat = Math.cos(altitude * rad);
  return { x: flat * (Math.cos(a) * north[0] + Math.sin(a) * east[0]), y: Math.sin(altitude * rad), z: flat * (Math.cos(a) * north[1] + Math.sin(a) * east[1]), altitude, azimuth };
}

// Salida y puesta aproximadas (horas solares) para acotar la animación del día.
export function daylight(sun) {
  let rise = null, set = null;
  for (let hour = 4; hour <= 22; hour += .25) {
    const up = sunPosition({ ...sun, hour }).altitude > 0;
    if (up && rise === null) rise = hour;
    if (up) set = hour;
  }
  return { rise: rise ?? 12, set: set ?? 12 };
}
