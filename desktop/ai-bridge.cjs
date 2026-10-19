// Puente local para asistentes de IA. Escucha solo en 127.0.0.1 con un token aleatorio que se
// renueva en cada inicio y se guarda en la carpeta de datos del usuario; el servidor MCP
// (desktop/mcp-server.cjs) lo lee de ahí. Rechaza peticiones de páginas web (Origin) y de otros
// hosts, y nunca expone tokens ni identificadores de Home Assistant.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');

const tools = new Set(['get_home', 'set_lights', 'set_air_conditioners', 'set_tvs', 'activate_scene']);
const maxBody = 64 * 1024;

function createAiBridge({ accessFile, call, onCall = () => {} }) {
  let server = null;
  let token = null;

  function reply(res, code, body) {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  function authorized(req) {
    const given = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from(`Bearer ${token}`);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  async function handle(req, res) {
    const host = String(req.headers.host || '');
    if (req.headers.origin || !/^127\.0\.0\.1:\d+$/.test(host)) return reply(res, 403, { error: 'Solo se aceptan programas de este equipo.' });
    if (!authorized(req)) return reply(res, 401, { error: 'Token inválido. Vuelve a abrir el asistente después de activar el acceso en Habita.' });
    if (req.method !== 'POST' || req.url !== '/tool') return reply(res, 404, { error: 'Ruta desconocida.' });
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > maxBody) return reply(res, 413, { error: 'Petición demasiado grande.' });
    }
    let input;
    try { input = JSON.parse(body); } catch { return reply(res, 400, { error: 'JSON inválido.' }); }
    const name = input?.name, args = input?.arguments ?? {};
    if (!tools.has(name)) return reply(res, 400, { error: `Herramienta desconocida: ${name}` });
    if (!args || typeof args !== 'object' || Array.isArray(args)) return reply(res, 400, { error: 'Los argumentos deben ser un objeto.' });
    const started = Date.now();
    try {
      const result = await call(name, args);
      onCall({ name, ok: result.ok, error: result.error, ms: Date.now() - started });
      reply(res, 200, result);
    } catch (error) {
      onCall({ name, ok: false, error: error.message, ms: Date.now() - started });
      reply(res, 200, { ok: false, error: error.message });
    }
  }

  return {
    get running() { return !!server; },
    async start() {
      if (server) return;
      token = crypto.randomBytes(32).toString('hex');
      const next = http.createServer((req, res) => handle(req, res).catch(() => reply(res, 500, { error: 'Error interno.' })));
      await new Promise((resolve, reject) => { next.once('error', reject); next.listen(0, '127.0.0.1', resolve); });
      server = next;
      await fs.writeFile(accessFile, JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, token }), { encoding: 'utf8', mode: 0o600 });
    },
    async stop() {
      const current = server;
      server = null;
      token = null;
      await fs.rm(accessFile, { force: true });
      if (current) await new Promise(resolve => { current.close(() => resolve()); current.closeAllConnections?.(); });
    }
  };
}

module.exports = { createAiBridge };
