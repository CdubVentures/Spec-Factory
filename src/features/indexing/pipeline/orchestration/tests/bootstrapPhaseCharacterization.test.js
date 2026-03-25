import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapPhase } from '../bootstrapPhase.js';
import { pipelineContextAfterBootstrap } from '../pipelineContextSchema.js';

function makeConfig(overrides = {}) {
  return { discoveryEnabled: true, searchEngines: 'bing,google', ...overrides };
}

function makeJob(overrides = {}) {
  return {
    productId: 'test-product',
    brand: 'Razer',
    model: 'Viper V3',
    variant: 'Pro',
    category: 'mouse',
    requirements: { focus_fields: ['dpi'] },
    ...overrides,
  };
}

function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    fieldOrder: ['sensor_model', 'weight', 'dpi'],
    schema: { critical_fields: ['sensor_model', 'weight'] },
    sourceHosts: [],
    ...overrides,
  };
}

function makeBrandResolution(overrides = {}) {
  return {
    officialDomain: 'razer.com',
    aliases: ['razerzone.com'],
    supportDomain: 'support.razer.com',
    confidence: 0.95,
    reasoning: ['Official manufacturer site'],
    ...overrides,
  };
}

function makeStorage(files = {}) {
  return {
    resolveOutputKey: (...parts) => parts.join('/'),
    readJsonOrNull: async (key) => files[key] ?? null,
  };
}

function makePlanningHints(overrides = {}) {
  return {
    missingRequiredFields: ['weight'],
    missingCriticalFields: ['sensor_model'],
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  const {
    config,
    job,
    categoryConfig,
    brandResolution,
    storage,
    planningHints,
    learningStoreHints,
    normalizeFieldListFn,
    ...rest
  } = overrides;

  return {
    config: makeConfig(config),
    job: makeJob(job),
    category: 'mouse',
    categoryConfig: makeCategoryConfig(categoryConfig),
    runId: 'run-001',
    storage: storage ?? makeStorage(),
    brandResolution: brandResolution === undefined ? makeBrandResolution() : brandResolution,
    planningHints: makePlanningHints(planningHints),
    learningStoreHints: learningStoreHints ?? null,
    normalizeFieldListFn: normalizeFieldListFn ?? ((fields) => [...new Set(fields)]),
    planner: {},
    focusGroups: [{
      key: 'sensor',
      label: 'Sensor',
      field_keys: ['sensor_model'],
      unresolved_field_keys: ['sensor_model'],
      priority: 'core',
      phase: 'now',
      group_search_worthy: true,
      skip_reason: null,
      normalized_key_queue: [{ normalized_key: 'sensor_model', repeat_count: 0 }],
    }],
    seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
    seedSearchPlan: null,
    queryExecutionHistory: { queries: [] },
    ...rest,
  };
}

function toAfterBootstrapPayload(ctx, result) {
  return {
    config: ctx.config,
    job: ctx.job,
    category: ctx.category,
    categoryConfig: result.categoryConfig,
    runId: ctx.runId,
    focusGroups: ctx.focusGroups,
    seedStatus: ctx.seedStatus,
    seedSearchPlan: ctx.seedSearchPlan,
    brandResolution: ctx.brandResolution,
    variables: result.variables,
    identityLock: result.identityLock,
    missingFields: result.missingFields,
    learning: result.learning,
    enrichedLexicon: result.enrichedLexicon,
    planningHints: ctx.planningHints,
    queryExecutionHistory: ctx.queryExecutionHistory,
  };
}

describe('bootstrapPhase.execute return contract', () => {
  it('returns a schema-valid bootstrap payload with promoted official-domain host data', async () => {
    const ctx = makeContext({
      categoryConfig: {
        sourceHosts: [
          { host: 'rtings.com', tierName: 'lab', role: 'review', tier: 2 },
        ],
      },
    });

    const result = await bootstrapPhase.execute(ctx);
    const parse = pipelineContextAfterBootstrap.safeParse(toAfterBootstrapPayload(ctx, result));

    assert.equal(parse.success, true);
    assert.equal(result.categoryConfig.sourceHostMap.has('razer.com'), true);
    assert.equal(result.categoryConfig.approvedRootDomains.has('razer.com'), true);
    assert.deepEqual(result.variables, {
      brand: 'Razer',
      model: 'Viper V3',
      variant: 'Pro',
      category: 'mouse',
    });
    assert.deepEqual(result.identityLock, {
      brand: 'Razer',
      model: 'Viper V3',
      variant: 'Pro',
      productId: 'test-product',
    });
    assert.deepEqual(result.missingFields, ['weight', 'sensor_model', 'dpi']);
    assert.equal(result.categoryConfig.sourceHostMap.get('razer.com').tierName, 'manufacturer');
    assert.equal(result.categoryConfig.sourceHostMap.get('razer.com').baseUrl, 'https://razer.com');
  });

  it('returns loaded learning artifacts and merged lexicon hints without overwriting an existing host entry', async () => {
    const existingMap = new Map([['razer.com', { host: 'razer.com', tierName: 'existing' }]]);
    const storage = makeStorage({
      '_learning/mouse/field_lexicon.json': { fields: { sensor_model: { synonyms: { optical: { count: 1 } } } } },
      '_learning/mouse/query_templates.json': { templates: ['official specs'] },
      '_learning/mouse/field_yield.json': { sensor_model: 0.8 },
    });
    const ctx = makeContext({
      storage,
      categoryConfig: {
        sourceHosts: [],
        sourceHostMap: existingMap,
        approvedRootDomains: new Set(['razer.com']),
      },
      learningStoreHints: {
        anchorsByField: {
          sensor_model: [
            { phrase: 'optical sensor', decayStatus: 'active' },
            { phrase: 'old phrase', decayStatus: 'expired' },
          ],
        },
      },
    });

    const result = await bootstrapPhase.execute(ctx);
    const parse = pipelineContextAfterBootstrap.safeParse(toAfterBootstrapPayload(ctx, result));

    assert.equal(parse.success, true);
    assert.equal(result.categoryConfig.sourceHostMap.get('razer.com').tierName, 'existing');
    assert.deepEqual(result.learning, {
      lexicon: { fields: { sensor_model: { synonyms: { optical: { count: 1 } } } } },
      queryTemplates: { templates: ['official specs'] },
      fieldYield: { sensor_model: 0.8 },
    });
    assert.equal(result.enrichedLexicon.fields.sensor_model.synonyms.optical.count, 1);
    assert.equal(result.enrichedLexicon.fields.sensor_model.synonyms['optical sensor'].count, 3);
  });

  it('returns a schema-valid bootstrap payload without promoting a source host when no official domain is resolved', async () => {
    const ctx = makeContext({
      brandResolution: null,
      categoryConfig: { sourceHosts: [] },
      job: {
        brand: 'Razer',
        model: 'Viper V3',
        variant: '',
        requirements: { focus_fields: [] },
      },
      planningHints: {
        missingRequiredFields: [],
        missingCriticalFields: [],
      },
    });

    const result = await bootstrapPhase.execute(ctx);
    const parse = pipelineContextAfterBootstrap.safeParse(toAfterBootstrapPayload(ctx, result));

    assert.equal(parse.success, true);
    assert.deepEqual(result.categoryConfig.sourceHosts, []);
    assert.deepEqual(result.variables, {
      brand: 'Razer',
      model: 'Viper V3',
      variant: '',
      category: 'mouse',
    });
    assert.deepEqual(result.missingFields, []);
  });
});
