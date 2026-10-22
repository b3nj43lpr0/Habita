// Notas sobre el plano («enchufe aquí», «pintar verde»): texto corto anclado a un punto del suelo
// de un piso. Se guardan en el proyecto y pasan por el historial como cualquier cambio.
export const noteLimit = 200;
export const noteColors = ['#ffe08a', '#bfe8c4', '#bcd8ff', '#ffc4c4'];

export function validNotes(notes, levelIds = null) {
  if (notes === undefined) return true;
  if (!Array.isArray(notes) || notes.length > noteLimit) return false;
  const ids = new Set();
  return notes.every(note => {
    if (!note || typeof note.id !== 'string' || ids.has(note.id)) return false;
    ids.add(note.id);
    const inside = n => typeof n === 'number' && Number.isFinite(n) && n >= -100 && n <= 100;
    return typeof note.text === 'string' && note.text.trim().length > 0 && note.text.length <= 200 && inside(note.x) && inside(note.z) &&
      noteColors.includes(note.color) && (note.level === undefined || (typeof note.level === 'string' && (!levelIds || levelIds.has(note.level))));
  });
}

export const makeNote = (text, x, z, level, color = noteColors[0]) => ({ id: crypto.randomUUID(), text: text.trim().slice(0, 200), x, z, color, ...(level ? { level } : {}) });
