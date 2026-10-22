import { test } from 'node:test';
import assert from 'node:assert/strict';
import mdns from '../desktop/mdns.cjs';

const { buildQuery, parsePacket, resolveServices, encodeName, TYPE } = mdns;

// Respuesta como la de Home Assistant: PTR del servicio, SRV con puerto, TXT y la dirección.
function record(name, type, data) {
  const head = Buffer.alloc(10);
  head.writeUInt16BE(type, 0); head.writeUInt16BE(1, 2); head.writeUInt32BE(120, 4); head.writeUInt16BE(data.length, 8);
  return Buffer.concat([encodeName(name), head, data]);
}
function response() {
  const service = '_home-assistant._tcp.local', instance = `Casa.${service}`;
  const srv = Buffer.alloc(6); srv.writeUInt16BE(8123, 4);
  const txt = Buffer.concat(['internal_url=http://192.168.1.20:8123', 'location_name=Casa'].map(s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s)])));
  const records = [record(service, TYPE.PTR, encodeName(instance)), record(instance, TYPE.SRV, Buffer.concat([srv, encodeName('homeassistant.local')])), record(instance, TYPE.TXT, txt), record('homeassistant.local', TYPE.A, Buffer.from([192, 168, 1, 20]))];
  const header = Buffer.alloc(12); header.writeUInt16BE(0x8400, 2); header.writeUInt16BE(records.length, 6);
  return Buffer.concat([header, ...records]);
}

test('la consulta mDNS pregunta por el servicio con PTR', () => {
  const query = buildQuery('_hue._tcp.local');
  assert.equal(query.readUInt16BE(4), 1);
  assert.ok(query.includes(Buffer.from('_hue')));
});

test('una respuesta de Home Assistant se resuelve en dirección, puerto y URL', () => {
  const found = resolveServices(parsePacket(response()), '_home-assistant._tcp.local');
  assert.deepEqual(found, [{ name: 'Casa', host: 'homeassistant.local', port: 8123, address: '192.168.1.20', txt: { internal_url: 'http://192.168.1.20:8123', location_name: 'Casa' } }]);
  assert.deepEqual(parsePacket(Buffer.from([1, 2, 3])), []);
});
