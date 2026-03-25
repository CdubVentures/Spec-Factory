// WHY: Characterization test — locks down buildIndexingRunStartPayload behavior
// before refactoring the 5 sub-builders into a single registry-driven overlay.

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { buildIndexingRunStartPayload } from '../indexingRunStartPayload.ts';
import { deriveIndexingRunStartParsedValues } from '../indexingRunStartParsedValues.ts';
import { RUNTIME_SETTINGS_REGISTRY } from '../../../../shared/registryDerivedSettingsMaps.ts';

/* ------------------------------------------------------------------ */
/*  Factory                                                             */
/* ------------------------------------------------------------------ */

function buildRegistryDefaults(): {
  settings: Record<string, string | number | boolean>;
  baseline: Record<string, number>;
} {
  const settings: Record<string, string | number | boolean> = {};
  const baseline: Record<string, number> = {};
  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    settings[entry.key] = entry.default as string | number | boolean;
    if ((entry.type === 'int' || entry.type === 'float') && typeof entry.default === 'number') {
      baseline[entry.key] = entry.default;
    }
  }
  return { settings, baseline };
}

interface MakeInputOverrides {
  requestedRunId?: string;
  category?: string;
  productId?: string;
  settingsOverrides?: Record<string, string | number | boolean>;
  parsedOverrides?: Record<string, number>;
  runControlPayload?: Record<string, unknown>;
  llmPolicy?: Record<string, unknown>;
}

function makeInput(overrides: MakeInputOverrides = {}) {
  const { settings, baseline } = buildRegistryDefaults();
  const runtimeSettingsPayload = { ...settings, ...overrides.settingsOverrides };
  const parsedValues = deriveIndexingRunStartParsedValues({
    runtimeSettingsPayload,
    runtimeSettingsBaseline: baseline as never,
  });
  if (overrides.parsedOverrides) Object.assign(parsedValues, overrides.parsedOverrides);
  return {
    requestedRunId: overrides.requestedRunId ?? 'run-1',
    category: overrides.category ?? 'test-cat',
    productId: overrides.productId ?? 'prod-1',
    runtimeSettingsPayload,
    parsedValues,
    runControlPayload: (overrides.runControlPayload ?? {}) as Record<string, string | number | boolean>,
    llmPolicy: overrides.llmPolicy,
  };
}

/* ------------------------------------------------------------------ */
/*  Hardcoded constants                                                 */
/* ------------------------------------------------------------------ */

describe('buildIndexingRunStartPayload — hardcoded constants', () => {
  it('mode is indexlab', () => {
    strictEqual(buildIndexingRunStartPayload(makeInput()).mode, 'indexlab');
  });

  it('replaceRunning is true', () => {
    strictEqual(buildIndexingRunStartPayload(makeInput()).replaceRunning, true);
  });

  it('profile is standard', () => {
    strictEqual(buildIndexingRunStartPayload(makeInput()).profile, 'standard');
  });

  it('runProfile is standard', () => {
    strictEqual(buildIndexingRunStartPayload(makeInput()).runProfile, 'standard');
  });

  it('discoveryEnabled is true', () => {
    strictEqual(buildIndexingRunStartPayload(makeInput()).discoveryEnabled, true);
  });
});

/* ------------------------------------------------------------------ */
/*  Input param forwarding                                              */
/* ------------------------------------------------------------------ */

describe('buildIndexingRunStartPayload — input params', () => {
  it('trims requestedRunId', () => {
    const result = buildIndexingRunStartPayload(makeInput({ requestedRunId: '  run-123  ' }));
    strictEqual(result.requestedRunId, 'run-123');
  });

  it('passes category through', () => {
    const result = buildIndexingRunStartPayload(makeInput({ category: 'shoes' }));
    strictEqual(result.category, 'shoes');
  });

  it('passes productId through', () => {
    const result = buildIndexingRunStartPayload(makeInput({ productId: 'prod-456' }));
    strictEqual(result.productId, 'prod-456');
  });
});

/* ------------------------------------------------------------------ */
/*  Boolean / string spread from runtimeSettingsPayload                 */
/* ------------------------------------------------------------------ */

describe('buildIndexingRunStartPayload — spread', () => {
  it('includes boolean settings from payload', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      settingsOverrides: { crawleeHeadless: false },
    }));
    strictEqual(result.crawleeHeadless, false);
  });

  it('includes string settings from payload', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      settingsOverrides: { runtimeControlFile: '/tmp/overrides.json' },
    }));
    strictEqual(result.runtimeControlFile, '/tmp/overrides.json');
  });

  it('includes numeric settings from payload', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      settingsOverrides: { maxPagesPerDomain: 25 },
    }));
    strictEqual(result.maxPagesPerDomain, 25);
  });
});

/* ------------------------------------------------------------------ */
/*  Numeric clamping — runtime builder fields                           */
/* ------------------------------------------------------------------ */

describe('buildIndexingRunStartPayload — numeric clamping', () => {
  it('clamps crawleeRequestHandlerTimeoutSecs to registry min', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedCrawleeRequestHandlerTimeoutSecs: 0 },
    }));
    // Registry min is 10; 0 should be clamped up
    ok(result.crawleeRequestHandlerTimeoutSecs >= 10);
  });
});

/* ------------------------------------------------------------------ */
/*  Numeric clamping — llm settings builder fields                      */
/* ------------------------------------------------------------------ */

describe('buildIndexingRunStartPayload — llm clamping', () => {
  it('clamps llmTimeoutMs to min 1000', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedLlmTimeoutMs: 500 },
    }));
    strictEqual(result.llmTimeoutMs, 1000);
  });


  it('clamps llmMaxOutputTokens to LLM_SETTING_LIMITS floor (256), not registry min (128)', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedLlmMaxOutputTokens: 100 },
    }));
    strictEqual(result.llmMaxOutputTokens, 256);
  });

  it('clamps llmMaxTokens to min 256', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedLlmMaxTokens: 100 },
    }));
    strictEqual(result.llmMaxTokens, 256);
  });
});

/* ------------------------------------------------------------------ */
/*  Numeric clamping — main body fields                                 */
/* ------------------------------------------------------------------ */

// WHY: robotsTxtTimeoutMs and frontierBackoffMaxExponent removed from registry — no longer clamped.

/* ------------------------------------------------------------------ */
/*  Merge overlays                                                      */
/* ------------------------------------------------------------------ */

describe('buildIndexingRunStartPayload — merge overlays', () => {
  it('merges runControlPayload', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      runControlPayload: { customControl: 'value' },
    }));
    strictEqual(result.customControl, 'value');
  });

  it('merges llmPolicy when provided', () => {
    const policy = { models: { plan: 'gpt-4o' } };
    const result = buildIndexingRunStartPayload(makeInput({ llmPolicy: policy }));
    deepStrictEqual(result.llmPolicy, policy);
  });

  it('omits llmPolicy when undefined', () => {
    const result = buildIndexingRunStartPayload(makeInput());
    ok(!('llmPolicy' in result) || result.llmPolicy === undefined);
  });
});
