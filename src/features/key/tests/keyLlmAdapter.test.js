import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKeyFinderPrompt,
  buildKeyFinderSpec,
  createKeyFinderCallLlm,
  KEY_FINDER_SPEC,
  KEY_FINDER_DEFAULT_TEMPLATE,
} from '../keyLlmAdapter.js';
import { KEY_FINDER_VARIABLES } from '../keyFinderPromptContract.js';

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

const SENSOR_COMPONENT_RULE = {
  field_key: 'sensor',
  display_name: 'Sensor',
  contract: { type: 'string', shape: 'scalar' },
  difficulty: 'very_hard',
  required_level: 'mandatory',
  availability: 'rare',
  enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
  evidence: { min_evidence_refs: 1 },
  ai_assist: { reasoning_note: '' },
};

const SENSOR_BRAND_RULE = {
  field_key: 'sensor_brand',
  display_name: 'Sensor Brand',
  contract: { type: 'string', shape: 'scalar' },
  difficulty: 'medium',
  required_level: 'mandatory',
  availability: 'rare',
  enum: { policy: 'open_prefer_known' },
  component_identity_projection: { component_type: 'sensor', facet: 'brand' },
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
  // FAMILY_SIZE is an optional placeholder available to prompt authors.
  // CATEGORY_CONTEXT is the default prompt's global category identity lock.
  const placeholders = [
    '{{BRAND}}', '{{MODEL}}', '{{VARIANT_SUFFIX}}', '{{CATEGORY_CONTEXT}}',
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
    '{{PRODUCT_COMPONENTS}}',
    '{{PRODUCT_SCOPED_FACTS}}',
    '{{VARIANT_INVENTORY}}',
    '{{FIELD_IDENTITY_USAGE}}',
    '{{PIF_PRIORITY_IMAGES}}',
    '{{VALUE_NORMALIZATION}}',
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
  assert.equal(KEY_FINDER_DEFAULT_TEMPLATE.includes('{{KNOWN_PRODUCT_FIELDS}}'), false);
});

test('VALUE_NORMALIZATION sits after visual context and before evidence rules', () => {
  const pifIdx = KEY_FINDER_DEFAULT_TEMPLATE.indexOf('{{PIF_PRIORITY_IMAGES}}');
  const normalizationIdx = KEY_FINDER_DEFAULT_TEMPLATE.indexOf('{{VALUE_NORMALIZATION}}');
  const evidenceIdx = KEY_FINDER_DEFAULT_TEMPLATE.indexOf('{{EVIDENCE_CONTRACT}}');
  assert.ok(pifIdx >= 0, 'PIF_PRIORITY_IMAGES placeholder present');
  assert.ok(normalizationIdx > pifIdx, 'VALUE_NORMALIZATION follows PIF_PRIORITY_IMAGES');
  assert.ok(evidenceIdx > normalizationIdx, 'EVIDENCE_CONTRACT follows VALUE_NORMALIZATION');
});

test('prompt variable contract exposes split product facts, variant inventory, and PIF image slots', () => {
  const names = new Set(KEY_FINDER_VARIABLES.map((row) => row.name));
  assert.equal(names.has('KNOWN_PRODUCT_FIELDS'), false);
  assert.equal(names.has('PRODUCT_SCOPED_FACTS'), true);
  assert.equal(names.has('VARIANT_INVENTORY'), true);
  assert.equal(names.has('FIELD_IDENTITY_USAGE'), true);
  assert.equal(names.has('PIF_PRIORITY_IMAGES'), true);
  assert.equal(names.has('VALUE_NORMALIZATION'), true);
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

test('PRIMARY_FIELD_CONTRACT resolves data-list enum values from known_values', () => {
  const rule = {
    ...POLLING_RATE_RULE,
    field_key: 'connection',
    enum: { policy: 'closed', source: 'data_lists.connection' },
  };
  const out = renderPrimary('connection', rule, {
    knownValues: {
      enums: {
        connection: { policy: 'closed', values: ['wired', 'wireless', 'hybrid'] },
      },
    },
  });

  assert.match(out, /Allowed values \(closed\): wired \| wireless \| hybrid/);
  assert.doesNotMatch(out, /no fixed list/);
});

test('PRIMARY_FIELD_CONTRACT renders open_prefer_known as preferred values', () => {
  const rule = {
    ...POLLING_RATE_RULE,
    field_key: 'lighting',
    enum: { policy: 'open_prefer_known', source: 'data_lists.lighting' },
  };
  const out = renderPrimary('lighting', rule, {
    knownValues: {
      enums: {
        lighting: { policy: 'open_prefer_known', values: ['rgb', 'zone rgb'] },
      },
    },
  });

  assert.match(out, /Preferred canonical values \(open_prefer_known\): rgb \| zone rgb/);
  assert.match(out, /Emit an unlisted value only when direct evidence proves a real value that none of the listed values can represent/);
  assert.match(out, /do not create new values from aliases, marketing phrases, formatting variants, or sibling-field wording/);
  assert.match(out, /unlisted only when direct evidence proves no listed value fits/);
  assert.doesNotMatch(out, /New values are allowed only when directly evidenced/);
  assert.doesNotMatch(out, /Allowed values \(open_prefer_known\)/);
});

test('PRIMARY_FIELD_CONTRACT does not render yes_no enum policy for boolean fields', () => {
  const rule = {
    ...POLLING_RATE_RULE,
    field_key: 'rgb',
    contract: { type: 'boolean', shape: 'scalar' },
    enum: { policy: 'closed', source: 'yes_no' },
  };
  const out = renderPrimary('rgb', rule, {
    knownValues: {
      enums: {
        yes_no: { policy: 'closed', values: ['yes', 'no'] },
      },
    },
  });

  assert.match(out, /Type: boolean/);
  assert.doesNotMatch(out, /Allowed values/);
  assert.doesNotMatch(out, /Enum policy/);
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

test('PRIMARY_CROSS_FIELD_CONSTRAINTS renders from fieldRule.constraints DSL', () => {
  const rule = {
    ...SENSOR_DATE_RULE,
    cross_field_constraints: [],
    constraints: ['sensor_date <= release_date'],
  };
  const out = renderPrimary('sensor_date', rule);

  assert.match(out, /release_date/);
  assert.match(out, /≤/);
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
      primary: { type: 'sensor', relation: 'subfield_of', parentFieldKey: 'sensor' },
      passengers: [],
    },
  });
  // Relation pointer only \u2014 resolved identity (and siblings) live in {{PRODUCT_COMPONENTS}}.
  assert.match(out, /belongs to the sensor component/i);
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

test('ADDITIONAL_FIELD_CONTRACT renders passenger evidence target without authorizing passenger searches', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [{
      fieldKey: 'polling_rate',
      fieldRule: {
        ...POLLING_RATE_RULE,
        evidence: { min_evidence_refs: 2 },
      },
    }],
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });

  assert.match(out, /Evidence target: 2 source refs/i);
  assert.match(out, /Do not run passenger-specific searches/i);
  assert.match(out, /primary key evidence target/i);
  assert.match(out, /do not suppress a found passenger value/i);
});

test('ADDITIONAL_FIELD_CONTRACT resolves passenger data-list enum values from known_values', () => {
  const passengerRule = {
    ...POLLING_RATE_RULE,
    field_key: 'sensor_type',
    contract: { type: 'string', shape: 'scalar' },
    enum: { policy: 'closed', source: 'data_lists.sensor_type' },
  };
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [{ fieldKey: 'sensor_type', fieldRule: passengerRule }],
    knownValues: {
      enums: {
        sensor_type: { policy: 'closed', values: ['optical', 'laser'] },
      },
    },
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });

  assert.match(out, /Passenger key: sensor_type/);
  assert.match(out, /Allowed values \(closed\): optical \| laser/);
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

test('ADDITIONAL_CROSS_FIELD_CONSTRAINTS renders passenger constraints DSL', () => {
  const passengerWithConstraint = {
    ...CLICK_LATENCY_RULE,
    constraints: ['click_latency_ms <= polling_rate'],
  };
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [{ fieldKey: 'click_latency_ms', fieldRule: passengerWithConstraint }],
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });

  assert.match(out, /polling_rate/);
  assert.match(out, /≤/);
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
      primary: { type: 'sensor', relation: 'subfield_of', parentFieldKey: 'sensor' },
      passengers: [
        { type: 'encoder', relation: 'subfield_of', parentFieldKey: 'encoder' },
      ],
    },
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });
  // Passenger relation pointer renders \u2014 resolved identity lives in {{PRODUCT_COMPONENTS}}.
  assert.match(out, /belongs to the encoder component/i);
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

// ── Product-level: PRODUCT_COMPONENTS (ALWAYS ON — ungated by either knob) ──

test('PRODUCT_COMPONENTS renders grouped inventory with identity + product-resolved subfields + variance suffix', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    productComponents: [
      {
        parentFieldKey: 'sensor', componentType: 'sensor',
        resolvedValue: 'Logitech Hero 25K',
        subfields: [
          { field_key: 'sensor_type', value: 'optical', variancePolicy: 'authoritative' },
          { field_key: 'sensor_date', value: '2021-04-15', variancePolicy: 'authoritative' },
        ],
      },
      {
        parentFieldKey: 'switch', componentType: 'switch',
        resolvedValue: 'Omron D2F-01F',
        subfields: [{ field_key: 'switch_type', value: 'mechanical', variancePolicy: 'authoritative' }],
      },
    ],
  });
  assert.match(out, /Components on this product/i);
  assert.match(out, /Logitech Hero 25K/);
  assert.match(out, /sensor_type:\s*optical\s+\(authoritative\)/);
  assert.match(out, /sensor_date:\s*2021-04-15\s+\(authoritative\)/);
  assert.match(out, /Omron D2F-01F/);
});

test('PRODUCT_COMPONENTS renders upper_bound suffix for numeric subfields', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    productComponents: [
      {
        parentFieldKey: 'sensor', componentType: 'sensor',
        resolvedValue: 'Hero 25K',
        subfields: [
          { field_key: 'dpi', value: 25000, variancePolicy: 'upper_bound' },
          { field_key: 'ips', value: 650, variancePolicy: 'upper_bound' },
        ],
      },
    ],
  });
  assert.match(out, /dpi:\s*25000\s+\(upper_bound \u2014 products can be lower\)/);
  assert.match(out, /ips:\s*650\s+\(upper_bound \u2014 products can be lower\)/);
});

test('PRODUCT_COMPONENTS missing variancePolicy defaults to authoritative', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    productComponents: [
      {
        parentFieldKey: 'sensor', componentType: 'sensor',
        resolvedValue: 'Hero 25K',
        subfields: [{ field_key: 'sensor_type', value: 'optical' }],
      },
    ],
  });
  assert.match(out, /sensor_type:\s*optical\s+\(authoritative\)/);
});

test('PRODUCT_COMPONENTS still renders when BOTH injection knobs OFF (ungated)', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    productComponents: [
      { parentFieldKey: 'sensor', componentType: 'sensor', resolvedValue: 'Hero 25K', subfields: [] },
    ],
    injectionKnobs: {
      componentInjectionEnabled: false,
      knownFieldsInjectionEnabled: false,
      searchHintsInjectionEnabled: false,
    },
  });
  assert.match(out, /Hero 25K/, 'inventory is unconditional, not gated by either knob');
});

test('PRODUCT_COMPONENTS renders unidentified components without subfield lines', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    productComponents: [
      { parentFieldKey: 'encoder', componentType: 'encoder', resolvedValue: '', subfields: [] },
    ],
  });
  assert.match(out, /encoder/i);
  assert.match(out, /unidentified/i);
});

test('PRODUCT_COMPONENTS renders identified component with no product-resolved subfields', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    productComponents: [
      { parentFieldKey: 'material', componentType: 'material', resolvedValue: 'ABS', subfields: [] },
    ],
  });
  assert.match(out, /material/i);
  assert.match(out, /ABS/);
});

test('PRODUCT_COMPONENTS empty when productComponents array empty', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, { productComponents: [] });
  assert.doesNotMatch(out, /Components on this product/i);
});

// ── Per-key component slots shrink to relation pointer only ─────────────

test('PRIMARY_COMPONENT_KEYS (new shape) renders relation pointer without resolvedValue data', () => {
  const out = renderPrimary('sensor_date', SENSOR_DATE_RULE, {
    componentContext: {
      primary: { type: 'sensor', relation: 'subfield_of', parentFieldKey: 'sensor' },
      passengers: [],
    },
  });
  assert.match(out, /belongs to the sensor component/i);
  // The data line "Component: sensor = ..." moved to {{PRODUCT_COMPONENTS}}
  // — per-key slot is relation-pointer only now.
  assert.doesNotMatch(out, /Component:\s*\w+\s*=/i, 'resolvedValue data belongs in the inventory, not in the per-key slot');
  assert.doesNotMatch(out, /not yet identified/i, 'unidentified copy also lives in the inventory');
});

test('PRIMARY_COMPONENT_KEYS (new shape) parent relation pointer', () => {
  const out = renderPrimary('sensor', {
    field_key: 'sensor',
    contract: { type: 'string', shape: 'scalar' },
    component: { type: 'sensor', match: { property_keys: ['sensor_type'] } },
  }, {
    componentContext: {
      primary: { type: 'sensor', relation: 'parent', parentFieldKey: 'sensor' },
      passengers: [],
    },
  });
  assert.match(out, /IS the sensor component identity/i);
  assert.doesNotMatch(out, /Component:\s*\w+\s*=/i);
});

// ── Orchestrator-level invariants (render happens but with ungated inventory) ──

test('knob independence (new shape): both OFF → inventory still renders, per-key pointer empty, known empty', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    productComponents: [
      { parentFieldKey: 'sensor', componentType: 'sensor', resolvedValue: 'Hero 25K', subfields: [] },
    ],
    productScopedFacts: { weight_g: 63 }, // orchestrator would've suppressed this when knob off; but the adapter still respects the knob directly
    componentContext: {
      primary: { type: 'sensor', relation: 'subfield_of', parentFieldKey: 'sensor' },
      passengers: [],
    },
    injectionKnobs: {
      componentInjectionEnabled: false,
      knownFieldsInjectionEnabled: false,
      searchHintsInjectionEnabled: true,
    },
  });
  assert.match(out, /Hero 25K/, 'inventory unconditional');
  assert.doesNotMatch(out, /belongs to the sensor component/i, 'per-key relation pointer gated by componentInjectionEnabled');
  assert.doesNotMatch(out, /weight_g/, 'product-scoped facts gated by knownFieldsInjectionEnabled');
});

// ── Product-level: known_fields (knob-gated) ────────────────────────────

test('PRODUCT_SCOPED_FACTS renders when knob ON + values present', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    productScopedFacts: { weight_g: 63, sensor_model: 'Focus Pro 30K' },
  });
  assert.match(out, /Resolved product-scoped facts/i);
  assert.match(out, /weight_g/);
  assert.match(out, /63/);
  assert.match(out, /sensor_model/);
  assert.match(out, /Focus Pro 30K/);
  assert.doesNotMatch(out, /Already-resolved fields on this product/i);
});

test('PRODUCT_SCOPED_FACTS empty when knownFieldsInjectionEnabled OFF', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    productScopedFacts: { weight_g: 63 },
    injectionKnobs: { ...ALL_KNOBS_ON, knownFieldsInjectionEnabled: false },
  });
  assert.doesNotMatch(out, /weight_g/);
});

test('PRODUCT_SCOPED_FACTS empty when no values present', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, { productScopedFacts: {} });
  assert.doesNotMatch(out, /Resolved product-scoped facts/);
});

test('VARIANT_INVENTORY renders locked identity table with product header and guardrails', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    product: {
      brand: 'Corsair',
      model: 'M75 Wireless',
      base_model: 'M75',
      variant: 'Wireless',
    },
    siblingsExcluded: ['M75 Air Wireless', 'M75'],
    variantInventory: [
      {
        variant_id: 'v_black',
        variant_key: 'color:black',
        label: 'black',
        type: 'color',
        color_atoms: ['black'],
        sku: '',
        release_date: '',
        image_status: '',
      },
      {
        variant_id: 'v_bo7',
        variant_key: 'edition:call-of-duty-black-ops-7-edition',
        label: 'Call of Duty: Black Ops 7 Edition',
        type: 'edition',
        color_atoms: ['black', 'white', 'dark-blue', 'orange'],
        sku: 'CH-931DB1M-NA',
        release_date: '2025-11-11',
        image_status: 'hero 1/3; priority 2/4',
      },
    ],
    fieldIdentityUsage: 'When researching `polling_rate`:\n- Use VARIANT_INVENTORY as a source-identity filter.',
  });

  assert.match(out, /VARIANT_INVENTORY/);
  assert.match(out, /Do not extract, revise, or submit colors, editions, sku, or release_date through Key Finder/);
  assert.match(out, /Blank sku\/release_date cells mean not yet discovered/);
  assert.match(out, /Product: Corsair M75 Wireless/);
  assert.match(out, /Base model: M75/);
  assert.match(out, /Current product variant: Wireless/);
  assert.match(out, /Sibling models to exclude: M75 Air Wireless, M75/);
  assert.match(out, /v_bo7/);
  assert.match(out, /CH-931DB1M-NA/);
  assert.match(out, /2025-11-11/);
  assert.match(out, /FIELD_IDENTITY_USAGE/);
  assert.match(out, /When researching `polling_rate`:/);
});

test('VARIANT_INVENTORY and FIELD_IDENTITY_USAGE omit when no inventory rows exist', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE, {
    variantInventory: [],
    fieldIdentityUsage: 'When researching `polling_rate`:\n- This should not render without inventory.',
  });

  assert.doesNotMatch(out, /VARIANT_INVENTORY/);
  assert.doesNotMatch(out, /FIELD_IDENTITY_USAGE/);
  assert.doesNotMatch(out, /This should not render without inventory/);
});

test('PIF_PRIORITY_IMAGES renders attached-image guardrails when enabled images exist', () => {
  const out = renderPrimary('design', {
    field_key: 'design',
    contract: { type: 'string', shape: 'list' },
    ai_assist: {
      reasoning_note: 'Use visual context only when it directly supports the field.',
      pif_priority_images: { enabled: true },
    },
  }, {
    pifPriorityImageContext: {
      enabled: true,
      status: 'available',
      variant: {
        variant_id: 'v_black',
        variant_key: 'color:black',
        label: 'Black',
        basis: 'CEF default_color',
      },
      priorityViews: ['top', 'left', 'bottom'],
      images: [
        {
          view: 'top',
          filename: 'top-black.png',
          source: 'eval',
          original_url: 'https://example.com/top.png',
          eval_reasoning: 'Clear default shell top view.',
        },
      ],
    },
  });

  assert.match(out, /PIF_PRIORITY_IMAGES/);
  assert.match(out, /default\/base variant images are attached/i);
  assert.match(out, /not exhaustive product proof/i);
  assert.match(out, /absence of a visible trait/i);
  assert.match(out, /Priority views from PIF viewConfig: top, left, bottom/);
  assert.match(out, /Variant: Black \(color:black\)/);
  assert.match(out, /top-black\.png/);
  assert.match(out, /Clear default shell top view/);
});

test('PIF_PRIORITY_IMAGES renders unavailable guidance when enabled but no images exist', () => {
  const out = renderPrimary('design', {
    field_key: 'design',
    contract: { type: 'string', shape: 'list' },
    ai_assist: { pif_priority_images: { enabled: true } },
  }, {
    pifPriorityImageContext: {
      enabled: true,
      status: 'no_images',
      priorityViews: ['top', 'left'],
      message: 'No PIF-evaluated priority images are available for the default/base variant.',
      images: [],
    },
  });

  assert.match(out, /PIF_PRIORITY_IMAGES/);
  assert.match(out, /enabled for this key, but no PIF-evaluated priority images are available/i);
  assert.match(out, /Priority views requested from PIF viewConfig: top, left/);
  assert.match(out, /Do not infer visual traits from missing PIF images/i);
  assert.doesNotMatch(out, /Attached images:/);
});

// ── Knob independence ──────────────────────────────────────────────────

test('knob independence: component ON, known OFF → per-key relation pointer renders, known does not', () => {
  const out = renderPrimary('sensor_date', SENSOR_DATE_RULE, {
    productScopedFacts: { weight_g: 63 },
    componentContext: {
      primary: { type: 'sensor', relation: 'subfield_of', parentFieldKey: 'sensor' },
      passengers: [],
    },
    injectionKnobs: { componentInjectionEnabled: true, knownFieldsInjectionEnabled: false, searchHintsInjectionEnabled: true },
  });
  assert.match(out, /belongs to the sensor component/i); // relation pointer rendered
  assert.doesNotMatch(out, /weight_g/); // product-scoped facts suppressed
});

test('knob independence: component OFF, known ON → known injects but per-key relation pointer does not', () => {
  const out = renderPrimary('sensor_date', SENSOR_DATE_RULE, {
    productScopedFacts: { weight_g: 63 },
    componentContext: {
      primary: { type: 'sensor', relation: 'subfield_of', parentFieldKey: 'sensor' },
      passengers: [],
    },
    injectionKnobs: { componentInjectionEnabled: false, knownFieldsInjectionEnabled: true, searchHintsInjectionEnabled: true },
  });
  assert.doesNotMatch(out, /belongs to the sensor component/i);
  assert.match(out, /weight_g/);
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

test('RETURN_JSON_SHAPE keeps discovery_log at the run envelope only', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'polling_rate', fieldRule: POLLING_RATE_RULE },
    passengers: [{ fieldKey: 'dpi', fieldRule: POLLING_RATE_RULE }],
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });

  const discoveryLogMentions = out.match(/"discovery_log"/g) || [];
  assert.equal(discoveryLogMentions.length, 1, 'only the envelope-level discovery_log should be requested');
  const passengerBlock = out.match(/"dpi": \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.doesNotMatch(passengerBlock, /"discovery_log"/);
  assert.match(out, /Passenger evidence must come from the primary search session/i);
});

test('RETURN_JSON_SHAPE requests aliases as metadata for component identity keys', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor', fieldRule: SENSOR_COMPONENT_RULE },
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });

  assert.match(out, /"component_aliases": \["\.\.\."\] \(optional metadata; aliases for the component name only/);
  assert.match(out, /"brand_aliases": \["\.\.\."\] \(optional metadata; aliases for the component brand\/maker only/);
});

test('RETURN_JSON_SHAPE requests aliases as metadata for component brand keys', () => {
  const out = buildKeyFinderPrompt({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_brand', fieldRule: SENSOR_BRAND_RULE },
    category: 'mouse',
    variantCount: 1,
    injectionKnobs: ALL_KNOBS_ON,
  });

  assert.match(out, /"component_aliases": \["\.\.\."\] \(optional metadata; aliases for the component name only/);
  assert.match(out, /"brand_aliases": \["\.\.\."\] \(optional metadata; aliases for the component brand\/maker only/);
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

test('VALUE_NORMALIZATION renders canonical table guidance without unk/n/a policy', () => {
  const out = renderPrimary('polling_rate', POLLING_RATE_RULE);
  assert.match(out, /VALUE NORMALIZATION:/);
  assert.match(out, /canonical table value/i);
  assert.match(out, /complete set of values/i);
  const section = out.slice(
    out.indexOf('VALUE NORMALIZATION:'),
    out.indexOf('Evidence requirements'),
  );
  assert.doesNotMatch(section, /\bunk\b/i);
  assert.doesNotMatch(section, /\bn\/a\b/i);
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

// ── createKeyFinderCallLlm: tier-aware capability override (Stage 2) ────
//
// The tier bundle carries 6 fields (model, useReasoning, reasoningModel,
// thinking, thinkingEffort, webSearch). Until Stage 2 only `model` was read;
// the others were dead data. These tests lock the full thread-through.

test('tier bundle threads capabilityOverride (thinking / thinkingEffort / webSearch)', async () => {
  const { callLlm, captured } = captureCallLlmArgs({
    name: 'hard',
    model: 'gpt-5.4',
    useReasoning: false,
    reasoningModel: '',
    thinking: true,
    thinkingEffort: 'xhigh',
    webSearch: true,
  });
  await callLlm({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [],
    variantCount: 1,
  });
  const cap = captured[0].capabilityOverride;
  assert.ok(cap, 'capabilityOverride must be emitted when tier bundle is provided');
  assert.equal(cap.thinking, true);
  assert.equal(cap.thinkingEffort, 'xhigh');
  assert.equal(cap.webSearch, true);
  assert.equal(cap.useReasoning, false);
});

test('tier bundle useReasoning=true routes modelOverride to reasoningModel (not model)', async () => {
  const { callLlm, captured } = captureCallLlmArgs({
    name: 'very_hard',
    model: 'gpt-5.4',
    useReasoning: true,
    reasoningModel: 'gpt-5.4-mini',
    thinking: true,
    thinkingEffort: 'xhigh',
    webSearch: true,
  });
  await callLlm({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [],
    variantCount: 1,
  });
  assert.equal(captured[0].modelOverride, 'gpt-5.4-mini',
    'when useReasoning=true, adapter must pick reasoningModel so the caller lands on the correct model');
  assert.equal(captured[0].capabilityOverride.useReasoning, true);
});

test('tier bundle useReasoning=true with empty reasoningModel falls back to tier.model (never emits empty override)', async () => {
  const { callLlm, captured } = captureCallLlmArgs({
    name: 'hard',
    model: 'gpt-5.4',
    useReasoning: true,
    reasoningModel: '',
    thinking: false,
    thinkingEffort: '',
    webSearch: false,
  });
  await callLlm({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [],
    variantCount: 1,
  });
  assert.equal(captured[0].modelOverride, 'gpt-5.4',
    'empty reasoningModel must not override — fall back to tier.model so we never send ""');
  assert.equal(captured[0].capabilityOverride.useReasoning, true,
    'useReasoning flag still flows so the caller can enable reasoning mode on the base model');
});

test('tier bundle with empty model AND empty reasoningModel emits no modelOverride but keeps capabilityOverride', async () => {
  // WHY: Empty-model tier inherits whole fallback bundle upstream (resolvePhaseModelByTier),
  // so we should never see this in practice. But if it sneaks through, do NOT override with ""
  // (that would wipe out the resolver's last-resort path). Capability flags still flow.
  const { callLlm, captured } = captureCallLlmArgs({
    name: 'medium',
    model: '',
    useReasoning: false,
    reasoningModel: '',
    thinking: true,
    thinkingEffort: 'high',
    webSearch: false,
  });
  await callLlm({
    product: PRODUCT,
    primary: { fieldKey: 'polling_rate', fieldRule: POLLING_RATE_RULE },
    passengers: [],
    variantCount: 1,
  });
  assert.equal(captured[0].modelOverride ?? '', '');
  assert.equal(captured[0].capabilityOverride?.thinking, true);
  assert.equal(captured[0].capabilityOverride?.thinkingEffort, 'high');
});

test('createKeyFinderCallLlm attaches PIF priority image files to the user message when present', async () => {
  const { callLlm, captured } = captureCallLlmArgs('medium');
  await callLlm({
    product: PRODUCT,
    primary: { fieldKey: 'design', fieldRule: { field_key: 'design', contract: { type: 'string' } } },
    passengers: [],
    pifPriorityImageContext: {
      images: [
        {
          view: 'top',
          filename: 'top-black.png',
          llm_file_uri: 'C:/images/top-black.png',
          mime_type: 'image/png',
          caption: 'top view: top-black.png',
        },
      ],
    },
  });

  assert.equal(typeof captured[0].user, 'object');
  assert.match(captured[0].user.text, /"primary_field_key":"design"/);
  assert.deepEqual(captured[0].user.images, [
    {
      id: 'pif-priority:top:top-black.png',
      file_uri: 'C:/images/top-black.png',
      mime_type: 'image/png',
      caption: 'top view: top-black.png',
    },
  ]);
});

test('legacy string-form tier emits NO capabilityOverride (phase-level reads stay authoritative)', async () => {
  const { callLlm, captured } = captureCallLlmArgs('hard');
  await callLlm({
    product: PRODUCT,
    primary: { fieldKey: 'sensor_date', fieldRule: SENSOR_DATE_RULE },
    passengers: [],
    variantCount: 1,
  });
  assert.equal(captured[0].capabilityOverride ?? null, null,
    'string form is legacy/billing-only — it must not synthesize a capability override');
});
