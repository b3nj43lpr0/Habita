// Home Assistant simulado para probar Habita sin hardware ni Docker: implementa la parte de la
// API WebSocket que usa la app (auth, get_states, subscribe_events, call_service y registros de
// áreas) con dispositivos demo que guardan estado. Idea adaptada del laboratorio de
// house-control (MIT, Copyright (c) 2026 0xProbability); el código es propio.
//
//   npm run lab            → http://127.0.0.1:8123 (página con el estado; clic = interruptor de pared)
//
// Solo escucha en 127.0.0.1. Sin dependencias: servidor WebSocket mínimo (RFC 6455, texto).
const http = require('node:http');
const crypto = require('node:crypto');

const LAB_TOKEN = 'habita-lab-token-0123456789abcdef';

function demoEntities() {
  const light = (id, name, area, attributes) => ({ entity_id: `light.${id}`, state: 'on', area, attributes: { friendly_name: name, ...attributes } });
  return [
    light('living_techo', 'Living · techo', 'living', { supported_color_modes: ['color_temp', 'hs'], color_mode: 'color_temp', brightness: 200, color_temp_kelvin: 2700, min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 }),
    light('living_pie', 'Living · lámpara de pie', 'living', { supported_color_modes: ['color_temp'], color_mode: 'color_temp', brightness: 255, color_temp_kelvin: 3000, min_color_temp_kelvin: 2200, max_color_temp_kelvin: 5000 }),
    light('dormitorio', 'Dormitorio · velador', 'dormitorio', { supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 90 }),
    light('tira_tv', 'Living · tira LED TV', 'living', { supported_color_modes: ['hs'], color_mode: 'hs', brightness: 160, rgb_color: [123, 92, 255] }),
    { entity_id: 'switch.lampara_enchufe', state: 'off', area: 'dormitorio', attributes: { friendly_name: 'Dormitorio · enchufe lámpara' } },
    { entity_id: 'climate.living', state: 'cool', area: 'living', attributes: { friendly_name: 'Living · aire acondicionado', hvac_modes: ['off', 'cool', 'heat', 'dry', 'fan_only', 'auto'], fan_modes: ['auto', 'low', 'medium', 'high'], swing_modes: ['off', 'on'], preset_modes: ['none', 'eco', 'sleep'], fan_mode: 'auto', swing_mode: 'off', preset_mode: 'none', min_temp: 16, max_temp: 30, target_temp_step: 1, temperature: 23, current_temperature: 25.5 } },
    // supported_features: volume_set 4 + volume_mute 8 + turn_on 128 + turn_off 256 + volume_step 1024 + select_source 2048.
    { entity_id: 'media_player.living_tv', state: 'off', area: 'living', attributes: { friendly_name: 'Living · televisor', supported_features: 3468, volume_level: .2, is_volume_muted: false, source: 'HDMI 1', source_list: ['HDMI 1', 'HDMI 2', 'Netflix', 'YouTube'] } },
    // supported_features de cover: abrir 1 + cerrar 2 + posición 4 + detener 8.
    { entity_id: 'cover.living_cortina', state: 'open', area: 'living', attributes: { friendly_name: 'Living · cortina', supported_features: 15, current_position: 100, device_class: 'curtain' } },
    { entity_id: 'cover.dormitorio_persiana', state: 'closed', area: 'dormitorio', attributes: { friendly_name: 'Dormitorio · persiana', supported_features: 3, device_class: 'blind' } },
    { entity_id: 'binary_sensor.puerta_acceso', state: 'off', area: 'acceso', attributes: { friendly_name: 'Acceso · puerta', device_class: 'door' } },
    { entity_id: 'binary_sensor.ventana_living', state: 'off', area: 'living', attributes: { friendly_name: 'Living · ventana', device_class: 'window' } },
    { entity_id: 'binary_sensor.movimiento_living', state: 'off', area: 'living', attributes: { friendly_name: 'Living · movimiento', device_class: 'motion' } },
    { entity_id: 'sensor.humedad_living', state: '58', area: 'living', attributes: { friendly_name: 'Living · humedad', device_class: 'humidity', unit_of_measurement: '%' } },
    { entity_id: 'sensor.temperatura_dormitorio', state: '20.5', area: 'dormitorio', attributes: { friendly_name: 'Dormitorio · temperatura', device_class: 'temperature', unit_of_measurement: '°C' } },
    { entity_id: 'sensor.consumo_living', state: '340', area: 'living', attributes: { friendly_name: 'Living · consumo', device_class: 'power', unit_of_measurement: 'W' } },
    { entity_id: 'sensor.consumo_cocina', state: '1.25', area: 'cocina', attributes: { friendly_name: 'Cocina · consumo', device_class: 'power', unit_of_measurement: 'kW' } },
    { entity_id: 'sensor.energia_total', state: '812.4', area: 'living', attributes: { friendly_name: 'Casa · energía acumulada', device_class: 'energy', unit_of_measurement: 'kWh' } },
    { entity_id: 'sensor.temperatura_living', state: '25.5', area: 'living', attributes: { friendly_name: 'Living · temperatura', device_class: 'temperature', unit_of_measurement: '°C' } }
  ];
}

const areas = [{ area_id: 'living', name: 'Living y comedor' }, { area_id: 'dormitorio', name: 'Dormitorio' }];

// Aplica un servicio como lo haría Home Assistant y devuelve si cambió el estado.
function applyService(entity, domain, service, data) {
  const a = entity.attributes;
  if (domain === 'light') {
    if (service === 'turn_off') { entity.state = 'off'; a.brightness = null; return; }
    if (service === 'toggle') return applyService(entity, domain, entity.state === 'on' ? 'turn_off' : 'turn_on', {});
    if (service !== 'turn_on') throw new Error(`Servicio no soportado: light.${service}`);
    const modes = a.supported_color_modes;
    if ('brightness_pct' in data) {
      if (modes.includes('onoff')) throw new Error('Esta luz no admite brillo');
      if (data.brightness_pct <= 0) { entity.state = 'off'; a.brightness = null; return; }
      a.brightness = Math.round(data.brightness_pct / 100 * 255);
    } else if (a.brightness == null) a.brightness = 255;
    if (data.rgb_color) {
      if (!modes.includes('hs')) throw new Error('Esta luz no admite color');
      a.rgb_color = data.rgb_color; a.color_mode = 'hs'; delete a.color_temp_kelvin;
    }
    if (data.color_temp_kelvin) {
      if (!modes.includes('color_temp')) throw new Error('Esta luz no admite temperatura de color');
      a.color_temp_kelvin = Math.max(a.min_color_temp_kelvin, Math.min(a.max_color_temp_kelvin, data.color_temp_kelvin));
      a.color_mode = 'color_temp'; delete a.rgb_color;
    }
    entity.state = 'on';
  } else if (domain === 'switch') {
    if (service === 'toggle') entity.state = entity.state === 'on' ? 'off' : 'on';
    else if (service === 'turn_on' || service === 'turn_off') entity.state = service === 'turn_on' ? 'on' : 'off';
    else throw new Error(`Servicio no soportado: switch.${service}`);
  } else if (domain === 'climate') {
    if (service === 'turn_off') entity.state = 'off';
    else if (service === 'turn_on') entity.state = entity.state === 'off' ? 'cool' : entity.state;
    else if (service === 'set_hvac_mode') {
      if (!a.hvac_modes.includes(data.hvac_mode)) throw new Error('Modo no soportado');
      entity.state = data.hvac_mode;
    } else if (service === 'set_temperature') {
      if (typeof data.temperature !== 'number' || data.temperature < a.min_temp || data.temperature > a.max_temp) throw new Error('Temperatura fuera de rango');
      a.temperature = data.temperature;
    } else if (service === 'set_fan_mode' && a.fan_modes.includes(data.fan_mode)) a.fan_mode = data.fan_mode;
    else if (service === 'set_swing_mode' && a.swing_modes.includes(data.swing_mode)) a.swing_mode = data.swing_mode;
    else if (service === 'set_preset_mode' && a.preset_modes.includes(data.preset_mode)) a.preset_mode = data.preset_mode;
    else throw new Error(`Servicio no soportado: climate.${service}`);
  } else if (domain === 'cover') {
    const supports = bit => (a.supported_features & bit) === bit;
    if (service === 'toggle') return applyService(entity, domain, entity.state === 'closed' ? 'open_cover' : 'close_cover', {});
    if (service === 'open_cover' && supports(1)) { entity.state = 'open'; if (supports(4)) a.current_position = 100; }
    else if (service === 'close_cover' && supports(2)) { entity.state = 'closed'; if (supports(4)) a.current_position = 0; }
    else if (service === 'set_cover_position' && supports(4)) {
      if (typeof data.position !== 'number' || data.position < 0 || data.position > 100) throw new Error('Posición fuera de rango');
      a.current_position = data.position; entity.state = data.position > 0 ? 'open' : 'closed';
    } else throw new Error(`Servicio no soportado: cover.${service}`);
  } else if (domain === 'binary_sensor') {
    // Solo el laboratorio lo cambia: simula abrir o cerrar la puerta o la ventana.
    if (service !== 'toggle') throw new Error(`Servicio no soportado: binary_sensor.${service}`);
    entity.state = entity.state === 'on' ? 'off' : 'on';
  } else if (domain === 'media_player') {
    const supports = bit => (a.supported_features & bit) === bit;
    if (service === 'toggle') return applyService(entity, domain, entity.state === 'off' ? 'turn_on' : 'turn_off', {});
    if (service === 'turn_on' && supports(128)) entity.state = 'on';
    else if (service === 'turn_off' && supports(256)) entity.state = 'off';
    else if (service === 'volume_set' && supports(4)) {
      if (typeof data.volume_level !== 'number' || data.volume_level < 0 || data.volume_level > 1) throw new Error('Volumen fuera de rango');
      a.volume_level = data.volume_level;
    } else if (service === 'volume_mute' && supports(8) && typeof data.is_volume_muted === 'boolean') a.is_volume_muted = data.is_volume_muted;
    else if (service === 'select_source' && supports(2048)) {
      if (!a.source_list.includes(data.source)) throw new Error('Entrada no soportada');
      a.source = data.source;
    } else throw new Error(`Servicio no soportado: media_player.${service}`);
  } else throw new Error(`Dominio no soportado: ${domain}`);
}

function frame(text) {
  const data = Buffer.from(text);
  const header = data.length < 126 ? Buffer.from([0x81, data.length])
    : data.length < 65536 ? Buffer.from([0x81, 126, data.length >> 8, data.length & 255])
    : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), (() => { const b = Buffer.alloc(4); b.writeUInt32BE(data.length); return b; })()]);
  return Buffer.concat([header, data]);
}

function parseFrames(buffer) {
  const messages = [];
  let closed = false;
  while (buffer.length >= 6) {
    let length = buffer[1] & 127, offset = 2;
    if (length === 126) { length = buffer.readUInt16BE(2); offset = 4; }
    else if (length === 127) { length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
    if (buffer.length < offset + 4 + length) break;
    const mask = buffer.subarray(offset, offset + 4);
    const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    const opcode = buffer[0] & 15;
    if (opcode === 1) messages.push(payload.toString());
    if (opcode === 8) closed = true;
    buffer = buffer.subarray(offset + 4 + length);
  }
  return { messages, rest: buffer, closed };
}

const publicState = entity => {
  const { area, ...state } = entity;
  return { ...state, last_changed: entity.last_changed || new Date().toISOString() };
};

function startFakeHomeAssistant({ port = 8123, token = LAB_TOKEN, log = () => {} } = {}) {
  const entities = new Map(demoEntities().map(e => [e.entity_id, e]));
  const clients = new Set();
  const calls = [];

  function broadcastChange(entity, oldState) {
    entity.last_changed = new Date().toISOString();
    const event = { event_type: 'state_changed', data: { entity_id: entity.entity_id, old_state: oldState, new_state: publicState(entity) } };
    for (const client of clients) if (client.subscription) client.send({ id: client.subscription, type: 'event', event });
  }

  function change(entityId, mutate) {
    const entity = entities.get(entityId);
    if (!entity) throw new Error(`Entidad desconocida: ${entityId}`);
    const before = publicState(structuredClone(entity));
    mutate(entity);
    if (JSON.stringify(before) !== JSON.stringify(publicState(entity))) broadcastChange(entity, before);
    return entity;
  }

  function handle(client, message) {
    const reply = (result, success = true, error) => client.send({ id: message.id, type: 'result', success, ...(success ? { result } : { error }) });
    if (!client.authenticated) {
      if (message.type !== 'auth') return;
      if (message.access_token === token) { client.authenticated = true; client.send({ type: 'auth_ok', ha_version: 'lab' }); log('cliente autenticado'); }
      else { client.send({ type: 'auth_invalid', message: 'Invalid access token' }); client.close(); log('token rechazado'); }
      return;
    }
    if (message.type === 'get_states') reply([...entities.values()].map(publicState));
    else if (message.type === 'subscribe_events') { client.subscription = message.id; reply(null); }
    else if (message.type === 'config/area_registry/list') reply(areas);
    else if (message.type === 'config/entity_registry/list') reply([...entities.values()].map(e => ({ entity_id: e.entity_id, area_id: e.area, device_id: null })));
    else if (message.type === 'call_service') {
      const targets = [].concat(message.target?.entity_id || message.service_data?.entity_id || []);
      try {
        for (const id of targets) {
          if (!id.startsWith(`${message.domain}.`)) throw new Error(`${id} no pertenece a ${message.domain}`);
          change(id, entity => applyService(entity, message.domain, message.service, message.service_data || {}));
        }
        calls.push(message);
        log(`${message.domain}.${message.service} → ${targets.join(', ')} ${JSON.stringify(message.service_data || {})}`);
        reply({ context: { id: crypto.randomUUID() } });
      } catch (error) {
        log(`rechazado: ${error.message}`);
        reply(null, false, { code: 'service_validation_error', message: error.message });
      }
    } else reply(null, false, { code: 'unknown_command', message: `Comando no soportado por el laboratorio: ${message.type}` });
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://lab');
    if (url.pathname === '/lab/states') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify([...entities.values()]));
    } else if (url.pathname === '/lab/toggle' && request.method === 'POST') {
      // Simula un interruptor de pared o una automatización: el cambio no viene de Habita.
      try {
        const id = url.searchParams.get('entity_id');
        const domain = id.split('.')[0];
        change(id, entity => applyService(entity, domain, domain === 'climate' ? (entity.state === 'off' ? 'turn_on' : 'turn_off') : 'toggle', {}));
        log(`interruptor manual → ${id}`);
        response.writeHead(204).end();
      } catch (error) {
        response.writeHead(400).end(error.message);
      }
    } else if (url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(page);
    } else response.writeHead(404).end();
  });

  server.on('upgrade', (request, socket) => {
    if (new URL(request.url, 'http://lab').pathname !== '/api/websocket') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const client = {
      authenticated: false,
      subscription: null,
      send: message => { if (!socket.destroyed) socket.write(frame(JSON.stringify(message))); },
      close: () => { socket.end(Buffer.from([0x88, 0])); clients.delete(client); }
    };
    clients.add(client);
    let pending = Buffer.alloc(0);
    socket.on('data', chunk => {
      const { messages, rest, closed } = parseFrames(Buffer.concat([pending, chunk]));
      pending = rest;
      for (const raw of messages) {
        try { handle(client, JSON.parse(raw)); } catch { /* mensaje inválido: se ignora */ }
      }
      if (closed) client.close();
    });
    socket.on('close', () => clients.delete(client));
    socket.on('error', () => clients.delete(client));
    client.send({ type: 'auth_required', ha_version: 'lab' });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = `http://127.0.0.1:${server.address().port}`;
      resolve({
        url: address,
        token,
        calls,
        entities,
        // Cambia un estado como si viniera de fuera de Habita (interruptor, otra app, automatización).
        external: (entityId, mutate) => change(entityId, mutate),
        // Corta todas las conexiones abiertas para probar la reconexión.
        dropClients: () => { for (const client of clients) client.close(); },
        close: () => new Promise(done => { for (const client of clients) client.close(); server.close(() => done()); })
      });
    });
  });
}

const page = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Laboratorio Home Assistant</title>
<style>
:root{color-scheme:dark;--bg:#12161f;--card:#1b2130;--line:#ffffff14;--text:#e6ecf5;--muted:#93a1b5;--on:#f4cc93}
body{margin:0;background:var(--bg);color:var(--text);font:14px system-ui,sans-serif;padding:24px 16px}
main{max-width:760px;margin:auto}h1{font-size:20px;margin:0 0 4px}p{color:var(--muted);margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
button{all:unset;cursor:pointer;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;display:grid;gap:6px}
button:hover{border-color:#ffffff33}button[disabled]{cursor:default}
.dot{width:10px;height:10px;border-radius:50%;background:#56606f;display:inline-block;margin-right:8px}
.on .dot{background:var(--dot,var(--on));box-shadow:0 0 12px var(--dot,var(--on))}
small{color:var(--muted)}code{color:var(--on)}
</style></head><body><main>
<h1>Laboratorio de Home Assistant</h1>
<p>Dispositivos simulados para Habita. Dirección <code id="origin"></code>. Haz clic en un dispositivo para simular su interruptor de pared: Habita debería reflejarlo al instante.</p>
<div class="grid" id="grid"></div></main>
<script>
const label=e=>{const a=e.attributes;if(e.entity_id.startsWith('light.'))return e.state==='on'?Math.round((a.brightness||0)/2.55)+'% · '+(a.rgb_color?'color':a.color_temp_kelvin?a.color_temp_kelvin+' K':'blanco'):'apagada';
if(e.entity_id.startsWith('climate.'))return e.state==='off'?'apagado':e.state+' · '+a.temperature+' °C · ventilador '+a.fan_mode;
if(e.entity_id.startsWith('cover.'))return e.state==='closed'?'cerrada':'abierta'+(a.current_position!=null?' · '+a.current_position+'%':'');
if(e.entity_id.startsWith('binary_sensor.'))return e.state==='on'?'abierta':'cerrada';
if(e.entity_id.startsWith('media_player.'))return e.state==='off'?'apagado':a.source+' · volumen '+Math.round(a.volume_level*100)+'%'+(a.is_volume_muted?' · silencio':'');
if(e.entity_id.startsWith('sensor.'))return e.state+' '+(a.unit_of_measurement||'');return e.state==='on'?'encendido':'apagado';};
async function paint(){const list=await (await fetch('/lab/states')).json();const grid=document.getElementById('grid');grid.replaceChildren(...list.map(e=>{
const b=document.createElement('button');const on=!['off','closed','unavailable'].includes(e.state)&&!e.entity_id.startsWith('sensor.');b.className=on?'on':'';
if(e.attributes.rgb_color)b.style.setProperty('--dot','rgb('+e.attributes.rgb_color.join(',')+')');b.disabled=e.entity_id.startsWith('sensor.');
const t=document.createElement('strong');t.innerHTML='<span class="dot"></span>';t.append(e.attributes.friendly_name);const s=document.createElement('small');s.textContent=e.entity_id+' · '+label(e);
b.append(t,s);b.onclick=async()=>{await fetch('/lab/toggle?entity_id='+encodeURIComponent(e.entity_id),{method:'POST'});paint();};return b;}));}
document.getElementById('origin').textContent=location.origin;paint();setInterval(paint,1000);
</script></body></html>`;

if (require.main === module) {
  const port = Number(process.env.PORT || 8123);
  startFakeHomeAssistant({ port, log: line => console.log(`[${new Date().toLocaleTimeString('es-CL')}] ${line}`) }).then(lab => {
    console.log(`
Laboratorio de Home Assistant en marcha (dispositivos simulados).
  Página     ${lab.url}
En Habita: botón del enchufe → Conectar tu casa real
  Dirección  ${lab.url}
  Token      ${lab.token}

Ctrl+C lo detiene.`);
  }).catch(error => {
    console.error(error.code === 'EADDRINUSE' ? `El puerto ${port} está ocupado. Prueba: PORT=8124 npm run lab` : error);
    process.exit(1);
  });
}

module.exports = { startFakeHomeAssistant, LAB_TOKEN, applyService };
