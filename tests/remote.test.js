import { test } from 'node:test';
import assert from 'node:assert/strict';
import remote from '../desktop/remote.cjs';

const { createRemote, isPrivate } = remote;

test('solo se aceptan direcciones de la red local', () => {
  for (const ip of ['192.168.1.5', '10.0.0.2', '172.20.1.1', '::ffff:192.168.0.9', '127.0.0.1', 'fe80::1']) assert.equal(isPrivate(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '::ffff:1.1.1.1', '2001:db8::1', '']) assert.equal(isPrivate(ip), false, ip);
});

test('el control remoto entrega la página y exige la clave para las órdenes', async () => {
  const calls = [];
  const server = createRemote({ port: 0, call: async (name, args) => { calls.push([name, args]); return { ok: true, result: { name } }; } });
  await server.start();
  try {
    const base = server.address().replace(/\/\/[^:]+:/, '//127.0.0.1:');
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(await page.text(), /Control remoto de Habita/);
    const post = (body, key = server.key) => fetch(`${base}/api/tool`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    assert.equal((await post({ name: 'get_home' }, 'mala')).status, 401);
    assert.equal((await post({ name: 'edit_plan' })).status, 400, 'Solo órdenes del control');
    const ok = await (await post({ name: 'set_lights', arguments: { on: false } })).json();
    assert.deepEqual(ok, { ok: true, result: { name: 'set_lights' } });
    assert.deepEqual(calls, [['set_lights', { on: false }]]);
    const before = server.key;
    server.rotate();
    assert.equal((await post({ name: 'get_home' }, before)).status, 401, 'La clave anterior deja de servir');
    assert.match(server.link(), /#k=[a-f0-9]{32}$/);
  } finally {
    await server.stop();
  }
});
