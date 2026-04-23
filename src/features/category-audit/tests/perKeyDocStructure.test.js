import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPerKeyDocStructure } from '../perKeyDocStructure.js';
import { composePerKeyPromptPreview } from '../perKeyPromptPreview.js';
import { FIELD_RULE_SCHEMA } from '../contractSchemaCatalog.js';

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

function makeKeyRecord(fieldKey, rule, overrides = {}) {
  return {
    fieldKey,
    displayName: rule?.ui?.label || fieldKey,
    group: 'general',
    priority: rule.priority,
    contract: { ...rule.contract, unit: rule.contract.unit || '', rounding: rule.contract.rounding || null, list_rules: rule.contract.list_rules || null, range: rule.contract.range || null },
    enum: { ...rule.enum, analysis: null, filterUi: 'toggles' },
    aliases: rule.aliases || [],
    search_hints: rule.search_hints || { domain_hints: [], query_terms: [] },
    constraints: [],
    component: null,
    ai_assist: rule.ai_assist,
    evidence: { min_evidence_refs: 1, tier_preference: [] },
    variance_policy: '',
    rawRule: rule,
    ...overrides,
  };
}

const BASE_OPTS = {
  category: 'mouse',
  generatedAt: '2026-04-23T12:00:00.000Z',
  schemaCatalog: FIELD_RULE_SCHEMA,
  siblingsInGroup: [],
};

test('returns a structure with { meta, sections }', () => {
  const rule = makeRule();
  const record = makeKeyRecord('dpi', rule);
  const preview = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });

  assert.ok(structure && typeof structure === 'object');
  assert.ok(Array.isArray(structure.sections) && structure.sections.length > 0, 'non-empty sections array');
  assert.equal(structure.meta.fieldKey, 'dpi');
  assert.equal(structure.meta.category, 'mouse');
  assert.equal(structure.meta.group, 'general');
  assert.equal(structure.meta.generatedAt, '2026-04-23T12:00:00.000Z');
});

test('sections appear in the expected order', () => {
  const rule = makeRule({
    enum: { policy: 'open_prefer_known', values: ['x', 'y', 'z'] },
    ai_assist: { reasoning_note: 'some note' },
    aliases: ['alias1'],
  });
  const record = makeKeyRecord('dpi', rule);
  const preview = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const ids = structure.sections.map((s) => s.id);
  // Header is always first. After that: purpose, contract-schema, enum, component, cross-field (optional),
  // siblings, full-prompt, per-slot.
  assert.equal(ids[0], 'header');
  const after = ids.slice(1);
  assert.deepEqual(after.filter((x) => ['purpose', 'authoring-checklist', 'contract-schema', 'enum', 'component', 'siblings', 'example-bank', 'full-prompt', 'per-slot'].includes(x)),
    ['purpose', 'authoring-checklist', 'contract-schema', 'enum', 'component', 'siblings', 'example-bank', 'full-prompt', 'per-slot']);
});

test('authoring checklist makes full priority and contract validation explicit', () => {
  const rule = makeRule({
    priority: { required_level: 'mandatory', availability: 'sometimes', difficulty: 'hard' },
    contract: { type: 'number', shape: 'list', unit: 'hz', list_rules: { dedupe: true, sort: 'desc' } },
    enum: { policy: 'open', values: [] },
  });
  const record = makeKeyRecord('polling_rate', rule);
  const preview = composePerKeyPromptPreview(rule, 'polling_rate', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const section = structure.sections.find((s) => s.id === 'authoring-checklist');
  assert.ok(section, 'authoring-checklist section present');
  const allText = JSON.stringify(section);
  assert.match(allText, /priority\.required_level/);
  assert.match(allText, /priority\.availability/);
  assert.match(allText, /priority\.difficulty/);
  assert.match(allText, /contract\.type/);
  assert.match(allText, /contract\.shape/);
  assert.match(allText, /guidance last/i);
});

test('example-bank recipe is category agnostic and asks for 5-10 examples', () => {
  const rule = makeRule();
  const record = makeKeyRecord('dpi', rule);
  const preview = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const section = structure.sections.find((s) => s.id === 'example-bank');
  assert.ok(section, 'example-bank section present');
  const allText = JSON.stringify(section);
  assert.match(allText, /5-10/);
  assert.match(allText, /happy path/i);
  assert.match(allText, /edge/i);
  assert.match(allText, /unknown/i);
  assert.match(allText, /conflict/i);
  assert.match(allText, /filter-risk/i);
  assert.match(allText, /benchmark/i);
  assert.match(allText, /brand-new categor/i);
});

test('contract-schema table has a row for every FIELD_RULE_SCHEMA entry', () => {
  const rule = makeRule();
  const record = makeKeyRecord('dpi', rule);
  const preview = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const contractSection = structure.sections.find((s) => s.id === 'contract-schema');
  assert.ok(contractSection, 'contract-schema section present');
  const table = contractSection.blocks.find((b) => b.kind === 'table');
  assert.ok(table, 'table block present in contract-schema');
  assert.equal(table.rows.length, FIELD_RULE_SCHEMA.length, 'one row per schema entry');
});

test('appliesWhen=false rows carry an "(n/a)" marker in the current-value column', () => {
  // scalar rule → list_rules.sort does not apply
  const rule = makeRule();
  const record = makeKeyRecord('dpi', rule);
  const preview = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const table = structure.sections.find((s) => s.id === 'contract-schema').blocks.find((b) => b.kind === 'table');
  const listSortRow = table.rows.find((r) => String(r[0]).includes('list_rules.sort'));
  assert.ok(listSortRow, 'list_rules.sort row present');
  assert.match(String(listSortRow[1]), /n\/a|not applicable/i, 'current value marked n/a');
});

test('enum section is omitted when the rule has no values', () => {
  const rule = makeRule({ enum: { policy: '', values: [] } });
  const record = makeKeyRecord('dpi', rule);
  const preview = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  assert.ok(!structure.sections.find((s) => s.id === 'enum'), 'enum section absent');
});

test('component section reflects component.type and renders component-inventory context', () => {
  const rule = makeRule({ component: { type: 'sensor', source: 'component_db.sensor' } });
  const record = makeKeyRecord('sensor', rule, { component: { type: 'sensor', relation: 'parent', source: 'component_db.sensor' } });
  const preview = composePerKeyPromptPreview(rule, 'sensor', { category: 'mouse', componentRelation: { type: 'sensor', relation: 'parent' } });
  const structure = buildPerKeyDocStructure(record, {
    ...BASE_OPTS,
    preview,
    componentInventory: [{
      type: 'sensor',
      entityCount: 2,
      entities: [{ name: 'PMW3950', maker: 'PixArt', aliases: [], properties: { dpi: 26000 } }],
      identityFields: ['sensor'],
      subfields: ['dpi', 'ips'],
    }],
  });
  const componentSection = structure.sections.find((s) => s.id === 'component');
  assert.ok(componentSection, 'component section present');
  // Should mention identity + the subfields that belong to this component
  const allText = JSON.stringify(componentSection);
  assert.ok(allText.includes('sensor'), 'sensor mentioned');
  assert.match(allText, /IS the sensor/i);
});

test('full-prompt section contains the systemPrompt as a codeBlock', () => {
  const rule = makeRule();
  const record = makeKeyRecord('dpi', rule);
  const preview = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const promptSection = structure.sections.find((s) => s.id === 'full-prompt');
  assert.ok(promptSection, 'full-prompt present');
  const code = promptSection.blocks.find((b) => b.kind === 'codeBlock');
  assert.ok(code, 'codeBlock in full-prompt');
  assert.ok(code.text.includes('<BRAND>'), 'includes placeholder');
  assert.ok(code.text.length > 200, 'prompt is substantial');
});

test('per-slot section renders one sub-block per runtime slot', () => {
  const rule = makeRule({
    ai_assist: { reasoning_note: 'look at the sticker' },
    search_hints: { domain_hints: ['logitech.com'], query_terms: ['sensor model'] },
  });
  const record = makeKeyRecord('sensor', rule);
  const preview = composePerKeyPromptPreview(rule, 'sensor', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const slotSection = structure.sections.find((s) => s.id === 'per-slot');
  assert.ok(slotSection, 'per-slot section present');
  const slotSubheadings = slotSection.blocks.filter((b) => b.kind === 'subheading');
  const hasGuidance = slotSubheadings.some((s) => String(s.text).includes('PRIMARY_FIELD_GUIDANCE'));
  const hasContract = slotSubheadings.some((s) => String(s.text).includes('PRIMARY_FIELD_CONTRACT'));
  const hasReturnShape = slotSubheadings.some((s) => String(s.text).includes('RETURN_JSON_SHAPE'));
  assert.ok(hasGuidance, 'guidance slot rendered');
  assert.ok(hasContract, 'contract slot rendered');
  assert.ok(hasReturnShape, 'return-shape slot rendered');
});

test('siblings section lists other keys in the same group', () => {
  const rule = makeRule();
  const record = makeKeyRecord('dpi', rule);
  const siblings = [
    makeKeyRecord('ips', makeRule({ ui: { label: 'IPS' } })),
    makeKeyRecord('polling_rate', makeRule({ contract: { type: 'number', shape: 'list' }, ui: { label: 'Polling Rate' } })),
  ];
  const preview = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview, siblingsInGroup: siblings });
  const sibSection = structure.sections.find((s) => s.id === 'siblings');
  assert.ok(sibSection, 'siblings section present');
  const table = sibSection.blocks.find((b) => b.kind === 'table');
  assert.ok(table, 'siblings table present');
  assert.equal(table.rows.length, 2, 'one row per sibling');
});

test('reserved-key preview yields a short structure with no full-prompt section', () => {
  const rule = makeRule();
  const record = makeKeyRecord('colors', rule);
  const preview = composePerKeyPromptPreview(rule, 'colors', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const ids = structure.sections.map((s) => s.id);
  assert.ok(!ids.includes('full-prompt'), 'no full-prompt section for reserved key');
  assert.ok(ids.includes('reserved-owner'), 'reserved-owner section shown');
});
