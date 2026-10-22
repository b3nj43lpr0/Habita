import { test } from 'node:test';
import assert from 'node:assert/strict';
import hue from '../desktop/hue.cjs';
import lab from '../tools/lab/fake-hue.cjs';

const { HueClient, fromHueLight, toHueState, rgbToXy, xyToHex, validHost } = hue;

test('las luces Hue se traducen al formato de Habita y de vuelta', () => {
  const living = { name: 'Living', state: { on: true, bri: 127, ct: 300, xy: [.45, .41], colormode: 'ct', reachable: true }, capabilities: { control: { ct: { min: 153, max: 454 } } } };
  const light = fromHueLight('1', living);
  assert.equal(light.entityId, 'hue.light_1');
  assert.deepEqual(light.supports, { color: true, temperature: true, dimmable: true });
  assert.deepEqual(light.light, { on: true, brightness: 50, mode: 'temperature', warmth: 49 });
  assert.deepEqual(toHueState({ on: true, brightness: 100, mode: 'temperature', warmth: 100, color: '#ffffff' }, living), { on: true, bri: 254, ct: 454 });
  assert.deepEqual(toHueState({ on: false, brightness: 50, mode: 'temperature', warmth: 0, color: '#ffffff' }, living), { on: false });
  // Una luz solo regulable ignora color y calidez.
  assert.deepEqual(toHueState({ on: true, brightness: 10, mode: 'color', warmth: 0, color: '#ff0000' }, { state: { on: true, bri: 1 } }), { on: true, bri: 25 });
  // El rojo vuelve aproximadamente rojo.
  assert.match(xyToHex(rgbToXy('#ff0000')), /^#ff[0-3][0-9a-f][0-3][0-9a-f]$/);
  assert.throws(() => validHost('http://evil/x'), /inválida/);
});

test('el cliente se vincula con el botón, lee las luces y las cambia', async () => {
  const bridge = await lab.startFakeHue();
  const client = new HueClient({ interval: 60000 });
  try {
    await assert.rejects(client.pair(bridge.host), /Pulsa el botón/);
    bridge.pressButton();
    const username = await client.pair(bridge.host);
    await client.connect(bridge.host, username);
    assert.equal(client.state.status, 'connected');
    assert.deepEqual(client.devices().map(d => d.name), ['Hue · living', 'Hue · tira dormitorio', 'Hue · baño']);
    const commands = [];
    client.on('command', c => commands.push(c));
    await client.setLight('hue.light_2', { on: true, brightness: 50, mode: 'color', warmth: 0, color: '#3d8bff' });
    assert.equal(bridge.lights[2].state.on, true);
    assert.equal(bridge.lights[2].state.bri, 127);
    assert.equal(bridge.lights[2].state.colormode, 'xy');
    assert.equal(commands[0].ok, true);
    await assert.rejects(client.setLight('hue.light_99', { on: false, brightness: 0, mode: 'temperature', warmth: 0, color: '#ffffff' }), /no informa/);
  } finally {
    client.disconnect();
    await bridge.close();
  }
});
