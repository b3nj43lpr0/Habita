// Herramientas de 0.10.0 en la interfaz: informe PDF, revisión de circulación, calculadora de
// materiales, sol real y modelos 3D importados.
import { reportHtml } from '../model/report.js';
import { circulationIssues, passageMin } from '../model/circulation.js';
import { materialEstimate, materialDefaults } from '../model/materials.js';
import { sunFor, cities, months, daylight, sunPosition } from '../model/sun.js';
import { modelLimit, modelsLimit, modelCount, isGlb } from '../model/models.js';
import { makeItem } from '../model/catalog.js';
import { round } from '../model/model.js';
import { money } from '../model/shopping.js';
import { modelSize } from '../scene3d/furniture.js';
import { $, esc, fmt, toast, modal } from './dom.js';
import { icon } from './icons.js';

const errorText = error => String(error?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export function createTools(ctx) {
  const { state, actions } = ctx;

  // PDF: la vista actual de la maqueta va en la portada; el resto lo arma el informe.
  async function exportPdf() {
    const html = reportHtml(state.project, { image: state.view === 'walk' ? null : ctx.scene.screenshot('image/jpeg', .86) });
    if (window.habita?.exportPdf) {
      toast('Preparando el PDF…');
      try { if (await window.habita.exportPdf(html, state.project.name)) toast('PDF guardado. Se abrió para que lo revises.'); }
      catch (error) { toast(`No se pudo crear el PDF: ${errorText(error)}`); }
      return;
    }
    // En el navegador: el informe se abre en una pestaña y se imprime (o se guarda como PDF).
    const page = window.open('', '_blank');
    if (!page) { toast('Permite las ventanas emergentes para imprimir el informe.'); return; }
    page.document.write(html);
    page.document.close();
    page.onload = () => page.print();
  }

  // Revisión de circulación: lista los problemas y los marca en rojo en el plano 2D.
  function showCirculation() {
    const issues = circulationIssues(state.project);
    state.circulation = true;
    actions.setView('2d');
    const names = { passage: 'Paso angosto', door: 'Puerta' };
    modal(`
     <h2>Revisión de circulación</h2>
     <p>${issues.length ? `Encontramos ${issues.length} ${issues.length === 1 ? 'punto' : 'puntos'} por revisar. Se recomiendan al menos ${passageMin * 100} cm libres para pasar y que las puertas abran sin chocar. Los pasos angostos quedan marcados en rojo en el plano.` : 'Todo en orden: no hay pasos angostos ni puertas que choquen al abrirse.'}</p>
     ${issues.length ? `<div class="issue-list">${issues.map((issue, i) => `<button data-issue="${i}">${icon(issue.kind === 'door' ? 'arrow' : 'ruler', 15)}<span><b>${names[issue.kind]}</b>${esc(issue.text)}</span></button>`).join('')}</div>` : ''}
     <div class="dialog-actions"><button type="button" id="hide-circulation" class="secondary">Quitar marcas</button><button type="button" data-close class="primary">Listo</button></div>`, () => {
      document.querySelectorAll('[data-issue]').forEach(b => b.onclick = () => {
        const issue = issues[Number(b.dataset.issue)];
        $('#dialog').close();
        actions.select(issue.items[0]);
        ctx.scene.focusItem(issue.items[0]);
      });
      $('#hide-circulation').onclick = () => { state.circulation = false; $('#dialog').close(); ctx.dimensions?.refresh(); };
    });
    ctx.dimensions?.refresh();
  }

  // Calculadora de materiales: margen, manos de pintura y precios se guardan en el proyecto.
  function showMaterials() {
    const draw = () => {
      const { rows, totals, cost, settings: s } = materialEstimate(state.project);
      const priced = Object.values(cost).filter(v => v !== undefined);
      modal(`
       <h2>Calculadora de materiales</h2>
       <p>Estimación según las medidas de cada espacio. Cambia la terminación del piso de un espacio desde la pestaña <strong>Materiales</strong>.</p>
       <form id="materials-form" class="materials-form">
        <label>Margen de piso<span><input type="number" name="waste" min="0" max="50" step="1" value="${s.waste}"> %</span></label>
        <label>Manos de pintura<select name="coats">${[1, 2, 3].map(n => `<option ${n === s.coats ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Rendimiento<span><input type="number" name="paintYield" min="4" max="20" step="1" value="${s.paintYield}"> m²/L</span></label>
        <label>Precio del piso<span><input type="number" name="floorPrice" min="0" step="100" placeholder="—" value="${s.floorPrice ?? ''}"> $/m²</span></label>
        <label>Precio de la pintura<span><input type="number" name="paintPrice" min="0" step="100" placeholder="—" value="${s.paintPrice ?? ''}"> $/L</span></label>
        <label>Precio del guardapolvo<span><input type="number" name="skirtingPrice" min="0" step="100" placeholder="—" value="${s.skirtingPrice ?? ''}"> $/m</span></label>
       </form>
       <div class="materials-table">
        <div class="materials-row head"><span>Espacio</span><span>Piso</span><span>Pintura</span><span>Guardapolvo</span></div>
        ${rows.map(r => `<div class="materials-row"><span>${esc(r.name)}<small>${esc(r.finish)}${r.level ? ` · ${esc(r.level)}` : ''}</small></span><span>${fmt(r.floorBuy)} m²</span><span>${fmt(r.paint)} L<small>${fmt(r.walls)} m² de muro</small></span><span>${fmt(r.skirting)} m</span></div>`).join('')}
        <div class="materials-row total"><span>Total</span><span>${fmt(totals.floorBuy)} m²${cost.floor !== undefined ? `<small>${money(cost.floor)}</small>` : ''}</span><span>${Math.ceil(totals.paint)} L${cost.paint !== undefined ? `<small>${money(cost.paint)}</small>` : ''}</span><span>${fmt(totals.skirting)} m${cost.skirting !== undefined ? `<small>${money(cost.skirting)}</small>` : ''}</span></div>
       </div>
       <p class="library-note">${priced.length ? `Con precios, los materiales suman ${money(priced.reduce((a, b) => a + b, 0))} y aparecen en la lista de compras.` : 'Agrega precios para sumar los materiales a la lista de compras.'} El piso incluye el margen por cortes; la pintura descuenta puertas y ventanas.</p>
       <div class="dialog-actions"><button type="button" data-close class="primary">Listo</button></div>`, () => {
        $('#materials-form').onchange = event => {
          const input = event.target, key = input.name, text = String(input.value).trim();
          const value = text === '' ? undefined : Number(text);
          const limits = { waste: [0, 50], coats: [1, 3], paintYield: [4, 20] }[key] || [0, 1e8];
          if (value !== undefined && (!Number.isFinite(value) || value < limits[0] || value > limits[1])) { toast(`Usa un valor entre ${limits[0]} y ${fmt(limits[1])}.`); draw(); return; }
          if (value === undefined && materialDefaults[key] !== undefined) { draw(); return; }
          actions.checkpoint();
          const next = { ...state.project.materials };
          if (value === undefined) delete next[key]; else next[key] = key === 'coats' ? Math.round(value) : value;
          if (Object.keys(next).length) state.project.materials = next; else delete state.project.materials;
          actions.changed();
          draw();
        };
      });
    };
    draw();
  }

  // Sol real en el resumen del proyecto: ciudad, orientación, mes y hora (con vista previa al
  // arrastrar y un paso de Deshacer al soltar). «Ver el día» recorre del amanecer al atardecer.
  let playing = null;
  function mountSun(container) {
    const sun = sunFor(state.project);
    const city = cities.find(([, lat]) => Math.abs(lat - sun.lat) < .01);
    const { altitude } = sunPosition(sun), hourText = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round(h % 1 * 60)).padStart(2, '0')}`;
    const section = document.createElement('section');
    section.className = 'property-section sun-section';
    section.innerHTML = `
     <h3>Sol real <label class="switch"><input type="checkbox" id="sun-on" ${sun.on ? 'checked' : ''}><span>${sun.on ? 'Activo' : 'Apagado'}</span></label></h3>
     ${sun.on ? `
      <label class="sun-field"><span>Ciudad</span><select id="sun-city">${cities.map(([name, lat]) => `<option value="${lat}" ${city?.[1] === lat ? 'selected' : ''}>${name}</option>`).join('')}${city ? '' : `<option selected value="${sun.lat}">Latitud ${fmt(sun.lat)}°</option>`}</select></label>
      <label class="sun-field"><span>Mes</span><select id="sun-month">${months.map((m, i) => `<option value="${i + 1}" ${i + 1 === sun.month ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="sun-field"><span>Hora solar <b id="sun-hour-label">${hourText(sun.hour)}</b></span><input id="sun-hour" class="property-range" type="range" min="5" max="21" step=".25" value="${sun.hour}"></label>
      <label class="sun-field"><span>Norte del plano <b id="sun-north-label">${Math.round(sun.north)}°</b></span><input id="sun-north" class="property-range" type="range" min="0" max="359" step="1" value="${sun.north}"></label>
      <small class="sun-note" id="sun-note">${altitude > 0 ? `El sol está a ${Math.round(altitude)}° sobre el horizonte.` : 'A esta hora el sol ya se puso.'} El norte es hacia dónde apunta la flecha del plano en el PDF: 0° es hacia arriba.</small>
      <button id="sun-play" class="secondary full">${icon('sun', 15)} ${playing ? 'Detener' : 'Ver el día completo'}</button>` : '<small class="sun-note">Muestra por dónde entra el sol según tu ciudad, el mes y la hora, y hacia dónde mira tu casa.</small>'}`;
    (container.querySelector('.scene-list') || container.querySelector('.room-lighting') || container.querySelector('.overview-stats')).after(section);
    const commit = fields => {
      actions.checkpoint();
      state.project.sun = { ...sunFor(state.project), ...fields };
      ctx.scene.setSun(state.project.sun);
      actions.changed();
    };
    $('#sun-on').onchange = event => {
      commit({ on: event.target.checked });
      if (event.target.checked) { actions.setView('3d'); toast('Sol real activo: mueve la hora para ver cómo entra la luz.'); }
    };
    if (!sun.on) return;
    $('#sun-city').onchange = event => commit({ lat: Number(event.target.value) });
    $('#sun-month').onchange = event => commit({ month: Number(event.target.value) });
    for (const key of ['hour', 'north']) {
      const range = $(`#sun-${key}`);
      const fill = () => range.style.setProperty('--fill', `${(range.value - range.min) / (range.max - range.min) * 100}%`);
      fill();
      range.oninput = () => {
        fill();
        const preview = { ...sunFor(state.project), [key]: Number(range.value) };
        $(`#sun-${key}-label`).textContent = key === 'hour' ? hourText(preview.hour) : `${Math.round(preview.north)}°`;
        ctx.scene.setSun(preview);
      };
      range.onchange = () => commit({ [key]: Number(range.value) });
    }
    $('#sun-play').onclick = () => {
      if (playing) { cancelAnimationFrame(playing); playing = null; ctx.scene.setSun(sunFor(state.project)); actions.changed(); return; }
      const base = sunFor(state.project), { rise, set } = daylight(base), start = performance.now(), seconds = 12;
      const step = now => {
        const t = Math.min(1, (now - start) / (seconds * 1000)), hour = rise + (set - rise) * t;
        ctx.scene.setSun({ ...base, hour });
        const label = $('#sun-hour-label');
        if (label) label.textContent = hourText(hour);
        if (t < 1) playing = requestAnimationFrame(step);
        else { playing = null; ctx.scene.setSun(base); ctx.inspector?.render(); }
      };
      playing = requestAnimationFrame(step);
      $('#sun-play').innerHTML = `${icon('sun', 15)} Detener`;
    };
  }

  // Modelo 3D descargado (.glb): queda guardado en el proyecto y se agrega a la casa.
  async function importModel() {
    try {
      let picked;
      if (window.habita?.openModel) picked = await window.habita.openModel();
      else picked = await pickInBrowser();
      if (!picked) return;
      const models = state.project.models || [];
      if (models.length >= modelCount) { toast(`Puedes guardar hasta ${modelCount} modelos por proyecto.`); return; }
      if (picked.data.length > modelLimit * 1.4) { toast('El modelo supera 3 MB. Busca una versión más liviana.'); return; }
      if (models.reduce((n, m) => n + m.data.length, 0) + picked.data.length > modelsLimit * 1.4) { toast('Los modelos del proyecto superan 8 MB en total. Quita alguno antes de importar otro.'); return; }
      actions.checkpoint();
      const model = { id: crypto.randomUUID(), name: picked.name || 'Modelo 3D', data: picked.data };
      state.project.models = [...models, model];
      actions.changed();
      placeModel(model.id);
    } catch (error) {
      toast(errorText(error));
    }
  }

  // Al principio mide 1 × 1 × 1 m; cuando el modelo carga, se ajusta a sus proporciones (1 m de
  // ancho o de alto, lo que sea mayor) para que no aparezca deformado. Las medidas se editan igual.
  function placeModel(id) {
    const room = state.project.rooms.find(r => r.id === state.selected) || state.project.rooms.find(r => (r.level || 'base') === state.level);
    if (!room) { toast('Dibuja una habitación en este piso antes de agregar el modelo.'); return; }
    const model = state.project.models.find(m => m.id === id);
    const item = { ...makeItem('custom', room.x, room.z), name: model.name.slice(0, 120), model: id };
    if (room.level) item.level = room.level;
    actions.checkpoint();
    state.project.items.push(item);
    state.selected = item.id;
    actions.changed();
    toast(`«${item.name}» agregado. Ajusta sus medidas en el panel derecho.`);
    const fit = (tries = 0) => {
      const size = modelSize(id);
      if (!size) { if (tries < 40) setTimeout(() => fit(tries + 1), 250); return; }
      const target = state.project.items.find(o => o.id === item.id);
      if (!target || target.w !== 1 || target.h !== 1 || target.d !== 1) return;
      const k = 1 / Math.max(size.x, size.y, size.z);
      Object.assign(target, { w: round(Math.max(.05, size.x * k)), h: round(Math.max(.05, size.y * k)), d: round(Math.max(.05, size.z * k)) });
      actions.changed();
    };
    fit();
  }

  function removeModel(id) {
    // Una versión guardada que lo usa dejaría de abrirse sin él.
    const version = (state.project.versions || []).find(v => (v.items || []).some(o => o.model === id));
    if (version) { toast(`La versión «${version.name}» usa este modelo. Elimina esa versión antes de quitarlo.`); return; }
    actions.checkpoint();
    state.project.items = state.project.items.filter(o => o.model !== id);
    state.project.models = state.project.models.filter(m => m.id !== id);
    if (!state.project.models.length) delete state.project.models;
    if (!state.project.items.some(o => o.id === state.selected)) state.selected = null;
    actions.changed();
    toast('Modelo quitado del proyecto. Deshacer lo recupera.', { label: 'Deshacer', run: () => actions.undo() });
  }

  return { exportPdf, showCirculation, showMaterials, mountSun, importModel, placeModel, removeModel };
}

function pickInBrowser() {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.glb,model/gltf-binary' });
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      if (file.size > modelLimit) { toast('El modelo supera 3 MB. Busca una versión más liviana.'); return resolve(null); }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isGlb(bytes)) { toast('El archivo no es un modelo GLB.'); return resolve(null); }
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      resolve({ name: file.name.replace(/\.glb$/i, '').slice(0, 80), data: `data:model/gltf-binary;base64,${btoa(binary)}` });
    };
    input.click();
  });
}
