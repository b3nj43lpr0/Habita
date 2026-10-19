// Escenas: el estado de las luces, aires y televisores de la casa guardado con un nombre. Referencian
// objetos del proyecto, nunca dispositivos reales; al activarlas, los objetos vinculados
// envían el cambio a su equipo.
import { isLamp, lightFor, validLight } from './lighting.js';
import { isClimate, climateFor, validClimate } from './climate.js';
import { isTv, tvFor, validTv } from './tv.js';
import { isCover, coverFor, validCover } from './cover.js';

export const sceneLimit = 30;

export function captureScene(project, name) {
  const lights = {}, climates = {}, tvs = {}, covers = {};
  for (const item of project.items) {
    if (isLamp(item)) lights[item.id] = lightFor(item);
    else if (isClimate(item)) climates[item.id] = climateFor(item);
    else if (isTv(item)) tvs[item.id] = tvFor(item);
    else if (isCover(item)) covers[item.id] = coverFor(item);
  }
  return { id: crypto.randomUUID(), name, lights, climates, tvs, covers };
}

// Aplica la escena a los objetos que aún existen y devuelve los que cambiaron.
export function applyScene(project, scene) {
  const changed = [];
  for (const item of project.items) {
    const light = isLamp(item) && scene.lights[item.id];
    const climate = isClimate(item) && scene.climates[item.id];
    if (light && JSON.stringify(light) !== JSON.stringify(lightFor(item))) { item.light = { ...light }; changed.push(item); }
    // Las escenas anteriores a 0.8.1 no guardan la aleta: se compara con los valores por defecto.
    if (climate && JSON.stringify({ ...climateFor(item), ...climate }) !== JSON.stringify(climateFor(item))) { item.climate = { ...climateFor(item), ...climate }; changed.push(item); }
    // Las escenas anteriores a 0.6.0 no tienen televisores.
    const tv = isTv(item) && scene.tvs?.[item.id];
    if (tv && JSON.stringify(tv) !== JSON.stringify(tvFor(item))) { item.tv = { ...tv }; changed.push(item); }
    const cover = isCover(item) && scene.covers?.[item.id];
    if (cover && cover.position !== coverFor(item).position) { item.cover = { ...cover }; changed.push(item); }
  }
  return changed;
}

export function validScenes(scenes) {
  if (scenes === undefined) return true;
  if (!Array.isArray(scenes) || scenes.length > sceneLimit) return false;
  const ids = new Set();
  return scenes.every(scene => {
    if (!scene || typeof scene.id !== 'string' || ids.has(scene.id) || typeof scene.name !== 'string' || !scene.name.trim() || scene.name.length > 60) return false;
    ids.add(scene.id);
    const entries = (value, valid) => value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).length <= 1500 && Object.values(value).every(valid);
    return entries(scene.lights, validLight) && entries(scene.climates, validClimate) && (scene.tvs === undefined || entries(scene.tvs, validTv)) && (scene.covers === undefined || entries(scene.covers, validCover));
  });
}
