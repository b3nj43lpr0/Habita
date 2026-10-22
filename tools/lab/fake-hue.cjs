// Puente Philips Hue simulado (API local v1) para probar Habita sin hardware: vincular con el botón,
// leer las luces y cambiar su estado. Arranca junto al laboratorio de Home Assistant (npm run lab).
const http = require('node:http');

function demoLights() {
  return {
    1: { name: 'Hue · living', type: 'Extended color light', capabilities: { control: { ct: { min: 153, max: 454 } } }, state: { on: true, bri: 200, ct: 366, xy: [.4573, .41], colormode: 'ct', reachable: true } },
    2: { name: 'Hue · tira dormitorio', type: 'Color light', state: { on: false, bri: 120, xy: [.17, .7], colormode: 'xy', reachable: true } },
    3: { name: 'Hue · baño', type: 'Dimmable light', state: { on: true, bri: 254, reachable: true } }
  };
}

function startFakeHue({ port = 0, log = () => {} } = {}) {
  const lights = demoLights();
  const users = new Set();
  let buttonUntil = 0;
  const send = (response, status, data) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(data)); };
  const error = (type, description) => [{ error: { type, address: '/', description } }];

  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; if (body.length > 10000) request.destroy(); });
    request.on('end', () => {
      const parts = new URL(request.url, 'http://hue').pathname.split('/').filter(Boolean);
      let data = {};
      try { data = body ? JSON.parse(body) : {}; } catch { return send(response, 400, error(2, 'body contains invalid json')); }
      if (parts[0] !== 'api') return send(response, 404, error(4, 'method not available'));
      if (parts.length === 1 && request.method === 'POST') {
        if (Date.now() > buttonUntil) return send(response, 200, error(101, 'link button not pressed'));
        const username = `habita${users.size + 1}x${Math.random().toString(36).slice(2, 10)}`;
        users.add(username);
        log(`usuario creado para ${data.devicetype}`);
        return send(response, 200, [{ success: { username } }]);
      }
      if (!users.has(parts[1])) return send(response, 200, error(1, 'unauthorized user'));
      if (parts[2] === 'lights' && parts.length === 3 && request.method === 'GET') return send(response, 200, lights);
      const light = lights[parts[3]];
      if (parts[2] === 'lights' && light && parts[4] === 'state' && request.method === 'PUT') {
        const s = light.state;
        if ('on' in data) s.on = !!data.on;
        if ('bri' in data && 'bri' in s) s.bri = Math.max(1, Math.min(254, data.bri));
        if ('ct' in data && 'ct' in s) { s.ct = data.ct; s.colormode = 'ct'; }
        if ('xy' in data && 'xy' in s) { s.xy = data.xy; s.colormode = 'xy'; }
        log(`luz ${parts[3]} → ${JSON.stringify(data)}`);
        return send(response, 200, Object.keys(data).map(key => ({ success: { [`/lights/${parts[3]}/state/${key}`]: data[key] } })));
      }
      send(response, 200, error(3, 'resource not available'));
    });
  });

  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({
    host: `127.0.0.1:${server.address().port}`,
    lights,
    // Simula pulsar el botón del puente: durante 30 s acepta vincular una aplicación.
    pressButton() { buttonUntil = Date.now() + 30000; },
    close: () => new Promise(done => server.close(done))
  })));
}

module.exports = { startFakeHue };
