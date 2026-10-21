// Panel del modo control, con la estructura de house-control (MIT): cabecera con el estado de la
// casa y un botón de encendido general, escenas, espacios con su cuenta de luces encendidas,
// tarjetas de equipos y una hoja de detalle por equipo. Implementación propia sobre el mismo
// estado del proyecto: cada cambio es un paso de Deshacer y llega al equipo real si está vinculado.
import { esc } from './dom.js';
import { icon } from './icons.js';
import { dimByDragging } from './dim-drag.js';
import { levelOf, inRoom } from '../levels.js';
import { isLamp, lightFor, lightColor } from '../lighting.js';
import { isClimate, climateFor, climateModes, fanSpeeds, modeNames, fanNames, modeColors, climateRange } from '../climate.js';
import { isTv, tvFor } from '../tv.js';
import { isCover, coverFor } from '../cover.js';
import { isVacuum, vacuumFor, vacuumNames, vacuumBusy } from '../vacuum.js';

const sceneIcons = ['sun', 'sofa', 'image', 'moon', 'lamp', 'tv'];
const swatches = ['#ff4d4d', '#ff8c3a', '#ffd23f', '#3ddc84', '#22d3ee', '#3d8bff', '#8b5cf6', '#ff4fa3'];
const navy = [23, 39, 79];
const degrees = n => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 1 });
const hex = rgb => '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const rgbOf = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
const isDevice = item => isLamp(item) || isClimate(item) || isTv(item) || isCover(item) || isVacuum(item);

// Cojín de color: el ancho recorre el tono y la altura lo aclara hacia el blanco.
function padColor(x, y) {
  const h = x * 6, f = h - Math.floor(h), sector = Math.floor(h) % 6;
  const hue = [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][sector];
  const white = y * .88;
  return hex(hue.map(c => (c * (1 - white) + white) * 255));
}
function padPoint(color) {
  const [r, g, b] = rgbOf(color).map(v => v / 255), min = Math.min(r, g, b), max = Math.max(r, g, b);
  const y = Math.min(1, min / .88);
  if (max - min < .01) return { x: 0, y };
  let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  if (h < 0) h += 6;
  return { x: h / 6, y };
}

export function createControlPanel(ctx) {
  const { state, actions } = ctx;
  const ui = { room: 'all', sheet: null };
  const shown = new Map();

  const items = () => state.project.items.filter(item => levelOf(item) === state.level && isDevice(item));
  const rooms = () => state.project.rooms.filter(room => levelOf(room) === state.level);
  const find = id => state.project.items.find(o => o.id === id);
  const lit = item => lightFor(item).on && lightFor(item).brightness > 0;
  const active = item => (isLamp(item) && lit(item)) || (isClimate(item) && climateFor(item).on) || (isTv(item) && tvFor(item).on);
  const roomOf = item => rooms().find(room => inRoom(item, room));
  const supports = item => ctx.devices.describe(item.id)?.available ? ctx.devices.supportsFor(item.id) : null;
  const current = item => ctx.devices.describe(item.id)?.current ?? null;

  function save(item, key, value) {
    actions.checkpoint();
    item[key] = value;
    ctx.devices.send(item);
    actions.changed();
  }
  function preview(item, key, value) {
    if (key === 'light') ctx.scene.previewLight(item.id, value);
    if (key === 'climate') ctx.scene.previewClimate(item.id, value);
    if (key === 'cover') ctx.scene.previewCover(item.id, value);
    ctx.devices.preview(item, value);
  }
  function saveMany(changes) {
    if (!changes.length) return;
    actions.checkpoint();
    for (const [item, key, value] of changes) item[key] = value;
    ctx.devices.sendMany(changes.map(([item]) => item));
    actions.changed();
  }

  // Color del ambiente del panel: el promedio de las luces encendidas, o el del aire abierto.
  function mood() {
    const open = ui.sheet && find(ui.sheet);
    if (open && isClimate(open)) {
      const s = climateFor(open);
      return s.on ? hex(rgbOf(modeColors[s.mode]).map(v => v * .4)) : hex(navy.map(v => v * .8));
    }
    let weight = 0;
    const sum = [0, 0, 0];
    for (const item of items().filter(isLamp)) {
      if (!lit(item)) continue;
      const w = lightFor(item).brightness / 100;
      rgbOf(lightColor(lightFor(item))).forEach((v, i) => sum[i] += v * w);
      weight += w;
    }
    if (!weight) return hex(navy);
    const mix = Math.min(.8, Math.max(.25, weight / 3.5));
    return hex(navy.map((v, i) => v + (sum[i] / weight * .42 - v) * mix));
  }

  function statusLine() {
    const lamps = items().filter(isLamp), on = lamps.filter(lit).length;
    const ac = items().find(item => isClimate(item) && climateFor(item).on);
    const any = items().some(active);
    return `<span class="cp-live ${any ? '' : 'off'}"></span><b>${on ? `${on} de ${lamps.length}` : 'Ninguna'}</b> ${on === 1 ? 'luz encendida' : 'luces encendidas'}${ac ? ` · Aire ${degrees(climateFor(ac).target)}°` : ''}`;
  }

  function tile(item, i) {
    const room = roomOf(item), where = ui.room === 'all' && room ? ` · ${esc(room.name)}` : '';
    if (isClimate(item)) {
      const s = climateFor(item), now = current(item);
      return `<div class="cp-tile ac ${s.on ? 'on' : ''}" style="--c:${modeColors[s.mode]};--i:${i}" role="button" tabindex="0" data-open="${esc(item.id)}" aria-label="${esc(item.name)}">
        <span class="cp-bubble">${icon(s.mode, 19)}</span>
        <span class="cp-text"><span class="cp-name">${esc(item.name)}</span><span class="cp-sub">${s.on ? modeNames[s.mode] : 'Apagado'}${now != null ? ` · Hab. ${degrees(now)}°` : where}</span></span>
        <span class="cp-stepper"><button data-step="-1" aria-label="Bajar temperatura">${icon('minus', 15)}</button><span class="cp-value">${degrees(s.target)}°</span><button data-step="1" aria-label="Subir temperatura">${icon('plus', 15)}</button></span>
        <button class="cp-mini-power" data-power aria-label="Encender o apagar ${esc(item.name)}">${icon('power', 16)}</button></div>`;
    }
    let on, sub, color, kind, level = 0;
    if (isLamp(item)) { const s = lightFor(item); on = lit(item); sub = on ? `${s.brightness}%` : 'Apagada'; color = lightColor(s); kind = 'lamp'; level = on ? s.brightness / 100 : 0; }
    else if (isTv(item)) { const s = tvFor(item); on = s.on; sub = on ? (s.muted ? 'Silenciado' : `Volumen ${s.volume}%`) : 'Apagado'; color = '#8fc3ff'; kind = 'tv'; }
    else if (isVacuum(item)) { const s = vacuumFor(item); on = vacuumBusy(s); sub = vacuumNames[s.status]; color = '#5be38c'; kind = 'vacuum'; }
    else { const s = coverFor(item); on = s.position > 0; sub = s.position ? `Abierta ${s.position}%` : 'Cerrada'; color = '#cfdcff'; kind = 'curtain'; level = s.position / 100; }
    const real = ctx.devices.describe(item.id);
    if (real && !real.available) sub = 'Sin conexión';
    const dim = isLamp(item) ? ` data-dim="${esc(item.id)}"` : '';
    return `<div class="cp-tile ${on ? 'on' : ''} ${isLamp(item) ? 'dimmable' : ''}" style="--c:${color};--level:${level};--i:${i}" role="button" tabindex="0" data-toggle="${esc(item.id)}"${dim} aria-label="${esc(item.name)}: ${esc(sub)}">
      <span class="cp-bubble">${icon(kind, 19)}</span>
      <span class="cp-text"><span class="cp-name">${esc(item.name)}</span><span class="cp-sub"><span class="cp-state">${esc(sub)}</span>${where}</span></span>
      <button class="cp-more" data-open="${esc(item.id)}" data-no-dim aria-label="Ajustes de ${esc(item.name)}">${icon('sliders', 15)}</button>
      <span class="cp-level"></span></div>`;
  }

  function panelHtml() {
    const all = items(), scope = ui.room === 'all' ? null : rooms().find(r => r.id === ui.room);
    if (!scope) ui.room = 'all';
    const scenes = state.project.scenes || [];
    const inScope = scope ? all.filter(item => inRoom(item, scope)) : all;
    const lamps = inScope.filter(isLamp);
    let i = 0;
    const groups = (scope ? [scope] : rooms()).map(room => {
      const list = all.filter(item => inRoom(item, room)).sort((a, b) => isClimate(b) - isClimate(a));
      return list.length ? `${scope ? '' : `<div class="cp-group">${esc(room.name)}</div>`}${list.map(item => tile(item, i++)).join('')}` : '';
    }).join('');
    const loose = scope ? [] : all.filter(item => !roomOf(item));
    const rest = loose.length ? `<div class="cp-group">Fuera de los espacios</div>${loose.map(item => tile(item, i++)).join('')}` : '';
    return `
      <div class="cp-top">
        <span class="cp-home">${icon('home', 17)}</span>
        <div class="cp-title"><div class="cp-name-big">${esc(state.project.name || 'Mi casa')}</div><div class="cp-status">${statusLine()}</div></div>
        <button class="cp-round cp-power ${all.some(active) ? 'on' : ''}" data-everything aria-label="Encender o apagar toda la casa">${icon('power', 21)}</button>
      </div>
      ${scenes.length ? `<div class="cp-scenes">${scenes.slice(0, 5).map((scene, n) => `<button class="cp-scene" data-scene="${esc(scene.id)}">${icon(sceneIcons[n % sceneIcons.length], 19)}<span>${esc(scene.name)}</span></button>`).join('')}</div>` : ''}
      <div class="cp-rooms" role="tablist" aria-label="Espacios">
        <button class="cp-room ${scope ? '' : 'active'}" data-room="all">Todo</button>
        ${rooms().map(room => { const n = all.filter(item => isLamp(item) && inRoom(item, room) && lit(item)).length; return `<button class="cp-room ${scope?.id === room.id ? 'active' : ''}" data-room="${esc(room.id)}">${esc(room.name)}<span class="cp-count ${n ? '' : 'zero'}">${n}</span></button>`; }).join('')}
      </div>
      <div class="cp-list-head"><span><b>${scope ? esc(scope.name) : 'Toda la casa'}</b> · ${lamps.filter(lit).length} de ${lamps.length} encendidas</span>
        ${lamps.length ? '<button class="cp-pill" data-lamps="on">Encender</button><button class="cp-pill" data-lamps="off">Apagar</button>' : ''}</div>
      <div class="cp-devices"><div class="cp-grid">${groups + rest || '<p class="cp-empty">No hay equipos en este piso. Agrega lámparas, aires, televisores o cortinas desde la biblioteca.</p>'}</div></div>`;
  }

  function big(id, value, unit, off) {
    const before = shown.get(id);
    shown.set(id, value);
    const tick = before == null || before === value ? '' : value > before ? 'tick-up' : 'tick-down';
    return `<div class="cp-big ${off ? 'off' : ''}"><span class="cp-num ${tick}">${degrees(value)}</span><small>${unit}</small></div>`;
  }
  const slider = (key, min, max, step, value, label, extra = '') =>
    `<div class="cp-slider-row ${extra}"><button class="cp-round range-step" data-step="-1" aria-label="Bajar">${icon('minus', 18)}</button><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" style="--fill:${(value - min) / (max - min) * 100}%" aria-label="${label}"><button class="cp-round range-step" data-step="1" aria-label="Subir">${icon('plus', 18)}</button></div>`;
  const option = (key, label, value, iconName, values) =>
    `<button class="cp-option" data-option="${key}" data-values='${esc(JSON.stringify(values))}'>${icon(iconName, 24)}<span class="cp-corner">${icon('down', 15)}</span><span class="cp-option-label">${label}</span><span class="cp-option-value">${esc(value)}</span></button>`;

  function sheetHtml(item) {
    const room = roomOf(item), real = ctx.devices.describe(item.id), sup = supports(item);
    const head = (sub, on) => `<div class="cp-sheet-head"><button class="cp-round" data-back aria-label="Volver">${icon('back', 19)}</button>
      <div class="cp-title"><div class="cp-sheet-name">${esc(item.name)}</div><div class="cp-status">${sub}</div></div>
      <button class="cp-round cp-power ${on ? 'on' : ''}" data-power aria-label="Encender o apagar">${icon('power', 21)}</button></div>`;
    const where = room ? esc(room.name) : 'Sin espacio';
    const link = real ? `<p class="cp-note">${esc(real.label)}</p>` : '';
    if (isClimate(item)) {
      const s = climateFor(item), now = current(item);
      const min = sup?.min ?? climateRange.min, max = sup?.max ?? climateRange.max, step = sup?.step || climateRange.step;
      const modes = sup?.modes?.length ? climateModes.filter(m => sup.modes.includes(m)) : climateModes;
      const fans = sup ? fanSpeeds.filter(f => sup.fans.includes(f)) : fanSpeeds;
      const options = [option('mode', 'Modo', modeNames[s.mode], s.mode, modes.map(m => [m, modeNames[m]])),
        fans.length ? option('fan', 'Ventilador', fanNames[s.fan], 'fan', fans.map(f => [f, fanNames[f]])) : '',
        !sup || sup.swing ? option('swing', 'Aleta', s.swing ? 'Oscilar' : 'Fija', 'wind', [[false, 'Fija'], [true, 'Oscilar']]) : ''].filter(Boolean);
      return `${head(`${icon('thermo', 14)}${now != null ? `Habitación <b>${degrees(now)} °C</b>` : where}<span class="cp-live ${s.on ? '' : 'off'}" style="--c:${modeColors[s.mode]}"></span>`, s.on)}
        <div class="cp-readout">${big(item.id, s.target, '°C', !s.on)}</div>
        ${slider('target', min, max, step, s.target, 'Temperatura objetivo', 'temp')}
        <div class="cp-scale"><span>${degrees(min)}°</span><span>${degrees(max)}°</span></div>
        ${link}<div class="cp-options" style="grid-template-columns:repeat(${options.length},1fr)">${options.join('')}</div>`;
    }
    if (isLamp(item)) {
      const s = lightFor(item), on = lit(item);
      const color = !sup || sup.color, warm = !sup || sup.temperature, dimmable = !sup || sup.dimmable;
      return `${head(`${where} · <b>${on ? 'Encendida' : 'Apagada'}</b>`, on)}
        <div class="cp-readout">${big(item.id, on ? s.brightness : 0, '%', !on)}
          ${color && warm ? `<div class="cp-segment"><button data-mode="temperature" aria-pressed="${s.mode === 'temperature'}">Blanco</button><button data-mode="color" aria-pressed="${s.mode === 'color'}">Color</button></div>` : ''}</div>
        ${dimmable ? slider('brightness', 0, 100, 1, s.brightness, 'Brillo', 'dim') : ''}
        ${s.mode === 'temperature' && warm ? `<div class="cp-field"><span>Calidez</span><span>${s.warmth}%</span></div>${slider('warmth', 0, 100, 1, s.warmth, 'Calidez', 'warmth compact')}` : ''}
        ${s.mode === 'color' && color ? `<div class="cp-field"><span>Color</span><span>${esc(s.color.toUpperCase())}</span></div>
          <div class="cp-pad" role="slider" tabindex="0" aria-label="Color" style="--x:${padPoint(s.color).x};--y:${padPoint(s.color).y};--sw:${s.color}"><span class="cp-pad-thumb"></span></div>
          <div class="cp-swatches">${swatches.map(c => `<button class="cp-swatch ${s.color.toLowerCase() === c ? 'selected' : ''}" style="--sw:${c}" data-color="${c}" aria-label="Color ${c}"></button>`).join('')}</div>` : ''}
        ${link}`;
    }
    if (isTv(item)) {
      const s = tvFor(item), sources = sup?.sources || [];
      return `${head(`${where} · <b>${s.on ? 'Encendido' : 'Apagado'}</b>`, s.on)}
        <div class="cp-readout">${big(item.id, s.volume, '%', !s.on || s.muted)}
          <button class="cp-chip ${s.muted ? 'on' : ''}" data-mute>${icon(s.muted ? 'mute' : 'volume', 17)} Silencio<span class="cp-switch"></span></button></div>
        ${!sup || sup.volume ? slider('volume', 0, 100, 1, s.volume, 'Volumen', 'volume') : ''}
        ${link}${sources.length ? `<div class="cp-options" style="grid-template-columns:1fr">${option('source', 'Entrada', s.source || 'Elegir', 'input', sources.map(v => [v, v]))}</div>` : ''}`;
    }
    if (isVacuum(item)) {
      const s = vacuumFor(item), battery = real?.available ? real.battery : null;
      const orders = [['cleaning', 'Limpiar', 'vacuum', !sup || sup.start], ['paused', 'Pausar', 'pause', !sup || sup.pause], ['docked', 'A la base', 'home', !sup || sup.dock]].filter(o => o[3]);
      const pressed = status => status === s.status || (status === 'docked' && s.status === 'returning');
      return `${head(`${where} · <b>${vacuumNames[s.status]}</b>`, vacuumBusy(s))}
        ${battery != null ? `<div class="cp-readout">${big(item.id, battery, '% batería', false)}</div>` : ''}
        <div class="cp-segment cp-vacuum">${orders.map(([status, label, iconName]) => `<button data-vacuum="${status}" aria-pressed="${pressed(status)}">${icon(iconName, 16)} ${label}</button>`).join('')}</div>
        ${link}`;
    }
    const s = coverFor(item);
    return `${head(`${where} · <b>${s.position ? `Abierta ${s.position}%` : 'Cerrada'}</b>`, s.position > 0)}
      <div class="cp-readout">${big(item.id, s.position, '%', !s.position)}</div>
      ${!sup || sup.position ? slider('position', 0, 100, 5, s.position, 'Apertura', 'volume') : ''}
      ${link}`;
  }

  // Estado del equipo con un cambio aplicado (sin guardar).
  function next(item, patch) {
    if (isClimate(item)) return ['climate', { ...climateFor(item), ...patch }];
    if (isLamp(item)) return ['light', { ...lightFor(item), ...patch }];
    if (isTv(item)) return ['tv', { ...tvFor(item), ...patch }];
    if (isVacuum(item)) return ['vacuum', { ...vacuumFor(item), ...patch }];
    return ['cover', { ...coverFor(item), ...patch }];
  }
  const apply = (item, patch) => save(item, ...next(item, patch));

  function togglePower(item) {
    if (isLamp(item)) apply(item, lit(item) ? { on: false } : { on: true, brightness: lightFor(item).brightness || 100 });
    else if (isClimate(item)) apply(item, { on: !climateFor(item).on });
    else if (isTv(item)) apply(item, { on: !tvFor(item).on });
    else if (isVacuum(item)) apply(item, { status: vacuumBusy(vacuumFor(item)) ? 'docked' : 'cleaning' });
    else apply(item, { position: coverFor(item).position ? 0 : 100 });
    ctx.feedback?.play();
  }

  function openMenu(button, item) {
    const host = button.closest('.cp-card');
    host.querySelector('.cp-menu')?.remove();
    const key = button.dataset.option, values = JSON.parse(button.dataset.values);
    const now = next(item, {})[1][key];
    const menu = document.createElement('div');
    menu.className = 'cp-menu';
    menu.innerHTML = values.map(([value, label]) => `<button data-value='${esc(JSON.stringify(value))}' class="${value === now ? 'selected' : ''}"><span>${esc(label)}</span>${value === now ? icon('check', 16) : ''}</button>`).join('');
    host.append(menu);
    const hr = host.getBoundingClientRect(), br = button.getBoundingClientRect();
    menu.style.left = `${Math.min(hr.width - menu.offsetWidth - 12, Math.max(12, br.right - hr.left - menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(12, br.top - hr.top - menu.offsetHeight - 8)}px`;
    button.classList.add('open');
    const close = () => { menu.remove(); button.classList.remove('open'); document.removeEventListener('pointerdown', outside, true); };
    const outside = event => { if (!menu.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside, true);
    menu.onclick = event => {
      const choice = event.target.closest('[data-value]');
      if (!choice) return;
      close();
      const value = JSON.parse(choice.dataset.value);
      apply(item, key === 'mode' ? { on: true, mode: value } : { [key]: value });
    };
    menu.querySelector('button')?.focus();
    menu.onkeydown = event => { if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); } };
  }

  function bindSheet(card, item) {
    card.querySelector('[data-back]').onclick = () => { ui.sheet = null; render(); };
    card.querySelector('[data-power]').onclick = () => togglePower(item);
    card.querySelectorAll('.cp-option').forEach(b => b.onclick = () => openMenu(b, item));
    card.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => apply(item, { on: true, mode: b.dataset.mode }));
    card.querySelectorAll('[data-color]').forEach(b => b.onclick = () => apply(item, { on: true, mode: 'color', color: b.dataset.color }));
    card.querySelectorAll('[data-vacuum]').forEach(b => b.onclick = () => { if (b.getAttribute('aria-pressed') !== 'true') apply(item, { status: b.dataset.vacuum }); });
    const mute = card.querySelector('[data-mute]');
    if (mute) mute.onclick = () => apply(item, { muted: !tvFor(item).muted });
    card.querySelectorAll('input[type="range"]').forEach(range => {
      const key = range.dataset.key;
      // Mover el slider de un equipo apagado lo enciende (menos las cortinas, que no se encienden).
      const patch = () => ({ [key]: Number(range.value), ...(isCover(item) ? {} : { on: true }) });
      range.oninput = () => {
        range.style.setProperty('--fill', `${(range.value - range.min) / (range.max - range.min) * 100}%`);
        const num = card.querySelector('.cp-num');
        if (num && key !== 'warmth') num.textContent = degrees(range.value);
        if (key === 'warmth') card.querySelector('.cp-field span:last-child').textContent = `${range.value}%`;
        preview(item, ...next(item, patch()));
      };
      range.onchange = () => apply(item, patch());
    });
    const pad = card.querySelector('.cp-pad');
    if (pad) {
      let dragging = false;
      const pick = event => {
        const r = pad.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (event.clientY - r.top) / r.height));
        pad.style.setProperty('--x', x); pad.style.setProperty('--y', y);
        const color = padColor(x, y);
        pad.style.setProperty('--sw', color);
        preview(item, ...next(item, { on: true, mode: 'color', color }));
        return color;
      };
      pad.onpointerdown = event => { dragging = true; pad.setPointerCapture(event.pointerId); pad.classList.add('dragging'); pick(event); };
      pad.onpointermove = event => { if (dragging) pick(event); };
      pad.onpointerup = event => { if (!dragging) return; dragging = false; pad.classList.remove('dragging'); apply(item, { on: true, mode: 'color', color: pick(event) }); };
      pad.onpointercancel = () => { dragging = false; pad.classList.remove('dragging'); preview(item, 'light', lightFor(item)); };
      pad.onkeydown = event => {
        const p = padPoint(lightFor(item).color), d = { ArrowLeft: [-.03, 0], ArrowRight: [.03, 0], ArrowUp: [0, -.08], ArrowDown: [0, .08] }[event.key];
        if (!d) return;
        event.preventDefault();
        apply(item, { on: true, mode: 'color', color: padColor((p.x + d[0] + 1) % 1, Math.min(1, Math.max(0, p.y + d[1]))) });
        document.querySelector('.cp-pad')?.focus();
      };
    }
  }

  function bindPanel(card) {
    card.querySelectorAll('[data-room]').forEach(b => b.onclick = () => {
      ui.room = b.dataset.room;
      render();
      if (ui.room !== 'all') ctx.scene.focusItem(ui.room);
    });
    card.querySelectorAll('[data-scene]').forEach(b => b.onclick = () => {
      const scene = (state.project.scenes || []).find(s => s.id === b.dataset.scene);
      if (scene) actions.activateScene(scene);
    });
    card.querySelector('[data-everything]').onclick = () => {
      const all = items(), running = all.filter(active);
      saveMany(running.length
        ? running.map(item => [item, ...next(item, { on: false })])
        : all.filter(isLamp).map(item => [item, 'light', { ...lightFor(item), on: true, brightness: lightFor(item).brightness || 100 }]));
      ctx.feedback?.play();
    };
    card.querySelectorAll('[data-lamps]').forEach(b => b.onclick = () => {
      const on = b.dataset.lamps === 'on', scope = rooms().find(r => r.id === ui.room);
      const lamps = items().filter(item => isLamp(item) && (!scope || inRoom(item, scope)) && lit(item) !== on);
      saveMany(lamps.map(item => [item, 'light', { ...lightFor(item), on, brightness: lightFor(item).brightness || 100 }]));
    });
    card.querySelectorAll('[data-dim]').forEach(el => {
      dimByDragging(el, ctx, el.dataset.dim);
      el.addEventListener('dimpreview', event => { el.classList.toggle('on', event.detail.on); el.querySelector('.cp-state').textContent = event.detail.on ? `${event.detail.brightness}%` : 'Apagada'; });
    });
    card.querySelectorAll('[data-toggle]').forEach(el => {
      el.onclick = event => {
        if (el.dataset.dragged) { delete el.dataset.dragged; return; }
        if (event.target.closest('[data-open]')) return;
        togglePower(find(el.dataset.toggle));
      };
      el.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePower(find(el.dataset.toggle)); } };
    });
    card.querySelectorAll('.cp-tile.ac').forEach(el => {
      const item = find(el.dataset.open);
      el.onclick = event => {
        const step = event.target.closest('[data-step]');
        if (step) { const s = climateFor(item); apply(item, { on: true, target: Math.min(climateRange.max, Math.max(climateRange.min, s.target + Number(step.dataset.step))) }); return; }
        if (event.target.closest('[data-power]')) { togglePower(item); return; }
        open(item.id);
      };
      el.onkeydown = event => { if (event.key === 'Enter') open(item.id); };
    });
    card.querySelectorAll('.cp-more').forEach(b => b.onclick = event => { event.stopPropagation(); open(b.dataset.open); });
  }

  function open(id) {
    ui.sheet = id;
    render();
    card()?.querySelector('[data-back]')?.focus({ preventScroll: true });
  }
  const card = () => document.querySelector('#inspector-content .cp-card');

  function render(container = document.querySelector('#inspector-content')) {
    const item = ui.sheet && find(ui.sheet);
    if (!item || levelOf(item) !== state.level) ui.sheet = null;
    const scroll = container.querySelector('.cp-devices')?.scrollTop || 0;
    container.innerHTML = `<div class="cp-card ${ui.sheet ? 'detail' : ''}" style="--mood:${mood()}"><div class="cp-tint"></div>
      <div class="cp-${ui.sheet ? 'sheet' : 'panel'}">${ui.sheet ? sheetHtml(item) : panelHtml()}</div></div>`;
    const el = container.querySelector('.cp-card');
    if (ui.sheet) bindSheet(el, item); else bindPanel(el);
    const list = container.querySelector('.cp-devices');
    if (list) list.scrollTop = scroll;
  }

  // Elegir un equipo en la maqueta abre su hoja; elegir una habitación la filtra.
  function focus(id) {
    const item = id && find(id);
    if (item && isDevice(item)) { ui.sheet = id; return; }
    if (id && state.project.rooms.some(r => r.id === id)) { ui.room = id; ui.sheet = null; }
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.control && ui.sheet && !document.querySelector('.cp-menu')) { ui.sheet = null; render(); }
  });

  return { render, focus, reset() { ui.room = 'all'; ui.sheet = null; shown.clear(); } };
}
