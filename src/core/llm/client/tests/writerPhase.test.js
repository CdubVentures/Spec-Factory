// WHY: Writer is a first-class global phase (not per-source-phase sub-keys).
// Any source phase with jsonStrict=false + jsonSchema triggers the global
// writer for Phase 2 (formatting). Writer has its own limits, its own
// reasoning toggle, and bills under phase='writer' (not source phase).

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistryLookup } from '../../routeResolver.js';
import { callLlmWithRouting } from '../routing.js';

function makeRegistry() {
  return [
    {
      id: 'prov-primary',
      name: 'Primary',
      type: 'openai-compatible',
      baseUrl: 'https://primary.test',
      apiKey: 'key-p',
      models: [{ id: 'mp', modelId: 'model-primary', role: 'primary' }],
    },
    {
      id: 'prov-fallback',
      name: 'Fallback',
      type: 'openai-compatible',
      baseUrl: 'https://fallback.test',
      apiKey: 'key-f',
      models: [{ id: 'mf', modelId: 'model-fallback', role: 'fallback' }],
    },
    {
      id: 'prov-writer',
      name: 'Writer',
      type: 'openai-compatible',
      baseUrl: 'https://writer.test',
      apiKey: 'key-w',
      models: [
        { id: 'mw', modelId: 'model-writer', role: 'primary' },
        { id: 'mwr', modelId: 'model-writer-reason', role: 'reasoning' },
      ],
    },
  ];
}

function baseConfig(phaseOverrides = {}) {
  const registry = makeRegistry();
  return {
    _registryLookup: buildRegistryLookup(registry),
    llmModelPlan: 'model-primary',
    llmPlanFallbackModel: 'model-fallback',
    llmMaxOutputTokensPlan: 1400,
    llmMaxOutputTokensTriage: 900,
    llmTimeoutMs: 30000,
    llmMaxTokens: 16384,
    llmReasoningBudget: 8192,

    ...phaseOverrides,
  };
}

// Fills every _resolved${Phase}* key that routing.js reads for a given phase id.
function phaseFlatKeys(phaseCapitalized, extras = {}) {
  const P = phaseCapitalized;
  return {
    [`_resolved${P}BaseModel`]: 'model-primary',
    [`_resolved${P}UseReasoning`]: false,
    [`_resolved${P}FallbackModel`]: 'model-fallback',
    [`_resolved${P}FallbackUseReasoning`]: false,
    [`_resolved${P}MaxOutputTokens`]: 1400,
    [`_resolved${P}TimeoutMs`]: 30000,
    [`_resolved${P}DisableLimits`]: false,
    [`_resolved${P}WebSearch`]: false,
    [`_resolved${P}Thinking`]: false,
    [`_resolved${P}ThinkingEffort`]: '',
    [`_resolved${P}FallbackWebSearch`]: false,
    [`_resolved${P}FallbackThinking`]: false,
    [`_resolved${P}FallbackThinkingEffort`]: '',
    [`_resolved${P}JsonStrict`]: false,
    ...extras,
  };
}

function installSuccessStub() {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    const hasSchema = Boolean(body.response_format);
    const content = hasSchema ? '{"ok":true}' : 'Findings: X';
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          choices: [{ message: { content } }],
          model: body.model,
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        });
      },
    };
  };
  return { calls, restore: () => { global.fetch = original; } };
}

const TEST_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
};

// ---------------------------------------------------------------------------
// 1. Global writer resolved for every source phase
// ---------------------------------------------------------------------------

describe('global writer — resolved from _resolvedWriter* regardless of source phase', () => {
  let stub;
  beforeEach(() => { stub?.restore?.(); stub = null; });

  const phases = [
    { id: 'needset', cap: 'Needset', role: 'plan', reason: 'needset_search_planner' },
    { id: 'searchPlanner', cap: 'SearchPlanner', role: 'plan', reason: 'planner' },
    { id: 'brandResolver', cap: 'BrandResolver', role: 'triage', reason: 'brand_resolution' },
    { id: 'serpSelector', cap: 'SerpSelector', role: 'triage', reason: 'serp_url_selector' },
    { id: 'colorFinder', cap: 'ColorFinder', role: 'triage', reason: 'color_finder' },
    { id: 'imageFinder', cap: 'ImageFinder', role: 'triage', reason: 'image_finder' },
    { id: 'imageEvaluator', cap: 'ImageEvaluator', role: 'triage', reason: 'image_evaluator' },
    { id: 'releaseDateFinder', cap: 'ReleaseDateFinder', role: 'triage', reason: 'release_date_finder' },
  ];

  for (const { id, cap, role, reason } of phases) {
    it(`${id} with jsonStrict=false routes Phase 2 to global writer`, async () => {
      stub = installSuccessStub();
      try {
        const config = baseConfig({
          ...phaseFlatKeys(cap),
          _resolvedWriterBaseModel: 'model-writer',
          _resolvedWriterUseReasoning: false,
          _resolvedWriterMaxOutputTokens: 1400,
          _resolvedWriterTimeoutMs: 30000,
          _resolvedWriterDisableLimits: false,
          _resolvedWriterThinking: false,
          _resolvedWriterThinkingEffort: '',
        });
        await callLlmWithRouting({
          config, phase: id, reason, role,
          system: 'do thing', user: 'input',
          jsonSchema: TEST_SCHEMA,
        });
        assert.equal(stub.calls.length, 2, 'two-phase: research + writer');
        assert.ok(stub.calls[0].url.includes('primary.test'), 'research uses primary');
        assert.ok(stub.calls[1].url.includes('writer.test'),
          `${id} writer call must go to global writer URL`);
        assert.equal(stub.calls[1].body.model, 'model-writer',
          `${id} writer call must use global writer model`);
      } finally { stub.restore(); }
    });
  }
});

// ---------------------------------------------------------------------------
// 2. No writer configured → Phase 2 falls back to primary (preserves today)
// ---------------------------------------------------------------------------

describe('global writer — empty config falls back to primary for Phase 2', () => {
  let stub;
  beforeEach(() => { stub?.restore?.(); stub = null; });

  it('empty _resolvedWriterBaseModel → Phase 2 uses primary', async () => {
    stub = installSuccessStub();
    try {
      const config = baseConfig({
        ...phaseFlatKeys('Needset'),
        _resolvedWriterBaseModel: '',
        _resolvedWriterUseReasoning: false,
      });
      await callLlmWithRouting({
        config, phase: 'needset', reason: 'needset_search_planner', role: 'plan',
        system: 's', user: 'u',
        jsonSchema: TEST_SCHEMA,
      });
      assert.equal(stub.calls.length, 2);
      assert.ok(stub.calls[0].url.includes('primary.test'));
      assert.ok(stub.calls[1].url.includes('primary.test'),
        'writer falls back to primary when no writer model configured');
    } finally { stub.restore(); }
  });
});

// ---------------------------------------------------------------------------
// 3. Billing: writer usageContext.phase='writer' + source_phase breadcrumb
// ---------------------------------------------------------------------------

describe('global writer — billing attribution', () => {
  let stub;
  beforeEach(() => { stub?.restore?.(); stub = null; });

  it('writer call usageContext.phase === "writer" and source_phase === source', async () => {
    const original = global.fetch;
    const usageContextLog = [];
    global.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      const hasSchema = Boolean(body.response_format);
      usageContextLog.push({ hasSchema, url });
      const content = hasSchema ? '{"ok":true}' : 'Findings: X';
      return {
        ok: true, status: 200,
        async text() {
          return JSON.stringify({
            choices: [{ message: { content } }],
            model: body.model,
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          });
        },
      };
    };
    const onUsageCalls = [];
    try {
      const config = baseConfig({
        ...phaseFlatKeys('ColorFinder'),
        _resolvedWriterBaseModel: 'model-writer',
        _resolvedWriterUseReasoning: false,
      });
      await callLlmWithRouting({
        config, phase: 'colorFinder', reason: 'color_finder', role: 'triage',
        system: 's', user: 'u',
        jsonSchema: TEST_SCHEMA,
        onUsage: (ctx) => onUsageCalls.push(ctx),
      });
      assert.equal(onUsageCalls.length, 2, 'onUsage fires once per phase call');
      const [research, writer] = onUsageCalls;
      assert.equal(research.phase ?? null, null,
        'research call uses source-phase semantics (no explicit writer phase bucket)');
      assert.equal(research.reason, 'color_finder',
        'research call preserves source-phase reason for billing');
      assert.equal(writer.phase, 'writer', 'writer call must bill under phase=writer');
      assert.equal(writer.source_phase, 'colorFinder', 'source_phase breadcrumb preserved');
      assert.equal(writer.writer_phase, true);
      assert.equal(writer.reason, 'writer_formatting',
        'writer Phase-2 must emit its own billing reason, not inherit source-phase reason');
    } finally { global.fetch = original; }
  });
});

// ---------------------------------------------------------------------------
// 4. Writer-owned maxOutputTokens (distinct from source phase)
// ---------------------------------------------------------------------------

describe('global writer — limits are writer-owned, not source-phase-inherited', () => {
  let stub;
  beforeEach(() => { stub?.restore?.(); stub = null; });

  it('writer max_tokens uses _resolvedWriterMaxOutputTokens, not source phase cap', async () => {
    stub = installSuccessStub();
    try {
      const config = baseConfig({
        ...phaseFlatKeys('ColorFinder', { _resolvedColorFinderMaxOutputTokens: 999 }),
        _resolvedWriterBaseModel: 'model-writer',
        _resolvedWriterMaxOutputTokens: 4096,
        _resolvedWriterUseReasoning: false,
      });
      await callLlmWithRouting({
        config, phase: 'colorFinder', reason: 'color_finder', role: 'triage',
        system: 's', user: 'u',
        jsonSchema: TEST_SCHEMA,
      });
      assert.equal(stub.calls.length, 2);
      assert.equal(stub.calls[1].body.max_tokens, 4096,
        'writer body must carry writer maxOutputTokens, NOT source phase cap');
    } finally { stub.restore(); }
  });

  it('writer disableLimits=true → writer body omits max_tokens even when source phase disableLimits=false', async () => {
    stub = installSuccessStub();
    try {
      const config = baseConfig({
        ...phaseFlatKeys('ColorFinder'),
        _resolvedColorFinderDisableLimits: false,
        _resolvedColorFinderMaxOutputTokens: 999,
        _resolvedWriterBaseModel: 'model-writer',
        _resolvedWriterUseReasoning: false,
        _resolvedWriterDisableLimits: true,
        _resolvedWriterMaxOutputTokens: 4096,
      });
      await callLlmWithRouting({
        config, phase: 'colorFinder', reason: 'color_finder', role: 'triage',
        system: 's', user: 'u',
        jsonSchema: TEST_SCHEMA,
      });
      assert.equal(stub.calls.length, 2);
      assert.equal(stub.calls[1].body.max_tokens, undefined,
        'writer body must omit max_tokens when writer disableLimits=true');
    } finally { stub.restore(); }
  });
});

// ---------------------------------------------------------------------------
// 5. Writer reasoning-mode swap
// ---------------------------------------------------------------------------

describe('global writer — reasoning mode switches model', () => {
  let stub;
  beforeEach(() => { stub?.restore?.(); stub = null; });

  it('_resolvedWriterUseReasoning=true → writer uses _resolvedWriterReasoningModel', async () => {
    stub = installSuccessStub();
    try {
      const config = baseConfig({
        ...phaseFlatKeys('Needset'),
        _resolvedWriterBaseModel: 'model-writer',
        _resolvedWriterReasoningModel: 'model-writer-reason',
        _resolvedWriterUseReasoning: true,
      });
      await callLlmWithRouting({
        config, phase: 'needset', reason: 'needset_search_planner', role: 'plan',
        system: 's', user: 'u',
        jsonSchema: TEST_SCHEMA,
      });
      assert.equal(stub.calls.length, 2);
      assert.equal(stub.calls[1].body.model, 'model-writer-reason',
        'writer uses reasoning model when _resolvedWriterUseReasoning=true');
    } finally { stub.restore(); }
  });
});

// ---------------------------------------------------------------------------
// 6. Research fallback still feeds writer (preserves today's behavior)
// ---------------------------------------------------------------------------

describe('global writer — research fallback → writer chain', () => {
  it('primary research fails → fallback research runs → writer formats', async () => {
    const original = global.fetch;
    const calls = [];
    let count = 0;
    global.fetch = async (url, opts) => {
      count++;
      const body = JSON.parse(opts.body);
      calls.push({ url, body });
      if (count === 1) {
        // Primary research fails
        return { ok: false, status: 500, async text() { return 'err'; } };
      }
      if (count === 2) {
        // Fallback research succeeds (no schema)
        return {
          ok: true, status: 200,
          async text() {
            return JSON.stringify({
              choices: [{ message: { content: 'Findings: fallback' } }],
              model: body.model,
              usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            });
          },
        };
      }
      // Writer call with schema
      return {
        ok: true, status: 200,
        async text() {
          return JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
            model: body.model,
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          });
        },
      };
    };
    try {
      const config = baseConfig({
        ...phaseFlatKeys('Needset'),
        _resolvedWriterBaseModel: 'model-writer',
        _resolvedWriterUseReasoning: false,
      });
      const result = await callLlmWithRouting({
        config, phase: 'needset', reason: 'needset_search_planner', role: 'plan',
        system: 's', user: 'u',
        jsonSchema: TEST_SCHEMA,
      });
      assert.equal(count, 3, 'primary research → fallback research → writer');
      assert.equal(calls[0].body.response_format, undefined, 'primary research has no schema');
      assert.equal(calls[1].body.response_format, undefined, 'fallback research has no schema');
      assert.ok(calls[2].body.response_format, 'writer call has schema');
      assert.ok(calls[2].url.includes('writer.test'), 'writer uses global writer route');
      assert.deepEqual(result, { ok: true });
    } finally { global.fetch = original; }
  });
});
