import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatProductImageIdentityFactsBlock,
  resolveProductImageDependencyStatus,
  resolveProductImageIdentityFacts,
} from '../productImageIdentityDependencies.js';

function makeSpecDb({ compiledRules, rowsByKey = {}, fallbackRowsByKey = {} } = {}) {
  return {
    getCompiledRules: () => compiledRules,
    getFieldCandidatesByProductAndField: (_productId, fieldKey, variantId) => {
      if (variantId) return rowsByKey[`${fieldKey}:${variantId}`] || [];
      return rowsByKey[`${fieldKey}:product`] || rowsByKey[fieldKey] || [];
    },
    getResolvedFieldCandidate: (_productId, fieldKey) => fallbackRowsByKey[fieldKey] || null,
  };
}

test('resolveProductImageIdentityFacts reads only enabled Field Studio dependency keys', () => {
  const compiledRules = {
    fields: {
      connection: {
        field_key: 'connection',
        product_image_dependent: true,
        ui: { label: 'Connection' },
      },
      weight_g: {
        field_key: 'weight_g',
        product_image_dependent: false,
        ui: { label: 'Weight' },
      },
      layout_standard: {
        field_key: 'layout_standard',
        product_image_dependent: true,
        ui: { label: 'Layout Standard' },
      },
    },
  };
  const specDb = makeSpecDb({
    compiledRules,
    rowsByKey: {
      'connection:product': [{ status: 'resolved', value: 'wired', confidence: 96 }],
      'layout_standard:v_ansi': [{ status: 'resolved', value: 'ANSI', confidence: 93 }],
      'weight_g:product': [{ status: 'resolved', value: 63, confidence: 90 }],
    },
  });

  const facts = resolveProductImageIdentityFacts({
    specDb,
    product: { product_id: 'p1', category: 'keyboard' },
    variant: { variant_id: 'v_ansi', key: 'layout:ansi', label: 'ANSI' },
  });

  assert.deepEqual(
    facts.map((fact) => [fact.fieldKey, fact.label, fact.value]),
    [
      ['connection', 'Connection', 'wired'],
      ['layout_standard', 'Layout Standard', 'ANSI'],
    ],
  );
});

test('resolveProductImageDependencyStatus reports required, resolved, and missing keys from the same dependency source', () => {
  const specDb = makeSpecDb({
    compiledRules: {
      fields: {
        connection: { field_key: 'connection', product_image_dependent: true, ui: { label: 'Connection' } },
        layout_standard: { field_key: 'layout_standard', product_image_dependent: true },
        weight_g: { field_key: 'weight_g', product_image_dependent: false },
      },
    },
    rowsByKey: {
      'connection:product': [{ status: 'resolved', value: 'wireless', confidence: 98 }],
      'layout_standard:product': [{ status: 'candidate', value: 'ANSI', confidence: 84 }],
      'weight_g:product': [{ status: 'resolved', value: 62, confidence: 90 }],
    },
  });

  const status = resolveProductImageDependencyStatus({
    specDb,
    product: { product_id: 'p1', category: 'keyboard' },
  });

  assert.equal(status.ready, false);
  assert.deepEqual(status.required_keys, ['connection', 'layout_standard']);
  assert.deepEqual(status.resolved_keys, ['connection']);
  assert.deepEqual(status.missing_keys, ['layout_standard']);
  assert.deepEqual(status.facts.map((fact) => [fact.fieldKey, fact.value]), [['connection', 'wireless']]);
});

test('resolveProductImageDependencyStatus is ready when a category has no product-image-dependent keys', () => {
  const specDb = makeSpecDb({
    compiledRules: {
      fields: {
        weight_g: { field_key: 'weight_g', product_image_dependent: false },
      },
    },
  });

  const status = resolveProductImageDependencyStatus({
    specDb,
    product: { product_id: 'p1', category: 'mouse' },
  });

  assert.equal(status.ready, true);
  assert.deepEqual(status.required_keys, []);
  assert.deepEqual(status.missing_keys, []);
});

test('resolveProductImageIdentityFacts omits unresolved and unknown values but can fall back to product JSON fields', () => {
  const specDb = makeSpecDb({
    compiledRules: {
      fields: {
        connection: { field_key: 'connection', product_image_dependent: true },
        color: { field_key: 'color', product_image_dependent: true },
        layout: { field_key: 'layout', product_image_dependent: true },
      },
    },
    rowsByKey: {
      'connection:product': [{ status: 'resolved', value: 'unk', confidence: 80 }],
      'layout:product': [{ status: 'rejected', value: 'TKL', confidence: 80 }],
    },
  });

  const facts = resolveProductImageIdentityFacts({
    specDb,
    product: {
      product_id: 'p1',
      category: 'keyboard',
      fields: {
        color: { value: 'black' },
        connection: { value: 'wireless' },
      },
    },
  });

  assert.deepEqual(
    facts.map((fact) => [fact.fieldKey, fact.value]),
    [['color', 'black']],
  );
});

test('formatProductImageIdentityFactsBlock renders discovery and eval guardrail text', () => {
  const facts = [
    { fieldKey: 'connection', label: 'Connection', value: 'wired' },
    { fieldKey: 'form_factor', label: 'Form Factor', value: 'TKL (80%)' },
  ];

  const discovery = formatProductImageIdentityFactsBlock(facts, { mode: 'discovery' });
  assert.match(discovery, /Product image identity facts/i);
  assert.match(discovery, /connection: wired/i);
  assert.match(discovery, /form_factor: TKL \(80%\)/i);
  assert.match(discovery, /required identity filters/i);
  assert.match(discovery, /Reject candidates that clearly conflict/i);

  const evalBlock = formatProductImageIdentityFactsBlock(facts, { mode: 'eval' });
  assert.match(evalBlock, /Product image identity guardrails/i);
  assert.match(evalBlock, /clear visual or source conflict/i);
  assert.match(evalBlock, /wrong_product/i);
});
