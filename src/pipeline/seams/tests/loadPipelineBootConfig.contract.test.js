import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPipelineBootConfig } from '../loadPipelineBootConfig.js';

// WHY: Contract test locking the return shape of loadPipelineBootConfig.
// Source is field_studio_map.compiled_rules + boot_config (the single SSOT).

function buildStubSpecDb() {
  const compiledRules = {
    fields: {
      brand: { required_level: 'identity', difficulty: 'easy', availability: 'common', display_name: 'Brand', group: 'identity', aliases: ['manufacturer'], search_hints: { query_terms: ['brand'], domain_hints: ['official site'], content_types: ['spec sheet'] }, ui: { tooltip_md: 'The brand name', label: 'Brand' } },
      model: { required_level: 'identity', difficulty: 'easy', availability: 'common', display_name: 'Model', group: 'identity', aliases: [], search_hints: { query_terms: [], domain_hints: [], content_types: [] }, ui: { tooltip_md: '', label: 'Model' } },
    },
    field_order: ['brand', 'model'],
    field_groups: { identity: ['brand', 'model'] },
    required_fields: ['brand', 'model'],
    critical_fields: ['brand'],
  };

  const bootConfig = {
    source_hosts: [{ host: 'example.com', tierName: 'manufacturer' }],
    source_registry: { src_1: { id: 'src_1', host: 'example.com' } },
    validated_registry: {},
    denylist: ['spam.com'],
    search_templates: [{ label: 'official', query: '{brand} {model} specs' }],
    spec_seeds: [],
  };

  return {
    getCompiledRules: () => compiledRules,
    getBootConfig: () => bootConfig,
  };
}

describe('loadPipelineBootConfig contract', () => {
  test('returns expected shape with all required properties', () => {
    const specDb = buildStubSpecDb();
    const result = loadPipelineBootConfig({ specDb, category: 'mouse' });

    assert.strictEqual(result.category, 'mouse');
    assert.ok(result.fieldRules, 'fieldRules present');
    assert.ok(result.fieldRules.fields, 'fieldRules.fields present');
    assert.ok(Array.isArray(result.fieldOrder), 'fieldOrder is array');
    assert.ok(typeof result.fieldGroups === 'object', 'fieldGroups is object');
    assert.ok(Array.isArray(result.requiredFields), 'requiredFields is array');
    assert.ok(result.schema, 'schema present');
    assert.ok(Array.isArray(result.schema.critical_fields), 'critical_fields is array');
    assert.ok(Array.isArray(result.sourceHosts), 'sourceHosts is array');
    assert.ok(result.sourceHostMap instanceof Map, 'sourceHostMap is Map');
    assert.ok(result.approvedRootDomains instanceof Set, 'approvedRootDomains is Set');
    assert.ok(typeof result.sourceRegistry === 'object', 'sourceRegistry is object');
    assert.ok(typeof result.validatedRegistry === 'object', 'validatedRegistry is object');
    assert.ok(Array.isArray(result.denylist), 'denylist is array');
    assert.ok(Array.isArray(result.searchTemplates), 'searchTemplates is array');
    assert.ok(Array.isArray(result.specSeeds), 'specSeeds is array');
  });

  test('fieldRules.fields contains per-field rules', () => {
    const specDb = buildStubSpecDb();
    const result = loadPipelineBootConfig({ specDb, category: 'mouse' });

    assert.ok(result.fieldRules.fields.brand, 'brand field present');
    assert.ok(result.fieldRules.fields.model, 'model field present');
    assert.strictEqual(result.fieldRules.fields.brand.required_level, 'identity');
  });

  test('derived data computed correctly from source_hosts', () => {
    const specDb = buildStubSpecDb();
    const result = loadPipelineBootConfig({ specDb, category: 'mouse' });

    assert.strictEqual(result.sourceHostMap.get('example.com').tierName, 'manufacturer');
    assert.ok(result.approvedRootDomains.has('example.com'));
  });

  test('field_order, field_groups, required_fields, critical_fields parsed', () => {
    const specDb = buildStubSpecDb();
    const result = loadPipelineBootConfig({ specDb, category: 'mouse' });

    assert.deepStrictEqual(result.fieldOrder, ['brand', 'model']);
    assert.deepStrictEqual(result.fieldGroups, { identity: ['brand', 'model'] });
    assert.deepStrictEqual(result.requiredFields, ['brand', 'model']);
    assert.deepStrictEqual(result.schema.critical_fields, ['brand']);
  });

  test('boot config data parsed', () => {
    const specDb = buildStubSpecDb();
    const result = loadPipelineBootConfig({ specDb, category: 'mouse' });

    assert.deepStrictEqual(result.denylist, ['spam.com']);
    assert.strictEqual(result.sourceHosts.length, 1);
    assert.strictEqual(result.sourceHosts[0].host, 'example.com');
    assert.deepStrictEqual(result.searchTemplates, [{ label: 'official', query: '{brand} {model} specs' }]);
    assert.deepStrictEqual(result.specSeeds, []);
    assert.ok(result.sourceRegistry.src_1);
  });

  test('throws when specDb missing', () => {
    assert.throws(() => loadPipelineBootConfig({ specDb: null, category: 'mouse' }));
  });

  test('throws when category missing', () => {
    assert.throws(() => loadPipelineBootConfig({ specDb: {}, category: '' }));
  });

  test('throws when no compiled rules found', () => {
    const specDb = { getCompiledRules: () => null, getBootConfig: () => null };
    assert.throws(() => loadPipelineBootConfig({ specDb, category: 'mouse' }));
  });
});
