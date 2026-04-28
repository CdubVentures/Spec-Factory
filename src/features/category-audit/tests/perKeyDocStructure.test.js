import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPerKeyDocStructure } from '../perKeyDocStructure.js';
import { composePerKeyPromptPreview } from '../perKeyPromptPreview.js';
import { FIELD_RULE_SCHEMA } from '../contractSchemaCatalog.js';

function sectionPromptText(section) {
  return section.blocks.map((block) => block.text || '').join('\n');
}

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
  allKeyRecords: [],
  groups: [],
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
  // Header is always first. After that: purpose, search routing, category key map, contract schema,
  // consumer surface, enum, component, cross-field map, siblings, full-prompt, per-slot.
  assert.equal(ids[0], 'header');
  const after = ids.slice(1);
  assert.deepEqual(after.filter((x) => ['purpose', 'search-routing', 'authoring-checklist', 'category-key-map', 'contract-schema', 'consumer-surface', 'enum', 'component', 'cross-field', 'siblings', 'example-bank', 'llm-audit-prompt', 'full-prompt', 'per-slot'].includes(x)),
    ['purpose', 'search-routing', 'authoring-checklist', 'category-key-map', 'contract-schema', 'consumer-surface', 'enum', 'component', 'cross-field', 'siblings', 'example-bank', 'llm-audit-prompt', 'full-prompt', 'per-slot']);
});

test('search routing section explains requiredness availability difficulty and benchmark depth', () => {
  const rule = makeRule({
    priority: { required_level: 'mandatory', availability: 'sometimes', difficulty: 'very_hard' },
  });
  const record = makeKeyRecord('sensor', rule);
  const preview = composePerKeyPromptPreview(rule, 'sensor', {
    category: 'mouse',
    tierBundles: {
      very_hard: {
        model: 'frontier-model',
        useReasoning: true,
        thinking: true,
        thinkingEffort: 'high',
        webSearch: true,
      },
    },
  });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const section = structure.sections.find((s) => s.id === 'search-routing');
  assert.ok(section, 'search-routing section present');
  const allText = JSON.stringify(section);
  assert.match(allText, /required_level/);
  assert.match(allText, /availability/);
  assert.match(allText, /difficulty/);
  assert.match(allText, /mandatory/);
  assert.match(allText, /very_hard/);
  assert.match(allText, /model\/search strength/i);
  assert.match(allText, /benchmark/i);
  assert.match(allText, /category benchmark\/example set/i);
  assert.doesNotMatch(allText, /mouseData\.xlsm/i);
  assert.doesNotMatch(allText, /C2:BT83/i);
  assert.match(allText, /public\/spec\/visual\/identity evidence/i);
  assert.match(allText, /not restricted to lab-only measurements/i);
  assert.match(allText, /after variant inventory, PIF images, aliases, and source hints/i);
  assert.match(allText, /Very_hard is reserved/i);
  assert.match(allText, /proprietary internal component identities/i);
  assert.match(allText, /lab-only metrics/i);
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
  assert.match(allText, /no contract change/i);
  assert.match(allText, /Consumer-surface impact/i);
  assert.match(allText, /Unknown \/ not-applicable/i);
  assert.match(allText, /Use boolean only for true two-state facts/i);
  assert.match(allText, /Never add `unk` to enum values/i);
  assert.match(allText, /no submitted value/i);
  assert.match(allText, /battery_hours/i);
  assert.doesNotMatch(allText, /yes\/no\/n\/a\/unk are real stored states/i);
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
  assert.match(allText, /Live validation rule for this key/i);
  assert.match(allText, /do not finalize this key/i);
  assert.match(allText, /memory alone/i);
  assert.match(allText, /3-5 representative products/i);
  assert.match(allText, /References spot-checked/i);
  assert.match(allText, /Use benchmark data only to understand the target answer shape/i);
});

test('per-key LLM audit prompt requires a strict Field Studio JSON patch first', () => {
  const rule = makeRule({
    enum: { policy: 'open_prefer_known', values: ['standard', 'limited edition'] },
  });
  const record = makeKeyRecord('design', rule);
  const preview = composePerKeyPromptPreview(rule, 'design', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const section = structure.sections.find((s) => s.id === 'llm-audit-prompt');
  assert.ok(section, 'llm-audit-prompt section present');
  const allText = sectionPromptText(section);
  assert.match(allText, /strict JSON patch first/i);
  assert.match(allText, /mouse-design\.field-studio-patch\.v1\.json/);
  assert.match(allText, /"schema_version": "field-studio-patch\.v1"/);
  assert.match(allText, /"field_key": "design"/);
  assert.match(allText, /"field_overrides"/);
  assert.match(allText, /"data_lists"/);
  assert.match(allText, /Live validation/);
  assert.doesNotMatch(allText, /- variant_dependent:/);
  assert.doesNotMatch(allText, /- Product Image Dependent:/);
  assert.match(allText, /color_edition_context/);
  assert.match(allText, /pif_priority_images/);
  assert.match(allText, /reasoning_note/);
  assert.doesNotMatch(allText, /No change/);
  assert.doesNotMatch(allText, /Tooltip \/ Guidance/);
  assert.doesNotMatch(allText, /tooltip/i);
  assert.doesNotMatch(allText, /current runtime behavior, not the target recommendation/i);
  assert.doesNotMatch(allText, /do not treat that as endorsement/i);
  assert.doesNotMatch(allText, /Recommend closed when this key/i);
});

test('per-key LLM audit prompt uses navigator ordinal when available', () => {
  const rule = makeRule({
    enum: { policy: 'open_prefer_known', values: ['standard', 'limited edition'] },
  });
  const record = makeKeyRecord('design', rule);
  const preview = composePerKeyPromptPreview(rule, 'design', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview, navigatorOrdinal: '07' });
  const section = structure.sections.find((s) => s.id === 'llm-audit-prompt');
  const allText = sectionPromptText(section);
  assert.match(allText, /mouse-07-design\.field-studio-patch\.v1\.json/);
  assert.match(allText, /"navigator_ordinal": 7/);
});

test('per-key LLM audit prompt gives component link fields authoritative component-source guidance', () => {
  const rule = makeRule({
    contract: { type: 'url', shape: 'scalar' },
    component: { type: 'sensor', source: 'component_db.sensor' },
    ui: { label: 'Sensor Link' },
  });
  const record = makeKeyRecord('sensor_link', rule, {
    component: { type: 'sensor', relation: 'subfield_of', source: 'component_db.sensor' },
  });
  const preview = composePerKeyPromptPreview(rule, 'sensor_link', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const section = structure.sections.find((s) => s.id === 'llm-audit-prompt');
  assert.ok(section, 'llm-audit-prompt section present');
  const allText = sectionPromptText(section);
  assert.match(allText, /component _link fields/i);
  assert.match(allText, /manufacturer component page/i);
  assert.match(allText, /datasheet\/spec-sheet PDF/i);
  assert.match(allText, /authorized component distributor/i);
  assert.match(allText, /not eBay/i);
  assert.match(allText, /merely mention/i);
});

test('contract-schema table has one row per non-dependency-toggle FIELD_RULE_SCHEMA entry', () => {
  const rule = makeRule();
  const record = makeKeyRecord('dpi', rule);
  const preview = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const contractSection = structure.sections.find((s) => s.id === 'contract-schema');
  assert.ok(contractSection, 'contract-schema section present');
  const table = contractSection.blocks.find((b) => b.kind === 'table');
  assert.ok(table, 'table block present in contract-schema');
  const expectedRowCount = FIELD_RULE_SCHEMA.filter((entry) => entry.studioWidget !== 'dependency_toggle').length;
  assert.equal(table.rows.length, expectedRowCount, 'one row per non-dependency-toggle schema entry');
  // Dependency-toggle entries (variant_dependent, product_image_dependent) are
  // category-summary concerns, not per-key field knobs. They must not appear.
  const rowParameters = table.rows.map((r) => String(r[0]));
  assert.ok(
    !rowParameters.some((cell) => cell.includes('variant_dependent')),
    'variant_dependent must not appear in per-key contract-schema table',
  );
  assert.ok(
    !rowParameters.some((cell) => cell.includes('product_image_dependent')),
    'product_image_dependent must not appear in per-key contract-schema table',
  );
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

test('component section reflects enum.source linkage and renders component-inventory context', () => {
  // Phase 2: parent identity derives from `enum.source === component_db.<self>`.
  const rule = makeRule({ enum: { source: 'component_db.sensor', policy: 'open_prefer_known', values: [] } });
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

test('category key map gives each per-key doc all keys for grouping and dependency review', () => {
  const rule = makeRule({ ui: { label: 'Sensor Date' }, variance_policy: 'authoritative' });
  const record = makeKeyRecord('sensor_date', rule, {
    group: 'sensor_performance',
    variance_policy: 'authoritative',
  });
  const allKeyRecords = [
    record,
    makeKeyRecord('release_date', makeRule({
      contract: { type: 'date', shape: 'scalar' },
      ui: { label: 'Release Date' },
    }), { group: 'general' }),
    makeKeyRecord('sensor', makeRule({
      ui: { label: 'Sensor' },
    }), { group: 'sensor_performance', component: { type: 'sensor', relation: 'parent', source: 'component_db.sensor' } }),
  ];
  const preview = composePerKeyPromptPreview(rule, 'sensor_date', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, {
    ...BASE_OPTS,
    preview,
    allKeyRecords,
    groups: [
      { groupKey: 'general', displayName: 'General', fieldKeys: ['release_date'] },
      { groupKey: 'sensor_performance', displayName: 'Sensor & Performance', fieldKeys: ['sensor', 'sensor_date'] },
    ],
  });
  const section = structure.sections.find((s) => s.id === 'category-key-map');
  assert.ok(section, 'category-key-map section present');
  const allText = JSON.stringify(section);
  assert.match(allText, /all current keys/i);
  assert.match(allText, /release_date/);
  assert.match(allText, /sensor_performance/);
  assert.match(allText, /authoritative/);
});

test('cross-field map includes constraints from other keys that touch this key', () => {
  const releaseRule = makeRule({
    contract: { type: 'date', shape: 'scalar' },
    ui: { label: 'Release Date' },
  });
  const record = makeKeyRecord('release_date', releaseRule, { group: 'general' });
  const sensorDate = makeKeyRecord('sensor_date', makeRule({
    constraints: ['sensor_date <= release_date'],
    ui: { label: 'Sensor Date' },
  }), {
    group: 'sensor_performance',
    constraints: [{ op: 'lte', left: 'sensor_date', right: 'release_date', raw: 'sensor_date <= release_date' }],
  });
  const preview = composePerKeyPromptPreview(releaseRule, 'release_date', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, {
    ...BASE_OPTS,
    preview,
    allKeyRecords: [record, sensorDate],
  });
  const section = structure.sections.find((s) => s.id === 'cross-field');
  assert.ok(section, 'cross-field section present even when current key owns no constraints');
  const allText = JSON.stringify(section);
  assert.match(allText, /sensor_date <= release_date/);
  assert.match(allText, /touches this key/i);
});

test('component section shows all components and relevant component variance details', () => {
  const rule = makeRule({ ui: { label: 'DPI' } });
  const record = makeKeyRecord('dpi', rule, {
    group: 'sensor_performance',
    component: { type: 'sensor', relation: 'subfield_of', source: 'component_db.sensor' },
    variance_policy: 'upper_bound',
  });
  const preview = composePerKeyPromptPreview(rule, 'dpi', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, {
    ...BASE_OPTS,
    preview,
    componentInventory: [
      {
        type: 'sensor',
        entityCount: 2,
        entities: [
          {
            name: 'PAW3950',
            maker: 'PixArt',
            aliases: ['3950'],
            properties: { dpi: 30000, sensor_date: '2023-01' },
            constraints: { sensor_date: ['sensor_date <= release_date'] },
            variance_policies: { dpi: 'upper_bound', sensor_date: 'authoritative' },
          },
        ],
        identityFields: ['sensor'],
        subfields: ['dpi', 'sensor_date'],
      },
      {
        type: 'switch',
        entityCount: 1,
        entities: [],
        identityFields: ['switch'],
        subfields: ['switch_type'],
      },
    ],
  });
  const section = structure.sections.find((s) => s.id === 'component');
  assert.ok(section, 'component section present');
  const allText = JSON.stringify(section);
  assert.match(allText, /All current components/i);
  assert.match(allText, /switch/);
  assert.match(allText, /PAW3950/);
  assert.match(allText, /upper_bound/);
  assert.match(allText, /sensor_date <= release_date/);
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

test('cross-field section reflects current renderer support for constraints DSL', () => {
  const rule = makeRule({ constraints: ['sensor_date <= release_date'] });
  const record = makeKeyRecord('sensor_date', rule, {
    constraints: [{ op: 'lte', left: 'sensor_date', right: 'release_date', raw: 'sensor_date <= release_date' }],
  });
  const preview = composePerKeyPromptPreview(rule, 'sensor_date', { category: 'mouse' });
  const structure = buildPerKeyDocStructure(record, { ...BASE_OPTS, preview });
  const allText = JSON.stringify(structure);

  assert.match(allText, /sensor_date <= release_date/);
  assert.doesNotMatch(allText, /KNOWN BUG|alias mismatch|NOT currently reaching/i);
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
