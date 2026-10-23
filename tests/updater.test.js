import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// updater.cjs pide electron solo al usarse; para comparar versiones basta con un reemplazo vacío.
const require = createRequire(import.meta.url);
const Module = require('node:module');
const load = Module._load;
Module._load = (name, ...rest) => name === 'electron' ? { app: {}, shell: {} } : load(name, ...rest);
const { compareVersions } = require('../desktop/updater.cjs');
Module._load = load;

test('compara versiones con y sin «v»', () => {
  assert.ok(compareVersions('v0.10.0', '0.9.1') > 0);
  assert.ok(compareVersions('0.9.1', '0.10.0') < 0);
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
  assert.ok(compareVersions('1.0.0', '0.99.99') > 0);
});
