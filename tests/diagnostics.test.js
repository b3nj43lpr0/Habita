import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../src/diagnostics.js';

const project = { items: [{ id: 'l1', name: 'Lámpara' }, { id: 'l2', name: 'Velador' }, { id: 'tv', name: 'Tele' }, { id: 'l3', name: 'Otra' }], rooms: [{ id: 'r', name: 'Living' }] };
const kindFor = item => item.id === 'tv' ? 'tv' : 'light';
const devices = new Map([
  ['light.ok', { name: 'Techo', kind: 'light', available: true }],
  ['light.off', { name: 'Pie', kind: 'light', available: false }],
  ['light.wrong', { name: 'Tira', kind: 'light', available: true }],
  ['sensor.t', { name: 'Termómetro', kind: 'sensor', available: true }]
]);

test('el diagnóstico revisa cada vinculación y detecta las huérfanas', () => {
  const bindings = { l1: 'light.ok', l2: 'light.off', tv: 'light.wrong', gone: 'light.ok', 'room:r:temperature': 'sensor.t', 'room:x:humidity': 'sensor.t', l3: 'light.missing' };
  const { checks, orphans, report } = diagnose({ status: { configured: true, status: 'connected' }, bindings, devices, project, kindFor, log: ['2026-10-22T10:00:00Z\tlight.on\terror: tiempo agotado'] });
  assert.deepEqual(orphans, ['gone', 'room:x:humidity']);
  const text = checks.map(c => `${c.level} ${c.text}`);
  assert.ok(text.includes('warn «Velador»: Pie no está disponible (apagado en la pared o sin red).'));
  assert.ok(text.includes('error «Tele» está vinculado con Tira, que no es del tipo correcto.'));
  assert.ok(text.includes('error «Otra» está vinculado con light.missing, que Home Assistant ya no informa.'));
  assert.ok(text.includes('ok 2 vinculaciones responden bien.'));
  assert.ok(text.some(t => t.startsWith('warn 1 orden falló')));
  assert.ok(report.includes('✗ «Tele»'));
});

test('sin conexión no acusa a cada equipo, solo la conexión', () => {
  const { checks } = diagnose({ status: { configured: true, status: 'error', message: 'Token rechazado' }, bindings: { l1: 'light.ok' }, devices: new Map(), project, kindFor });
  assert.deepEqual(checks.filter(c => c.level === 'error').map(c => c.text), ['Sin conexión con Home Assistant: Token rechazado']);
});
