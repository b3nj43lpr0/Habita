// Plano de referencia: una imagen bajo el dibujo 2D, en metros. Viaja dentro del archivo .habita
// como data URL; al importarla se reduce y se vuelve a codificar en JPEG para acotar su tamaño.
export const planImageLimit = 3_000_000;
const imagePattern = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const num = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

export function validPlan(plan) {
  return !!plan && typeof plan === 'object' && typeof plan.image === 'string' && plan.image.length <= planImageLimit &&
    imagePattern.test(plan.image) && num(plan.x, -100, 100) && num(plan.z, -100, 100) &&
    num(plan.w, .1, 200) && num(plan.d, .1, 200) && num(plan.opacity, 0, 1) && typeof plan.locked === 'boolean';
}

// Sin calibrar, la imagen mide 10 m de ancho y se centra en la casa.
export function newPlan(image, width, height, project) {
  const rooms = project.rooms;
  const span = (lo, hi) => rooms.length ? (Math.min(...rooms.map(lo)) + Math.max(...rooms.map(hi))) / 2 : 0;
  const x = span(r => r.x - r.w / 2, r => r.x + r.w / 2), z = span(r => r.z - r.d / 2, r => r.z + r.d / 2);
  const w = 10, d = Math.max(.1, Math.round(w * height / width * 1000) / 1000);
  return { image, x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000, w, d, opacity: .55, locked: false };
}

// Escala la imagen alrededor del primer punto para que la distancia entre `a` y `b` mida `meters`.
export function calibratePlan(plan, a, b, meters) {
  const measured = Math.hypot(b.x - a.x, b.z - a.z);
  if (measured < .01) throw new Error('Marca dos puntos separados en el plano.');
  if (!num(meters, .05, 200)) throw new Error('Escribe una distancia entre 0,05 y 200 m.');
  const k = meters / measured, r = n => Math.round(n * 1000) / 1000;
  const next = { ...plan, x: r(a.x + (plan.x - a.x) * k), z: r(a.z + (plan.z - a.z) * k), w: r(plan.w * k), d: r(plan.d * k) };
  if (!validPlan(next)) throw new Error('Con esa medida el plano queda fuera del rango admitido (hasta 200 m).');
  return next;
}
