// Control desde el celular: un servidor en la red de la casa que entrega el panel remoto y atiende
// sus órdenes. Solo responde a equipos de la red local, exige la clave que va en el código QR y
// solo permite las órdenes del control (luces, aires, televisores, escenas y la imagen).
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const remoteTools = new Set(['get_home', 'set_lights', 'set_air_conditioners', 'set_tvs', 'activate_scene', 'get_picture']);
const maxBody = 16 * 1024;

// Direcciones privadas (RFC 1918), locales y de enlace; también IPv4 dentro de IPv6.
function isPrivate(address = '') {
  const ip = address.replace(/^::ffff:/, '');
  if (ip === '::1' || /^fe80:/i.test(ip) || /^f[cd]/i.test(ip)) return true;
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n))) return false;
  return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254);
}

// IPv4 de la red local de este equipo (para el enlace del QR).
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) for (const net of list || []) if (net.family === 'IPv4' && !net.internal && isPrivate(net.address)) return net.address;
  return '127.0.0.1';
}

function createRemote({ call, onCall = () => {}, port = 8770 }) {
  let server = null, key = null;
  const page = fs.readFileSync(path.join(__dirname, 'remote', 'remote.html'), 'utf8');
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'" };
  const reply = (res, code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { ...headers, 'content-type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  const authorized = req => {
    const given = Buffer.from(String(req.headers.authorization || '')), expected = Buffer.from(`Bearer ${key}`);
    return !!key && given.length === expected.length && crypto.timingSafeEqual(given, expected);
  };

  async function handle(req, res) {
    if (!isPrivate(req.socket.remoteAddress)) return reply(res, 403, { ok: false, error: 'Solo desde la red de la casa.' });
    const url = new URL(req.url, 'http://habita');
    if (req.method === 'GET' && url.pathname === '/') return reply(res, 200, page, 'text/html; charset=utf-8');
    if (req.method !== 'POST' || url.pathname !== '/api/tool') return reply(res, 404, { ok: false, error: 'Ruta desconocida.' });
    if (!authorized(req)) return reply(res, 401, { ok: false, error: 'Este celular no está vinculado. Escanea otra vez el código QR de Habita.' });
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > maxBody) return reply(res, 413, { ok: false, error: 'Petición demasiado grande.' }); }
    let input;
    try { input = JSON.parse(body); } catch { return reply(res, 400, { ok: false, error: 'JSON inválido.' }); }
    const name = input?.name, args = input?.arguments ?? {};
    if (!remoteTools.has(name) || !args || typeof args !== 'object' || Array.isArray(args)) return reply(res, 400, { ok: false, error: 'Orden no permitida.' });
    const started = Date.now();
    const result = await call(name, args).catch(error => ({ ok: false, error: error.message }));
    if (name !== 'get_home' && name !== 'get_picture') onCall({ name, ok: result.ok, error: result.error, ms: Date.now() - started });
    reply(res, 200, result);
  }

  return {
    get running() { return !!server; },
    get key() { return key; },
    // La clave se conserva entre inicios (settings) para que el celular siga vinculado.
    async start(savedKey) {
      if (server) return;
      key = typeof savedKey === 'string' && /^[a-f0-9]{32}$/.test(savedKey) ? savedKey : crypto.randomBytes(16).toString('hex');
      const next = http.createServer((req, res) => handle(req, res).catch(() => reply(res, 500, { ok: false, error: 'Error interno.' })));
      await new Promise((resolve, reject) => {
        next.once('error', error => error.code === 'EADDRINUSE' ? next.listen(0, '0.0.0.0', resolve) : reject(error));
        next.listen(port, '0.0.0.0', resolve);
      });
      server = next;
    },
    async stop() {
      const current = server;
      server = null;
      if (current) await new Promise(resolve => { current.close(() => resolve()); current.closeAllConnections?.(); });
    },
    // Una clave nueva desvincula los celulares que tenían la anterior.
    rotate() { key = crypto.randomBytes(16).toString('hex'); return key; },
    address() { return server ? `http://${lanAddress()}:${server.address().port}` : null; },
    link() { return server ? `${this.address()}/#k=${key}` : null; }
  };
}

module.exports = { createRemote, isPrivate, lanAddress, remoteTools };
