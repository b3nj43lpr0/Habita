import { isLamp, lightFor } from '../devices/lighting.js';
import { isClimate, climateFor, modeNames } from '../devices/climate.js';
import { isTv, tvFor } from '../devices/tv.js';
import { isCover, coverFor } from '../devices/cover.js';
import { isVacuum, vacuumFor, vacuumNames } from '../devices/vacuum.js';
import { isOpening } from '../model/catalog.js';
import { $, esc, toast, modal } from './dom.js';
import { icon } from './icons.js';
import { createOutbox } from './outbox.js';
import { diagnose } from '../devices/diagnostics.js';
import { suggestLinks } from '../devices/link-suggest.js';
import { inRoom } from '../model/levels.js';

// Las vinculaciones objeto → dispositivo viven fuera del proyecto: no entran al archivo
// .habita, al historial ni al autoguardado, y no contienen credenciales.
const bindingsKey = 'habita-bindings';
const statusLabels = {
  connected: 'Home Assistant conectado',
  connecting: 'Conectando…',
  reconnecting: 'Reconectando…',
  error: 'Home Assistant con error',
  disconnected: 'Sin dispositivos'
};
const entityPattern = /^(light|switch|climate|media_player|cover|vacuum|sensor|binary_sensor|hue)\.[a-z0-9_]+$/;

const cleanError = error => String(error?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
// Qué tipo de dispositivo real acepta cada objeto de la maqueta.
// Las puertas y ventanas aceptan un sensor de apertura: solo se leen, nunca se les envían órdenes.
const kindFor = item => isLamp(item) ? 'light' : isClimate(item) ? 'climate' : isTv(item) ? 'tv' : isCover(item) ? 'cover' : isVacuum(item) ? 'vacuum' : isOpening(item) ? 'contact' : null;
const liveField = kind => kind;
const designState = item => isClimate(item) ? climateFor(item) : isTv(item) ? tvFor(item) : isCover(item) ? coverFor(item) : isVacuum(item) ? vacuumFor(item) : lightFor(item);
const senders = { light: 'setLight', climate: 'setClimate', tv: 'setTv', cover: 'setCover', vacuum: 'setVacuum' };
// Sensores de habitación: la vinculación usa la clave room:<id>:<medida>.
const roomKey = (roomId, measure) => `room:${roomId}:${measure}`;
const measureNames = { temperature: 'Temperatura', humidity: 'Humedad', power: 'Consumo' };
// Potencia en vatios, aunque el sensor informe kW.
const watts = live => live.sensor.unit === 'kW' ? live.sensor.value * 1000 : live.sensor.value;

function loadBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem(bindingsKey));
    if (saved && typeof saved === 'object') {
      return Object.fromEntries(Object.entries(saved).filter(([item, entity]) => typeof item === 'string' && entityPattern.test(entity)));
    }
  } catch {}
  return {};
}

export function createDevices(ctx, { onLiveChange, onContact = () => {} }) {
  const { state } = ctx;
  const bridge = window.habita?.homeAssistant;
  let status = { available: !!bridge, configured: false, status: 'disconnected', message: '' };
  let devices = new Map();
  let bindings = loadBindings();
  // Objetos cuyo slider se está arrastrando: sus ecos no deben mover el control.
  const previewing = new Set();
  const outbox = createOutbox(
    (entity, value, { kind }) => bridge[senders[kind]](entity, value),
    {
      interval: 150,
      // Sin órdenes en curso, la maqueta adopta el último estado que informó el equipo.
      onIdle: entity => {
        const changed = applyLive(entity);
        if (changed.length) onLiveChange(changed);
      },
      onError: (entity, error, { name }) => {
        toast(`No se pudo cambiar ${name}: ${cleanError(error)}`);
        refreshDevices();
      }
    }
  );

  const statusButton = $('#device-status');
  const settingsButton = $('#home-assistant');
  statusButton.hidden = settingsButton.hidden = !bridge;
  statusButton.onclick = settingsButton.onclick = openSettings;

  function saveBindings() {
    try { localStorage.setItem(bindingsKey, JSON.stringify(bindings)); } catch {}
  }

  function paintStatus() {
    statusButton.dataset.status = status.status;
    const total = Object.keys(bindings).length;
    statusButton.textContent = status.status === 'connected' && total
      ? `${statusLabels.connected} · ${total} ${total === 1 ? 'dispositivo vinculado' : 'dispositivos vinculados'}`
      : statusLabels[status.status] || statusLabels.disconnected;
    statusButton.title = status.message || 'Configurar Home Assistant';
  }

  // Copia el estado real a los objetos vinculados sin crear pasos de historial.
  function applyLive(entityId = null) {
    const changed = [];
    for (const item of state.project.items) {
      const entity = bindings[item.id], kind = kindFor(item);
      if (!entity || !senders[kind] || (entityId && entity !== entityId) || previewing.has(item.id) || outbox.busy(entity)) continue;
      const live = devices.get(entity);
      if (!live?.available || live.kind !== kind) continue;
      const field = liveField(kind);
      const next = { ...designState(item), ...live[field] };
      if (JSON.stringify(next) === JSON.stringify(designState(item))) continue;
      item[field] = next;
      changed.push(item.id);
    }
    return changed;
  }

  // Puertas y ventanas con sensor: se redibujan cuando llega el estado de la casa.
  const contactItems = () => state.project.items.filter(item => bindings[item.id] && kindFor(item) === 'contact').map(item => item.id);

  function receive(device) {
    const previous = devices.get(device.entityId);
    devices.set(device.entityId, device);
    // Ecos de nuestras propias órdenes: se aplican al terminar la cola (onIdle).
    if (outbox.busy(device.entityId)) return;
    // Un sensor de apertura no cambia el proyecto, pero la maqueta debe redibujar la puerta.
    if (device.kind === 'contact') {
      const ids = Object.keys(bindings).filter(key => bindings[key] === device.entityId);
      onLiveChange(ids);
      if (previous?.available && device.available && previous.contact.open !== device.contact.open) onContact(ids, device.contact.open);
      return;
    }
    const changed = applyLive(device.entityId);
    if (changed.length || Object.values(bindings).includes(device.entityId)) onLiveChange(changed);
  }

  function liveLabel(live) {
    if (live.kind === 'climate') {
      const degrees = n => `${Number(n).toLocaleString('es-CL', { maximumFractionDigits: 1 })} °C`;
      const now = live.current != null ? ` · ${degrees(live.current)} ahora` : '';
      return live.climate.on ? `${modeNames[live.climate.mode] || 'Encendido'} a ${degrees(live.climate.target)}${now}` : `apagado${now}`;
    }
    if (live.kind === 'contact') return live.contact.open ? 'abierta' : 'cerrada';
    if (live.kind === 'cover') return live.cover.position ? `abierta ${live.cover.position}%` : 'cerrada';
    if (live.kind === 'vacuum') {
      const battery = live.battery != null ? ` · batería ${live.battery}%` : '';
      return `${live.error ? 'con error' : vacuumNames[live.vacuum.status]?.toLowerCase() || 'estado desconocido'}${battery}`;
    }
    if (live.kind === 'tv') {
      if (!live.tv.on) return 'apagado';
      const sound = live.tv.muted ? 'en silencio' : live.tv.volume != null ? `volumen ${live.tv.volume}%` : 'encendido';
      return live.tv.source ? `${live.tv.source} · ${sound}` : sound;
    }
    return live.light.on ? 'encendida' : 'apagada';
  }

  // Las luces Hue dependen de su puente; el resto, de Home Assistant.
  const online = entity => entity?.startsWith('hue.') ? status.hue?.status === 'connected' : status.status === 'connected' && (!status.hue?.paired || !!status.url || status.hue.status === 'connected');

  function describe(itemId) {
    const entity = bindings[itemId];
    if (!entity) return null;
    const live = devices.get(entity);
    if (!online(entity)) return { entity, available: false, label: entity.startsWith('hue.') ? 'Sin conexión con el puente Hue' : 'Sin conexión con la casa' };
    if (!live) return { entity, available: false, label: 'No encontrado en Home Assistant' };
    if (!live.available) return { entity, available: false, label: `${live.name} · no disponible` };
    return { entity, available: true, label: `${live.name} · ${liveLabel(live)}`, current: live.current ?? null, battery: live.battery ?? null };
  }

  // Lo que admite el equipo vinculado, para limitar los controles; null si no hay vínculo.
  const supportsFor = itemId => devices.get(bindings[itemId])?.supports || null;

  function target(item) {
    const entity = bindings[item.id], kind = kindFor(item);
    if (!entity || !senders[kind] || !bridge) return null;
    return { entity, kind, name: devices.get(entity)?.name || entity };
  }

  function send(item) {
    previewing.delete(item.id);
    const to = target(item);
    if (!to) return;
    if (!online(to.entity)) {
      toast(`${to.entity.startsWith('hue.') ? 'El puente Hue' : 'Home Assistant'} no está conectado: ${to.name} no cambió. La maqueta sí.`);
      return;
    }
    // Optimista: el cambio del usuario manda hasta que la casa confirme o informe otro estado.
    const field = liveField(to.kind), live = devices.get(to.entity);
    if (live) devices.set(to.entity, { ...live, [field]: { ...live[field], ...designState(item) } });
    outbox.dispatch(to.entity, designState(item), to);
  }

  // Mientras se arrastra un slider de luz o de volumen, el equipo real sigue el gesto en vivo. Los
  // aires no: cada orden les hace sonar un pitido, así que solo reciben el valor final al soltar.
  function preview(item, value) {
    const to = target(item);
    if (!to || !['light', 'tv'].includes(to.kind) || !online(to.entity)) return;
    previewing.add(item.id);
    outbox.dispatch(to.entity, value, to);
  }

  function endPreview(item) {
    previewing.delete(item.id);
  }

  function sendMany(items) {
    for (const item of items) send(item);
  }

  function bind(item, entity) {
    if (entity) bindings[item.id] = entity;
    else delete bindings[item.id];
    saveBindings();
    paintStatus();
    if (!entity) { toast(`${item.name} vuelve a ser solo de la maqueta.`); onLiveChange([]); return; }
    const live = devices.get(entity);
    toast(`${item.name} vinculado con ${live?.name || entity}. La maqueta muestra su estado real.`);
    onLiveChange(kindFor(item) === 'contact' ? [item.id] : applyLive(entity));
  }

  function unsupportedNote(item, live) {
    if (!live) return '';
    if (live.kind === 'climate') return '';
    if (live.kind === 'tv') return live.supports.power ? '' : 'Este televisor no se enciende ni apaga desde Home Assistant.';
    if (live.kind === 'cover') return live.supports.position ? '' : 'Este motor solo abre y cierra.';
    if (live.kind === 'vacuum') return live.supports.start ? '' : 'Esta aspiradora no se puede iniciar desde Home Assistant.';
    if (live.kind !== 'light') return '';
    const light = lightFor(item);
    if (!live.supports.dimmable) return 'Este equipo solo enciende y apaga.';
    if (light.mode === 'color' && !live.supports.color) return 'Esta luz no admite color; solo cambia el brillo.';
    if (light.mode === 'temperature' && !live.supports.temperature) return 'Esta luz no admite temperatura de blanco; solo cambia el brillo.';
    return '';
  }

  function mountLink(panel, item) {
    const kind = kindFor(item);
    if (!bridge || !kind) return;
    const section = document.createElement('div');
    section.className = 'device-link';
    const bound = bindings[item.id];
    const label = { climate: 'Equipo real', tv: 'Televisor real', light: 'Luz real', cover: 'Cortina real', vacuum: 'Aspiradora real', contact: 'Sensor de apertura' }[kind];
    if (!status.configured) {
      section.innerHTML = `<button class="device-connect">${icon('plug', 14)} Controlar un equipo real</button>`;
      section.querySelector('button').onclick = openSettings;
      panel.append(section);
      return;
    }
    const options = [...devices.values()].filter(d => d.kind === kind);
    if (bound && !devices.has(bound)) options.unshift({ entityId: bound, name: bound });
    const info = describe(item.id);
    const note = unsupportedNote(item, bound && devices.get(bound));
    section.innerHTML = `
     <label><span>${icon('link', 13)} ${label}</span>
      <select data-device aria-label="${label} vinculado">
       <option value="">Solo maqueta</option>
       ${options.map(o => `<option value="${esc(o.entityId)}" ${o.entityId === bound ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
      </select>
     </label>
     ${info ? `<small class="device-state ${info.available ? 'online' : 'offline'}">${esc(info.label)}</small>` : ''}
     ${note ? `<small class="device-state">${esc(note)}</small>` : ''}`;
    section.querySelector('[data-device]').onchange = event => bind(item, event.target.value);
    panel.append(section);
  }

  function openSettings() {
    if (!bridge) return;
    const found = () => `${devices.size} dispositivos encontrados`;
    modal(`
     <span class="dialog-emblem">${icon('plug', 32)}</span>
     <h2>Conectar tu casa real</h2>
     <p>Habita controla luces, enchufes, aires, televisores, cortinas, aspiradoras y sensores a través de <strong>Home Assistant</strong> en tu red local. Después, vincula cada objeto de la maqueta con su equipo real.</p>
     <form id="ha-form" class="ha-form">
      <label>Dirección de Home Assistant<span class="ha-url-row"><input id="ha-url" placeholder="http://homeassistant.local:8123" value="${esc(status.url || '')}" autocomplete="off" spellcheck="false"><button type="button" id="ha-discover" class="secondary">Buscar en la red</button></span></label>
      <div id="ha-found" class="ha-found" hidden></div>
      <label>Token de acceso de larga duración<input id="ha-token" type="password" autocomplete="off" placeholder="${status.configured ? 'Guardado · deja vacío para conservarlo' : 'Pega aquí el token'}"></label>
      <small>Créalo en Home Assistant: tu perfil → Seguridad → Tokens de acceso de larga duración. Se guarda cifrado con tu cuenta de Windows y nunca entra a los archivos .habita.</small>
      <p id="ha-feedback" class="ha-feedback" data-status="${esc(status.status)}">${esc(status.message || statusLabels[status.status])}${status.status === 'connected' ? ` · ${found()}` : ''}</p>
      <div class="dialog-actions">
       ${status.configured ? '<button type="button" id="ha-forget" class="danger">Olvidar conexión</button><button type="button" id="ha-log" class="secondary">Ver registro</button><button type="button" id="ha-diagnose" class="secondary">Diagnóstico</button>' : ''}
       ${status.status === 'connected' ? '<button type="button" id="ha-rooms" class="secondary">Vincular por habitación</button>' : ''}
       ${window.habita?.desktop?.phone ? '<button type="button" id="ha-phone" class="secondary">Control desde el celular</button>' : ''}
       <button type="button" data-close class="secondary">Cerrar</button>
       <button type="submit" class="primary">Conectar</button>
      </div>
     </form>
     <section class="hue-section">
      <h3>Philips Hue sin Home Assistant</h3>
      ${status.hue?.paired
        ? `<p class="ha-feedback" data-status="${esc(status.hue.status)}">Puente ${esc(status.hue.host)} · ${esc(status.hue.message || statusLabels[status.hue.status] || '')}</p><div class="dialog-actions"><button type="button" id="hue-forget" class="danger">Olvidar puente</button></div>`
        : `<p>Si tus luces son Hue, Habita puede usarlas directo desde el puente en tu red.</p>
         <div class="ha-url-row"><input id="hue-host" placeholder="Dirección del puente, por ejemplo 192.168.1.30" autocomplete="off" spellcheck="false" aria-label="Dirección del puente Hue"><button type="button" id="hue-discover" class="secondary">Buscar</button></div>
         <p id="hue-feedback" class="ha-feedback"></p>
         <div class="dialog-actions"><button type="button" id="hue-pair" class="primary">Pulsé el botón · Vincular</button></div>`}
     </section>`, () => {
      const feedback = $('#ha-feedback');
      // Buscar Home Assistant: con uno solo se completa la dirección; con varios, se elige.
      $('#ha-discover').onclick = async () => {
        const button = $('#ha-discover'), list = $('#ha-found');
        button.disabled = true; button.textContent = 'Buscando…';
        let found = [];
        try { found = await bridge.discover(); } catch {}
        button.disabled = false; button.textContent = 'Buscar en la red';
        if (found.length === 1) { $('#ha-url').value = found[0].url; list.hidden = true; feedback.textContent = `Encontrado: ${found[0].name}. Pega el token y conecta.`; return; }
        list.hidden = false;
        list.innerHTML = found.length ? found.map(f => `<button type="button" data-url="${esc(f.url)}">${esc(f.name)}<small>${esc(f.url)}</small></button>`).join('') : '<p>No apareció Home Assistant en esta red. Escribe su dirección; suele ser http://homeassistant.local:8123 o la IP del equipo con :8123.</p>';
        list.querySelectorAll('[data-url]').forEach(b => b.onclick = () => { $('#ha-url').value = b.dataset.url; list.hidden = true; });
      };
      const hueFeedback = $('#hue-feedback');
      const hueDiscover = $('#hue-discover');
      if (hueDiscover) hueDiscover.onclick = async () => {
        hueDiscover.disabled = true;
        let found = [];
        try { found = await bridge.discoverHue(); } catch {}
        hueDiscover.disabled = false;
        if (found.length) { $('#hue-host').value = found[0].host; hueFeedback.textContent = `Puente encontrado${found.length > 1 ? ` (${found.length})` : ''}. Pulsa el botón redondo del puente y luego «Vincular».`; }
        else hueFeedback.textContent = 'No apareció un puente Hue. Escribe su IP (está en la app Hue → Configuración → Puentes).';
      };
      const huePair = $('#hue-pair');
      if (huePair) huePair.onclick = async () => {
        huePair.disabled = true;
        hueFeedback.dataset.status = 'connecting';
        hueFeedback.textContent = 'Vinculando…';
        try {
          status = await bridge.pairHue($('#hue-host').value);
          await refreshDevices();
          paintStatus();
          openSettings();
          toast('Puente Hue vinculado. Elige una lámpara de la maqueta para vincular sus luces.');
        } catch (error) {
          hueFeedback.dataset.status = 'error';
          hueFeedback.textContent = cleanError(error);
          huePair.disabled = false;
        }
      };
      const hueForget = $('#hue-forget');
      if (hueForget) hueForget.onclick = async () => { status = await bridge.forgetHue(); await refreshDevices(); paintStatus(); openSettings(); };
      $('#ha-form').onsubmit = async event => {
        event.preventDefault();
        const submit = event.target.querySelector('[type="submit"]');
        submit.disabled = true;
        feedback.dataset.status = 'connecting';
        feedback.textContent = 'Conectando…';
        try {
          status = await bridge.configure($('#ha-url').value, $('#ha-token').value);
          $('#ha-token').value = '';
          await refreshDevices();
          feedback.dataset.status = 'connected';
          feedback.textContent = `Conectado · ${found()}. Selecciona una lámpara, un aire o un televisor para vincularlo.`;
        } catch (error) {
          feedback.dataset.status = 'error';
          feedback.textContent = cleanError(error);
        } finally {
          submit.disabled = false;
        }
      };
      const log = $('#ha-log');
      if (log) log.onclick = showLog;
      const check = $('#ha-diagnose');
      if (check) check.onclick = showDiagnosis;
      const rooms = $('#ha-rooms');
      if (rooms) rooms.onclick = showRoomLinker;
      const phoneButton = $('#ha-phone');
      if (phoneButton) phoneButton.onclick = () => ctx.phone?.open();
      const forget = $('#ha-forget');
      if (forget) forget.onclick = async () => {
        status = await bridge.forget();
        devices = new Map();
        paintStatus();
        $('#dialog').close();
        onLiveChange([]);
        toast('Conexión con Home Assistant eliminada. Las vinculaciones se conservan.');
      };
    });
  }

  // Sensores de temperatura y humedad de una habitación, en su panel.
  function mountRoomSensors(anchor, room) {
    if (!bridge || !status.configured || !anchor) return;
    const section = document.createElement('div');
    section.className = 'device-link room-sensors';
    section.innerHTML = Object.entries(measureNames).map(([measure, label]) => {
      const key = roomKey(room.id, measure), bound = bindings[key];
      const options = [...devices.values()].filter(d => d.kind === 'sensor' && d.sensor.measure === measure);
      if (bound && !devices.has(bound)) options.unshift({ entityId: bound, name: bound });
      const live = devices.get(bound);
      return `<label><span>${icon('link', 13)} ${label} de la habitación</span>
        <select data-room-sensor="${measure}" aria-label="Sensor de ${label.toLowerCase()}"><option value="">Sin sensor</option>
        ${options.map(o => `<option value="${esc(o.entityId)}" ${o.entityId === bound ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>
        ${live ? `<small class="device-state ${live.available ? 'online' : 'offline'}">${esc(live.available ? `${live.name} · ${reading(live)}` : `${live.name} · no disponible`)}</small>` : ''}`;
    }).join('');
    section.querySelectorAll('[data-room-sensor]').forEach(select => select.onchange = () => {
      const key = roomKey(room.id, select.dataset.roomSensor);
      if (select.value) bindings[key] = select.value; else delete bindings[key];
      saveBindings();
      paintStatus();
      onLiveChange([]);
    });
    anchor.after(section);
  }

  const number = n => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 1 });
  const reading = live => live.sensor.measure === 'power' ? `${number(Math.round(watts(live)))} W` : `${number(live.sensor.value)}${live.sensor.measure === 'humidity' ? ' %' : ` ${live.sensor.unit || '°C'}`}`;

  // Texto corto con lo que miden los sensores de la habitación, por ejemplo «23,5 °C · 58 %».
  function roomSensors(roomId) {
    if (status.status !== 'connected') return '';
    return Object.keys(measureNames).map(m => devices.get(bindings[roomKey(roomId, m)])).filter(d => d?.available && d.kind === 'sensor').map(reading).join(' · ');
  }

  // Consumo por habitación en vatios (solo las que tienen sensor de consumo disponible).
  function roomPower() {
    const result = {};
    if (status.status !== 'connected') return result;
    for (const room of state.project.rooms) {
      const live = devices.get(bindings[roomKey(room.id, 'power')]);
      if (live?.available && live.kind === 'sensor' && live.sensor.measure === 'power') result[room.id] = watts(live);
    }
    return result;
  }

  const isOpen = itemId => { const live = devices.get(bindings[itemId]); return !!(live?.available && live.kind === 'contact' && live.contact.open); };
  // Una puerta o ventana solo muestra su panel si hay casa conectada para vincularla.
  const linkable = item => !!bridge && (!!bindings[item.id] || status.configured);

  // Últimas órdenes enviadas y sus respuestas; nunca incluye el token.
  async function showLog() {
    let lines = [];
    try { lines = await bridge.log(); } catch {}
    const rows = lines.slice().reverse().map(line => {
      const [time, ...fields] = line.split('	');
      const failed = fields.some(f => f.startsWith('error'));
      return `<li class="${failed ? 'failed' : ''}"><time>${esc(new Date(time).toLocaleTimeString('es-CL'))}</time><span>${esc(fields.join(' · '))}</span></li>`;
    }).join('');
    modal(`
     <h2>Registro de eventos</h2>
     <p>Órdenes enviadas a tus equipos, su respuesta y los cambios de conexión. Lo más reciente primero.</p>
     ${rows ? `<ol class="event-log">${rows}</ol>` : '<p class="scene-empty">Todavía no hay eventos.</p>'}
     <div class="dialog-actions"><button type="button" id="log-back" class="secondary">Volver</button><button type="button" data-close class="primary">Cerrar</button></div>`, () => {
      $('#log-back').onclick = openSettings;
    });
  }

  // Todos los equipos de la maqueta por habitación, cada uno con su selector de dispositivo real.
  // Los que no tienen vínculo traen marcada la propuesta (misma área o nombre parecido); nada se
  // guarda hasta pulsar «Guardar vínculos».
  function showRoomLinker() {
    const suggested = suggestLinks(state.project, [...devices.values()], kindFor, bindings);
    // Solo los tipos de equipo que la casa real tiene (o ya vinculados): sin sensores de apertura no se listan puertas.
    const kinds = new Set([...devices.values()].map(d => d.kind));
    const items = state.project.items.filter(item => (senders[kindFor(item)] || kindFor(item) === 'contact') && (kinds.has(kindFor(item)) || bindings[item.id]));
    const groups = [...state.project.rooms.map(room => [room.name, items.filter(item => inRoom(item, room))]), ['Sin espacio', items.filter(item => !state.project.rooms.some(room => inRoom(item, room)))]].filter(([, list]) => list.length);
    const row = item => {
      const kind = kindFor(item), chosen = bindings[item.id] || suggested[item.id] || '';
      const options = [...devices.values()].filter(d => d.kind === kind).sort((a, b) => (b.entityId === suggested[item.id]) - (a.entityId === suggested[item.id]) || a.name.localeCompare(b.name, 'es'));
      return `<label class="linker-row" data-search="${esc(`${item.name} ${options.map(o => `${o.name} ${o.area || ''}`).join(' ')}`.toLocaleLowerCase('es'))}"><span>${esc(item.name)}${suggested[item.id] ? '<small>Propuesto</small>' : ''}</span>
        <select data-link-item="${esc(item.id)}" aria-label="Dispositivo para ${esc(item.name)}"><option value="">Solo maqueta</option>${options.map(o => `<option value="${esc(o.entityId)}" ${o.entityId === chosen ? 'selected' : ''}>${esc(o.name)}${o.area ? ` · ${esc(o.area)}` : ''}</option>`).join('')}</select></label>`;
    };
    const proposals = Object.keys(suggested).length;
    modal(`
     <h2>Vincular por habitación</h2>
     <p>${proposals ? `Hay ${proposals} ${proposals === 1 ? 'propuesta' : 'propuestas'} según las áreas de Home Assistant y los nombres; revísalas antes de guardar.` : 'Elige el dispositivo real de cada equipo de la maqueta.'}</p>
     <input id="linker-search" class="linker-search" placeholder="Buscar objeto o dispositivo…" aria-label="Buscar" autocomplete="off">
     <div class="linker">${groups.map(([name, list]) => `<h3>${esc(name)}</h3>${list.map(row).join('')}`).join('') || '<p class="scene-empty">La maqueta no tiene equipos para vincular.</p>'}</div>
     <div class="dialog-actions"><button type="button" id="linker-back" class="secondary">Volver</button><button type="button" id="linker-save" class="primary">Guardar vínculos</button></div>`, () => {
      $('#linker-search').oninput = event => {
        const query = event.target.value.trim().toLocaleLowerCase('es');
        document.querySelectorAll('.linker-row').forEach(r => { r.hidden = !!query && !r.dataset.search.includes(query); });
      };
      $('#linker-back').onclick = openSettings;
      $('#linker-save').onclick = () => {
        let count = 0;
        document.querySelectorAll('[data-link-item]').forEach(select => {
          const id = select.dataset.linkItem, value = select.value;
          if ((bindings[id] || '') === value) return;
          if (value) bindings[id] = value; else delete bindings[id];
          count++;
        });
        saveBindings();
        paintStatus();
        $('#dialog').close();
        onLiveChange([...applyLive(), ...contactItems()]);
        toast(count ? `${count} ${count === 1 ? 'vínculo actualizado' : 'vínculos actualizados'}. La maqueta muestra el estado real.` : 'Los vínculos no cambiaron.');
      };
    });
  }

  async function showDiagnosis() {
    let log = [];
    try { log = await bridge.log(); } catch {}
    const result = diagnose({ status, bindings, devices, project: state.project, kindFor, log: log.slice(-40) });
    const icons = { ok: 'check', warn: 'help', error: 'close' };
    modal(`
     <h2>Diagnóstico</h2>
     <p>Revisión de la conexión, de cada equipo vinculado y de las últimas órdenes. El informe no incluye el token ni la dirección de tu casa.</p>
     <ul class="diagnosis">${result.checks.map(c => `<li class="${c.level}">${icon(icons[c.level], 14)}<span>${esc(c.text)}</span></li>`).join('')}</ul>
     <div class="dialog-actions">
      ${result.orphans.length ? '<button type="button" id="diagnosis-clean" class="secondary">Quitar vínculos huérfanos</button>' : ''}
      <button type="button" id="diagnosis-copy" class="secondary">Copiar informe</button>
      <button type="button" id="diagnosis-back" class="secondary">Volver</button><button type="button" data-close class="primary">Cerrar</button>
     </div>`, () => {
      $('#diagnosis-back').onclick = openSettings;
      $('#diagnosis-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(result.report); toast('Informe copiado.'); } catch { toast('No se pudo copiar el informe.'); }
      };
      const clean = $('#diagnosis-clean');
      if (clean) clean.onclick = () => {
        for (const key of result.orphans) delete bindings[key];
        saveBindings();
        paintStatus();
        toast(`${result.orphans.length} ${result.orphans.length === 1 ? 'vínculo quitado' : 'vínculos quitados'}.`);
        showDiagnosis();
      };
    });
  }

  async function refreshDevices() {
    try {
      devices = new Map((await bridge.devices()).map(device => [device.entityId, device]));
    } catch {
      return;
    }
    onLiveChange([...applyLive(), ...contactItems()]);
  }

  if (bridge) {
    bridge.onStatus(next => {
      const was = status.status;
      status = next;
      paintStatus();
      if (next.status === 'connected' && was !== 'connected') refreshDevices();
      else if (next.status !== was) onLiveChange([]);
    });
    bridge.onDevices(list => {
      devices = new Map(list.map(device => [device.entityId, device]));
      onLiveChange([...applyLive(), ...contactItems()]);
    });
    bridge.onDevice(receive);
    bridge.status().then(next => {
      status = next;
      paintStatus();
      if (next.status === 'connected') refreshDevices();
    }).catch(() => {});
  }
  paintStatus();

  return { applyLive: () => applyLive(), describe, supportsFor, send, sendMany, preview, endPreview, mountLink, mountRoomSensors, roomSensors, roomPower, isOpen, linkable, openSettings };
}
