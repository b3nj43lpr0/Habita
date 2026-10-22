import { test } from 'node:test';
import assert from 'node:assert/strict';
import mapping from '../desktop/ha-mapping.cjs';
import { exampleProject, validateProject } from '../src/model/model.js';
import { validAutomations, dueAutomations, contactAutomations, describeTrigger } from '../src/model/automations.js';
import { applyTvs, homeSnapshot } from '../src/devices/ai-home.js';
import { isTv } from '../src/devices/tv.js';

const withAutomations = () => {
  const project = exampleProject();
  const window = project.items.find(i => i.asset === 'window');
  project.scenes = [{ id: 'cine', name: 'Cine', lights: {}, climates: {} }];
  project.automations = [
    { id: 'noche', name: 'Noche', enabled: true, trigger: { type: 'time', time: '22:00', days: [1, 2, 3, 4, 5] }, scene: 'cine' },
    { id: 'apagada', name: 'Apagada', enabled: false, trigger: { type: 'time', time: '22:00', days: [1, 2, 3, 4, 5] }, scene: 'cine' },
    { id: 'ventana', name: 'Ventana', enabled: true, trigger: { type: 'contact', item: window.id, when: 'open' }, scene: 'cine' }
  ];
  return { project, window };
};

test('las automatizaciones con hora corren una vez en su minuto y solo los días elegidos', () => {
  const { project } = withAutomations();
  const ran = new Map();
  const monday = new Date(2026, 9, 19, 22, 0, 10);
  assert.deepEqual(dueAutomations(project, monday, ran).map(a => a.id), ['noche']);
  assert.deepEqual(dueAutomations(project, new Date(2026, 9, 19, 22, 0, 40), ran), []);
  assert.deepEqual(dueAutomations(project, new Date(2026, 9, 19, 22, 1), ran), []);
  assert.deepEqual(dueAutomations(project, new Date(2026, 9, 18, 22, 0), ran), [], 'domingo');
  assert.deepEqual(dueAutomations(project, new Date(2026, 9, 20, 22, 0), ran).map(a => a.id), ['noche']);
  assert.equal(describeTrigger(project.automations[0], project), 'Lun, Mar, Mié, Jue, Vie a las 22:00');
});

test('las automatizaciones de apertura reaccionan solo al cambio elegido', () => {
  const { project, window } = withAutomations();
  assert.deepEqual(contactAutomations(project, window.id, true).map(a => a.id), ['ventana']);
  assert.deepEqual(contactAutomations(project, window.id, false), []);
  assert.match(describeTrigger(project.automations[2], project), /^Al abrir Ventana/);
});

test('las automatizaciones se validan al abrir el proyecto', () => {
  const { project } = withAutomations();
  assert.doesNotThrow(() => validateProject(JSON.parse(JSON.stringify(project))));
  const bad = [
    { trigger: { type: 'time', time: '25:00', days: [1] } }, { trigger: { type: 'time', time: '07:30', days: [] } },
    { trigger: { type: 'time', time: '07:30', days: [1, 1] } }, { trigger: { type: 'time', time: '07:30', days: [7] } },
    { trigger: { type: 'contact', item: 'x', when: 'ajar' } }, { trigger: { type: 'motion' } }, { enabled: 'si' }, { name: '' }
  ];
  for (const change of bad) assert.equal(validAutomations([{ ...project.automations[0], ...change }]), false, JSON.stringify(change));
  project.automations.push({ ...project.automations[0] });
  assert.throws(() => validateProject(project), /Automatizaciones/);
});

test('la IA cambia televisores por objeto o habitación y no ve el dispositivo real', () => {
  const project = exampleProject();
  const tv = project.items.find(isTv);
  assert.deepEqual(applyTvs(project, { room: 'Living y comedor', volume: 30 }).map(i => i.id), [tv.id]);
  assert.deepEqual(tv.tv, { on: true, volume: 30, muted: false, source: '' });
  applyTvs(project, { ids: [tv.id], source: 'Netflix', muted: true });
  assert.deepEqual(tv.tv, { on: true, volume: 30, muted: true, source: 'Netflix' });
  assert.deepEqual(applyTvs(project, { ids: [tv.id], muted: true }), []);
  assert.throws(() => applyTvs(project, { volume: 120 }), /volume/);
  assert.throws(() => applyTvs(project, {}), /Indica/);
  const view = homeSnapshot(project, () => ({ available: true, label: 'Living · televisor · encendido' }));
  assert.equal(view.tvs[0].id, tv.id);
  assert.ok(!JSON.stringify(view).includes('media_player'));
});

test('los sensores de consumo se cargan; los de energía acumulada no', () => {
  const sensor = (device_class, unit, state) => ({ entity_id: 'sensor.x', state, attributes: { device_class, unit_of_measurement: unit } });
  assert.ok(mapping.relevant(sensor('power', 'W', '340')));
  assert.equal(mapping.relevant(sensor('energy', 'kWh', '812')), false);
  assert.deepEqual(mapping.fromEntity(sensor('power', 'kW', '1.25')).sensor, { measure: 'power', value: 1.25, unit: 'kW' });
});
