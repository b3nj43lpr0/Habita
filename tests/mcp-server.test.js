// El servidor MCP real (desktop/mcp-server.cjs) contra el puente local real (desktop/ai-bridge.cjs),
// con una ventana simulada que responde las herramientas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createAiBridge } = require('../desktop/ai-bridge.cjs');
const serverPath = fileURLToPath(new URL('../desktop/mcp-server.cjs', import.meta.url));

function startMcp(accessFile) {
  const child = spawn(process.execPath, [serverPath], { env: { ...process.env, HABITA_ACCESS_FILE: accessFile }, stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map();
  let next = 1;
  readline.createInterface({ input: child.stdout }).on('line', line => {
    const message = JSON.parse(line);
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  });
  return {
    request(method, params) {
      const id = next++;
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      return new Promise(resolve => waiting.set(id, resolve));
    },
    notify(method) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'); },
    close() { child.kill(); }
  };
}

test('el servidor MCP reenvía herramientas a Habita y avisa si el acceso está apagado', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'habita-mcp-'));
  const accessFile = path.join(dir, 'ai-access.json');
  const calls = [], logged = [];
  const bridge = createAiBridge({
    accessFile,
    call: async (tool, args) => {
      calls.push({ tool, args });
      if (tool === 'activate_scene') return { ok: false, error: 'No hay una escena «Noche».' };
      return { ok: true, result: tool === 'get_home' ? { name: 'Mi casa', lights: [] } : { changed: [{ id: 'a', name: 'Lámpara' }] } };
    },
    onCall: c => logged.push(c)
  });
  const mcp = startMcp(accessFile);
  try {
    const init = await mcp.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'habita');
    assert.equal(init.result.protocolVersion, '2025-06-18');
    mcp.notify('notifications/initialized');
    const list = await mcp.request('tools/list', {});
    assert.deepEqual(list.result.tools.map(t => t.name), ['get_home', 'set_lights', 'set_air_conditioners', 'set_tvs', 'get_plan', 'add_room', 'update_room', 'remove_room', 'add_item', 'update_item', 'remove_item', 'activate_scene']);

    const off = await mcp.request('tools/call', { name: 'get_home', arguments: {} });
    assert.equal(off.result.isError, true);
    assert.match(off.result.content[0].text, /acceso para IA está desactivado/);

    await bridge.start();
    const access = JSON.parse(readFileSync(accessFile, 'utf8'));
    assert.match(access.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(access.token.length, 64);

    const homeCall = await mcp.request('tools/call', { name: 'get_home', arguments: {} });
    assert.equal(homeCall.result.structuredContent.name, 'Mi casa');
    const set = await mcp.request('tools/call', { name: 'set_lights', arguments: { room: 'Dormitorio', brightness: 30 } });
    assert.equal(set.result.isError, undefined);
    assert.deepEqual(calls.at(-1), { tool: 'set_lights', args: { room: 'Dormitorio', brightness: 30 } });
    const scene = await mcp.request('tools/call', { name: 'activate_scene', arguments: { scene: 'Noche' } });
    assert.equal(scene.result.isError, true);
    assert.match(scene.result.content[0].text, /Noche/);
    assert.equal((await mcp.request('tools/call', { name: 'borrar_casa', arguments: {} })).error.code, -32602);
    assert.equal((await mcp.request('resources/list', {})).error.code, -32601);
    assert.deepEqual(logged.map(c => [c.name, c.ok]), [['get_home', true], ['set_lights', true], ['activate_scene', false]]);

    await bridge.stop();
    assert.equal(existsSync(accessFile), false, 'Al desactivar se borra el token');
  } finally {
    mcp.close();
    await bridge.stop();
  }
});

test('el puente rechaza otros orígenes, tokens incorrectos y herramientas desconocidas', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'habita-bridge-'));
  const accessFile = path.join(dir, 'ai-access.json');
  const bridge = createAiBridge({ accessFile, call: async () => ({ ok: true, result: {} }) });
  await bridge.start();
  try {
    const { url, token } = JSON.parse(readFileSync(accessFile, 'utf8'));
    if (process.platform !== 'win32') assert.equal(statSync(accessFile).mode & 0o077, 0, 'Solo el usuario lee el token');
    const post = (body, headers = {}) => fetch(`${url}/tool`, { method: 'POST', headers: { authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body) });
    assert.equal((await post({ name: 'get_home' }, { authorization: 'Bearer otro' })).status, 401);
    assert.equal((await post({ name: 'get_home' }, { origin: 'https://sitio-malicioso.example' })).status, 403, 'Una página web no puede usar el puente');
    // fetch fija Host por su cuenta; http.request permite simular un nombre que apunta a 127.0.0.1.
    const rebound = await new Promise(resolve => http.request(`${url}/tool`, { method: 'POST', headers: { host: 'atacante.example', authorization: `Bearer ${token}` } }, res => { res.resume(); resolve(res.statusCode); }).end('{"name":"get_home"}'));
    assert.equal(rebound, 403, 'Rebinding de DNS');
    assert.equal((await post({ name: 'eval' })).status, 400);
    // Editar el plano exige el permiso aparte; ver el plano, no.
    assert.match((await (await post({ name: 'add_room', arguments: { x: 0, z: 0, w: 3, d: 3 } })).json()).error, /no permitió que la IA edite/);
    assert.equal((await (await post({ name: 'get_plan' })).json()).ok, true);
    assert.equal((await post({ name: 'set_lights', arguments: [1] })).status, 400);
    assert.equal((await post({ name: 'get_home', arguments: { x: 'a'.repeat(70 * 1024) } })).status, 413);
    const ok = await post({ name: 'get_home' });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, result: {} });
    // Al reiniciar el acceso cambia el token: uno filtrado deja de servir.
    await bridge.stop();
    await bridge.start();
    assert.notEqual(JSON.parse(readFileSync(accessFile, 'utf8')).token, token);
  } finally {
    await bridge.stop();
  }
});
