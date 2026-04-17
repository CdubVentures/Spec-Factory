import test from 'node:test';
import assert from 'node:assert/strict';
import { gateCapabilities, capabilitiesFromLookup } from '../modelCapabilityGate.js';
import { buildRegistryLookup } from '../../core/llm/routeResolver.js';

// ---------------------------------------------------------------------------
// gateCapabilities — boundary matrix
// ---------------------------------------------------------------------------

const GATE_CASES = [
  // Model supports thinking + stored thinking=true → passes through
  [
    { thinking: true, thinkingEffort: 'high', webSearch: false },
    { thinking: true, webSearch: false },
    { thinking: true, thinkingEffort: 'high', webSearch: false },
    'supports thinking → passes through',
  ],
  // Model does NOT support thinking + stored thinking=true → gated off
  [
    { thinking: true, thinkingEffort: 'low', webSearch: false },
    { thinking: false, webSearch: false },
    { thinking: false, thinkingEffort: '', webSearch: false },
    'model lacks thinking capability → stale true gated',
  ],
  // Missing capabilities object → all false
  [
    { thinking: true, thinkingEffort: 'high', webSearch: true },
    null,
    { thinking: false, thinkingEffort: '', webSearch: false },
    'null capabilities → all gated to false',
  ],
  // webSearch capability
  [
    { thinking: false, thinkingEffort: '', webSearch: true },
    { thinking: false, webSearch: true },
    { thinking: false, thinkingEffort: '', webSearch: true },
    'webSearch supported → passes through',
  ],
  [
    { thinking: false, thinkingEffort: '', webSearch: true },
    { thinking: false, webSearch: false },
    { thinking: false, thinkingEffort: '', webSearch: false },
    'webSearch unsupported → gated',
  ],
  // thinkingEffort masking when thinking unsupported
  [
    { thinking: false, thinkingEffort: 'low', webSearch: false },
    { thinking: false, webSearch: false },
    { thinking: false, thinkingEffort: '', webSearch: false },
    'stored effort without thinking capability → effort cleared',
  ],
  // thinkingEffort preserved when thinking supported (even if stored thinking is false)
  [
    { thinking: false, thinkingEffort: 'medium', webSearch: false },
    { thinking: true, webSearch: false },
    { thinking: false, thinkingEffort: 'medium', webSearch: false },
    'effort preserved when thinking supported but stored thinking false',
  ],
  // Empty stored
  [
    {},
    { thinking: true, webSearch: true },
    { thinking: false, thinkingEffort: '', webSearch: false },
    'empty stored → all defaults',
  ],
  // Both undefined
  [
    undefined,
    undefined,
    { thinking: false, thinkingEffort: '', webSearch: false },
    'both undefined → all defaults',
  ],
];

for (const [stored, caps, expected, label] of GATE_CASES) {
  test(`gateCapabilities: ${label}`, () => {
    assert.deepEqual(gateCapabilities(stored, caps), expected);
  });
}

// ---------------------------------------------------------------------------
// capabilitiesFromLookup — registry integration
// ---------------------------------------------------------------------------

const REGISTRY = [
  {
    id: 'lab-openai',
    name: 'LLM Lab OpenAI',
    baseUrl: 'http://localhost:5001/v1',
    apiKey: 'session',
    accessMode: 'lab',
    models: [
      { id: 'gpt-mini', modelId: 'gpt-5.4-mini', role: 'reasoning', thinking: true, webSearch: true, thinkingEffortOptions: ['low', 'medium', 'high'] },
      { id: 'gpt-low', modelId: 'gpt-5.4-low', role: 'reasoning', thinking: true, webSearch: false, thinkingEffortOptions: ['low'] },
    ],
  },
  {
    id: 'default-gemini',
    name: 'Gemini',
    baseUrl: 'https://gen.example/v1beta/openai',
    apiKey: '',
    models: [
      { id: 'flash-lite', modelId: 'gemini-2.5-flash-lite', role: 'primary' },
    ],
  },
];

test('capabilitiesFromLookup: lab model with thinking + webSearch (composite key)', () => {
  const lookup = buildRegistryLookup(REGISTRY);
  const caps = capabilitiesFromLookup(lookup, 'lab-openai:gpt-5.4-mini');
  assert.equal(caps?.thinking, true);
  assert.equal(caps?.webSearch, true);
  assert.deepEqual(caps?.thinkingEffortOptions, ['low', 'medium', 'high']);
});

test('capabilitiesFromLookup: lab model (bare key)', () => {
  const lookup = buildRegistryLookup(REGISTRY);
  const caps = capabilitiesFromLookup(lookup, 'gpt-5.4-low');
  assert.equal(caps?.thinking, true);
  assert.equal(caps?.webSearch, false);
});

test('capabilitiesFromLookup: gemini direct (no capability fields declared)', () => {
  const lookup = buildRegistryLookup(REGISTRY);
  const caps = capabilitiesFromLookup(lookup, 'default-gemini:gemini-2.5-flash-lite');
  assert.equal(caps?.thinking, false);
  assert.equal(caps?.webSearch, false);
});

test('capabilitiesFromLookup: unknown model → null', () => {
  const lookup = buildRegistryLookup(REGISTRY);
  assert.equal(capabilitiesFromLookup(lookup, 'does-not-exist'), null);
});

test('capabilitiesFromLookup: null lookup → null', () => {
  assert.equal(capabilitiesFromLookup(null, 'gpt-5.4-mini'), null);
});

test('capabilitiesFromLookup: empty key → null', () => {
  const lookup = buildRegistryLookup(REGISTRY);
  assert.equal(capabilitiesFromLookup(lookup, ''), null);
});

// ---------------------------------------------------------------------------
// Combined flow — the real bug this fix targets
// ---------------------------------------------------------------------------

test('gateCapabilities + lookup: stale thinking=true on gemini-direct → gated off', () => {
  const lookup = buildRegistryLookup(REGISTRY);
  const caps = capabilitiesFromLookup(lookup, 'default-gemini:gemini-2.5-flash-lite');
  const gated = gateCapabilities(
    { thinking: true, thinkingEffort: 'low', webSearch: false },
    caps,
  );
  assert.deepEqual(gated, { thinking: false, thinkingEffort: '', webSearch: false });
});

test('gateCapabilities + lookup: thinking=true on lab-openai gpt-5.4-mini → passes through', () => {
  const lookup = buildRegistryLookup(REGISTRY);
  const caps = capabilitiesFromLookup(lookup, 'lab-openai:gpt-5.4-mini');
  const gated = gateCapabilities(
    { thinking: true, thinkingEffort: 'high', webSearch: true },
    caps,
  );
  assert.deepEqual(gated, { thinking: true, thinkingEffort: 'high', webSearch: true });
});
