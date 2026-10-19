import { isLamp, lightFor } from '../lighting.js';
import { isClimate, climateFor, modeNames } from '../climate.js';
import { isTv, tvFor } from '../tv.js';
import { isCover, coverFor } from '../cover.js';
import { isOpening } from '../catalog.js';
import { $, esc, toast, modal } from './dom.js';
import { icon } from './icons.js';
import { createOutbox } from './outbox.js';

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
const entityPattern = /^(light|switch|climate|media_player|cover|sensor|binary_sensor)\.[a-z0-9_]+$/;

const cleanError = error => String(error?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
// Qué tipo de dispositivo real acepta cada objeto de la maqueta.
// Las puertas y ventanas aceptan un sensor de apertura: solo se leen, nunca se les envían órdenes.
const kindFor = item => isLamp(item) ? 'light' : isClimate(item) ? 'climate' : isTv(item) ? 'tv' : isCover(item) ? 'cover' : isOpening(item) ? 'contact' : null;
const liveField = kind => kind;
const designState = item => isClimate(item) ? climateFor(item) : isTv(item) ? tvFor(item) : isCover(item) ? coverFor(item) : lightFor(item);
const senders = { light: 'setLight', climate: 'setClimate', tv: 'setTv', cover: 'setCover' };
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
    if (live.kind === 'tv') {
      if (!live.tv.on) return 'apagado';
      const sound = live.tv.muted ? 'en silencio' : live.tv.volume != null ? `volumen ${live.tv.volume}%` : 'encendido';
      return live.tv.source ? `${live.tv.source} · ${sound}` : sound;
    }
    return live.light.on ? 'encendida' : 'apagada';
  }

  function describe(itemId) {
    const entity = bindings[itemId];
    if (!entity) return null;
    const live = devices.get(entity);
    if (status.status !== 'connected') return { entity, available: false, label: 'Sin conexión con la casa' };
    if (!live) return { entity, available: false, label: 'No encontrado en Home Assistant' };
    if (!live.available) return { entity, available: false, label: `${live.name} · no disponible` };
    return { entity, available: true, label: `${live.name} · ${liveLabel(live)}`, current: live.current ?? null };
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
    if (status.status !== 'connected') {
      toast(`Home Assistant no está conectado: ${to.name} no cambió. La maqueta sí.`);
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
    if (!to || !['light', 'tv'].includes(to.kind) || status.status !== 'connected') return;
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
    const label = { climate: 'Equipo real', tv: 'Televisor real', light: 'Luz real', cover: 'Cortina real', contact: 'Sensor de apertura' }[kind];
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
     <p>Habita controla luces, enchufes, aires, televisores, cortinas y sensores a través de <strong>Home Assistant</strong> en tu red local. Después, vincula cada objeto de la maqueta con su equipo real.</p>
     <form id="ha-form" class="ha-form">
      <label>Dirección de Home Assistant<input id="ha-url" placeholder="http://homeassistant.local:8123" value="${esc(status.url || '')}" autocomplete="off" spellcheck="false"></label>
      <label>Token de acceso de larga duración<input id="ha-token" type="password" autocomplete="off" placeholder="${status.configured ? 'Guardado · deja vacío para conservarlo' : 'Pega aquí el token'}"></label>
      <small>Créalo en Home Assistant: tu perfil → Seguridad → Tokens de acceso de larga duración. Se guarda cifrado con tu cuenta de Windows y nunca entra a los archivos .habita.</small>
      <p id="ha-feedback" class="ha-feedback" data-status="${esc(status.status)}">${esc(status.message || statusLabels[status.status])}${status.status === 'connected' ? ` · ${found()}` : ''}</p>
      <div class="dialog-actions">
       ${status.configured ? '<button type="button" id="ha-forget" class="danger">Olvidar conexión</button><button type="button" id="ha-log" class="secondary">Ver registro</button>' : ''}
       <button type="button" data-close class="secondary">Cerrar</button>
       <button type="submit" class="primary">Conectar</button>
      </div>
     </form>`, () => {
      const feedback = $('#ha-feedback');
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
