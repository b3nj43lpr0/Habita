import { validateProject } from '../model.js';
import { $ } from './dom.js';
import { icon } from './icons.js';

const key = 'habita-project';
// Un autoguardado que esta versión no puede leer (por ejemplo, de una versión más nueva) se
// guarda aquí antes de abrir la casa de ejemplo, para que el siguiente autoguardado no lo borre.
export const backupKey = 'habita-project-respaldo';

export function loadSavedProject(fallback) {
  try {
    const saved = localStorage.getItem(key);
    return { project: saved ? validateProject(JSON.parse(saved)) : fallback, issue: false };
  } catch {
    try { localStorage.setItem(backupKey, localStorage.getItem(key)); } catch {}
    return { project: fallback, issue: true };
  }
}

export function createAutosave(getProject) {
  let timer;
  return function persist() {
    clearTimeout(timer);
    $('#save-status').textContent = 'Guardando…';
    timer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(getProject()));
        $('#save-status').innerHTML = `${icon('check', 12)} Guardado en este equipo`;
      } catch {
        $('#save-status').textContent = 'Sin autoguardado: guarda un archivo';
      }
    }, 250);
  };
}
