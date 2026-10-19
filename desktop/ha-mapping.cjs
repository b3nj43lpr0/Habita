// Traducción entre los estados de Habita y las entidades de Home Assistant.
// Luz:   { on, brightness 0-100, warmth 0-100 (100 = cálido), mode 'temperature'|'color', color '#rrggbb' }
//        ← light.* y switch.* (un enchufe es una luz que solo enciende y apaga).
// Clima: { on, mode 'cool'|'heat'|'dry'|'fan'|'auto', target °C, fan 'auto'|'low'|'medium'|'high' }
//        ← climate.*
// TV:    { on, volume 0-100, muted, source '' | nombre de entrada }
//        ← media_player.* (solo lo que permite supported_features)
// Cortina: { position 0-100 (100 = abierta) } ← cover.*
// Solo lectura: sensor.* de temperatura o humedad y binary_sensor.* de puertas y ventanas.
const colorModes = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
const entityPattern = /^(light|switch|climate|media_player|cover|sensor|binary_sensor)\.[a-z0-9_]{1,200}$/;
const clamp = n => Math.max(0, Math.min(100, Math.round(n)));
const domainOf = entityId => entityId.split('.')[0];
const measures = ['temperature', 'humidity', 'power'];
const contactClasses = ['door', 'window', 'opening', 'garage_door'];

// De los sensores solo interesan temperatura, humedad y aperturas; el resto no se carga.
function relevant(entity) {
  if (!entity || typeof entity.entity_id !== 'string' || !entityPattern.test(entity.entity_id)) return false;
  const deviceClass = entity.attributes?.device_class;
  const domain = domainOf(entity.entity_id);
  if (domain === 'sensor') return measures.includes(deviceClass);
  if (domain === 'binary_sensor') return contactClasses.includes(deviceClass);
  return true;
}

// Bits de CoverEntityFeature: abrir 1, cerrar 2, posición 4.
function coverCapabilities(attributes = {}) {
  const bits = Number.isInteger(attributes.supported_features) ? attributes.supported_features : 0;
  return { open: (bits & 1) === 1, close: (bits & 2) === 2, position: (bits & 4) === 4 };
}

// Nombres de Home Assistant para los modos de Habita, en orden de preferencia.
const hvacNames = { cool: ['cool'], heat: ['heat'], dry: ['dry'], fan: ['fan_only'], auto: ['auto', 'heat_cool'] };
const fanNames = { auto: ['auto'], low: ['low', 'quiet', 'silent'], medium: ['medium', 'mid', 'middle'], high: ['high', 'strong', 'turbo'] };
const habitaMode = hvac => Object.keys(hvacNames).find(mode => hvacNames[mode].includes(hvac));
const habitaFan = fan => Object.keys(fanNames).find(speed => fanNames[speed].includes(String(fan).toLowerCase()));

function capabilities(attributes = {}) {
  const modes = Array.isArray(attributes.supported_color_modes) ? attributes.supported_color_modes : [];
  return {
    color: modes.some(mode => colorModes.includes(mode)),
    temperature: modes.includes('color_temp'),
    dimmable: modes.some(mode => mode !== 'onoff')
  };
}

function climateCapabilities(attributes = {}) {
  const hvac = Array.isArray(attributes.hvac_modes) ? attributes.hvac_modes : [];
  const fans = Array.isArray(attributes.fan_modes) ? attributes.fan_modes : [];
  const swings = Array.isArray(attributes.swing_modes) ? attributes.swing_modes : [];
  const number = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return {
    modes: Object.keys(hvacNames).filter(mode => hvacNames[mode].some(name => hvac.includes(name))),
    fans: Object.keys(fanNames).filter(speed => fans.some(fan => habitaFan(fan) === speed)),
    min: number(attributes.min_temp, 16),
    max: number(attributes.max_temp, 30),
    step: number(attributes.target_temp_step, .5),
    // Oscilación: hace falta poder apagarla y al menos un modo que no sea «off».
    swing: swings.includes('off') && swings.some(swing => swing !== 'off')
  };
}

function kelvinRange(attributes = {}) {
  const min = Number.isFinite(attributes.min_color_temp_kelvin) ? attributes.min_color_temp_kelvin : 2000;
  const max = Number.isFinite(attributes.max_color_temp_kelvin) ? attributes.max_color_temp_kelvin : 6500;
  return max > min ? { min, max } : { min: 2000, max: 6500 };
}

// Bits de MediaPlayerEntityFeature en Home Assistant.
const feature = { volumeSet: 4, volumeMute: 8, selectSource: 2048, turnOn: 128, turnOff: 256 };
const offStates = ['off', 'standby', 'unavailable', 'unknown'];

function tvCapabilities(attributes = {}) {
  const bits = Number.isInteger(attributes.supported_features) ? attributes.supported_features : 0;
  const has = bit => (bits & bit) === bit;
  const list = Array.isArray(attributes.source_list) ? attributes.source_list : [];
  return {
    power: has(feature.turnOn) && has(feature.turnOff),
    volume: has(feature.volumeSet),
    mute: has(feature.volumeMute),
    sources: has(feature.selectSource) ? list.filter(s => typeof s === 'string' && s && s.length <= 80).slice(0, 40) : []
  };
}

const toHex = rgb => '#' + rgb.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
const fromHex = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// Devuelve solo los campos que el dispositivo informa; el resto conserva el valor de la maqueta.
function fromEntity(entity) {
  const attributes = entity.attributes || {};
  const domain = domainOf(entity.entity_id);
  const available = !['unavailable', 'unknown'].includes(entity.state);
  const base = {
    entityId: entity.entity_id,
    name: typeof attributes.friendly_name === 'string' ? attributes.friendly_name.slice(0, 120) : entity.entity_id,
    available
  };
  if (domain === 'climate') {
    const climate = { on: available && entity.state !== 'off' };
    const mode = habitaMode(entity.state);
    if (mode) climate.mode = mode;
    if (typeof attributes.temperature === 'number') climate.target = attributes.temperature;
    const fan = habitaFan(attributes.fan_mode);
    if (fan) climate.fan = fan;
    if (typeof attributes.swing_mode === 'string') climate.swing = attributes.swing_mode !== 'off';
    const current = typeof attributes.current_temperature === 'number' ? attributes.current_temperature : null;
    return { ...base, kind: 'climate', supports: climateCapabilities(attributes), climate, current };
  }
  if (domain === 'sensor') {
    const value = Number(entity.state);
    const unit = typeof attributes.unit_of_measurement === 'string' ? attributes.unit_of_measurement.slice(0, 10) : '';
    return { ...base, available: available && Number.isFinite(value), kind: 'sensor', supports: {}, sensor: { measure: attributes.device_class, value: Number.isFinite(value) ? value : null, unit } };
  }
  if (domain === 'binary_sensor') return { ...base, kind: 'contact', supports: {}, contact: { open: entity.state === 'on' } };
  if (domain === 'cover') {
    const position = typeof attributes.current_position === 'number' ? clamp(attributes.current_position) : ['open', 'opening'].includes(entity.state) ? 100 : 0;
    return { ...base, kind: 'cover', supports: coverCapabilities(attributes), cover: { position } };
  }
  if (domain === 'media_player') {
    const tv = { on: !offStates.includes(entity.state) };
    if (typeof attributes.volume_level === 'number') tv.volume = clamp(attributes.volume_level * 100);
    if (typeof attributes.is_volume_muted === 'boolean') tv.muted = attributes.is_volume_muted;
    if (typeof attributes.source === 'string' && attributes.source.length <= 80) tv.source = attributes.source;
    return { ...base, kind: 'tv', supports: tvCapabilities(attributes), tv };
  }
  if (domain === 'switch') {
    return { ...base, kind: 'light', supports: { color: false, temperature: false, dimmable: false }, light: { on: entity.state === 'on', ...(entity.state === 'on' ? { brightness: 100 } : {}) } };
  }
  const supports = capabilities(attributes);
  const light = { on: entity.state === 'on' };
  if (light.on && typeof attributes.brightness === 'number') light.brightness = clamp(attributes.brightness / 255 * 100);
  else if (light.on && !supports.dimmable) light.brightness = 100;
  if (light.on && colorModes.includes(attributes.color_mode) && Array.isArray(attributes.rgb_color)) {
    light.mode = 'color';
    light.color = toHex(attributes.rgb_color);
  } else if (light.on && typeof attributes.color_temp_kelvin === 'number') {
    const { min, max } = kelvinRange(attributes);
    light.mode = 'temperature';
    light.warmth = clamp((max - attributes.color_temp_kelvin) / (max - min) * 100);
  }
  return { ...base, kind: 'light', supports, light };
}

function validLightState(state) {
  return !!state && typeof state === 'object' && typeof state.on === 'boolean' &&
    [state.brightness, state.warmth].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100) &&
    ['temperature', 'color'].includes(state.mode) && typeof state.color === 'string' && /^#[\da-f]{6}$/i.test(state.color);
}

function validClimateState(state) {
  return !!state && typeof state === 'object' && typeof state.on === 'boolean' &&
    Object.keys(hvacNames).includes(state.mode) && Object.keys(fanNames).includes(state.fan) && (state.swing === undefined || typeof state.swing === 'boolean') &&
    typeof state.target === 'number' && Number.isFinite(state.target) && state.target >= 10 && state.target <= 35;
}

function validTvState(state) {
  return !!state && typeof state === 'object' && typeof state.on === 'boolean' && typeof state.muted === 'boolean' &&
    typeof state.volume === 'number' && Number.isFinite(state.volume) && state.volume >= 0 && state.volume <= 100 &&
    typeof state.source === 'string' && state.source.length <= 80;
}

// Llamadas para llevar el televisor al estado pedido: solo lo que cambia y lo que el equipo admite.
function toTvCalls(state, entity) {
  const attributes = entity.attributes || {};
  const supports = tvCapabilities(attributes);
  const on = !offStates.includes(entity.state);
  if (!state.on) return on && supports.power ? [{ service: 'turn_off', data: {} }] : [];
  const calls = [];
  if (!on && supports.power) calls.push({ service: 'turn_on', data: {} });
  if (supports.volume && clamp(state.volume) !== (typeof attributes.volume_level === 'number' ? clamp(attributes.volume_level * 100) : null)) {
    calls.push({ service: 'volume_set', data: { volume_level: clamp(state.volume) / 100 } });
  }
  if (supports.mute && state.muted !== attributes.is_volume_muted) calls.push({ service: 'volume_mute', data: { is_volume_muted: state.muted } });
  if (state.source && supports.sources.includes(state.source) && state.source !== attributes.source) calls.push({ service: 'select_source', data: { source: state.source } });
  return calls;
}

function validCoverState(state) {
  return !!state && typeof state === 'object' && typeof state.position === 'number' && Number.isFinite(state.position) && state.position >= 0 && state.position <= 100;
}

// Con posición se envía el porcentaje; si el motor solo abre y cierra, se redondea a una de las dos.
function toCoverCalls(state, entity) {
  const attributes = entity.attributes || {};
  const supports = coverCapabilities(attributes);
  const target = clamp(state.position);
  const current = typeof attributes.current_position === 'number' ? clamp(attributes.current_position) : null;
  if (supports.position) return current === target ? [] : [{ service: 'set_cover_position', data: { position: target } }];
  if (target >= 50) return supports.open && !['open', 'opening'].includes(entity.state) ? [{ service: 'open_cover', data: {} }] : [];
  return supports.close && !['closed', 'closing'].includes(entity.state) ? [{ service: 'close_cover', data: {} }] : [];
}

// Solo se envían los atributos que la luz admite; Home Assistant rechaza el resto.
function toService(state, attributes = {}, domain = 'light') {
  if (!state.on || state.brightness <= 0) return { service: 'turn_off', data: {} };
  if (domain === 'switch') return { service: 'turn_on', data: {} };
  const supports = capabilities(attributes);
  const data = {};
  if (supports.dimmable) data.brightness_pct = clamp(state.brightness);
  if (state.mode === 'color' && supports.color) data.rgb_color = fromHex(state.color);
  else if (state.mode === 'temperature' && supports.temperature) {
    const { min, max } = kelvinRange(attributes);
    data.color_temp_kelvin = Math.round(max - state.warmth / 100 * (max - min));
  }
  return { service: 'turn_on', data };
}

// Llamadas necesarias para llevar el equipo al estado pedido: solo lo que cambia y lo que admite.
function toClimateCalls(state, entity) {
  const attributes = entity.attributes || {};
  const supports = climateCapabilities(attributes);
  const hvac = Array.isArray(attributes.hvac_modes) ? attributes.hvac_modes : [];
  if (!state.on) return entity.state === 'off' ? [] : [{ service: 'set_hvac_mode', data: { hvac_mode: 'off' } }];
  const calls = [];
  const name = hvacNames[state.mode].find(candidate => hvac.includes(candidate));
  if (!name) throw new Error('El equipo no admite ese modo.');
  if (entity.state !== name) calls.push({ service: 'set_hvac_mode', data: { hvac_mode: name } });
  const step = supports.step > 0 ? supports.step : .5;
  const target = Math.min(supports.max, Math.max(supports.min, Math.round(state.target / step) * step));
  if (attributes.temperature !== target) calls.push({ service: 'set_temperature', data: { temperature: target } });
  const fans = Array.isArray(attributes.fan_modes) ? attributes.fan_modes : [];
  const fan = fans.find(candidate => habitaFan(candidate) === state.fan);
  if (fan && attributes.fan_mode !== fan) calls.push({ service: 'set_fan_mode', data: { fan_mode: fan } });
  // Si ya oscila en algún sentido (vertical, horizontal…) se respeta; si no, se elige el más amplio.
  const swinging = typeof attributes.swing_mode === 'string' && attributes.swing_mode !== 'off';
  if (supports.swing && typeof state.swing === 'boolean' && state.swing !== swinging) {
    const swings = attributes.swing_modes;
    calls.push({ service: 'set_swing_mode', data: { swing_mode: state.swing ? ['both', 'vertical', 'on'].find(name => swings.includes(name)) || swings.find(name => name !== 'off') : 'off' } });
  }
  return calls;
}

module.exports = { entityPattern, domainOf, relevant, capabilities, climateCapabilities, tvCapabilities, coverCapabilities, fromEntity, toService, toClimateCalls, toTvCalls, toCoverCalls, validLightState, validClimateState, validTvState, validCoverState };
