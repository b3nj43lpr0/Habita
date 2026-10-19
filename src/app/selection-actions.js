import * as THREE from 'three';
import { isOpening } from '../catalog.js';
import { isLamp, lightFor } from '../lighting.js';
import { mountLightControls } from '../light-controls.js';
import { isClimate, climateFor } from '../climate.js';
import { mountClimateControls } from '../climate-controls.js';
import { isTv, tvFor } from '../tv.js';
import { mountTvControls } from '../tv-controls.js';
import { isCover, coverFor } from '../cover.js';
import { mountCoverControls } from '../cover-controls.js';
import { $, esc } from './dom.js';
import { icon } from './icons.js';

// Barra flotante junto al objeto seleccionado, con controles para lámparas, aires y televisores.
export function createSelectionActions(ctx) {
  const { state, actions } = ctx;
  const bar = document.createElement('div');
  bar.className = 'selection-actions';
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Acciones del objeto');
  $('.viewport').append(bar);
  let camera = null, rect = null;

  const selectedItem = () => state.project.items.find(o => o.id === state.selected);

  function render() {
    const item = selectedItem();
    bar.classList.toggle('with-light', isLamp(item) || isClimate(item) || isTv(item) || isCover(item) || (!!item && isOpening(item) && ctx.devices.linkable(item)));
    // En modo control los equipos se controlan en la hoja del panel, no en la barra.
    bar.hidden = !item || state.view === 'walk' || state.control;
    if (bar.hidden) return;
    bar.innerHTML = `
     <strong>${esc(item.name)}</strong>
     <button data-action="focus" aria-label="Centrar objeto" title="Centrar objeto">${icon('focus', 16)}</button>
     ${!isOpening(item) ? `<button data-action="rotate" aria-label="Girar objeto" title="Girar 90°">${icon('rotate', 16)}</button>` : ''}
     <button data-action="duplicate" aria-label="Duplicar objeto" title="Duplicar objeto">${icon('copy', 16)}</button>
     <button data-action="close" aria-label="Cerrar acciones" title="Cerrar selección">${icon('close', 16)}</button>`;
    bar.querySelector('[data-action="focus"]').onclick = () => { ctx.scene.focusItem(state.selected); ctx.feedback.play(); };
    const rotate = bar.querySelector('[data-action="rotate"]');
    if (rotate) rotate.onclick = actions.rotateItem;
    bar.querySelector('[data-action="duplicate"]').onclick = actions.duplicateItem;
    bar.querySelector('[data-action="close"]').onclick = () => actions.select(null);
    if (isLamp(item)) mountLamp(item);
    if (isClimate(item)) mountClimate(item);
    if (isTv(item)) mountTv(item);
    if (isCover(item)) mountCover(item);
    if (isOpening(item) && ctx.devices.linkable(item)) mountContact(item);
    if (camera) position(camera, rect);
  }

  function mountLamp(item) {
    const panel = document.createElement('section');
    panel.className = 'lamp-controls';
    panel.setAttribute('aria-label', 'Luz de la lámpara');
    bar.append(panel);
    mountLightControls(panel, item, {
      preview: light => { ctx.scene.previewLight(item.id, light); ctx.devices.preview(item, light); },
      end: () => ctx.devices.endPreview(item),
      commit: light => {
        // Sin cambios netos: igual se envía el valor final, porque el gesto pudo mover el equipo real.
        if (JSON.stringify(light) === JSON.stringify(lightFor(item))) { ctx.devices.send(item); return; }
        const active = document.activeElement?.dataset.light;
        actions.checkpoint();
        item.light = light;
        ctx.devices.send(item);
        actions.changed();
        if (active) bar.querySelector(`[data-light="${active}"]`)?.focus({ preventScroll: true });
      }
    });
    ctx.devices.mountLink(panel, item);
  }

  function mountClimate(item) {
    const panel = document.createElement('section');
    panel.className = 'lamp-controls climate-controls';
    panel.setAttribute('aria-label', 'Aire acondicionado');
    bar.append(panel);
    const info = ctx.devices.describe(item.id);
    mountClimateControls(panel, item, {
      supports: info?.available ? ctx.devices.supportsFor(item.id) : null,
      current: info?.current ?? null,
      preview: climate => ctx.scene.previewClimate(item.id, climate),
      commit: climate => {
        if (JSON.stringify(climate) === JSON.stringify(climateFor(item))) return;
        const active = document.activeElement?.dataset.climate;
        actions.checkpoint();
        item.climate = climate;
        ctx.devices.send(item);
        actions.changed();
        if (active) bar.querySelector(`[data-climate="${active}"]`)?.focus({ preventScroll: true });
      }
    });
    ctx.devices.mountLink(panel, item);
  }

  function mountTv(item) {
    const panel = document.createElement('section');
    panel.className = 'lamp-controls tv-controls';
    panel.setAttribute('aria-label', 'Televisor');
    bar.append(panel);
    const info = ctx.devices.describe(item.id);
    mountTvControls(panel, item, {
      supports: info?.available ? ctx.devices.supportsFor(item.id) : null,
      // El volumen sigue el slider en vivo con la misma cola de una orden en curso que las luces.
      preview: tv => ctx.devices.preview(item, tv),
      end: () => ctx.devices.endPreview(item),
      commit: tv => {
        if (JSON.stringify(tv) === JSON.stringify(tvFor(item))) { ctx.devices.send(item); return; }
        const active = document.activeElement?.dataset.tv;
        actions.checkpoint();
        item.tv = tv;
        ctx.devices.send(item);
        actions.changed();
        if (active) bar.querySelector(`[data-tv="${active}"]`)?.focus({ preventScroll: true });
      }
    });
    ctx.devices.mountLink(panel, item);
  }

  function mountCover(item) {
    const panel = document.createElement('section');
    panel.className = 'lamp-controls cover-controls';
    panel.setAttribute('aria-label', 'Cortina');
    bar.append(panel);
    const info = ctx.devices.describe(item.id);
    mountCoverControls(panel, item, {
      supports: info?.available ? ctx.devices.supportsFor(item.id) : null,
      preview: cover => ctx.scene.previewCover(item.id, cover),
      commit: cover => {
        if (cover.position === coverFor(item).position) return;
        actions.checkpoint();
        item.cover = cover;
        ctx.devices.send(item);
        actions.changed();
      }
    });
    ctx.devices.mountLink(panel, item);
  }

  // Puertas y ventanas: solo se vinculan con un sensor de apertura, que se ve en la maqueta.
  function mountContact(item) {
    const panel = document.createElement('section');
    panel.className = 'lamp-controls contact-controls';
    panel.setAttribute('aria-label', 'Sensor de apertura');
    bar.append(panel);
    ctx.devices.mountLink(panel, item);
  }

  function position(nextCamera, nextRect) {
    camera = nextCamera;
    rect = nextRect;
    if (bar.hidden) return;
    const item = selectedItem();
    if (!item) return;
    const pos = new THREE.Vector3(item.x, (item.elevation || 0) + item.h + .2, item.z).project(camera);
    bar.style.visibility = Math.abs(pos.x) > 1.15 || Math.abs(pos.y) > 1.15 || Math.abs(pos.z) > 1 ? 'hidden' : 'visible';
    const dock = $('#ambience-dock');
    // Con controles de un equipo el panel puede cubrir el dock de ambiente para no quedar cortado.
    const dockTop = dock.hidden || bar.classList.contains('with-light') ? rect.height - 66 : dock.getBoundingClientRect().top - rect.top;
    const minTop = state.view === '3d' ? 140 : 78;
    bar.style.maxHeight = `${Math.max(100, dockTop - minTop - 12)}px`;
    const anchorX = (pos.x + 1) * rect.width / 2, anchorY = (-pos.y + 1) * rect.height / 2;
    let x = anchorX - bar.offsetWidth / 2, y = anchorY - bar.offsetHeight - 12;
    // Si no cabe encima del objeto, va a su lado para no taparlo.
    if (y < minTop) {
      x = anchorX + 48 + bar.offsetWidth <= rect.width - 12 ? anchorX + 48 : anchorX - 48 - bar.offsetWidth;
      y = anchorY - bar.offsetHeight / 2;
    }
    x = Math.max(12, Math.min(rect.width - bar.offsetWidth - 12, x));
    y = Math.max(minTop, Math.min(dockTop - bar.offsetHeight - 12, y));
    bar.style.left = `${x}px`;
    bar.style.top = `${y}px`;
  }

  // Un cambio del dispositivo real no debe interrumpir un slider que se está arrastrando.
  const isInteracting = () => bar.contains(document.activeElement) && document.activeElement.matches('input[type="range"]:active');

  return { render, position, isInteracting, get element() { return bar; } };
}
