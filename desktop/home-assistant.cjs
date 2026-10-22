// Cliente de la API WebSocket de Home Assistant. Vive en el proceso principal:
// el renderer nunca ve el token ni abre conexiones de red.
const { EventEmitter } = require('node:events');
const { entityPattern, domainOf, relevant, fromEntity, toService, toClimateCalls, toTvCalls, toCoverCalls, toVacuumCalls, validLightState, validClimateState, validTvState, validCoverState, validVacuumState } = require('./ha-mapping.cjs');

const reconnectDelays = [1000, 2000, 5000, 10000, 30000];
const requestTimeout = 10000;

function websocketUrl(base) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('La dirección debe empezar con http:// o https://');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/websocket`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

class HomeAssistantClient extends EventEmitter {
  constructor({ WebSocket = globalThis.WebSocket, delays = reconnectDelays, timeout = requestTimeout } = {}) {
    super();
    this.WebSocket = WebSocket;
    this.delays = delays;
    this.timeout = timeout;
    this.socket = null;
    this.entities = new Map();
    // Área de Home Assistant de cada entidad (propia o de su dispositivo), para vincular por habitación.
    this.areaOf = new Map();
    this.pending = new Map();
    this.nextId = 1;
    this.attempt = 0;
    this.state = { status: 'disconnected', message: '' };
  }

  // Resuelve con la primera autenticación correcta; rechaza si el token o la dirección fallan.
  // Con `persistent` (conexión guardada al iniciar la app) sigue reintentando hasta lograrlo.
  connect(url, token, { persistent = false } = {}) {
    this.disconnect();
    this.persistent = persistent;
    this.url = url;
    this.token = token;
    this.stopped = false;
    this.attempt = 0;
    return new Promise((resolve, reject) => {
      this.firstConnection = { resolve, reject };
      this.open();
    });
  }

  open() {
    clearTimeout(this.retryTimer);
    this.setStatus('connecting', 'Conectando con Home Assistant…');
    let socket;
    try {
      socket = new this.WebSocket(websocketUrl(this.url));
    } catch (error) {
      this.fail(error.message);
      return;
    }
    this.socket = socket;
    socket.addEventListener('message', event => {
      if (socket !== this.socket) return;
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      this.handle(message);
    });
    socket.addEventListener('close', () => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.rejectPending('Se perdió la conexión con Home Assistant.');
      if (this.stopped) return;
      if (this.firstConnection && !this.persistent) { this.fail('No se pudo conectar. Revisa la dirección y que Home Assistant esté encendido.'); return; }
      const delay = this.delays[Math.min(this.attempt++, this.delays.length - 1)];
      this.setStatus('reconnecting', 'Conexión perdida. Reintentando…');
      this.retryTimer = setTimeout(() => this.open(), delay);
    });
    socket.addEventListener('error', () => {});
  }

  handle(message) {
    if (message.type === 'auth_required') {
      this.send({ type: 'auth', access_token: this.token });
    } else if (message.type === 'auth_invalid') {
      this.stopped = true;
      this.fail('Home Assistant rechazó el token de acceso.');
      this.socket?.close();
    } else if (message.type === 'auth_ok') {
      this.attempt = 0;
      this.setStatus('connected', 'Conectado');
      this.firstConnection?.resolve();
      this.firstConnection = null;
      this.loadEntities();
    } else if (message.type === 'result') {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.success) request.resolve(message.result);
      else request.reject(new Error(message.error?.message || 'Home Assistant no pudo ejecutar la acción.'));
    } else if (message.type === 'event' && message.event?.event_type === 'state_changed') {
      const entity = message.event.data?.new_state;
      if (!relevant(entity)) return;
      this.entities.set(entity.entity_id, entity);
      this.emit('device', this.describe(entity));
    }
  }

  async loadEntities() {
    try {
      await this.request({ type: 'subscribe_events', event_type: 'state_changed' });
      const states = await this.request({ type: 'get_states' });
      this.entities = new Map(states.filter(relevant).map(e => [e.entity_id, e]));
      await this.loadAreas();
      this.emit('devices', this.devices());
    } catch (error) {
      this.emit('warning', error.message);
    }
  }

  // Las áreas son opcionales: sin permisos de registro o en versiones antiguas, se sigue sin ellas.
  async loadAreas() {
    try {
      const [areas, entities, devices] = await Promise.all([
        this.request({ type: 'config/area_registry/list' }),
        this.request({ type: 'config/entity_registry/list' }),
        this.request({ type: 'config/device_registry/list' }).catch(() => [])
      ]);
      const names = new Map(areas.map(area => [area.area_id, String(area.name).slice(0, 80)]));
      const deviceArea = new Map(devices.map(device => [device.id, device.area_id]));
      this.areaOf = new Map(entities.map(e => [e.entity_id, names.get(e.area_id || deviceArea.get(e.device_id)) || null]));
    } catch {
      this.areaOf = new Map();
    }
  }

  describe(entity) {
    return { ...fromEntity(entity), area: this.areaOf.get(entity.entity_id) || null };
  }

  devices() {
    return [...this.entities.values()].map(entity => this.describe(entity)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  entityFor(entityId, domains) {
    if (!entityPattern.test(entityId) || !domains.includes(domainOf(entityId))) throw new Error('Identificador de dispositivo inválido.');
    if (this.state.status !== 'connected') throw new Error('Home Assistant no está conectado.');
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error('Home Assistant no informa ese dispositivo.');
    if (['unavailable', 'unknown'].includes(entity.state)) throw new Error('El dispositivo no está disponible.');
    return entity;
  }

  async setLight(entityId, state) {
    if (!validLightState(state)) throw new Error('Estado de luz inválido.');
    const entity = this.entityFor(entityId, ['light', 'switch']);
    const domain = domainOf(entityId);
    const { service, data } = toService(state, entity.attributes, domain);
    await this.callService(entityId, domain, service, data);
  }

  // Un aire puede necesitar varias llamadas (modo, temperatura, ventilador); van en orden.
  async setClimate(entityId, state) {
    if (!validClimateState(state)) throw new Error('Estado de aire acondicionado inválido.');
    const entity = this.entityFor(entityId, ['climate']);
    for (const { service, data } of toClimateCalls(state, entity)) await this.callService(entityId, 'climate', service, data);
  }

  async setTv(entityId, state) {
    if (!validTvState(state)) throw new Error('Estado de televisor inválido.');
    const entity = this.entityFor(entityId, ['media_player']);
    for (const { service, data } of toTvCalls(state, entity)) await this.callService(entityId, 'media_player', service, data);
  }

  async setCover(entityId, state) {
    if (!validCoverState(state)) throw new Error('Estado de cortina inválido.');
    const entity = this.entityFor(entityId, ['cover']);
    for (const { service, data } of toCoverCalls(state, entity)) await this.callService(entityId, 'cover', service, data);
  }

  async setVacuum(entityId, state) {
    if (!validVacuumState(state)) throw new Error('Estado de aspiradora inválido.');
    const entity = this.entityFor(entityId, ['vacuum']);
    for (const { service, data } of toVacuumCalls(state, entity)) await this.callService(entityId, 'vacuum', service, data);
  }

  // Cada orden queda informada (sin token) para el registro de eventos.
  async callService(entityId, domain, service, data) {
    const started = Date.now();
    const report = extra => this.emit('command', { entityId, service: `${domain}.${service}`, data, ms: Date.now() - started, ...extra });
    try {
      await this.request({ type: 'call_service', domain, service, service_data: data, target: { entity_id: entityId } });
      report({ ok: true });
    } catch (error) {
      report({ ok: false, error: error.message });
      throw error;
    }
  }

  request(payload) {
    if (!this.socket) return Promise.reject(new Error('Home Assistant no está conectado.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Home Assistant no respondió a tiempo.'));
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, ...payload });
    });
  }

  send(message) {
    this.socket?.send(JSON.stringify(message));
  }

  rejectPending(reason) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(reason));
    }
    this.pending.clear();
  }

  fail(message) {
    this.setStatus('error', message);
    this.firstConnection?.reject(new Error(message));
    this.firstConnection = null;
  }

  setStatus(status, message) {
    this.state = { status, message };
    this.emit('status', this.state);
  }

  disconnect() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.rejectPending('Conexión cerrada.');
    this.firstConnection?.reject(new Error('Conexión cancelada.'));
    this.firstConnection = null;
    this.entities = new Map();
    if (this.state.status !== 'disconnected') this.setStatus('disconnected', '');
  }
}

module.exports = { HomeAssistantClient, websocketUrl };
