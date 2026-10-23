// Modelos 3D importados (.glb): viajan dentro del proyecto como data URL, igual que el plano de
// referencia. Cada objeto «custom» apunta a uno por `model`.
export const modelLimit = 3_000_000;
export const modelsLimit = 8_000_000;
export const modelCount = 20;
const pattern = /^data:model\/gltf-binary;base64,[A-Za-z0-9+/]+={0,2}$/;

export function validModels(models) {
  if (models === undefined) return true;
  if (!Array.isArray(models) || models.length > modelCount) return false;
  const ids = new Set();
  let total = 0;
  for (const m of models) {
    if (!m || typeof m.id !== 'string' || !/^[\w-]{1,60}$/.test(m.id) || ids.has(m.id) || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 80) return false;
    if (typeof m.data !== 'string' || m.data.length > modelLimit * 1.4 || !pattern.test(m.data)) return false;
    ids.add(m.id);
    total += m.data.length;
  }
  return total <= modelsLimit * 1.4;
}

// GLB: empieza con «glTF» y versión 2.
export function isGlb(bytes) {
  return bytes.length > 20 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46 && bytes[4] === 2;
}
