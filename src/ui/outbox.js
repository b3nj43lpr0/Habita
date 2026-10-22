// Una orden en curso por dispositivo. Lo que cambia mientras tanto se fusiona en una sola orden
// siguiente con el último estado, así que arrastrar un slider cuesta unas pocas órdenes y no
// decenas. `interval` separa dos órdenes al mismo equipo (Zigbee y Wi-Fi no soportan ráfagas);
// durante esa espera los cambios se siguen fusionando. Patrón adaptado de house-control
// (MIT, Copyright (c) 2026 0xProbability).
export function createOutbox(send, { interval = 0, onIdle = () => {}, onError = () => {} } = {}) {
  const slots = new Map();

  async function pump(key, slot) {
    slot.busy = true;
    while (slot.pending) {
      const wait = slot.last + interval - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      const { state, meta } = slot.pending;
      slot.last = Date.now();
      slot.pending = null;
      try {
        await send(key, state, meta);
      } catch (error) {
        // Lo pendiente se descarta: tras un rechazo manda el estado real del dispositivo.
        slot.pending = null;
        slot.busy = false;
        onError(key, error, meta);
        onIdle(key);
        return;
      }
    }
    slot.busy = false;
    onIdle(key);
  }

  return {
    dispatch(key, state, meta) {
      let slot = slots.get(key);
      if (!slot) { slot = { busy: false, pending: null, last: 0 }; slots.set(key, slot); }
      slot.pending = { state, meta };
      if (!slot.busy) pump(key, slot);
    },
    busy: key => !!slots.get(key)?.busy
  };
}
