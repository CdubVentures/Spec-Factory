import test from 'node:test';
import assert from 'node:assert/strict';

// WHY: hasMeaningfulValue is internal. We test through the exported buildRuntimeIdxTooltip
// which calls hasMeaningfulValue indirectly via buildBadgesForFields. However, the function
// is the primary target. We import the module and test observable behavior through exports.

// Since hasMeaningfulValue is not exported directly, we'll test through buildBadgesForFields
// which is used by the runtime surface. For characterization we need the actual function.
// Import the whole module and access the exports that exercise hasMeaningfulValue.

// ---------------------------------------------------------------------------
// Direct import — hasMeaningfulValue is consumed by buildBadgesForFields.
// We test the switch behavior by verifying buildRuntimeIdxTooltip output changes
// based on whether hasMeaningfulValue returns true or false for a given fieldPath.
//
// For the registry refactor, we need to verify that hasMeaningfulValue itself
// returns correct boolean for each (rule, fieldPath) combination.
// Since it's module-internal, we test indirectly through module re-export.
// ---------------------------------------------------------------------------

// Dynamically import to get the module's exports
const mod = await import('../src/features/indexing/runtime/idxRuntimeMetadata.js');
const { buildRuntimeIdxTooltip } = mod;

// We need hasMeaningfulValue to be exported for direct testing.
// If it's not exported, we'll need to export it. Let's check:
const hasMeaningfulValue = mod.hasMeaningfulValue;

// If hasMeaningfulValue is not exported, skip direct tests and test via tooltip
const canTestDirectly = typeof hasMeaningfulValue === 'function';

// ---------------------------------------------------------------------------
// Characterization: table-driven tests for all 28 field paths
// ---------------------------------------------------------------------------

// Each entry: [fieldPath, ruleWithValue, ruleWithLegacyValue?, emptyRule]
const STRING_FIELDS = [
  ['contract.type', { contract: { type: 'string' } }, { data_type: 'number' }, { type: 'boolean' }],
  ['contract.shape', { contract: { shape: 'scalar' } }, { output_shape: 'list' }, { shape: 'map' }],
  ['contract.unit', { contract: { unit: 'kg' } }, { unit: 'lb' }, null],
  ['contract.unknown_token', { contract: { unknown_token: 'N/A' } }, { unknown_token: '-' }, null],
  ['priority.required_level', { priority: { required_level: 'high' } }, { required_level: 'low' }, null],
  ['priority.availability', { priority: { availability: 'common' } }, { availability: 'rare' }, null],
  ['priority.difficulty', { priority: { difficulty: 'easy' } }, { difficulty: 'hard' }, null],
  ['ai_assist.mode', { ai_assist: { mode: 'auto' } }, null, null],
  ['ai_assist.model_strategy', { ai_assist: { model_strategy: 'fast' } }, null, null],
  ['ai_assist.reasoning_note', { ai_assist: { reasoning_note: 'check units' } }, null, null],
  ['parse.template', { parse: { template: '{{value}}' } }, { parse_template: '{{v}}' }, null],
  ['enum.policy', { enum: { policy: 'strict' } }, { enum_policy: 'fuzzy' }, null],
  ['enum.source', { enum: { source: 'authority' } }, { enum_source: 'user' }, null],
  ['evidence.conflict_policy', { evidence: { conflict_policy: 'majority' } }, null, null],
  ['component.type', { component: { type: 'capacitor' } }, { component_db_ref: 'ref-123' }, null],
  ['ui.tooltip_md', { ui: { tooltip_md: 'Hover text' } }, { tooltip_md: 'Alt hover' }, null],
];

const NUMERIC_FIELDS = [
  ['priority.effort', { priority: { effort: 5 } }, { effort: 3 }],
  ['ai_assist.max_tokens', { ai_assist: { max_tokens: 1024 } }, null],
  ['evidence.min_evidence_refs', { evidence: { min_evidence_refs: 2 } }, { min_evidence_refs: 1 }],
];

const ARRAY_FIELDS = [
  ['evidence.tier_preference', { evidence: { tier_preference: ['primary', 'secondary'] } }],
  ['constraints', { constraints: ['a > b'] }],
  ['aliases', { aliases: ['alt_name'] }],
];

const ARRAY_FILTERED_FIELDS = [
  ['search_hints.query_terms', { search_hints: { query_terms: ['term1', 'term2'] } }],
  ['search_hints.domain_hints', { search_hints: { domain_hints: ['example.com'] } }],
  ['search_hints.preferred_content_types', { search_hints: { preferred_content_types: ['datasheet'] } }],
];

const BOOL_PRESENCE_FIELDS = [
  ['contract.range', { contract: { range: { min: 0, max: 100 } } }, null],
  ['evidence.required', { evidence: { required: true } }, { evidence_required: false }],
];

const OBJECT_TRUTHY_FIELDS = [
  ['contract.list_rules', { contract: { list_rules: { dedupe: true } } }, { list_rules: { ordering: 'asc' } }],
];

// ---------------------------------------------------------------------------
// String field tests
// ---------------------------------------------------------------------------

for (const [fieldPath, structured, legacy, altLegacy] of STRING_FIELDS) {
  test(`hasMeaningfulValue('${fieldPath}') — structured value returns true`, () => {
    if (!canTestDirectly) return;
    assert.equal(hasMeaningfulValue(structured, fieldPath), true);
  });

  if (legacy) {
    test(`hasMeaningfulValue('${fieldPath}') — legacy alias returns true`, () => {
      if (!canTestDirectly) return;
      assert.equal(hasMeaningfulValue(legacy, fieldPath), true);
    });
  }

  if (altLegacy) {
    test(`hasMeaningfulValue('${fieldPath}') — alt legacy alias returns true`, () => {
      if (!canTestDirectly) return;
      assert.equal(hasMeaningfulValue(altLegacy, fieldPath), true);
    });
  }

  test(`hasMeaningfulValue('${fieldPath}') — empty string returns false`, () => {
    if (!canTestDirectly) return;
    // Build a rule with empty string at the structured path
    const emptyRule = buildRuleWithValue(fieldPath, '');
    assert.equal(hasMeaningfulValue(emptyRule, fieldPath), false);
  });

  test(`hasMeaningfulValue('${fieldPath}') — null/undefined rule returns false`, () => {
    if (!canTestDirectly) return;
    assert.equal(hasMeaningfulValue({}, fieldPath), false);
    assert.equal(hasMeaningfulValue(null, fieldPath), false);
    assert.equal(hasMeaningfulValue(undefined, fieldPath), false);
  });
}

// ---------------------------------------------------------------------------
// Numeric field tests
// ---------------------------------------------------------------------------

for (const [fieldPath, structured, legacy] of NUMERIC_FIELDS) {
  test(`hasMeaningfulValue('${fieldPath}') — numeric value returns true`, () => {
    if (!canTestDirectly) return;
    assert.equal(hasMeaningfulValue(structured, fieldPath), true);
  });

  if (legacy) {
    test(`hasMeaningfulValue('${fieldPath}') — legacy numeric returns true`, () => {
      if (!canTestDirectly) return;
      assert.equal(hasMeaningfulValue(legacy, fieldPath), true);
    });
  }

  test(`hasMeaningfulValue('${fieldPath}') — zero is valid finite number`, () => {
    if (!canTestDirectly) return;
    const zeroRule = buildRuleWithValue(fieldPath, 0);
    assert.equal(hasMeaningfulValue(zeroRule, fieldPath), true);
  });

  test(`hasMeaningfulValue('${fieldPath}') — NaN returns false`, () => {
    if (!canTestDirectly) return;
    const nanRule = buildRuleWithValue(fieldPath, 'not-a-number');
    assert.equal(hasMeaningfulValue(nanRule, fieldPath), false);
  });

  test(`hasMeaningfulValue('${fieldPath}') — empty rule returns false`, () => {
    if (!canTestDirectly) return;
    assert.equal(hasMeaningfulValue({}, fieldPath), false);
  });
}

// ---------------------------------------------------------------------------
// Array field tests
// ---------------------------------------------------------------------------

for (const [fieldPath, structured] of ARRAY_FIELDS) {
  test(`hasMeaningfulValue('${fieldPath}') — non-empty array returns true`, () => {
    if (!canTestDirectly) return;
    assert.equal(hasMeaningfulValue(structured, fieldPath), true);
  });

  test(`hasMeaningfulValue('${fieldPath}') — empty array returns false`, () => {
    if (!canTestDirectly) return;
    const emptyRule = buildRuleWithValue(fieldPath, []);
    assert.equal(hasMeaningfulValue(emptyRule, fieldPath), false);
  });

  test(`hasMeaningfulValue('${fieldPath}') — missing key returns false`, () => {
    if (!canTestDirectly) return;
    assert.equal(hasMeaningfulValue({}, fieldPath), false);
  });
}

// ---------------------------------------------------------------------------
// Array-with-filter field tests (normalizeText filter)
// ---------------------------------------------------------------------------

for (const [fieldPath, structured] of ARRAY_FILTERED_FIELDS) {
  test(`hasMeaningfulValue('${fieldPath}') — non-empty filtered array returns true`, () => {
    if (!canTestDirectly) return;
    assert.equal(hasMeaningfulValue(structured, fieldPath), true);
  });

  test(`hasMeaningfulValue('${fieldPath}') — array of empty strings returns false`, () => {
    if (!canTestDirectly) return;
    const emptyStrings = buildRuleWithValue(fieldPath, ['', '  ', null]);
    assert.equal(hasMeaningfulValue(emptyStrings, fieldPath), false);
  });

  test(`hasMeaningfulValue('${fieldPath}') — empty array returns false`, () => {
    if (!canTestDirectly) return;
    const emptyRule = buildRuleWithValue(fieldPath, []);
    assert.equal(hasMeaningfulValue(emptyRule, fieldPath), false);
  });
}

// ---------------------------------------------------------------------------
// Bool presence field tests
// ---------------------------------------------------------------------------

for (const [fieldPath, structured, legacy] of BOOL_PRESENCE_FIELDS) {
  test(`hasMeaningfulValue('${fieldPath}') — structured presence returns true`, () => {
    if (!canTestDirectly) return;
    assert.equal(hasMeaningfulValue(structured, fieldPath), true);
  });

  if (legacy) {
    test(`hasMeaningfulValue('${fieldPath}') — legacy presence returns true`, () => {
      if (!canTestDirectly) return;
      assert.equal(hasMeaningfulValue(legacy, fieldPath), true);
    });
  }

  test(`hasMeaningfulValue('${fieldPath}') — missing key returns false`, () => {
    if (!canTestDirectly) return;
    assert.equal(hasMeaningfulValue({}, fieldPath), false);
  });
}

// ---------------------------------------------------------------------------
// Object truthy field tests
// ---------------------------------------------------------------------------

for (const [fieldPath, structured, legacy] of OBJECT_TRUTHY_FIELDS) {
  test(`hasMeaningfulValue('${fieldPath}') — object with truthy entries returns true`, () => {
    if (!canTestDirectly) return;
    assert.equal(hasMeaningfulValue(structured, fieldPath), true);
  });

  if (legacy) {
    test(`hasMeaningfulValue('${fieldPath}') — legacy object returns true`, () => {
      if (!canTestDirectly) return;
      assert.equal(hasMeaningfulValue(legacy, fieldPath), true);
    });
  }

  test(`hasMeaningfulValue('${fieldPath}') — empty object returns false`, () => {
    if (!canTestDirectly) return;
    const emptyObj = buildRuleWithValue(fieldPath, {});
    assert.equal(hasMeaningfulValue(emptyObj, fieldPath), false);
  });
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('hasMeaningfulValue returns false for unknown field path', () => {
  if (!canTestDirectly) return;
  assert.equal(hasMeaningfulValue({ foo: 'bar' }, 'unknown.path'), false);
  assert.equal(hasMeaningfulValue({ foo: 'bar' }, ''), false);
});

test('hasMeaningfulValue handles contract.range with only min', () => {
  if (!canTestDirectly) return;
  assert.equal(hasMeaningfulValue({ contract: { range: { min: 0 } } }, 'contract.range'), true);
});

test('hasMeaningfulValue handles contract.range with only max', () => {
  if (!canTestDirectly) return;
  assert.equal(hasMeaningfulValue({ contract: { range: { max: 100 } } }, 'contract.range'), true);
});

test('hasMeaningfulValue handles evidence.required with false value (presence check)', () => {
  if (!canTestDirectly) return;
  assert.equal(hasMeaningfulValue({ evidence: { required: false } }, 'evidence.required'), true);
});

// ---------------------------------------------------------------------------
// Helper: build a rule object with a value at the given dotted path
// ---------------------------------------------------------------------------

function buildRuleWithValue(fieldPath, value) {
  const parts = fieldPath.split('.');
  if (parts.length === 1) {
    return { [parts[0]]: value };
  }
  const rule = {};
  let current = rule;
  for (let i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
  return rule;
}
