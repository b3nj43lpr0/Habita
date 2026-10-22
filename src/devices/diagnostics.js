// Diagnóstico de la casa conectada: revisa la conexión, cada vinculación objeto → dispositivo y las
// órdenes que fallaron hace poco, y lo resume en un informe para leer o copiar (sin el token ni la
// dirección de Home Assistant). Idea del --diagnose de house-control (MIT); implementación propia.
// checks: { level: 'ok' | 'warn' | 'error', text }. orphans: claves de vinculaciones sin objeto.
export function diagnose({ status, bindings, devices, project, kindFor, log = [] }) {
  const checks = [], orphans = [];
  const add = (level, text) => checks.push({ level, text });
  const connected = status.status === 'connected';
  if (!status.configured) add('warn', 'Home Assistant no está configurado.');
  else if (connected) add('ok', `Conectado con Home Assistant · ${devices.size} dispositivos útiles para Habita.`);
  else add('error', `Sin conexión con Home Assistant${status.message ? `: ${status.message}` : '.'}`);

  const items = new Map(project.items.map(item => [item.id, item]));
  const rooms = new Map(project.rooms.map(room => [room.id, room]));
  let healthy = 0;
  for (const [key, entity] of Object.entries(bindings)) {
    const room = key.startsWith('room:') && rooms.get(key.split(':')[1]);
    const item = items.get(key);
    const name = item ? `«${item.name}»` : room ? `El sensor de «${room.name}»` : null;
    if (!name) { orphans.push(key); continue; }
    const live = devices.get(entity);
    if (!connected) continue;
    if (!live) add('error', `${name} está vinculado con ${entity}, que Home Assistant ya no informa.`);
    else if (item && live.kind !== kindFor(item)) add('error', `${name} está vinculado con ${live.name}, que no es del tipo correcto.`);
    else if (!live.available) add('warn', `${name}: ${live.name} no está disponible (apagado en la pared o sin red).`);
    else healthy++;
  }
  if (connected && healthy) add('ok', `${healthy} ${healthy === 1 ? 'vinculación responde' : 'vinculaciones responden'} bien.`);
  if (orphans.length) add('warn', `${orphans.length} ${orphans.length === 1 ? 'vinculación es' : 'vinculaciones son'} de objetos que ya no están en esta casa.`);
  const linkable = project.items.filter(item => ['light', 'climate', 'tv', 'cover', 'vacuum'].includes(kindFor(item)));
  const unlinked = linkable.filter(item => !bindings[item.id]).length;
  if (linkable.length && unlinked) add('ok', `${unlinked} de ${linkable.length} equipos de la maqueta son solo de diseño (sin vincular).`);

  // Registro: líneas «fecha\tcampos…»; una orden fallida tiene un campo que empieza con «error».
  const failed = log.filter(line => line.split('\t').some(field => field.startsWith('error')));
  if (failed.length) add('warn', `${failed.length} ${failed.length === 1 ? 'orden falló' : 'órdenes fallaron'} en el registro reciente. La última: ${failed.at(-1).split('\t').slice(1).join(' · ')}.`);
  else if (log.length) add('ok', 'Las últimas órdenes del registro se completaron sin errores.');

  const icons = { ok: '✓', warn: '!', error: '✗' };
  const report = [`Diagnóstico de Habita · ${new Date().toLocaleString('es-CL')}`, ...checks.map(c => `${icons[c.level]} ${c.text}`)].join('\n');
  return { checks, orphans, report };
}
