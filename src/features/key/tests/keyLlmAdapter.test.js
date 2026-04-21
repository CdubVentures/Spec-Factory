import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKeyFinderPrompt,
  buildKeyFinderSpec,
  KEY_FINDER_SPEC,
  KEY_FINDER_DEFAULT_TEMPLATE,
} from '../keyLlmAdapter.js';

const PRODUCT = { brand: 'Razer', model: 'DeathAdder V3 Pro', base_model: 'DeathAdder V3 Pro' };
const FIELD_RULE = {
  field_key: 'polling_rate',
  ui: { label: 'Polling Rate', tooltip: 'Maximum USB polling rate in Hz.' },
  contract: { type: 'number', shape: 'scalar', unit: 'Hz' },
  evidence: { min_evidence_refs: 2 },
  search_hints: {
    query_terms: ['polling rate Hz', '1000Hz wireless'],
    domain_hints: ['razer.com', 'rtings.com'],
    preferred_tiers: ['tier1', 'tier2'],
  },
  ai_assist: { reasoning_note: 'Report the maximum supported polling rate.' },
};

test('prompt renders product identity + field key + variant suffix', () => {
  const out = buildKeyFinderPrompt({
    product: { ...PRODUCT, variant: 'Black' },
    fieldKey: 'polling_rate',
    fieldRule: FIELD_RULE,
  });
  assert.match(out, /Razer/);
  assert.match(out, /DeathAdder V3 Pro/);
  assert.match(out, /polling_rate/);
  assert.match(out, /variant: Black/);
});

test('prompt includes field guidance derived from field_rule', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    fieldKey: 'polling_rate',
    fieldRule: FIELD_RULE,
  });
  assert.match(out, /Polling Rate/);
  assert.match(out, /polling rate Hz/);
  assert.match(out, /razer\.com/);
  assert.match(out, /Report the maximum supported polling rate/);
});

test('prompt includes return contract with type, shape, unit', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    fieldKey: 'polling_rate',
    fieldRule: FIELD_RULE,
  });
  assert.match(out, /Type: number/);
  assert.match(out, /Unit: Hz/);
});

test('prompt respects minimum evidence refs from field_rule', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    fieldKey: 'polling_rate',
    fieldRule: FIELD_RULE,
  });
  assert.match(out, /AT LEAST 2 evidence/);
});

test('prompt template respects promptOverride when templateOverride not supplied', () => {
  const overrideTemplate = 'CUSTOM: {{FIELD_KEY}} for {{BRAND}} {{MODEL}}';
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    fieldKey: 'weight',
    fieldRule: { field_key: 'weight' },
    promptOverride: overrideTemplate,
  });
  assert.match(out, /^CUSTOM: weight for Razer DeathAdder V3 Pro$/);
});

test('prompt injects previous discovery when supplied', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    fieldKey: 'polling_rate',
    fieldRule: FIELD_RULE,
    previousDiscovery: {
      urlsChecked: ['https://razer.com/polling-rate-page'],
      queriesRun: ['razer deathadder polling rate'],
    },
  });
  assert.match(out, /razer\.com\/polling-rate-page/);
  assert.match(out, /razer deathadder polling rate/);
});

test('prompt omits previous discovery block when no history', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    fieldKey: 'polling_rate',
    fieldRule: FIELD_RULE,
  });
  assert.doesNotMatch(out, /URLs already checked/);
});

test('list shape fields include array guidance', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    fieldKey: 'connectivity',
    fieldRule: {
      field_key: 'connectivity',
      contract: { type: 'string', shape: 'list' },
      enum: { policy: 'open', values: ['usb-c', 'usb-a', '2.4ghz', 'bluetooth'] },
    },
  });
  assert.match(out, /Type: string \(list/);
  assert.match(out, /Allowed values/);
  assert.match(out, /usb-c \| usb-a \| 2\.4ghz \| bluetooth/);
  assert.match(out, /Return an array/);
});

test('buildKeyFinderSpec emits per-tier reason tag', () => {
  assert.equal(buildKeyFinderSpec({ tier: 'easy' }).reason, 'key_finding_easy');
  assert.equal(buildKeyFinderSpec({ tier: 'medium' }).reason, 'key_finding_medium');
  assert.equal(buildKeyFinderSpec({ tier: 'hard' }).reason, 'key_finding_hard');
  assert.equal(buildKeyFinderSpec({ tier: 'very_hard' }).reason, 'key_finding_very_hard');
});

test('buildKeyFinderSpec normalizes unknown tier to medium', () => {
  assert.equal(buildKeyFinderSpec({ tier: 'extreme' }).reason, 'key_finding_medium');
  assert.equal(buildKeyFinderSpec({ tier: '' }).reason, 'key_finding_medium');
  assert.equal(buildKeyFinderSpec({}).reason, 'key_finding_medium');
});

test('KEY_FINDER_SPEC shape matches the finder contract', () => {
  assert.equal(KEY_FINDER_SPEC.phase, 'keyFinder');
  assert.equal(KEY_FINDER_SPEC.role, 'triage');
  assert.equal(typeof KEY_FINDER_SPEC.system, 'function');
  assert.ok(KEY_FINDER_SPEC.jsonSchema);
});

test('default template contains every placeholder the builder injects', () => {
  const placeholders = [
    '{{BRAND}}', '{{MODEL}}', '{{FIELD_KEY}}', '{{VARIANT_SUFFIX}}',
    '{{FIELD_GUIDANCE}}', '{{FIELD_CONTRACT}}',
    '{{IDENTITY_INTRO}}', '{{IDENTITY_WARNING}}',
    '{{PREVIOUS_DISCOVERY}}',
    '{{EVIDENCE_CONTRACT}}', '{{EVIDENCE_VERIFICATION}}', '{{VALUE_CONFIDENCE_GUIDANCE}}',
    '{{DISCOVERY_LOG_SHAPE}}',
  ];
  for (const p of placeholders) {
    assert.ok(KEY_FINDER_DEFAULT_TEMPLATE.includes(p), `missing placeholder ${p}`);
  }
});
