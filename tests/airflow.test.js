import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAirflow } from '../src/airflow.js';

const item = { x: 0, z: 0, w: .9, h: .3, d: .24, rotation: 0 };
const positions = flow => {
  const mesh = flow.group.children[0], matrix = new THREE.Matrix4(), p = new THREE.Vector3();
  return Array.from({ length: mesh.count }, (_, i) => { mesh.getMatrixAt(i, matrix); p.setFromMatrixPosition(matrix); return [p.x, p.z]; });
};

test('las estelas del aire se reparten a lo ancho en vez de caer en una sola línea', () => {
  const flow = createAirflow(item);
  flow.setState({ on: true, mode: 'cool', fan: 'auto' }, true, true);
  flow.update(0); flow.update(.4);
  const pts = positions(flow), n = pts.length;
  const mean = k => pts.reduce((a, q) => a + q[k], 0) / n, mx = mean(0), mz = mean(1);
  const corr = pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - mz), 0) /
    Math.sqrt(pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0) * pts.reduce((a, q) => a + (q[1] - mz) ** 2, 0));
  assert.ok(Math.abs(corr) < .3, `correlación ${corr}`);
  assert.ok(Math.max(...pts.map(q => q[0])) - Math.min(...pts.map(q => q[0])) > item.w * .8);
});

test('al apagar, el flujo se desvanece y deja de animarse', () => {
  const flow = createAirflow(item);
  flow.setState({ on: true, mode: 'heat' }, true, true);
  flow.update(0);
  flow.setState({ on: false, mode: 'heat' });
  assert.equal(flow.active, true);
  for (let t = .05; t < 4; t += .05) flow.update(t);
  assert.equal(flow.active, false);
  assert.equal(flow.group.children[0].visible, false);
});
