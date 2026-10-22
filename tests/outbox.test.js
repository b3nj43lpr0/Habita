import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createOutbox } from '../src/ui/outbox.js';
import eventLog from '../desktop/event-log.cjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('una orden en curso por dispositivo y los cambios intermedios se fusionan', async () => {
  const sent = [], waits = [];
  const idle = [];
  const outbox = createOutbox((key, state) => { sent.push([key, state]); const d = deferred(); waits.push(d); return d.promise; }, { onIdle: key => idle.push(key) });
  // Un arrastre: 1..20. Solo viajan el primero y el último.
  for (let brightness = 1; brightness <= 20; brightness++) outbox.dispatch('light.a', { brightness });
  outbox.dispatch('light.b', { brightness: 5 });
  assert.deepEqual(sent, [['light.a', { brightness: 1 }], ['light.b', { brightness: 5 }]]);
  assert.equal(outbox.busy('light.a'), true);
  waits[0].resolve(); await tick();
  assert.deepEqual(sent.at(-1), ['light.a', { brightness: 20 }]);
  waits[1].resolve(); waits[2].resolve(); await tick();
  assert.equal(sent.length, 3);
  assert.deepEqual(idle.sort(), ['light.a', 'light.b']);
  assert.equal(outbox.busy('light.a'), false);
});

test('un rechazo descarta lo pendiente e informa el error', async () => {
  const errors = [], sent = [];
  let first = true;
  const outbox = createOutbox(async (key, state) => { sent.push(state); if (first) { first = false; await tick(); throw new Error('rechazado'); } }, { onError: (key, error, meta) => errors.push([key, error.message, meta.name]) });
  outbox.dispatch('light.a', 1, { name: 'Lámpara' });
  outbox.dispatch('light.a', 2, { name: 'Lámpara' });
  await tick(); await tick();
  assert.deepEqual(sent, [1]);
  assert.deepEqual(errors, [['light.a', 'rechazado', 'Lámpara']]);
  outbox.dispatch('light.a', 3, {});
  await tick();
  assert.deepEqual(sent, [1, 3]);
});

test('el registro de eventos agrega líneas, las lee y conserva la mitad reciente', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'habita-log-'));
  try {
    const log = eventLog.createEventLog(path.join(dir, 'events.log'), { limit: 2000 });
    log.append(['light.a', 'light.turn_on', '{"brightness_pct":40}', 'ok', '12 ms']);
    log.append(['conexión', 'error', 'línea\ncon salto']);
    const lines = await log.read();
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^\d{4}-\d\d-\d\dT.*\tlight\.a\tlight\.turn_on\t\{"brightness_pct":40\}\tok\t12 ms$/);
    assert.match(lines[1], /línea con salto$/);
    for (let i = 0; i < 100; i++) log.append(['light.a', 'light.turn_on', `{"n":${i}}`, 'ok', '1 ms']);
    const trimmed = await log.read(1000);
    assert.ok((await readFile(log.file, 'utf8')).length <= 2000);
    assert.match(trimmed.at(-1), /"n":99/);
    assert.ok(trimmed.every(line => /^\d{4}-/.test(line)), 'el recorte empieza en una línea completa');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('el intervalo mínimo separa las órdenes y deja fusionar el arrastre', async () => {
  const sent = [];
  const outbox = createOutbox(async (key, state) => { sent.push([state, Date.now()]); }, { interval: 60 });
  const started = Date.now();
  for (let i = 1; i <= 30; i++) { outbox.dispatch('light.a', i); await new Promise(resolve => setTimeout(resolve, 5)); }
  const elapsed = Date.now() - started;
  await new Promise(resolve => setTimeout(resolve, 150));
  // Treinta cambios caben en pocas órdenes: a lo más una cada 60 ms (los timers de Windows van de 15 en 15 ms).
  assert.ok(sent.length >= 2 && sent.length <= Math.ceil(elapsed / 60) + 1, `${sent.length} órdenes en ${elapsed} ms`);
  assert.ok(sent.length < 30 / 2);
  assert.equal(sent.at(-1)[0], 30);
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i][1] - sent[i - 1][1] >= 55, 'separación mínima');
});
