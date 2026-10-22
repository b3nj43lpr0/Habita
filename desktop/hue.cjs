// Philips Hue sin Home Assistant: el puente se vincula pulsando su botón y las luces se controlan
// con su API local (v1). Como esa API no avisa los cambios, se consulta cada 2 s. Las luces llegan
// a Habita con el mismo formato que las de Home Assistant (entityId «hue.light_<id>»).
const { EventEmitter } = require('node:events');

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const toHex = rgb => '#' + rgb.map(n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('');

// Conversión de color de Philips (gamut amplio, gamma sRGB).
function rgbToXy(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c > .04045 ? ((c + .055) / 1.055) ** 2.4 : c / 12.92);
  const X = r * .664511 + g * .154324 + b * .162028, Y = r * .283881 + g * .668433 + b * .047685, Z = r * .000088 + g * .07231 + b * .986039;
  const sum = X + Y + Z;
  return sum ? [Math.round(X / sum * 10000) / 10000, Math.round(Y / sum * 10000) / 10000] : [.3227, .329];
}
function xyToHex([x, y]) {
  const Y = 1, X = Y / y * x, Z = Y / y * (1 - x - y);
  let rgb = [X * 1.656492 - Y * .354851 - Z * .255038, -X * .707196 + Y * 1.655397 + Z * .036152, X * .051713 - Y * .121364 + Z * 1.01153];
  const max = Math.max(...rgb, 1e-6);
  rgb = rgb.map(c => clamp(c / max, 0, 1)).map(c => c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055);
  return toHex(rgb.map(c => c * 255));
}

function capabilities(light) {
  const control = light.capabilities?.control || {};
  return {
    color: 'xy' in (light.state || {}),
    temperature: 'ct' in (light.state || {}),
    dimmable: 'bri' in (light.state || {}),
    ct: { min: control.ct?.min || 153, max: control.ct?.max || 500 }
  };
}

function fromHueLight(id, light) {
  const s = light.state || {}, caps = capabilities(light);
  const state = { on: !!s.on };
  if (state.on) {
    state.brightness = caps.dimmable ? clamp(Math.round(s.bri / 254 * 100), 1, 100) : 100;
    if (s.colormode === 'xy' && caps.color) { state.mode = 'color'; state.color = xyToHex(s.xy); }
    else if (s.colormode === 'ct' && caps.temperature) { state.mode = 'temperature'; state.warmth = clamp(Math.round((s.ct - caps.ct.min) / (caps.ct.max - caps.ct.min) * 100), 0, 100); }
  }
  return {
    entityId: `hue.light_${String(id).replace(/[^a-z0-9_]/gi, '').toLowerCase()}`,
    name: typeof light.name === 'string' ? light.name.slice(0, 120) : `Hue ${id}`,
    available: s.reachable !== false,
    kind: 'light',
    source: 'hue',
    supports: { color: caps.color, temperature: caps.temperature, dimmable: caps.dimmable },
    light: state
  };
}

// Cuerpo del PUT /lights/<id>/state: solo lo que la luz admite (la calidez 100 = más cálida).
function toHueState(state, light) {
  if (!state.on || state.brightness <= 0) return { on: false };
  const caps = capabilities(light), body = { on: true };
  if (caps.dimmable) body.bri = clamp(Math.round(state.brightness / 100 * 254), 1, 254);
  if (state.mode === 'color' && caps.color) body.xy = rgbToXy(state.color);
  else if (state.mode === 'temperature' && caps.temperature) body.ct = Math.round(caps.ct.min + state.warmth / 100 * (caps.ct.max - caps.ct.min));
  return body;
}

class HueClient extends EventEmitter {
  constructor({ fetch = globalThis.fetch, interval = 2000, timeout = 5000 } = {}) {
    super();
    this.fetch = fetch;
    this.interval = interval;
    this.timeout = timeout;
    this.host = '';
    this.username = '';
    this.lights = new Map();
    this.state = { status: 'disconnected', message: '' };
    this.timer = null;
  }

  async call(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetch(`http://${this.host}${path}`, { method, body: body && JSON.stringify(body), headers: body ? { 'content-type': 'application/json' } : undefined, signal: controller.signal });
      const data = await response.json();
      const error = Array.isArray(data) && data.find(entry => entry.error)?.error;
      if (error) { const e = new Error(error.description || 'El puente Hue rechazó la orden.'); e.type = error.type; throw e; }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('El puente Hue no respondió.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // Vincular: el puente entrega un usuario solo si su botón se pulsó en los últimos 30 s.
  async pair(host) {
    this.host = validHost(host);
    try {
      const reply = await this.call('/api', { method: 'POST', body: { devicetype: 'habita#windows' } });
      const username = reply?.[0]?.success?.username;
      if (typeof username !== 'string') throw new Error('Respuesta inesperada del puente Hue.');
      return username;
    } catch (error) {
      if (error.type === 101) throw new Error('Pulsa el botón redondo del puente Hue y vuelve a intentarlo dentro de 30 segundos.');
      throw error;
    }
  }

  setStatus(status, message = '') {
    if (this.state.status === status && this.state.message === message) return;
    this.state = { status, message };
    this.emit('status', this.state);
  }

  async connect(host, username) {
    this.disconnect();
    this.host = validHost(host);
    this.username = String(username);
    this.setStatus('connecting', 'Conectando con el puente Hue…');
    await this.poll(true);
    this.timer = setInterval(() => this.poll().catch(() => {}), this.interval);
    this.timer.unref?.();
  }

  async poll(first = false) {
    try {
      const data = await this.call(`/api/${encodeURIComponent(this.username)}/lights`);
      const next = new Map(Object.entries(data || {}).map(([id, light]) => [id, light]));
      const before = this.lights;
      this.lights = next;
      this.setStatus('connected', 'Puente Hue conectado');
      if (first || before.size !== next.size) this.emit('devices', this.devices());
      else for (const [id, light] of next) if (JSON.stringify(light.state) !== JSON.stringify(before.get(id)?.state)) this.emit('device', fromHueLight(id, light));
    } catch (error) {
      this.setStatus('error', error.message);
      if (first) throw error;
    }
  }

  devices() {
    return [...this.lights].map(([id, light]) => fromHueLight(id, light));
  }

  async setLight(entityId, state) {
    const id = [...this.lights.keys()].find(key => fromHueLight(key, this.lights.get(key)).entityId === entityId);
    if (!id) throw new Error('El puente Hue no informa esa luz.');
    const body = toHueState(state, this.lights.get(id)), started = Date.now();
    try {
      await this.call(`/api/${encodeURIComponent(this.username)}/lights/${encodeURIComponent(id)}/state`, { method: 'PUT', body });
      this.emit('command', { entityId, service: 'hue.state', data: body, ms: Date.now() - started, ok: true });
    } catch (error) {
      this.emit('command', { entityId, service: 'hue.state', data: body, ms: Date.now() - started, ok: false, error: error.message });
      throw error;
    }
    setTimeout(() => this.poll().catch(() => {}), 150).unref?.();
  }

  disconnect() {
    clearInterval(this.timer);
    this.timer = null;
    this.lights = new Map();
    this.setStatus('disconnected', '');
  }
}

// Solo direcciones de la red local: IPv4 o nombres sin esquema ni ruta.
function validHost(host) {
  if (typeof host !== 'string' || !/^[a-z0-9.-]{1,100}(:\d{1,5})?$/i.test(host.trim())) throw new Error('Dirección del puente Hue inválida.');
  return host.trim();
}

module.exports = { HueClient, fromHueLight, toHueState, rgbToXy, xyToHex, validHost };
