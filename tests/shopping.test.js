import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shoppingList, shoppingCsv, validPrice, validLink, money } from '../src/shopping.js';
import { exampleProject, validateProject } from '../src/model.js';

test('la lista de compras suma por mueble y se exporta como CSV', () => {
  const project = exampleProject();
  const sofa = project.items.find(i => i.asset === 'sofa'), bed = project.items.find(i => i.asset === 'bed');
  sofa.price = 499990; sofa.link = 'https://tienda.cl/sofa?color=gris;talla=3';
  bed.price = 250000;
  const list = shoppingList(project);
  assert.equal(list.total, 749990);
  assert.equal(list.rows.some(r => r.name === 'Puerta interior'), false, 'Las aberturas no se compran aparte');
  assert.equal(list.missing, list.rows.length - 2);
  assert.equal(list.rows.find(r => r.id === sofa.id).room, 'Living y comedor');
  const csv = shoppingCsv(list);
  assert.ok(csv.startsWith('﻿Espacio;Objeto;'));
  assert.ok(csv.includes('"https://tienda.cl/sofa?color=gris;talla=3"'), 'Escapa el punto y coma');
  assert.ok(csv.trim().endsWith(';Total;;749990;'));
  assert.equal(money(749990).replace(/\s/g, ' '), '$749.990');
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))).items.find(i => i.id === sofa.id).price, 499990);
});

test('precios y enlaces inválidos no se aceptan', () => {
  assert.equal(validPrice(-1), false);
  assert.equal(validPrice(NaN), false);
  assert.equal(validLink('javascript:alert(1)'), false);
  assert.equal(validLink('https://ok.cl/x'), true);
  const project = exampleProject();
  project.items[0].link = 'file:///etc/passwd';
  assert.throws(() => validateProject(project), /compra/);
});
