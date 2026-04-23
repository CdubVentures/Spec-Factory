import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composePerKeyPromptPreview,
  detectReservedKey,
} from '../perKeyPromptPreview.js';

function makeRule(overrides = {}) {
  return {
    priority: { required_level: 'non_mandatory', availability: 'always', difficulty: 'medium' },
    contract: { type: 'string', shape: 'scalar' },
    enum: { policy: 'closed', values: ['a', 'b'] },
    aliases: [],
    ai_assist: { reasoning_note: '' },
    search_hints: { domain_hints: [], query_terms: [] },
    ui: { label: 'Test Field' },
    ...overrides,
  };
}

test('reserved keys are detected and bypassed', () => {
  const res = composePerKeyPromptPreview(makeRule(), 'colors', { category: 'mouse' });
  assert.equal(res.reserved, true);
  assert.equal(res.systemPrompt, '');
  assert.ok(res.owner, 'owner attributed');
});

test('detectReservedKey attributes owner from FINDER_MODULES', () => {
  assert.deepEqual(detectReservedKey('colors'), { reserved: true, fieldKey: 'colors', owner: 'colorEditionFinder', ownerLabel: 'CEF' });
  assert.deepEqual(detectReservedKey('release_date'), { reserved: true, fieldKey: 'release_date', owner: 'releaseDateFinder', ownerLabel: 'RDF' });
  assert.deepEqual(detectReservedKey('sku'), { reserved: true, fieldKey: 'sku', owner: 'skuFinder', ownerLabel: 'SKF' });
  assert.equal(detectReservedKey('editions').reserved, true);
  assert.equal(detectReservedKey('dpi'), null);
  assert.equal(detectReservedKey(''), null);
});

test('non-reserved keys produce a systemPrompt containing the placeholder identity', () => {
  const res = composePerKeyPromptPreview(makeRule(), 'dpi', { category: 'mouse' });
  assert.equal(res.reserved, false);
  assert.ok(typeof res.systemPrompt === 'string' && res.systemPrompt.length > 100, 'systemPrompt is a non-trivial string');
  assert.ok(res.systemPrompt.includes('<BRAND>'), 'systemPrompt contains <BRAND> placeholder');
  assert.ok(res.systemPrompt.includes('<MODEL>'), 'systemPrompt contains <MODEL> placeholder');
});

test('systemPrompt contains the rendered field contract', () => {
  const rule = makeRule({
    contract: { type: 'number', shape: 'scalar', unit: 'g' },
    enum: { policy: '', values: [] },
    aliases: ['grams'],
  });
  const res = composePerKeyPromptPreview(rule, 'weight', { category: 'mouse' });
  assert.ok(res.systemPrompt.includes('Return contract:'), 'systemPrompt has contract block');
  assert.ok(res.systemPrompt.includes('Type: number'), 'systemPrompt mentions type');
  assert.ok(res.systemPrompt.includes('Unit: g'), 'systemPrompt mentions unit');
  assert.ok(res.systemPrompt.includes('grams'), 'systemPrompt mentions aliases');
});

test('component identity renders the PRIMARY_COMPONENT_KEYS pointer', () => {
  const rule = makeRule({ component: { type: 'sensor', source: 'component_db.sensor' } });
  const res = composePerKeyPromptPreview(rule, 'sensor', {
    category: 'mouse',
    componentRelation: { type: 'sensor', relation: 'parent' },
  });
  assert.ok(res.systemPrompt.includes('This key IS the sensor component identity'), 'component identity rendered');
});

test('subfield relation renders the parent-component pointer', () => {
  const rule = makeRule();
  const res = composePerKeyPromptPreview(rule, 'dpi', {
    category: 'mouse',
    componentRelation: { type: 'sensor', relation: 'subfield_of' },
  });
  assert.ok(res.systemPrompt.includes('belongs to the sensor component'), 'subfield pointer rendered');
});

test('tier bundle resolution honors the provided bundle config', () => {
  const rule = makeRule({ priority: { required_level: 'non_mandatory', availability: 'always', difficulty: 'hard' } });
  const tierBundles = {
    hard: { model: 'gpt-4-hard', useReasoning: true, reasoningModel: 'gpt-4-hard-r', thinking: false, thinkingEffort: '', webSearch: true },
    fallback: { model: 'gpt-4-fallback' },
  };
  const res = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse', tierBundles });
  assert.equal(res.tierBundle.name, 'hard');
  assert.equal(res.tierBundle.model, 'gpt-4-hard');
  assert.equal(res.tierBundle.webSearch, true);
});

test('slotRendering exposes per-slot text for the doc breakdown section', () => {
  const rule = makeRule({
    ai_assist: { reasoning_note: 'look at the sensor underside sticker' },
    search_hints: { domain_hints: ['logitech.com'], query_terms: ['g502 sensor'] },
  });
  const res = composePerKeyPromptPreview(rule, 'sensor', { category: 'mouse' });
  assert.ok(res.slotRendering, 'slotRendering is present');
  assert.ok(String(res.slotRendering.header).includes('sensor'), 'header contains field key');
  assert.ok(String(res.slotRendering.guidance).includes('sensor underside sticker'), 'guidance rendered');
  assert.ok(String(res.slotRendering.searchHints).includes('logitech.com'), 'search hints rendered');
});
