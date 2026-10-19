// Automatizaciones simples: «a una hora, ciertos días» o «cuando se abre o cierra una puerta o
// ventana con sensor», activan una escena. Viajan en el archivo .habita y, como las escenas,
// referencian objetos y escenas del proyecto, nunca dispositivos. Corren mientras Habita está
// abierto, también minimizado en la bandeja.
export const automationLimit = 30;
export const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validAutomations(list) {
  if (list === undefined) return true;
  if (!Array.isArray(list) || list.length > automationLimit) return false;
  const ids = new Set();
  return list.every(a => {
    if (!a || typeof a.id !== 'string' || ids.has(a.id) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 60) return false;
    ids.add(a.id);
    if (typeof a.enabled !== 'boolean' || typeof a.scene !== 'string' || !a.trigger || typeof a.trigger !== 'object') return false;
    const t = a.trigger;
    if (t.type === 'time') return typeof t.time === 'string' && timePattern.test(t.time) && Array.isArray(t.days) && t.days.length >= 1 && t.days.length <= 7 &&
      new Set(t.days).size === t.days.length && t.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
    if (t.type === 'contact') return typeof t.item === 'string' && ['open', 'closed'].includes(t.when);
    return false;
  });
}

const pad = n => String(n).padStart(2, '0');
const minuteKey = now => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

// Automatizaciones con hora que tocan en este minuto y todavía no corrieron (`ran`: id → minuto).
export function dueAutomations(project, now, ran) {
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`, key = minuteKey(now);
  const due = (project.automations || []).filter(a => a.enabled && a.trigger.type === 'time' && a.trigger.time === time && a.trigger.days.includes(now.getDay()) && ran.get(a.id) !== key);
  for (const a of due) ran.set(a.id, key);
  return due;
}

export const contactAutomations = (project, itemId, open) => (project.automations || [])
  .filter(a => a.enabled && a.trigger.type === 'contact' && a.trigger.item === itemId && (a.trigger.when === 'open') === open);

export function describeTrigger(a, project) {
  const t = a.trigger;
  if (t.type === 'contact') {
    const item = project.items.find(i => i.id === t.item);
    return `${t.when === 'open' ? 'Al abrir' : 'Al cerrar'} ${item ? item.name : 'un objeto eliminado'}`;
  }
  const days = t.days.length === 7 ? 'Todos los días' : [0, 1, 2, 3, 4, 5, 6].filter(d => t.days.includes(d)).map(d => dayNames[d]).join(', ');
  return `${days} a las ${t.time}`;
}
