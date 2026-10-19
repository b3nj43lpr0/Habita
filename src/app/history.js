// Historial por instantáneas completas del proyecto: cada gesto ocupa un solo paso.
export function createHistory(limit = 60) {
  const undoStack = [], redoStack = [];
  return {
    record(snapshot) {
      undoStack.push(snapshot);
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
    },
    undo(current) {
      if (!undoStack.length) return null;
      redoStack.push(current);
      return undoStack.pop();
    },
    redo(current) {
      if (!redoStack.length) return null;
      undoStack.push(current);
      return redoStack.pop();
    },
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; }
  };
}
