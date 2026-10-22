import { test } from 'node:test';
import assert from 'node:assert/strict';
import mapping from '../desktop/ha-mapping.cjs';
import client from '../desktop/home-assistant.cjs';
import { validLight } from '../src/devices/lighting.js';
import { createHistory } from '../src/ui/history.js';

const { fromEntity, toService, toClimateCalls } = mapping;
const { HomeAssistantClient, websocketUrl } = client;

const colorLamp = {
  entity_id: 'light.living',
  state: 'on',
  attributes: {
    friendly_name: 'Lámpara living', supported_color_modes: ['color_temp', 'hs'], color_mode: 'color_temp',
    brightness: 128, color_temp_kelvin: 2700, min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500
  }
};

test('el estado de Home Assistant se traduce a la luz de la maqueta', () => {
  const live = fromEntity(colorLamp);
  assert.equal(live.name, 'Lámpara living');
  assert.deepEqual(live.supports, { color: true, temperature: true, dimmable: true });
  assert.deepEqual(live.light, { on: true, brightness: 50, mode: 'temperature', warmth: 84 });
  const color = fromEntity({ ...colorLamp, attributes: { ...colorLamp.attributes, color_mode: 'hs', rgb_color: [136, 186, 255] } });
  assert.deepEqual(color.light, { on: true, brightness: 50, mode: 'color', color: '#88baff' });
  // Apagada solo informa el encendido: el brillo y el color de la maqueta se conservan.
  assert.deepEqual(fromEntity({ ...colorLamp, state: 'off', attributes: { ...colorLamp.attributes, brightness: null } }).light, { on: false });
  assert.equal(fromEntity({ ...colorLamp, state: 'unavailable' }).available, false);
});

test('la luz de la maqueta se traduce a servicios que la lámpara admite', () => {
  const base = { on: true, brightness: 40, warmth: 100, mode: 'temperature', color: '#88baff' };
  assert.ok(validLight(base));
  assert.deepEqual(toService(base, colorLamp.attributes), { service: 'turn_on', data: { brightness_pct: 40, color_temp_kelvin: 2000 } });
  assert.deepEqual(toService({ ...base, mode: 'color' }, colorLamp.attributes), { service: 'turn_on', data: { brightness_pct: 40, rgb_color: [136, 186, 255] } });
  assert.deepEqual(toService({ ...base, on: false }, colorLamp.attributes), { service: 'turn_off', data: {} });
  assert.deepEqual(toService({ ...base, brightness: 0 }, colorLamp.attributes), { service: 'turn_off', data: {} });
  // Una luz que solo enciende y apaga no recibe brillo ni color.
  assert.deepEqual(toService({ ...base, mode: 'color' }, { supported_color_modes: ['onoff'] }), { service: 'turn_on', data: {} });
});

test('la dirección se convierte al WebSocket de Home Assistant', () => {
  assert.equal(websocketUrl('http://homeassistant.local:8123'), 'ws://homeassistant.local:8123/api/websocket');
  assert.equal(websocketUrl('https://casa.example.com/ha/'), 'wss://casa.example.com/ha/api/websocket');
  assert.throws(() => websocketUrl('file:///c:/x'), /http/);
});

// Servidor falso con el protocolo de autenticación, estados, eventos y servicios.
function fakeHomeAssistant({ token = 'token-correcto-de-prueba-123', entities = [colorLamp] } = {}) {
  const server = { sockets: [], calls: [] };
  server.WebSocket = class {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      server.sockets.push(this);
      queueMicrotask(() => this.receive({ type: 'auth_required' }));
    }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    receive(message) { for (const callback of this.listeners.message || []) callback({ data: JSON.stringify(message) }); }
    close() { if (this.closed) return; this.closed = true; queueMicrotask(() => (this.listeners.close || []).forEach(callback => callback())); }
    send(raw) {
      const message = JSON.parse(raw);
      const reply = result => queueMicrotask(() => this.receive({ id: message.id, type: 'result', success: true, result }));
      if (message.type === 'auth') queueMicrotask(() => this.receive({ type: message.access_token === token ? 'auth_ok' : 'auth_invalid' }));
      else if (message.type === 'get_states') reply([...entities, { entity_id: 'sensor.temperatura', state: '21' }]);
      else if (message.type === 'subscribe_events') reply(null);
      else if (message.type === 'call_service') { server.calls.push(message); reply({}); }
    }
  };
  return server;
}

test('el cliente se autentica, lista solo luces, recibe cambios y llama servicios', async () => {
  const server = fakeHomeAssistant();
  const ha = new HomeAssistantClient({ WebSocket: server.WebSocket, delays: [5] });
  const lightsLoaded = new Promise(resolve => ha.once('devices', resolve));
  await ha.connect('http://ha.local:8123', 'token-correcto-de-prueba-123');
  assert.equal(server.sockets[0].url, 'ws://ha.local:8123/api/websocket');
  assert.deepEqual((await lightsLoaded).map(l => l.entityId), ['light.living']);

  const changed = new Promise(resolve => ha.once('device', resolve));
  server.sockets[0].receive({ type: 'event', event: { event_type: 'state_changed', data: { new_state: { ...colorLamp, state: 'off' } } } });
  assert.equal((await changed).light.on, false);

  await ha.setLight('light.living', { on: true, brightness: 80, warmth: 0, mode: 'temperature', color: '#ffffff' });
  assert.deepEqual(server.calls[0], { id: server.calls[0].id, type: 'call_service', domain: 'light', service: 'turn_on', service_data: { brightness_pct: 80, color_temp_kelvin: 6500 }, target: { entity_id: 'light.living' } });
  await assert.rejects(ha.setLight('sensor.calefactor', { on: true, brightness: 80, warmth: 0, mode: 'temperature', color: '#ffffff' }), /inválido/);
  await assert.rejects(ha.setLight('light.living', { on: 'sí' }), /inválido/);

  // Al perder la conexión se reintenta solo y vuelve a autenticarse.
  const reconnected = new Promise(resolve => ha.on('status', s => { if (s.status === 'connected') resolve(); }));
  server.sockets[0].close();
  await reconnected;
  assert.equal(server.sockets.length, 2);
  ha.disconnect();
  assert.equal(ha.state.status, 'disconnected');
});

test('un token inválido se informa y no se reintenta', async () => {
  const server = fakeHomeAssistant();
  const ha = new HomeAssistantClient({ WebSocket: server.WebSocket, delays: [5] });
  await assert.rejects(ha.connect('http://ha.local:8123', 'token-incorrecto-de-prueba'), /rechazó el token/);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(server.sockets.length, 1);
  assert.equal(ha.state.status, 'error');
});

test('el historial guarda un paso por gesto y rehacer se limpia al registrar', () => {
  const history = createHistory(2);
  history.record('a'); history.record('b'); history.record('c');
  assert.equal(history.undo('d'), 'c');
  assert.equal(history.undo('c'), 'b');
  assert.equal(history.undo('b'), null);
  assert.equal(history.redo('b'), 'c');
  history.record('x');
  assert.equal(history.canRedo, false);
});

test('el cliente real funciona contra el laboratorio por un WebSocket de verdad', async () => {
  const { startFakeHomeAssistant } = (await import('../tools/lab/fake-home-assistant.cjs')).default;
  const lab = await startFakeHomeAssistant({ port: 0 });
  const ha = new HomeAssistantClient({ delays: [20] });
  try {
    const loaded = new Promise(resolve => ha.once('devices', resolve));
    await ha.connect(lab.url, lab.token);
    const lights = await loaded;
    assert.deepEqual(lights.map(l => l.entityId).sort(), ['binary_sensor.puerta_acceso', 'binary_sensor.ventana_living', 'climate.living', 'cover.dormitorio_persiana', 'cover.living_cortina', 'light.dormitorio', 'light.living_pie', 'light.living_techo', 'light.tira_tv', 'media_player.living_tv', 'sensor.consumo_cocina', 'sensor.consumo_living', 'sensor.humedad_living', 'sensor.temperatura_dormitorio', 'sensor.temperatura_living', 'switch.lampara_enchufe', 'vacuum.robot_living']);
    assert.deepEqual(lights.find(l => l.entityId === 'light.dormitorio').supports, { color: false, temperature: false, dimmable: true });

    const changed = new Promise(resolve => ha.on('device', light => { if (light.entityId === 'light.tira_tv') resolve(light); }));
    await ha.setLight('light.tira_tv', { on: true, brightness: 25, warmth: 0, mode: 'color', color: '#ff0000' });
    const live = await changed;
    assert.deepEqual(live.light, { on: true, brightness: 25, mode: 'color', color: '#ff0000' });
    assert.equal(lab.entities.get('light.tira_tv').attributes.brightness, 64);

    // Un cambio externo (interruptor de pared) llega como evento.
    const external = new Promise(resolve => ha.on('device', light => { if (light.entityId === 'light.dormitorio') resolve(light); }));
    lab.external('light.dormitorio', e => { e.state = 'off'; e.attributes.brightness = null; });
    assert.equal((await external).light.on, false);

    // El laboratorio rechaza lo que una luz no admite, como Home Assistant.
    await assert.rejects(ha.request({ type: 'call_service', domain: 'light', service: 'turn_on', service_data: { rgb_color: [1, 2, 3] }, target: { entity_id: 'light.dormitorio' } }), /no admite color/);
  } finally {
    ha.disconnect();
    await lab.close();
  }
});

const ac = {
  entity_id: 'climate.living',
  state: 'cool',
  attributes: { friendly_name: 'Aire living', hvac_modes: ['off', 'cool', 'heat', 'fan_only', 'heat_cool'], fan_modes: ['auto', 'Low', 'mid', 'high'], fan_mode: 'mid', min_temp: 17, max_temp: 30, target_temp_step: 1, temperature: 24, current_temperature: 26.5 }
};

test('enchufes y aires de Home Assistant se traducen a la maqueta', () => {
  const plug = fromEntity({ entity_id: 'switch.enchufe', state: 'on', attributes: { friendly_name: 'Enchufe' } });
  assert.equal(plug.kind, 'light');
  assert.deepEqual(plug.supports, { color: false, temperature: false, dimmable: false });
  assert.deepEqual(plug.light, { on: true, brightness: 100 });
  assert.deepEqual(toService({ on: true, brightness: 30, warmth: 50, mode: 'color', color: '#ff0000' }, {}, 'switch'), { service: 'turn_on', data: {} });

  const live = fromEntity(ac);
  assert.equal(live.kind, 'climate');
  assert.deepEqual(live.climate, { on: true, mode: 'cool', target: 24, fan: 'medium' });
  assert.equal(live.current, 26.5);
  assert.deepEqual(live.supports, { modes: ['cool', 'heat', 'fan', 'auto'], fans: ['auto', 'low', 'medium', 'high'], min: 17, max: 30, step: 1, swing: false });
  assert.deepEqual(fromEntity({ ...ac, state: 'off' }).climate, { on: false, target: 24, fan: 'medium' });
  assert.equal(fromEntity({ ...ac, state: 'heat_cool' }).climate.mode, 'auto');
});

test('el aire solo recibe las llamadas que cambian algo y que admite', () => {
  const state = { on: true, mode: 'cool', target: 24, fan: 'medium' };
  assert.deepEqual(toClimateCalls(state, ac), []);
  assert.deepEqual(toClimateCalls({ ...state, mode: 'auto', target: 21.4, fan: 'low' }, ac), [
    { service: 'set_hvac_mode', data: { hvac_mode: 'heat_cool' } },
    { service: 'set_temperature', data: { temperature: 21 } },
    { service: 'set_fan_mode', data: { fan_mode: 'Low' } }
  ]);
  assert.deepEqual(toClimateCalls({ ...state, target: 12 }, ac), [{ service: 'set_temperature', data: { temperature: 17 } }]);
  assert.deepEqual(toClimateCalls({ ...state, on: false }, ac), [{ service: 'set_hvac_mode', data: { hvac_mode: 'off' } }]);
  assert.deepEqual(toClimateCalls({ ...state, on: false }, { ...ac, state: 'off' }), []);
  assert.throws(() => toClimateCalls({ ...state, mode: 'dry' }, ac), /no admite ese modo/);
});

test('la oscilación de la aleta se lee y se envía solo si el equipo la admite', () => {
  const state = { on: true, mode: 'cool', target: 24, fan: 'medium' };
  const swinging = { ...ac, attributes: { ...ac.attributes, swing_modes: ['off', 'vertical', 'horizontal', 'both'], swing_mode: 'off' } };
  assert.equal(fromEntity(swinging).supports.swing, true);
  assert.equal(fromEntity(swinging).climate.swing, false);
  assert.equal(fromEntity(ac).supports.swing, false);
  assert.deepEqual(toClimateCalls({ ...state, swing: true }, swinging), [{ service: 'set_swing_mode', data: { swing_mode: 'both' } }]);
  // Ya oscila en horizontal: cuenta como oscilando y no se cambia.
  assert.deepEqual(toClimateCalls({ ...state, swing: true }, { ...swinging, attributes: { ...swinging.attributes, swing_mode: 'horizontal' } }), []);
  assert.deepEqual(toClimateCalls({ ...state, swing: false }, { ...swinging, attributes: { ...swinging.attributes, swing_mode: 'both' } }), [{ service: 'set_swing_mode', data: { swing_mode: 'off' } }]);
  assert.deepEqual(toClimateCalls({ ...state, swing: true }, ac), []);
  assert.equal(mapping.validClimateState({ ...state, swing: 'yes' }), false);
});

test('el laboratorio responde a enchufes y aires como Home Assistant', async () => {
  const { startFakeHomeAssistant } = (await import('../tools/lab/fake-home-assistant.cjs')).default;
  const lab = await startFakeHomeAssistant({ port: 0 });
  const ha = new HomeAssistantClient({ delays: [20] });
  try {
    const loaded = new Promise(resolve => ha.once('devices', resolve));
    await ha.connect(lab.url, lab.token);
    await loaded;
    await ha.setLight('switch.lampara_enchufe', { on: true, brightness: 100, warmth: 50, mode: 'temperature', color: '#ffffff' });
    assert.equal(lab.entities.get('switch.lampara_enchufe').state, 'on');
    const changed = new Promise(resolve => ha.on('device', d => { if (d.entityId === 'climate.living' && d.climate.mode === 'heat' && d.climate.target === 21) resolve(d); }));
    await ha.setClimate('climate.living', { on: true, mode: 'heat', target: 21, fan: 'high' });
    const live = await changed;
    assert.equal(lab.entities.get('climate.living').attributes.fan_mode, 'high');
    assert.equal(live.current, 25.5);
    await ha.setClimate('climate.living', { on: false, mode: 'heat', target: 21, fan: 'high' });
    assert.equal(lab.entities.get('climate.living').state, 'off');
    await assert.rejects(ha.setClimate('light.dormitorio', { on: true, mode: 'heat', target: 21, fan: 'high' }), /inválido/);
  } finally {
    ha.disconnect();
    await lab.close();
  }
});
