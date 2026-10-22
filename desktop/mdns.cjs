// Búsqueda en la red local por mDNS/DNS-SD (como Bonjour), sin dependencias: pregunta por un
// servicio (_home-assistant._tcp.local, _hue._tcp.local) desde un puerto propio, así los equipos
// responden directo a Habita (respuesta «unicast heredada», RFC 6762 §6.7).
const dgram = require('node:dgram');

const TYPE = { A: 1, PTR: 12, TXT: 16, SRV: 33 };

function encodeName(name) {
  const parts = name.replace(/\.$/, '').split('.').map(label => { const b = Buffer.from(label, 'utf8'); return Buffer.concat([Buffer.from([b.length]), b]); });
  return Buffer.concat([...parts, Buffer.from([0])]);
}

function buildQuery(service) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4); // una pregunta
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(TYPE.PTR, 0);
  tail.writeUInt16BE(1, 2); // IN
  return Buffer.concat([header, encodeName(service), tail]);
}

// Lee un nombre con compresión de punteros; devuelve [nombre, posición siguiente].
function readName(buf, offset, depth = 0) {
  const labels = [];
  let pos = offset, end = null;
  while (pos < buf.length) {
    const len = buf[pos];
    if (len === 0) { pos++; break; }
    if ((len & 0xc0) === 0xc0) {
      if (depth > 10 || pos + 1 >= buf.length) throw new Error('Nombre mDNS inválido');
      if (end === null) end = pos + 2;
      const [rest] = readName(buf, ((len & 0x3f) << 8) | buf[pos + 1], depth + 1);
      if (rest) labels.push(rest);
      return [labels.join('.'), end];
    }
    labels.push(buf.toString('utf8', pos + 1, pos + 1 + len));
    pos += len + 1;
  }
  return [labels.join('.'), end ?? pos];
}

function parsePacket(buf) {
  if (buf.length < 12) return [];
  const qd = buf.readUInt16BE(4), count = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10);
  let pos = 12;
  for (let i = 0; i < qd; i++) pos = readName(buf, pos)[1] + 4;
  const records = [];
  for (let i = 0; i < count && pos + 10 <= buf.length; i++) {
    const [name, next] = readName(buf, pos);
    const type = buf.readUInt16BE(next), length = buf.readUInt16BE(next + 8), data = next + 10;
    if (data + length > buf.length) break;
    const record = { name: name.toLowerCase(), type };
    if (type === TYPE.PTR) record.target = readName(buf, data)[0];
    else if (type === TYPE.SRV) Object.assign(record, { port: buf.readUInt16BE(data + 4), target: readName(buf, data + 6)[0].toLowerCase() });
    else if (type === TYPE.A && length === 4) record.address = [...buf.subarray(data, data + 4)].join('.');
    else if (type === TYPE.TXT) {
      record.txt = {};
      for (let p = data; p < data + length;) { const l = buf[p]; const entry = buf.toString('utf8', p + 1, p + 1 + l); p += l + 1; const eq = entry.indexOf('='); if (eq > 0) record.txt[entry.slice(0, eq).toLowerCase()] = entry.slice(eq + 1); }
    }
    records.push(record);
    pos = data + length;
  }
  return records;
}

// Junta PTR → SRV → A/TXT de todas las respuestas en una lista de servicios encontrados.
function resolveServices(records, service) {
  const byName = type => new Map(records.filter(r => r.type === type).map(r => [r.name, r]));
  const srv = byName(TYPE.SRV), txt = byName(TYPE.TXT), a = new Map();
  for (const r of records.filter(r => r.type === TYPE.A)) a.set(r.name, r.address);
  const instances = [...new Set(records.filter(r => r.type === TYPE.PTR && r.name === service.toLowerCase()).map(r => r.target))];
  return instances.map(instance => {
    const s = srv.get(instance.toLowerCase()), t = txt.get(instance.toLowerCase());
    return { name: instance.replace(`.${service}`, ''), host: s?.target || null, port: s?.port || null, address: (s && a.get(s.target)) || null, txt: t?.txt || {} };
  }).filter(found => found.address || found.host);
}

function browse(service, { timeout = 1500, socketFactory = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }) } = {}) {
  return new Promise(resolve => {
    const records = [];
    let socket;
    const finish = () => { try { socket?.close(); } catch {} resolve(resolveServices(records, service)); };
    try {
      socket = socketFactory();
      socket.on('message', message => { try { records.push(...parsePacket(message)); } catch {} });
      socket.on('error', finish);
      socket.bind(0, () => {
        try { socket.setMulticastTTL(255); } catch {}
        socket.send(buildQuery(service), 5353, '224.0.0.251', () => {});
      });
      setTimeout(finish, timeout).unref?.();
    } catch { finish(); }
  });
}

module.exports = { buildQuery, parsePacket, resolveServices, browse, encodeName, TYPE };
