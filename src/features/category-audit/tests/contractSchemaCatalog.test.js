import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_RULE_SCHEMA,
  KNOWN_KINDS,
  getIn,
  appliesTo,
  describeCurrent,
  describePossibleValues,
} from '../contractSchemaCatalog.js';

test('FIELD_RULE_SCHEMA is a non-empty frozen array', () => {
  assert.ok(Array.isArray(FIELD_RULE_SCHEMA), 'FIELD_RULE_SCHEMA is array');
  assert.ok(FIELD_RULE_SCHEMA.length >= 20, `expected \u226520 entries, got ${FIELD_RULE_SCHEMA.length}`);
  assert.ok(Object.isFrozen(FIELD_RULE_SCHEMA), 'FIELD_RULE_SCHEMA is frozen');
});

test('every entry has the required shape', () => {
  for (const entry of FIELD_RULE_SCHEMA) {
    assert.ok(entry && typeof entry === 'object', 'entry is object');
    assert.ok(typeof entry.path === 'string' && entry.path.length > 0, `entry.path: ${entry.path}`);
    assert.ok(typeof entry.label === 'string' && entry.label.length > 0, `entry.label on ${entry.path}`);
    assert.ok(KNOWN_KINDS.has(entry.kind), `unknown kind "${entry.kind}" on ${entry.path}`);
    assert.ok(typeof entry.doc === 'string' && entry.doc.length > 0, `entry.doc on ${entry.path}`);
    if (entry.kind === 'enum') {
      assert.ok(Array.isArray(entry.options) && entry.options.length > 0, `enum options on ${entry.path}`);
    }
    if (entry.appliesWhen) {
      assert.ok(typeof entry.appliesWhen === 'object', `appliesWhen is object on ${entry.path}`);
    }
  }
});

test('schema catalog does not describe supported constraints as unreachable', () => {
  const combinedDocs = FIELD_RULE_SCHEMA.map((entry) => entry.doc).join('\n');
  assert.doesNotMatch(combinedDocs, /KNOWN BUG|alias mismatch|unreachable/i);
});

test('paths are unique', () => {
  const seen = new Set();
  for (const entry of FIELD_RULE_SCHEMA) {
    assert.ok(!seen.has(entry.path), `duplicate path: ${entry.path}`);
    seen.add(entry.path);
  }
});

test('critical paths are present (anchor test — locks the minimum surface)', () => {
  const paths = new Set(FIELD_RULE_SCHEMA.map((e) => e.path));
  const required = [
    'priority.required_level',
    'priority.availability',
    'priority.difficulty',
    'contract.type',
    'contract.shape',
    'contract.unit',
    'enum.policy',
    'enum.values',
    'aliases',
    'ai_assist.reasoning_note',
    'ai_assist.color_edition_context.enabled',
    'ai_assist.pif_priority_images.enabled',
    'search_hints.domain_hints',
    'search_hints.query_terms',
    'constraints',
    'evidence.min_evidence_refs',
  ];
  for (const p of required) {
    assert.ok(paths.has(p), `missing required path: ${p}`);
  }
});

test('getIn resolves dot-notation paths', () => {
  const rule = {
    priority: { difficulty: 'hard' },
    contract: { type: 'number', rounding: { decimals: 2 } },
    enum: { values: ['a', 'b'] },
  };
  assert.equal(getIn(rule, 'priority.difficulty'), 'hard');
  assert.equal(getIn(rule, 'contract.type'), 'number');
  assert.equal(getIn(rule, 'contract.rounding.decimals'), 2);
  assert.deepEqual(getIn(rule, 'enum.values'), ['a', 'b']);
  assert.equal(getIn(rule, 'nonexistent.path'), undefined);
  assert.equal(getIn(null, 'any'), undefined);
});

test('appliesTo respects appliesWhen conditions', () => {
  const listRule = { contract: { type: 'string', shape: 'list' } };
  const scalarRule = { contract: { type: 'string', shape: 'scalar' } };
  const numberRule = { contract: { type: 'number', shape: 'scalar' } };

  const listRuleEntry = FIELD_RULE_SCHEMA.find((e) => e.path === 'contract.list_rules.sort');
  assert.ok(listRuleEntry, 'list_rules.sort entry exists');
  assert.equal(appliesTo(listRuleEntry, listRule), true);
  assert.equal(appliesTo(listRuleEntry, scalarRule), false);

  const rangeEntry = FIELD_RULE_SCHEMA.find((e) => e.path === 'contract.range.min');
  assert.ok(rangeEntry, 'range.min entry exists');
  assert.equal(appliesTo(rangeEntry, numberRule), true);
  assert.equal(appliesTo(rangeEntry, scalarRule), false);
});

test('describeCurrent renders representative values', () => {
  const rule = {
    priority: { difficulty: 'hard' },
    contract: { type: 'number' },
    enum: { values: ['tier1', 'tier2'] },
    aliases: [],
    ai_assist: {
      reasoning_note: '',
      color_edition_context: { enabled: false },
      pif_priority_images: { enabled: true },
    },
    search_hints: { domain_hints: ['logitech.com'] },
  };
  const byPath = (p) => FIELD_RULE_SCHEMA.find((e) => e.path === p);
  assert.equal(describeCurrent(byPath('priority.difficulty'), rule), 'hard');
  assert.equal(describeCurrent(byPath('contract.type'), rule), 'number');
  assert.equal(describeCurrent(byPath('enum.values'), rule), '2 values: tier1, tier2');
  assert.equal(describeCurrent(byPath('aliases'), rule), '(unset)');
  assert.equal(describeCurrent(byPath('ai_assist.reasoning_note'), rule), '(unset)');
  assert.equal(describeCurrent(byPath('ai_assist.color_edition_context.enabled'), rule), 'false');
  assert.equal(describeCurrent(byPath('ai_assist.pif_priority_images.enabled'), rule), 'true');
  assert.equal(describeCurrent(byPath('search_hints.domain_hints'), rule), '1 value: logitech.com');
});

test('describePossibleValues renders option lists / kind hints', () => {
  const byPath = (p) => FIELD_RULE_SCHEMA.find((e) => e.path === p);
  const enumEntry = byPath('contract.type');
  const possible = describePossibleValues(enumEntry);
  for (const opt of enumEntry.options) assert.ok(possible.includes(opt), `option ${opt} in ${possible}`);
  const stringEntry = byPath('contract.unit');
  assert.match(describePossibleValues(stringEntry), /free-form|string/i);
  const listEntry = byPath('aliases');
  assert.match(describePossibleValues(listEntry), /list/i);
});

test('FIELD_RULE_SCHEMA characterizes the full path/kind/options surface', () => {
  assert.deepEqual(
    FIELD_RULE_SCHEMA.map(({ path, kind, options, appliesWhen }) => ({
      path,
      kind,
      ...(options ? { options } : {}),
      ...(appliesWhen ? { appliesWhen } : {}),
    })),
    [
      { path: 'variant_dependent', kind: 'boolean' },
      { path: 'product_image_dependent', kind: 'boolean' },
      { path: 'priority.required_level', kind: 'enum', options: ['mandatory', 'non_mandatory'] },
      { path: 'priority.availability', kind: 'enum', options: ['always', 'sometimes', 'rare'] },
      { path: 'priority.difficulty', kind: 'enum', options: ['easy', 'medium', 'hard', 'very_hard'] },
      { path: 'contract.type', kind: 'enum', options: ['string', 'number', 'integer', 'boolean', 'date', 'url', 'range', 'mixed_number_range'] },
      { path: 'contract.shape', kind: 'enum', options: ['scalar', 'list'] },
      { path: 'contract.unit', kind: 'string' },
      { path: 'contract.rounding.decimals', kind: 'integer', appliesWhen: { 'contract.type': ['number', 'integer', 'float'] } },
      { path: 'contract.rounding.mode', kind: 'enum', options: ['nearest', 'floor', 'ceil', 'half_even'], appliesWhen: { 'contract.type': ['number', 'integer', 'float'] } },
      { path: 'contract.list_rules.dedupe', kind: 'boolean', appliesWhen: { 'contract.shape': 'list' } },
      { path: 'contract.list_rules.sort', kind: 'enum', options: ['none', 'asc', 'desc', 'insert'], appliesWhen: { 'contract.shape': 'list' } },
      { path: 'contract.list_rules.item_union', kind: 'enum', options: ['winner_only', 'set_union', 'ordered_union'], appliesWhen: { 'contract.shape': 'list' } },
      { path: 'contract.range.min', kind: 'number-nullable', appliesWhen: { 'contract.type': ['number', 'integer', 'float'] } },
      { path: 'contract.range.max', kind: 'number-nullable', appliesWhen: { 'contract.type': ['number', 'integer', 'float'] } },
      { path: 'enum.policy', kind: 'enum', options: ['closed', 'open_prefer_known', 'open'] },
      { path: 'enum.values', kind: 'string-list' },
      { path: 'enum.source', kind: 'enum-or-freeform', options: ['data_lists.<name>', 'component_db.<type>', 'yes_no'] },
      { path: 'enum.match.format_hint', kind: 'string' },
      { path: 'aliases', kind: 'string-list' },
      { path: 'variance_policy', kind: 'enum', options: ['authoritative', 'upper_bound', 'lower_bound', 'majority_vote'] },
      { path: 'ai_assist.reasoning_note', kind: 'prose' },
      { path: 'ai_assist.color_edition_context.enabled', kind: 'boolean' },
      { path: 'ai_assist.pif_priority_images.enabled', kind: 'boolean' },
      { path: 'search_hints.domain_hints', kind: 'string-list' },
      { path: 'search_hints.content_types', kind: 'string-list' },
      { path: 'search_hints.query_terms', kind: 'string-list' },
      { path: 'constraints', kind: 'constraint-list' },
      { path: 'evidence.min_evidence_refs', kind: 'integer' },
      { path: 'evidence.tier_preference', kind: 'ordered-list', options: ['tier1', 'tier2', 'tier3'] },
      { path: 'group', kind: 'group-ref' },
    ],
  );
});
