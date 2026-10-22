import { $, esc, fmt, modal, toast } from './dom.js';
import { icon } from './icons.js';
import { captureVersion, restoreVersion, versionStats, versionLimit } from '../versions.js';
import { validateProject } from '../model.js';
import { money } from '../shopping.js';
import { baseLevel, levelOf } from '../levels.js';

// Plano pequeño (primer piso) con espacios y muebles, para comparar versiones lado a lado.
function planPreview(layout) {
  const rooms = layout.rooms.filter(r => levelOf(r) === baseLevel), items = layout.items.filter(i => levelOf(i) === baseLevel);
  if (!rooms.length) return '<svg viewBox="0 0 100 70" aria-hidden="true"></svg>';
  const minX = Math.min(...rooms.map(r => r.x - r.w / 2)), maxX = Math.max(...rooms.map(r => r.x + r.w / 2));
  const minZ = Math.min(...rooms.map(r => r.z - r.d / 2)), maxZ = Math.max(...rooms.map(r => r.z + r.d / 2));
  const k = Math.min(92 / (maxX - minX), 64 / (maxZ - minZ)), ox = (100 - (maxX - minX) * k) / 2, oz = (70 - (maxZ - minZ) * k) / 2;
  const rect = (o, fill, stroke = 'none') => `<rect x="${ox + (o.x - o.w / 2 - minX) * k}" y="${oz + (o.z - o.d / 2 - minZ) * k}" width="${o.w * k}" height="${o.d * k}" fill="${fill}" stroke="${stroke}" stroke-width=".8" transform="rotate(${o.rotation || 0} ${ox + (o.x - minX) * k} ${oz + (o.z - minZ) * k})"/>`;
  return `<svg viewBox="0 0 100 70" aria-hidden="true">${rooms.map(r => rect({ ...r, rotation: 0 }, r.color, '#f4ede2')).join('')}${items.filter(i => !['door', 'window'].includes(i.asset)).map(i => rect(i, i.color + 'dd')).join('')}</svg>`;
}

// Versiones en el resumen del proyecto: guardar la distribución actual, comparar y restaurar.
export function mountVersions(container, ctx) {
  const { state, actions } = ctx;
  const versions = state.project.versions || [];
  const section = document.createElement('section');
  section.className = 'property-section version-list';
  const date = iso => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  section.innerHTML = `
   <h3>Versiones <span>${versions.length}</span></h3>
   ${versions.length ? versions.map(v => `<div class="version-row"><span>${esc(v.name)}<small>${esc(date(v.created))}</small></span>
     <button class="icon-button" data-compare="${esc(v.id)}" aria-label="Comparar ${esc(v.name)}" title="Comparar con la actual">${icon('panels', 14)}</button>
     <button class="icon-button" data-delete-version="${esc(v.id)}" aria-label="Eliminar ${esc(v.name)}" title="Eliminar versión">${icon('close', 13)}</button></div>`).join('')
     : '<p class="scene-empty">Guarda la distribución actual para probar otra («Opción A», «Opción B») y comparar.</p>'}
   <button id="save-version" class="secondary full" ${versions.length >= versionLimit ? 'disabled' : ''}>${icon('plus', 14)} Guardar distribución actual</button>`;
  (container.querySelector('.scene-list') || container.querySelector('.overview-stats')).after(section);

  $('#save-version').onclick = () => modal(`
   <h2>Guardar versión</h2>
   <p>Se guardan los espacios, los muebles, los pisos y las notas tal como están. Las escenas y los equipos no cambian al restaurarla.</p>
   <form id="version-form" class="ha-form"><label>Nombre<input id="version-name" maxlength="60" required value="Opción ${String.fromCharCode(65 + versions.length)}" autocomplete="off"></label>
    <div class="dialog-actions"><button type="button" data-close class="secondary">Cancelar</button><button type="submit" class="primary">Guardar</button></div></form>`, () => {
    $('#version-name').select();
    $('#version-form').onsubmit = event => {
      event.preventDefault();
      const name = $('#version-name').value.trim();
      if (!name) return;
      $('#dialog').close();
      actions.checkpoint();
      state.project.versions = [...versions, captureVersion(state.project, name)];
      actions.changed();
      toast(`Versión «${name}» guardada.`);
    };
  });
  section.querySelectorAll('[data-delete-version]').forEach(b => b.onclick = () => {
    const version = versions.find(v => v.id === b.dataset.deleteVersion);
    actions.checkpoint();
    state.project.versions = versions.filter(v => v !== version);
    if (!state.project.versions.length) delete state.project.versions;
    actions.changed();
    toast(`Versión «${version.name}» eliminada.`, { label: 'Deshacer', run: () => actions.undo() });
  });
  section.querySelectorAll('[data-compare]').forEach(b => b.onclick = () => compare(versions.find(v => v.id === b.dataset.compare)));

  function compare(version) {
    const now = versionStats(state.project), then = versionStats(version);
    const ids = new Map(version.items.map(i => [i.id, i]));
    const current = new Set(state.project.items.map(i => i.id));
    const added = state.project.items.filter(i => !ids.has(i.id)).length, removed = version.items.filter(i => !current.has(i.id)).length;
    const moved = state.project.items.filter(i => { const o = ids.get(i.id); return o && (o.x !== i.x || o.z !== i.z || o.rotation !== i.rotation); }).length;
    const line = (label, a, b, show = v => v) => `<div class="compare-line"><span>${label}</span><span>${show(b)}</span><span>${show(a)}</span></div>`;
    modal(`
     <h2>Comparar con «${esc(version.name)}»</h2>
     <div class="compare-grid"><figure>${planPreview(version)}<figcaption>${esc(version.name)}</figcaption></figure><figure>${planPreview(state.project)}<figcaption>Actual</figcaption></figure></div>
     <div class="compare-table"><div class="compare-line head"><span></span><span>${esc(version.name)}</span><span>Actual</span></div>
      ${line('Superficie', now.area, then.area, v => `${fmt(v)} m²`)}${line('Espacios', now.rooms, then.rooms)}${line('Objetos', now.items, then.items)}${line('Presupuesto', now.budget, then.budget, money)}</div>
     <p class="compare-summary">Desde esa versión: ${added} ${added === 1 ? 'objeto nuevo' : 'objetos nuevos'}, ${removed} ${removed === 1 ? 'quitado' : 'quitados'} y ${moved} ${moved === 1 ? 'movido' : 'movidos'}.</p>
     <div class="dialog-actions"><button type="button" data-close class="secondary">Cerrar</button><button type="button" id="restore-version" class="primary">Volver a «${esc(version.name)}»</button></div>`, () => {
      $('#restore-version').onclick = () => {
        $('#dialog').close();
        actions.replaceProject(validateProject(restoreVersion(state.project, version)), `Distribución «${version.name}» restaurada.`);
      };
    });
  }
}
