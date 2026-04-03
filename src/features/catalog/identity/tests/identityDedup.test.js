import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanVariant,
  deriveFullModel,
  isFabricatedVariant,
  normalizeProductIdentity
} from '../identityDedup.js';

// --- cleanVariant ---

test('cleanVariant: strips placeholder values', () => {
  assert.equal(cleanVariant(''), '');
  assert.equal(cleanVariant('unk'), '');
  assert.equal(cleanVariant('Unknown'), '');
  assert.equal(cleanVariant('N/A'), '');
  assert.equal(cleanVariant('none'), '');
  assert.equal(cleanVariant('null'), '');
  assert.equal(cleanVariant('-'), '');
  assert.equal(cleanVariant('default'), '');
});

test('cleanVariant: preserves real variant values', () => {
  assert.equal(cleanVariant('Wireless'), 'Wireless');
  assert.equal(cleanVariant('Pro'), 'Pro');
  assert.equal(cleanVariant('M994'), 'M994');
});

test('cleanVariant: handles null/undefined', () => {
  assert.equal(cleanVariant(null), '');
  assert.equal(cleanVariant(undefined), '');
});

// --- isFabricatedVariant ---

test('isFabricatedVariant: "310" is fabricated from "Cestus 310"', () => {
  assert.equal(isFabricatedVariant('Cestus 310', '310'), true);
});

test('isFabricatedVariant: "Pro" is fabricated from "Alienware Pro"', () => {
  assert.equal(isFabricatedVariant('Alienware Pro', 'Pro'), true);
});

test('isFabricatedVariant: "Gladius III" is fabricated from "ROG Gladius III"', () => {
  assert.equal(isFabricatedVariant('ROG Gladius III', 'Gladius III'), true);
});

test('isFabricatedVariant: "M994" is fabricated from "Woki M994"', () => {
  assert.equal(isFabricatedVariant('Woki M994', 'M994'), true);
});

test('isFabricatedVariant: "Wireless" is NOT fabricated from "Viper V3 Pro"', () => {
  assert.equal(isFabricatedVariant('Viper V3 Pro', 'Wireless'), false);
});

test('isFabricatedVariant: empty variant is not fabricated', () => {
  assert.equal(isFabricatedVariant('Viper V3 Pro', ''), false);
  assert.equal(isFabricatedVariant('Viper V3 Pro', null), false);
});

test('isFabricatedVariant: placeholder variant is not fabricated', () => {
  assert.equal(isFabricatedVariant('Viper V3 Pro', 'N/A'), false);
  assert.equal(isFabricatedVariant('Viper V3 Pro', 'unknown'), false);
});

test('isFabricatedVariant: variant is exact model name', () => {
  assert.equal(isFabricatedVariant('G Pro X Superlight', 'G Pro X Superlight'), true);
});

test('isFabricatedVariant: single shared token but variant has unique info', () => {
  // "Pro Max" has "Pro" from model but also "Max" which is new info
  assert.equal(isFabricatedVariant('Viper V3 Pro', 'Pro Max'), false);
});

test('isFabricatedVariant: case insensitive', () => {
  assert.equal(isFabricatedVariant('CESTUS 310', '310'), true);
  assert.equal(isFabricatedVariant('cestus 310', '310'), true);
});

// --- normalizeProductIdentity ---
// WHY: productId is no longer returned (decoupled from identity).
// Tests verify identity normalization and fabricated variant stripping only.

test('normalizeProductIdentity: strips fabricated variant', () => {
  const result = normalizeProductIdentity('mouse', 'Acer', 'Cestus 310', '310');
  assert.equal(result.variant, '');
  assert.equal(result.wasCleaned, true);
  assert.equal(result.reason, 'fabricated_variant_stripped');
  assert.equal(result.productId, undefined);
});

test('normalizeProductIdentity: keeps real variant', () => {
  const result = normalizeProductIdentity('mouse', 'Razer', 'Viper V3 Pro', 'Wireless');
  assert.equal(result.variant, 'Wireless');
  assert.equal(result.wasCleaned, false);
  assert.equal(result.reason, null);
});

test('normalizeProductIdentity: empty variant remains empty, no fabrication flag', () => {
  const result = normalizeProductIdentity('mouse', 'Logitech', 'G Pro X Superlight 2', '');
  assert.equal(result.variant, '');
  assert.equal(result.wasCleaned, false);
});

test('normalizeProductIdentity: placeholder variant cleaned', () => {
  const result = normalizeProductIdentity('mouse', 'Corsair', 'M65 RGB Ultra', 'N/A');
  assert.equal(result.variant, '');
  assert.equal(result.wasCleaned, false); // placeholder cleaning is not "fabricated"
});

test('normalizeProductIdentity: diacritics handled correctly', () => {
  const result = normalizeProductIdentity('mouse', 'Señor', 'Café Mouse', '');
  assert.equal(result.brand, 'Señor'); // original brand preserved, only slug is NFD-normalized
});

test('normalizeProductIdentity: Redragon Woki M994 fabricated variant', () => {
  const result = normalizeProductIdentity('mouse', 'Redragon', 'Woki M994', 'M994');
  assert.equal(result.variant, '');
  assert.equal(result.wasCleaned, true);
});

test('normalizeProductIdentity: null inputs produce empty strings', () => {
  const result = normalizeProductIdentity('mouse', null, null, null);
  assert.equal(result.brand, '');
  assert.equal(result.model, '');
  assert.equal(result.variant, '');
});

// --- normalizeProductIdentity: canonical triple { base_model, model, variant } ---

test('normalizeProductIdentity: returns base_model and derived model for base-only input', () => {
  const result = normalizeProductIdentity('mouse', 'Razer', 'Viper V3 Pro', '');
  assert.equal(result.base_model, 'Viper V3 Pro');
  assert.equal(result.model, 'Viper V3 Pro');
  assert.equal(result.variant, '');
});

test('normalizeProductIdentity: returns derived model when variant is real', () => {
  const result = normalizeProductIdentity('mouse', 'Finalmouse', 'ULX Prophecy', 'Scream');
  assert.equal(result.base_model, 'ULX Prophecy');
  assert.equal(result.model, 'ULX Prophecy Scream');
  assert.equal(result.variant, 'Scream');
});

test('normalizeProductIdentity: fabricated variant stripped, model equals base_model', () => {
  const result = normalizeProductIdentity('mouse', 'Acer', 'Cestus 310', '310');
  assert.equal(result.base_model, 'Cestus 310');
  assert.equal(result.model, 'Cestus 310');
  assert.equal(result.variant, '');
  assert.equal(result.wasCleaned, true);
  assert.equal(result.reason, 'fabricated_variant_stripped');
});

test('normalizeProductIdentity: null inputs produce empty base_model and model', () => {
  const result = normalizeProductIdentity('mouse', null, null, null);
  assert.equal(result.base_model, '');
  assert.equal(result.model, '');
  assert.equal(result.variant, '');
});

// --- deriveFullModel ---

test('deriveFullModel: base + variant produces full name', () => {
  assert.equal(deriveFullModel('ULX Prophecy', 'Scream'), 'ULX Prophecy Scream');
});

test('deriveFullModel: no variant returns base only', () => {
  assert.equal(deriveFullModel('AW610M', ''), 'AW610M');
});

test('deriveFullModel: trims whitespace', () => {
  assert.equal(deriveFullModel('  Viper V3 Pro  ', '  White  '), 'Viper V3 Pro White');
});

test('deriveFullModel: null/undefined handled', () => {
  assert.equal(deriveFullModel(null, null), '');
  assert.equal(deriveFullModel(undefined, ''), '');
  assert.equal(deriveFullModel('G502', null), 'G502');
});
