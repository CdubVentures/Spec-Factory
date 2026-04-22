import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKeyFinderPrompt,
  buildKeyFinderSpec,
  createKeyFinderCallLlm,
  KEY_FINDER_SPEC,
  KEY_FINDER_DEFAULT_TEMPLATE,
} from '../keyLlmAdapter.js';

// ── Fixtures ────────────────────────────────────────────────────────────

const PRODUCT = {
  brand: 'Razer',
  model: 'DeathAdder V3 Pro',
  base_model: 'DeathAdder V3 Pro',
};

const SENSOR_DATE_RULE = {
  field_key: 'sensor_date',
  display_name: 'Sensor Release Date',
  ui: { label: 'Sensor Release Date', tooltip: 'Date the sensor was released.' },
  contract: { type: 'date', shape: 'scalar' },
  aliases: ['sensor release date', 'PAW3395 launch'],
  difficulty: 'hard',
  required_level: 'mandatory',
  availability: 'rare',
  group: 'sensor_performance',
  enum: { policy: 'open', source: null },
  evidence: { min_evidence_refs: 1 },
  variance_policy: 'authoritative',
  search_hints: {
    content_types: ['spec_sheet', 'review'],
    domain_hints: ['sensor.fyi', 'mousespecs.org'],
    query_terms: ['PAW3395 launch date', 'PixArt release 3395'],
  },
  ai_assist: { reasoning_note: '' },
  cross_field_constraints: [{ op: 'lte', target: 'release_date' }],
};

const POLLING_RATE_RULE = {
  field_key: 'polling_rate',
  display_name: 'Polling Rate',
  ui: { label: 'Polling Rate' },
  contract: { type: 'number', shape: 'scalar', unit: 'Hz' },
  aliases: ['report rate', 'USB polling'],
  difficulty: 'medium',
  required_level: 'mandatory',
  availability: 'always',
  group: 'sensor_performance',
  enum: { policy: 'open' },
  evidence: { min_evidence_refs: 2 },
  variance_policy: 'upper_bound',
  search_hints: { domain_hints: ['razer.com'], query_terms: ['polling rate', 'report rate Hz'] },
  ai_assist: { reasoning_note: 'Report the native wireless polling rate, not wired boosted.' },
};

const CLICK_LATENCY_RULE = {
  field_key: 'click_latency_ms',
  display_name: 'Click Latency',
  ui: { label: 'Click Latency' },
  contract: { type: 'number', shape: 'scalar', unit: 'ms' },
  aliases: [],
  difficulty: 'hard',
  required_level: 'non_mandatory',
  availability: 'sometimes',
  group: 'sensor_performance',
  enum: { policy: 'open' },
  evidence: { min_evidence_refs: 1 },
  ai_assist: { reasoning_note: '' },
};

const ALL_KNOBS_ON = {
  componentInjectionEnabled: true,
  knownFieldsInjectionEnabled: true,
  searchHintsInjectionEnabled: true,
};

function renderPrimary(fieldKey, fieldRule, overrides = {}) {
  return buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey, fieldRule },
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
    ...overrides,
  });
}

// ── Template placeholder surface area ───────────────────────────────────

test('default template contains every placeholder the builder injects', () => {
  // CATEGORY + VARIANT_COUNT are optional placeholders (available in the
  // variable contract for authors who want to use them in per-category
  // overrides) but not present in the default template by design \u2014 redundant
  // with IDENTITY_INTRO which already carries product identity.
  const placeholders = [
    '{{BRAND}}', '{{MODEL}}', '{{VARIANT_SUFFIX}}',
    '{{IDENTITY_INTRO}}', '{{IDENTITY_WARNING}}',
    '{{PRIMARY_FIELD_KEY}}',
    '{{PRIMARY_FIELD_GUIDANCE}}',
    '{{PRIMARY_FIELD_CONTRACT}}',
    '{{PRIMARY_SEARCH_HINTS}}',
    '{{PRIMARY_CROSS_FIELD_CONSTRAINTS}}',
    '{{PRIMARY_COMPONENT_KEYS}}',
    '{{ADDITIONAL_FIELD_KEYS}}',
    '{{ADDITIONAL_FIELD_GUIDANCE}}',
    '{{ADDITIONAL_FIELD_CONTRACT}}',
    '{{ADDITIONAL_CROSS_FIELD_CONSTRAINTS}}',
    '{{ADDITIONAL_COMPONENT_KEYS}}',
    '{{KNOWN_PRODUCT_FIELDS}}',
    '{{EVIDENCE_CONTRACT}}',
    '{{EVIDENCE_VERIFICATION}}',
    '{{SOURCE_TIER_STRATEGY}}',
    '{{SCALAR_SOURCE_GUIDANCE_CLOSER}}',
    '{{VALUE_CONFIDENCE_GUIDANCE}}',
    '{{UNK_POLICY}}',
    '{{PREVIOUS_DISCOVERY}}',
    '{{RETURN_JSON_SHAPE}}',
  ];
  for (const p of placeholders) {
    assert.ok(KEY_FINDER_DEFAULT_TEMPLATE.includes(p), `missing placeholder ${p}`);
  }
});

// ── Identity + product header ───────────────────────────────────────────

test('prompt renders brand/model/variant identity', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    product: { ...PRODUCT, variant: 'Black' },
  });
  assert.match(out, /Razer/);
  assert.match(out, /DeathAdder V3 Pro/);
  assert.match(out, /variant: Black/);
});

// ── Primary: field key header ───────────────────────────────────────────

test('PRIMARY_FIELD_KEY uses display_name / ui.label, not raw field_key alone', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  assert.match(out, /Polling Rate/); // display_name
  assert.match(out, /polling_rate/); // raw key still present as identifier
});

test('PRIMARY_FIELD_KEY falls back to raw field_key when display_name/ui.label absent', () => {
  const out = renderPrimary('mcu', { field_key: 'mcu', contract: { type: 'string' } });
  assert.match(out, /mcu/);
});

// ── Primary: guidance (reasoning_note only) ─────────────────────────────

test('PRIMARY_FIELD_GUIDANCE renders reasoning_note when non-empty', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  assert.match(out, /Report the native wireless polling rate, not wired boosted\./);
});

test('PRIMARY_FIELD_GUIDANCE empty-string when reasoning_note empty (no tooltip fallback)', () => {
  const out = renderPrimary('sensor_date', SENSOR_DATE_RULE);
  // SENSOR_DATE_RULE has ai_assist.reasoning_note: '' and a tooltip — the tooltip must NOT leak into guidance
  assert.doesNotMatch(out, /Date the sensor was released\./);
});

// ── Primary: contract (type/shape/unit/enum/variance/aliases) ──

test('PRIMARY_FIELD_CONTRACT includes type + shape + unit', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  assert.match(out, /number/);
  assert.match(out, /Hz/);
});

test('PRIMARY_FIELD_CONTRACT includes aliases', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  assert.match(out, /report rate/);
  assert.match(out, /USB polling/);
});

test('PRIMARY_FIELD_CONTRACT includes variance_policy when present', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  assert.match(out, /upper_bound/);
});

test('PRIMARY_FIELD_CONTRACT includes enum allowed values when populated', () => {
  const rule = {
    ...POLLING_RATE_RULE,
    enum: { policy: 'closed', values: ['125', '500', '1000', '2000', '4000', '8000'] },
  };
  const out = renderPrimary('polling_rate', rule);
  assert.match(out, /125/);
  assert.match(out, /8000/);
  assert.match(out, /closed/);
});

// ── Primary: search_hints (respects knob) ───────────────────────────────

test('PRIMARY_SEARCH_HINTS renders domain_hints + query_terms when knob ON', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  assert.match(out, /razer\.com/);
  assert.match(out, /polling rate/);
});

test('PRIMARY_SEARCH_HINTS empty when knob OFF (even if hints populated)', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    injectionKnobs: { ...ALL_KNOBS_ON, searchHintsInjectionEnabled: false },
  });
  assert.doesNotMatch(out, /razer\.com/);
});

test('PRIMARY_SEARCH_HINTS empty when no hints populated on rule', () => {
  const out = renderPrimary('click_latency_ms', CLICK_LATENCY_RULE);
  assert.doesNotMatch(out, /domain_hints/);
});

// ── Primary: cross-field constraints ────────────────────────────────────

test('PRIMARY_CROSS_FIELD_CONSTRAINTS renders from fieldRule.cross_field_constraints', () => {
  const out = renderPrimary('sensor_date', SENSOR_DATE_RULE);
  assert.match(out, /release_date/);
  assert.match(out, /lte|less than or equal|≤/);
});

test('PRIMARY_CROSS_FIELD_CONSTRAINTS empty when absent/[]', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  // POLLING_RATE_RULE has no cross_field_constraints
  assert.doesNotMatch(out, /Cross-field constraint/i);
});

// ── Primary: component keys (knob-gated) ────────────────────────────────

test('PRIMARY_COMPONENT_KEYS renders when knob ON + relation exists', () => {
  const out = renderPrimary('sensor_date', SENSOR_DATE_RULE, {
    componentContext: {
      primary: { type: 'sensor', resolvedValue: 'PixArt PAW3395', relation: 'subfield_of' },
      passengers: [],
    },
  });
  assert.match(out, /PixArt PAW3395/);
  assert.match(out, /sensor/i);
});

test('PRIMARY_COMPONENT_KEYS empty when componentInjectionEnabled OFF', () => {
  const out = renderPrimary('sensor_date', SENSOR_DATE_RULE, {
    componentContext: {
      primary: { type: 'sensor', resolvedValue: 'PixArt PAW3395', relation: 'subfield_of' },
      passengers: [],
    },
    injectionKnobs: { ...ALL_KNOBS_ON, componentInjectionEnabled: false },
  });
  assert.doesNotMatch(out, /PixArt PAW3395/);
});

test('PRIMARY_COMPONENT_KEYS empty when no relation on primary', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    componentContext: { primary: null, passengers: [] },
  });
  assert.doesNotMatch(out, /Component:/);
});

// ── Additional keys: all 5 placeholders empty when no passengers ────────

test('all ADDITIONAL_* placeholders render empty when passengers is empty', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  // Headers of the per-passenger blocks must not appear
  assert.doesNotMatch(out, /Passenger key:/);
});

// ── Additional keys: field_keys list ────────────────────────────────────

test('ADDITIONAL_FIELD_KEYS lists all passenger keys with display names', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [
      { fieldKey: 'polling_rate', fieldRule: POLLING_RATE_RULE },
      { fieldKey: 'click_latency_ms', fieldRule: CLICK_LATENCY_RULE },
    ],
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });
  assert.match(out, /polling_rate/);
  assert.match(out, /Polling Rate/);
  assert.match(out, /click_latency_ms/);
  assert.match(out, /Click Latency/);
});

// ── Additional keys: guidance (per-passenger concatenated) ──────────────

test('ADDITIONAL_FIELD_GUIDANCE concatenates per-passenger reasoning_note with labels', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [
      { fieldKey: 'polling_rate', fieldRule: POLLING_RATE_RULE },
      { fieldKey: 'click_latency_ms', fieldRule: CLICK_LATENCY_RULE },
    ],
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });
  // polling_rate has a reasoning_note, click_latency_ms does not
  assert.match(out, /Report the native wireless polling rate/);
});

// ── Additional keys: contract (per-passenger) ───────────────────────────

test('ADDITIONAL_FIELD_CONTRACT renders each passenger contract with its type + unit + aliases', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [{ fieldKey: 'polling_rate', fieldRule: POLLING_RATE_RULE }],
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });
  assert.match(out, /Hz/);
  assert.match(out, /report rate/); // alias present in passenger contract
});

// ── Additional keys: cross-field constraints (per-passenger) ────────────

test('ADDITIONAL_CROSS_FIELD_CONSTRAINTS renders per-passenger constraints', () => {
  const passengerWithConstraint = {
    ...CLICK_LATENCY_RULE,
    cross_field_constraints: [
      { op: 'requires_when_value', target: 'connectivity', value: 'wireless' },
    ],
  };
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [{ fieldKey: 'click_latency_ms', fieldRule: passengerWithConstraint }],
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });
  assert.match(out, /connectivity/);
  assert.match(out, /wireless/);
});

// ── Additional keys: component context (knob-gated) ─────────────────────

test('ADDITIONAL_COMPONENT_KEYS renders per-passenger component context when knob ON', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [
      { fieldKey: 'encoder_steps', fieldRule: { field_key: 'encoder_steps', contract: { type: 'number' } } },
    ],
    componentContext: {
      primary: { type: 'sensor', resolvedValue: 'PixArt PAW3395', relation: 'subfield_of' },
      passengers: [
        { type: 'encoder', resolvedValue: 'Logitech Scrolling 2.0', relation: 'subfield_of' },
      ],
    },
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });
  assert.match(out, /Logitech Scrolling 2\.0/);
});

test('ADDITIONAL_COMPONENT_KEYS empty when componentInjectionEnabled OFF (even with data)', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [{ fieldKey: 'encoder_steps', fieldRule: { field_key: 'encoder_steps' } }],
    componentContext: {
      primary: null,
      passengers: [{ type: 'encoder', resolvedValue: 'Logitech Scrolling 2.0', relation: 'subfield_of' }],
    },
    injectionKnobs: { ...ALL_KNOBS_ON, componentInjectionEnabled: false },
    category: 'mouse',
    variantCount: 1,
  });
  assert.doesNotMatch(out, /Logitech Scrolling 2\.0/);
});

// ── Product-level: known_fields (knob-gated) ────────────────────────────

test('KNOWN_PRODUCT_FIELDS renders when knob ON + values present', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    knownFields: { release_date: '2023-09-15', weight_g: 63 },
  });
  assert.match(out, /release_date/);
  assert.match(out, /2023-09-15/);
  assert.match(out, /weight_g/);
  assert.match(out, /63/);
});

test('KNOWN_PRODUCT_FIELDS empty when knownFieldsInjectionEnabled OFF', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    knownFields: { release_date: '2023-09-15' },
    injectionKnobs: { ...ALL_KNOBS_ON, knownFieldsInjectionEnabled: false },
  });
  assert.doesNotMatch(out, /2023-09-15/);
});

test('KNOWN_PRODUCT_FIELDS empty when no values present', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, { knownFields: {} });
  assert.doesNotMatch(out, /Already-resolved/);
});

// ── Knob independence ──────────────────────────────────────────────────

test('knob independence: component ON, known OFF → component injects but known does not', () => {
  const out = renderPrimary('sensor_date', SENSOR_DATE_RULE, {
    knownFields: { release_date: '2023-09-15' },
    componentContext: {
      primary: { type: 'sensor', resolvedValue: 'PixArt PAW3395', relation: 'subfield_of' },
      passengers: [],
    },
    injectionKnobs: { componentInjectionEnabled: true, knownFieldsInjectionEnabled: false, searchHintsInjectionEnabled: true },
  });
  assert.match(out, /PixArt PAW3395/); // component rendered
  assert.doesNotMatch(out, /2023-09-15/); // known-fields suppressed
});

test('knob independence: component OFF, known ON → known injects but component does not', () => {
  const out = renderPrimary('sensor_date', SENSOR_DATE_RULE, {
    knownFields: { release_date: '2023-09-15' },
    componentContext: {
      primary: { type: 'sensor', resolvedValue: 'PixArt PAW3395', relation: 'subfield_of' },
      passengers: [],
    },
    injectionKnobs: { componentInjectionEnabled: false, knownFieldsInjectionEnabled: true, searchHintsInjectionEnabled: true },
  });
  assert.doesNotMatch(out, /PixArt PAW3395/);
  assert.match(out, /2023-09-15/);
});

// ── Template / prompt override precedence ───────────────────────────────

test('templateOverride wins over default template', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    templateOverride: 'CATEGORY OVERRIDE: {{PRIMARY_FIELD_KEY}}',
  });
  assert.match(out, /^CATEGORY OVERRIDE:/);
});

test('promptOverride wins over default template when templateOverride absent', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    promptOverride: 'LEGACY OVERRIDE: {{PRIMARY_FIELD_KEY}}',
  });
  assert.match(out, /^LEGACY OVERRIDE:/);
});

test('templateOverride beats promptOverride', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    templateOverride: 'TEMPLATE WINS: {{PRIMARY_FIELD_KEY}}',
    promptOverride: 'LEGACY LOSES: {{PRIMARY_FIELD_KEY}}',
  });
  assert.match(out, /^TEMPLATE WINS:/);
  assert.doesNotMatch(out, /LEGACY LOSES/);
});

// ── Return JSON shape: per-key contract rendering ───────────────────────

test('RETURN_JSON_SHAPE emits per-key value shape (array for list, number+unit for numeric, enum values for closed enum)', () => {
  const listRule = {
    field_key: 'connectivity',
    contract: { type: 'string', shape: 'list' },
    enum: { policy: 'closed', values: ['usb-c', 'usb-a', '2.4ghz', 'bluetooth'] },
  };
  const numericRule = {
    field_key: 'polling_rate',
    contract: { type: 'number', shape: 'scalar', unit: 'Hz' },
  };
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'connectivity', fieldRule: listRule },
    passengers: [{ fieldKey: 'polling_rate', fieldRule: numericRule }],
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });
  // return JSON object actually shows per-key "value" shapes inline
  assert.match(out, /"connectivity":\s*\{\s*"value": <array of/);
  assert.match(out, /"polling_rate":\s*\{\s*"value": <number \(Hz\)>/);
  // trailing duplicate-list shape block is removed \u2014 inline shape is SSOT
  assert.doesNotMatch(out, /Per-key value shapes/);
});

// \u2500\u2500 Universal source-tier strategy + closer (global fragments) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

test('SOURCE_TIER_STRATEGY renders universal tier-strategy block from global fragment', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  // Invariant wording from scalarSourceTierStrategy default
  assert.match(out, /PRIMARY \u2014 manufacturer authority/);
  assert.match(out, /INDEPENDENT CORROBORATION/);
  assert.match(out, /RETAILER LISTINGS/);
  assert.match(out, /COMMUNITY \/ AGGREGATORS/);
});

test('SCALAR_SOURCE_GUIDANCE_CLOSER renders closer line from global fragment', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  // Invariant wording from scalarSourceGuidanceCloser default
  assert.match(out, /You decide which sources to query/);
});

test('UNK_POLICY renders honest-unk policy from global fragment', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  // Invariant wording from unkPolicy default
  assert.match(out, /Honest "unk" policy/);
  assert.match(out, /strictly better than a low-confidence guess/);
});

// ── Previous discovery (per-key scope) ──────────────────────────────────

test('PREVIOUS_DISCOVERY renders urls + queries scoped to the primary key', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    previousDiscovery: {
      urlsChecked: ['https://razer.com/polling-rate'],
      queriesRun: ['razer deathadder polling rate'],
    },
  });
  assert.match(out, /razer\.com\/polling-rate/);
  assert.match(out, /razer deathadder polling rate/);
  assert.match(out, /polling_rate/); // scope label mentions the key
});

// ── SPEC reason + shape (preserved from pre-rewrite) ────────────────────

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

// ── createKeyFinderCallLlm: tier-aware model routing ────────────────────

function captureCallLlmArgs(tierOrBundle) {
  const captured = [];
  const deps = {
    callRoutedLlmFn: async (args) => {
      captured.push(args);
      return { value: 'stub', confidence: 0, unknown_reason: '', evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] } };
    },
    config: {},
  };
  const callLlm = createKeyFinderCallLlm(deps, tierOrBundle);
  return { callLlm, captured };
}

test('createKeyFinderCallLlm accepts tier name string (legacy) and emits per-tier reason', async () => {
  const { callLlm, captured } = captureCallLlmArgs('hard');
  await callLlm({
    product: PRODUCT,
    primary: { fieldKey: 'polling_rate', fieldRule: POLLING_RATE_RULE },
    passengers: [],
    variantCount: 1,
  });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].reason, 'key_finding_hard');
  assert.equal(captured[0].modelOverride || '', ''); // string form passes no override
});

test('createKeyFinderCallLlm accepts tier bundle object and plumbs modelOverride per call', async () => {
  const { callLlm, captured } = captureCallLlmArgs({ name: 'very_hard', model: 'gpt-5.4' });
  await callLlm({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_model', fieldRule: SENSOR_DATE_RULE },
    passengers: [],
    variantCount: 1,
  });
  assert.equal(captured[0].reason, 'key_finding_very_hard');
  assert.equal(captured[0].modelOverride, 'gpt-5.4');
});

test('createKeyFinderCallLlm with tier bundle but empty model does NOT emit modelOverride', async () => {
  // Guards against "" overriding phase auto-resolution and picking a stale default.
  const { callLlm, captured } = captureCallLlmArgs({ name: 'medium', model: '' });
  await callLlm({
    product: PRODUCT,
    primary: { fieldKey: 'polling_rate', fieldRule: POLLING_RATE_RULE },
    passengers: [],
    variantCount: 1,
  });
  assert.equal(captured[0].reason, 'key_finding_medium');
  assert.equal(captured[0].modelOverride ?? '', '');
});

test('createKeyFinderCallLlm with no args defaults to medium tier', async () => {
  const { callLlm, captured } = captureCallLlmArgs();
  await callLlm({
    product: PRODUCT,
    primary: { fieldKey: 'polling_rate', fieldRule: POLLING_RATE_RULE },
    passengers: [],
    variantCount: 1,
  });
  assert.equal(captured[0].reason, 'key_finding_medium');
});
