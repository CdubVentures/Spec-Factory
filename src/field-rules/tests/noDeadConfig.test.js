import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_RULE_SCHEMA } from '../fieldRuleSchema.js';
import {
  FIELD_RULE_CAPABILITIES,
  FIELD_RULE_CAPABILITY_KEYS,
  capabilityKeyForSchemaPath,
} from '../fieldRuleCapabilities.js';

// ---------------------------------------------------------------------------
// Window 9: No Dead Config CI enforcement
//
// Prevents authorable knobs from being emitted without a consumer.
// Uses fieldRuleCapabilities.js as the derived registry. Schema knobs come
// from FIELD_RULE_SCHEMA; compatibility-only legacy knobs live in one local
// block in that module.
//
// FAIL conditions:
//   - Knob in FIELD_RULE_CAPABILITIES has status other than live/ui_only/deferred/retired
//   - Knob with status "deferred" lacks a reason
//   - Knob with status "live" lacks a consumer
//   - More than 10 deferred knobs (cap to prevent accumulation)
// ---------------------------------------------------------------------------

test('FIELD_RULE_CAPABILITIES exposes a non-empty knob registry', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  assert.ok(cap.knobs, 'FIELD_RULE_CAPABILITIES must have a "knobs" object');
  assert.ok(Object.keys(cap.knobs).length > 0, 'knobs must not be empty');
});

test('every knob has a valid status (live, ui_only, deferred, or retired)', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  const validStatuses = new Set(['live', 'ui_only', 'deferred', 'retired']);
  const invalid = [];
  for (const [knob, config] of Object.entries(cap.knobs)) {
    if (!validStatuses.has(config.status)) {
      invalid.push({ knob, status: config.status });
    }
  }
  assert.equal(invalid.length, 0,
    `Invalid statuses: ${JSON.stringify(invalid)}`);
});

test('every live knob has a consumer specified', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  const missing = [];
  for (const [knob, config] of Object.entries(cap.knobs)) {
    if (config.status === 'live' && !config.consumer) {
      missing.push(knob);
    }
  }
  assert.equal(missing.length, 0,
    `Live knobs without consumers: ${missing.join(', ')}`);
});

test('every deferred knob has a reason', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  const missing = [];
  for (const [knob, config] of Object.entries(cap.knobs)) {
    if (config.status === 'deferred' && !config.reason) {
      missing.push(knob);
    }
  }
  assert.equal(missing.length, 0,
    `Deferred knobs without reasons: ${missing.join(', ')}`);
});

test('deferred knob count does not exceed cap (max 10)', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  const deferred = Object.entries(cap.knobs)
    .filter(([, config]) => config.status === 'deferred');
  assert.ok(deferred.length <= 10,
    `Too many deferred knobs (${deferred.length}): ${deferred.map(([k]) => k).join(', ')}. ` +
    'Either wire them or remove from the registry.');
});

test('every knob has a description', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  const missing = [];
  for (const [knob, config] of Object.entries(cap.knobs)) {
    if (!config.description || !config.description.trim()) {
      missing.push(knob);
    }
  }
  assert.equal(missing.length, 0,
    `Knobs without descriptions: ${missing.join(', ')}`);
});

test('capabilities registry covers every field-rule schema knob', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  const capabilityKeys = new Set(Object.keys(cap.knobs));
  const expectedKeys = [...new Set(FIELD_RULE_SCHEMA.map((entry) => capabilityKeyForSchemaPath(entry.path)))].sort();
  const missing = expectedKeys.filter((key) => !capabilityKeys.has(key));

  assert.deepEqual(missing, []);
});

test('no duplicate knob names (case-insensitive)', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  const seen = new Map();
  const dupes = [];
  for (const knob of Object.keys(cap.knobs)) {
    const lower = knob.toLowerCase();
    if (seen.has(lower)) {
      dupes.push({ knob, conflictsWith: seen.get(lower) });
    }
    seen.set(lower, knob);
  }
  assert.equal(dupes.length, 0,
    `Duplicate knobs: ${JSON.stringify(dupes)}`);
});

test('non-indexlab knobs remain authorable in capabilities registry', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  const retainedKnobs = [
    'contract.rounding.decimals',
    'contract.rounding.mode',
    'parse.unit',
  ];

  for (const knob of retainedKnobs) {
    assert.ok(cap.knobs[knob], `${knob} should remain authorable in FIELD_RULE_CAPABILITIES`);
  }
});

test('live AI assist knobs remain registered with consumer metadata', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  const expectedLiveAiKnobs = [
    'ai_assist.reasoning_note',
    'ai_assist.color_edition_context',
    'ai_assist.pif_priority_images',
  ];

  for (const knob of expectedLiveAiKnobs) {
    const config = cap.knobs[knob];
    assert.ok(config, `AI knob ${knob} should exist in FIELD_RULE_CAPABILITIES`);
    assert.equal(config.status, 'live', `AI knob ${knob} should remain live`);
    assert.ok(
      typeof config.consumer === 'string' && config.consumer.trim().length > 0,
      `AI knob ${knob} should declare consumer metadata`,
    );
  }
});

test('FIELD_RULE_CAPABILITY_KEYS characterizes the published capability surface', () => {
  assert.deepEqual(FIELD_RULE_CAPABILITY_KEYS, [
    'ai_assist.color_edition_context',
    'ai_assist.pif_priority_images',
    'ai_assist.reasoning_note',
    'aliases',
    'constraints',
    'contract.list_rules.dedupe',
    'contract.list_rules.item_union',
    'contract.list_rules.sort',
    'contract.range',
    'contract.rounding.decimals',
    'contract.rounding.mode',
    'contract.shape',
    'contract.type',
    'contract.unit',
    'core_fields',
    'enum.match.format_hint',
    'enum.new_value_policy',
    'enum.policy',
    'enum.source',
    'enum.values',
    'evidence.min_evidence_refs',
    'evidence.tier_preference',
    'group',
    'parse.delimiters',
    'parse.template',
    'parse.token_map',
    'parse.unit',
    'priority.availability',
    'priority.difficulty',
    'priority.effort',
    'priority.required_level',
    'product_image_dependent',
    'search_hints.content_types',
    'search_hints.domain_hints',
    'search_hints.query_terms',
    'selection_policy',
    'ui.display_decimals',
    'ui.group',
    'ui.input_control',
    'ui.label',
    'ui.order',
    'ui.surfaces',
    'ui.tooltip_md',
    'ui.tooltip_source',
    'variance_policy',
    'variant_dependent',
  ]);
});

test('capabilities summary: report live/ui_only/deferred counts', () => {
  const cap = FIELD_RULE_CAPABILITIES;
  const counts = { live: 0, ui_only: 0, deferred: 0 };
  for (const config of Object.values(cap.knobs)) {
    counts[config.status] = (counts[config.status] || 0) + 1;
  }
  const total = Object.keys(cap.knobs).length;

  // At least 20 live knobs (we have ~30+)
  assert.ok(counts.live >= 20,
    `Expected at least 20 live knobs, got ${counts.live}`);

  // Report for visibility
  assert.ok(true,
    `Capabilities: ${total} total — ${counts.live} live, ${counts.ui_only} ui_only, ${counts.deferred} deferred`);
});
