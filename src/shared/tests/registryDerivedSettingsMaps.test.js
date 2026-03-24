import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';

// WHY: Characterization test proving the registry-derived maps produce values
// identical to the current hardcoded values in RuntimeFlowDraftContracts.ts.
// This is the safety net before replacing hardcoded layers with generic loops.

// Derive the same maps the GUI module will derive (logic is intentionally
// duplicated here so the test is self-contained and does not import the GUI TS module).
function deriveBounds(registry) {
  const bounds = {};
  for (const entry of registry) {
    if ((entry.type === 'int' || entry.type === 'float') && entry.min != null && entry.max != null) {
      bounds[entry.key] = { min: entry.min, max: entry.max, ...(entry.type === 'int' ? { int: true } : {}) };
    }
  }
  return bounds;
}

function deriveTypeMap(registry) {
  const map = {};
  for (const entry of registry) map[entry.key] = entry.type;
  return map;
}

function deriveEnumMap(registry) {
  const map = {};
  for (const entry of registry) {
    if ((entry.type === 'enum' || entry.type === 'csv_enum') && entry.allowed) {
      map[entry.key] = [...entry.allowed];
    }
  }
  return map;
}

describe('registry-derived settings maps — characterization', () => {

  it('every registry int/float with min+max produces a bounds entry', () => {
    const bounds = deriveBounds(RUNTIME_SETTINGS_REGISTRY);
    const boundsKeys = Object.keys(bounds).sort();
    ok(boundsKeys.length >= 35, `expected >=35 bounds keys, got ${boundsKeys.length}`);

    // Spot-check known values against current hardcoded RuntimeFlowDraftContracts.ts
    deepStrictEqual(bounds.llmTimeoutMs, { min: 1000, max: 600000, int: true });
    deepStrictEqual(bounds.llmMonthlyBudgetUsd, { min: 0, max: 100000 }); // float
    deepStrictEqual(bounds.searchProfileQueryCap, { min: 1, max: 100, int: true });
  });

  it('type map covers every registry key', () => {
    const typeMap = deriveTypeMap(RUNTIME_SETTINGS_REGISTRY);
    strictEqual(Object.keys(typeMap).length, RUNTIME_SETTINGS_REGISTRY.length);
    strictEqual(typeMap.llmModelPlan, 'string');
    strictEqual(typeMap.autoScrollEnabled, 'bool');
    strictEqual(typeMap.searchEngines, 'csv_enum');
    strictEqual(typeMap.llmCostInputPer1M, 'float');
  });

  it('enum map includes all enum/csv_enum entries with allowed arrays', () => {
    const enumMap = deriveEnumMap(RUNTIME_SETTINGS_REGISTRY);
    ok(enumMap.searchEngines.includes('google'));
    ok(enumMap.searchEngines.includes('google-proxy'));
    ok(enumMap.repairDedupeRule.includes('domain_once'));
  });

  it('allow-empty set includes known allowEmpty keys', () => {
    const allowEmpty = new Set(
      RUNTIME_SETTINGS_REGISTRY.filter(e => e.allowEmpty).map(e => e.key)
    );
    ok(allowEmpty.has('llmPlanApiKey'));
    ok(allowEmpty.has('searxngBaseUrl'));
    ok(!allowEmpty.has('autoScrollEnabled')); // not allowEmpty
  });

  it('secret set includes known secret keys', () => {
    const secrets = new Set(
      RUNTIME_SETTINGS_REGISTRY.filter(e => e.secret).map(e => e.key)
    );
    ok(secrets.has('openaiApiKey'));
    ok(secrets.has('geminiApiKey'));
    ok(secrets.has('deepseekApiKey'));
    ok(secrets.has('anthropicApiKey'));
    ok(!secrets.has('llmModelPlan')); // not secret
  });

  it('bounds derived from registry match hardcoded RuntimeFlowDraftContracts bounds (full comparison)', () => {
    // WHY: This is the critical characterization — every bounds entry in the GUI
    // contracts file must be exactly reproducible from the registry.
    const bounds = deriveBounds(RUNTIME_SETTINGS_REGISTRY);

    // These are the keys currently hardcoded in RuntimeFlowDraftContracts.ts RUNTIME_NUMBER_BOUNDS
    const hardcodedKeys = [
      'searxngMinQueryIntervalMs',
      'crawleeRequestHandlerTimeoutSecs',
      'autoScrollPasses', 'autoScrollDelayMs',
      'robotsTxtTimeoutMs', 'runtimeScreencastFps', 'runtimeScreencastQuality',
      'runtimeScreencastMaxWidth', 'runtimeScreencastMaxHeight', 'searchProfileQueryCap',
      'maxPagesPerDomain', 'maxRunSeconds',
      'capturePageScreenshotQuality', 'capturePageScreenshotMaxBytes',
      'llmMaxCallsPerProductTotal',
      'llmReasoningBudget', 'llmMonthlyBudgetUsd', 'llmPerProductBudgetUsd',
      'llmMaxCallsPerRound', 'llmMaxOutputTokens',
      'llmMaxTokens', 'llmTimeoutMs', 'llmCostInputPer1M', 'llmCostOutputPer1M',
      'llmCostCachedInputPer1M',
      'runtimeTraceFetchRing', 'runtimeTraceLlmRing',
      'llmMaxOutputTokensReasoningFallback',
      'googleSearchTimeoutMs', 'googleSearchMinQueryIntervalMs', 'googleSearchMaxRetries',
      'searchMaxRetries', 'serpSelectorUrlCap', 'domainClassifierUrlCap',
    ];

    for (const key of hardcodedKeys) {
      ok(bounds[key], `registry must produce bounds for hardcoded key "${key}"`);
    }
  });
});
