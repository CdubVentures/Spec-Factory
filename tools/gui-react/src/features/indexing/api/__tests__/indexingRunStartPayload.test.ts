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
      settingsOverrides: { dynamicCrawleeEnabled: false },
    }));
    strictEqual(result.dynamicCrawleeEnabled, false);
  });

  it('includes string settings from payload', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      settingsOverrides: { frontierDbPath: '/tmp/test.db' },
    }));
    strictEqual(result.frontierDbPath, '/tmp/test.db');
  });

  it('includes numeric settings from payload', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      settingsOverrides: { runtimeScreencastFps: 30 },
    }));
    // Spread has 30, overlay has parsed value (also 30). Either way: 30.
    strictEqual(result.runtimeScreencastFps, 30);
  });
});

/* ------------------------------------------------------------------ */
/*  Numeric clamping — runtime builder fields                           */
/* ------------------------------------------------------------------ */

describe('buildIndexingRunStartPayload — numeric clamping', () => {
  it('clamps runtimeScreencastFps to min 1', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedRuntimeScreencastFps: 0 },
    }));
    strictEqual(result.runtimeScreencastFps, 1);
  });

  it('clamps runtimeScreencastQuality to min 10', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedRuntimeScreencastQuality: 5 },
    }));
    strictEqual(result.runtimeScreencastQuality, 10);
  });

  it('clamps runtimeScreencastMaxWidth to min 320', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedRuntimeScreencastMaxWidth: 100 },
    }));
    strictEqual(result.runtimeScreencastMaxWidth, 320);
  });

  it('clamps runtimeScreencastMaxHeight to min 240', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedRuntimeScreencastMaxHeight: 50 },
    }));
    strictEqual(result.runtimeScreencastMaxHeight, 240);
  });

  it('clamps daemonConcurrency to min 1', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedDaemonConcurrency: 0 },
    }));
    strictEqual(result.daemonConcurrency, 1);
  });

  // WHY: Registry has no min for this entry (defaultsOnly: true, default: 30000).
  // Old sub-builder had a stale Math.max(1000, ...) floor not backed by registry SSOT.
  // Generic overlay respects registry: no min → no clamping.
  it('passes daemonGracefulShutdownTimeoutMs through (no registry min)', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedDaemonGracefulShutdownTimeoutMs: 200 },
    }));
    strictEqual(result.daemonGracefulShutdownTimeoutMs, 200);
  });

  it('clamps importsPollSeconds to min 1', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedImportsPollSeconds: 0 },
    }));
    strictEqual(result.importsPollSeconds, 1);
  });

  it('clamps runtimeTraceFetchRing to min 10', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedRuntimeTraceFetchRing: 3 },
    }));
    strictEqual(result.runtimeTraceFetchRing, 10);
  });
});

/* ------------------------------------------------------------------ */
/*  Numeric clamping — llm settings builder fields                      */
/* ------------------------------------------------------------------ */

describe('buildIndexingRunStartPayload — llm clamping', () => {
  it('clamps llmMaxCallsPerRound to min 1', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedLlmMaxCallsPerRound: 0 },
    }));
    strictEqual(result.llmMaxCallsPerRound, 1);
  });

  it('clamps llmTimeoutMs to min 1000', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedLlmTimeoutMs: 500 },
    }));
    strictEqual(result.llmTimeoutMs, 1000);
  });

  it('clamps endpointNetworkScanLimit to min 50', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedEndpointNetworkScanLimit: 10 },
    }));
    strictEqual(result.endpointNetworkScanLimit, 50);
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

describe('buildIndexingRunStartPayload — main body clamping', () => {
  it('clamps fetchPerHostConcurrencyCap to min 1', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedFetchPerHostConcurrencyCap: 0 },
    }));
    strictEqual(result.fetchPerHostConcurrencyCap, 1);
  });

  it('clamps robotsTxtTimeoutMs to min 100', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedRobotsTxtTimeoutMs: 10 },
    }));
    strictEqual(result.robotsTxtTimeoutMs, 100);
  });

  it('clamps frontierBackoffMaxExponent to min 1', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedFrontierBackoffMaxExponent: 0 },
    }));
    strictEqual(result.frontierBackoffMaxExponent, 1);
  });

  it('clamps driftPollSeconds to min 60', () => {
    const result = buildIndexingRunStartPayload(makeInput({
      parsedOverrides: { parsedDriftPollSeconds: 10 },
    }));
    strictEqual(result.driftPollSeconds, 60);
  });
});

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
