import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import {
  PHASE_OVERRIDE_REGISTRY,
  uiPhaseIdToOverrideKey,
  type PhaseOverrideRegistryEntry,
} from '../llmPhaseOverridesBridge.generated.ts';
import { resolvePhaseModel } from '../llmPhaseOverridesBridge.generated.ts';

describe('PHASE_OVERRIDE_REGISTRY', () => {
  it('has exactly 11 entries', () => {
    strictEqual(PHASE_OVERRIDE_REGISTRY.length, 11);
  });

  it('every entry has uiPhaseId, overrideKey, and globalModel', () => {
    for (const entry of PHASE_OVERRIDE_REGISTRY) {
      ok(entry.uiPhaseId, 'missing uiPhaseId');
      ok(entry.overrideKey, 'missing overrideKey');
      ok(entry.globalModel, 'missing globalModel');
      ok(entry.groupToggle, 'missing groupToggle');
      ok(entry.globalTokens, 'missing globalTokens');
    }
  });

  it('maps the expected UI phase IDs', () => {
    const ids = PHASE_OVERRIDE_REGISTRY.map((e) => e.uiPhaseId).sort();
    deepStrictEqual(ids, [
      'brand-resolver',
      'color-finder',
      'image-evaluator',
      'image-finder',
      'key-finder',
      'needset',
      'release-date-finder',
      'search-planner',
      'serp-selector',
      'sku-finder',
      'validate',
    ]);
  });
});

describe('uiPhaseIdToOverrideKey', () => {
  it('returns override key for needset', () => {
    strictEqual(uiPhaseIdToOverrideKey('needset'), 'needset');
  });

  it('returns override key for brand-resolver', () => {
    strictEqual(uiPhaseIdToOverrideKey('brand-resolver'), 'brandResolver');
  });

  it('returns override key for search-planner', () => {
    strictEqual(uiPhaseIdToOverrideKey('search-planner'), 'searchPlanner');
  });

  it('returns override key for serp-selector', () => {
    strictEqual(uiPhaseIdToOverrideKey('serp-selector'), 'serpSelector');
  });

  it('returns undefined for global', () => {
    strictEqual(uiPhaseIdToOverrideKey('global'), undefined);
  });

  it('returns override key for validate', () => {
    strictEqual(uiPhaseIdToOverrideKey('validate'), 'validate');
  });
});

describe('resolvePhaseModel — webSearch defaults', () => {
  const globalDraft = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelReasoning: 'deepseek-reasoner',
    llmPlanFallbackModel: 'deepseek-chat',
    llmReasoningFallbackModel: 'gemini-2.5-pro',
    llmPlanUseReasoning: false,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensTriage: 20000,
    llmTimeoutMs: 30000,
    llmMaxTokens: 16384,
    llmReasoningBudget: 32768,
  };

  it('webSearch defaults to false when no override set', () => {
    const result = resolvePhaseModel({}, 'needset', globalDraft);
    strictEqual(result?.webSearch, false);
  });

  it('webSearch resolves to true when phase override is set', () => {
    const overrides = { needset: { webSearch: true } };
    const result = resolvePhaseModel(overrides, 'needset', globalDraft);
    strictEqual(result?.webSearch, true);
  });

  it('webSearch is independent per phase', () => {
    const overrides = {
      needset: { webSearch: true },
      brandResolver: { webSearch: false },
    };
    const needset = resolvePhaseModel(overrides, 'needset', globalDraft);
    const brand = resolvePhaseModel(overrides, 'brandResolver', globalDraft);
    strictEqual(needset?.webSearch, true);
    strictEqual(brand?.webSearch, false);
  });
});

describe('resolvePhaseModel — thinking defaults', () => {
  const globalDraft = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelReasoning: 'deepseek-reasoner',
    llmPlanFallbackModel: 'deepseek-chat',
    llmReasoningFallbackModel: 'gemini-2.5-pro',
    llmPlanUseReasoning: false,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensTriage: 20000,
    llmTimeoutMs: 30000,
    llmMaxTokens: 16384,
    llmReasoningBudget: 32768,
  };

  it('thinking defaults to false when no override set', () => {
    const result = resolvePhaseModel({}, 'needset', globalDraft);
    strictEqual(result?.thinking, false);
  });

  it('thinking resolves to true when phase override is set', () => {
    const overrides = { needset: { thinking: true } };
    const result = resolvePhaseModel(overrides, 'needset', globalDraft);
    strictEqual(result?.thinking, true);
  });

  it('thinking is independent per phase', () => {
    const overrides = {
      needset: { thinking: true },
      brandResolver: { thinking: false },
    };
    const needset = resolvePhaseModel(overrides, 'needset', globalDraft);
    const brand = resolvePhaseModel(overrides, 'brandResolver', globalDraft);
    strictEqual(needset?.thinking, true);
    strictEqual(brand?.thinking, false);
  });
});

describe('resolvePhaseModel — thinkingEffort defaults', () => {
  const globalDraft = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelReasoning: 'deepseek-reasoner',
    llmPlanFallbackModel: 'deepseek-chat',
    llmReasoningFallbackModel: 'gemini-2.5-pro',
    llmPlanUseReasoning: false,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensTriage: 20000,
    llmTimeoutMs: 30000,
    llmMaxTokens: 16384,
    llmReasoningBudget: 32768,
  };

  it('thinkingEffort defaults to empty string when no override set', () => {
    const result = resolvePhaseModel({}, 'needset', globalDraft);
    strictEqual(result?.thinkingEffort, '');
  });

  it('thinkingEffort resolves to value when phase override is set', () => {
    const overrides = { needset: { thinkingEffort: 'high' } };
    const result = resolvePhaseModel(overrides, 'needset', globalDraft);
    strictEqual(result?.thinkingEffort, 'high');
  });

  it('thinkingEffort is independent per phase', () => {
    const overrides = {
      needset: { thinkingEffort: 'xhigh' },
      brandResolver: { thinkingEffort: 'low' },
    };
    const needset = resolvePhaseModel(overrides, 'needset', globalDraft);
    const brand = resolvePhaseModel(overrides, 'brandResolver', globalDraft);
    strictEqual(needset?.thinkingEffort, 'xhigh');
    strictEqual(brand?.thinkingEffort, 'low');
  });
});

describe('resolvePhaseModel — fallback panel defaults', () => {
  const globalDraft = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelReasoning: 'deepseek-reasoner',
    llmPlanFallbackModel: 'deepseek-chat',
    llmReasoningFallbackModel: 'gemini-2.5-pro',
    llmPlanUseReasoning: false,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensTriage: 20000,
    llmTimeoutMs: 30000,
    llmMaxTokens: 16384,
    llmReasoningBudget: 32768,
  };

  it('fallbackModel defaults to global llmPlanFallbackModel', () => {
    const result = resolvePhaseModel({}, 'needset', globalDraft);
    strictEqual(result?.fallbackModel, 'deepseek-chat');
  });

  it('fallbackReasoningModel defaults to global llmReasoningFallbackModel', () => {
    const result = resolvePhaseModel({}, 'needset', globalDraft);
    strictEqual(result?.fallbackReasoningModel, 'gemini-2.5-pro');
  });

  it('fallbackUseReasoning defaults to false', () => {
    const result = resolvePhaseModel({}, 'needset', globalDraft);
    strictEqual(result?.fallbackUseReasoning, false);
  });

  it('fallbackThinking, fallbackThinkingEffort, fallbackWebSearch default correctly', () => {
    const result = resolvePhaseModel({}, 'needset', globalDraft);
    strictEqual(result?.fallbackThinking, false);
    strictEqual(result?.fallbackThinkingEffort, '');
    strictEqual(result?.fallbackWebSearch, false);
  });

  it('fallbackModel resolves to override when set', () => {
    const overrides = { needset: { fallbackModel: 'custom-fb' } };
    const result = resolvePhaseModel(overrides, 'needset', globalDraft);
    strictEqual(result?.fallbackModel, 'custom-fb');
  });

  it('effectiveFallbackModel uses fallbackModel when fallbackUseReasoning is false', () => {
    const result = resolvePhaseModel({}, 'needset', globalDraft);
    strictEqual(result?.effectiveFallbackModel, 'deepseek-chat');
  });

  it('effectiveFallbackModel uses fallbackReasoningModel when fallbackUseReasoning is true', () => {
    const overrides = { needset: { fallbackUseReasoning: true } };
    const result = resolvePhaseModel(overrides, 'needset', globalDraft);
    strictEqual(result?.effectiveFallbackModel, 'gemini-2.5-pro');
  });

  it('fallback fields are independent per phase', () => {
    const overrides = {
      needset: { fallbackModel: 'needset-fb', fallbackWebSearch: true },
      brandResolver: { fallbackModel: 'brand-fb' },
    };
    const needset = resolvePhaseModel(overrides, 'needset', globalDraft);
    const brand = resolvePhaseModel(overrides, 'brandResolver', globalDraft);
    strictEqual(needset?.fallbackModel, 'needset-fb');
    strictEqual(needset?.fallbackWebSearch, true);
    strictEqual(brand?.fallbackModel, 'brand-fb');
    strictEqual(brand?.fallbackWebSearch, false);
  });
});

describe('resolvePhaseModel — disableLimits defaults', () => {
  const globalDraft = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelReasoning: 'deepseek-reasoner',
    llmPlanFallbackModel: 'deepseek-chat',
    llmReasoningFallbackModel: 'gemini-2.5-pro',
    llmPlanUseReasoning: false,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensTriage: 20000,
    llmTimeoutMs: 30000,
    llmMaxTokens: 16384,
    llmReasoningBudget: 32768,
  };

  it('disableLimits defaults to false when no override set', () => {
    const result = resolvePhaseModel({}, 'needset', globalDraft);
    strictEqual(result?.disableLimits, false);
  });

  it('disableLimits resolves to true when set', () => {
    const overrides = { needset: { disableLimits: true } };
    const result = resolvePhaseModel(overrides, 'needset', globalDraft);
    strictEqual(result?.disableLimits, true);
  });
});

describe('resolvePhaseModel — reasoningBudget defaults', () => {
  const globalDraft = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelReasoning: 'deepseek-reasoner',
    llmPlanFallbackModel: 'deepseek-chat',
    llmReasoningFallbackModel: 'gemini-2.5-pro',
    llmPlanUseReasoning: false,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensTriage: 20000,
    llmTimeoutMs: 30000,
    llmMaxTokens: 16384,
    llmReasoningBudget: 32768,
  };

  it('reasoningBudget defaults to global llmReasoningBudget when no override set', () => {
    const result = resolvePhaseModel({}, 'needset', globalDraft);
    strictEqual(result?.reasoningBudget, 32768);
  });

  it('reasoningBudget resolves to override value when phase override is set', () => {
    const overrides = { needset: { reasoningBudget: 8192 } };
    const result = resolvePhaseModel(overrides, 'needset', globalDraft);
    strictEqual(result?.reasoningBudget, 8192);
  });

  it('reasoningBudget is independent per phase', () => {
    const overrides = {
      needset: { reasoningBudget: 8192 },
      brandResolver: { reasoningBudget: 2048 },
    };
    const needset = resolvePhaseModel(overrides, 'needset', globalDraft);
    const brand = resolvePhaseModel(overrides, 'brandResolver', globalDraft);
    strictEqual(needset?.reasoningBudget, 8192);
    strictEqual(brand?.reasoningBudget, 2048);
  });
});

describe('resolvePhaseModel with unmapped phase', () => {
  it('returns null for unmapped phase', () => {
    const result = resolvePhaseModel({}, 'nonexistent' as never, {
      llmModelPlan: 'gpt-4o',
      llmModelReasoning: 'o1',
      llmPlanFallbackModel: '',
      llmReasoningFallbackModel: '',
      llmPlanUseReasoning: false,
      llmMaxOutputTokensPlan: 4096,
      llmMaxOutputTokensTriage: 20000,
      llmTimeoutMs: 30000,
      llmMaxTokens: 16384,
      llmReasoningBudget: 32768,
    });
    strictEqual(result, null);
  });
});

describe('resolvePhaseModel — writer phase (global formatter)', () => {
  const globalDraft = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelReasoning: 'deepseek-reasoner',
    llmPlanFallbackModel: 'deepseek-chat',
    llmReasoningFallbackModel: 'gemini-2.5-pro',
    llmPlanUseReasoning: false,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensTriage: 20000,
    llmTimeoutMs: 30000,
    llmMaxTokens: 16384,
    llmReasoningBudget: 32768,
  };

  it('writer resolves from top-level writer override, jsonStrict locked true', () => {
    const overrides = {
      writer: { baseModel: 'custom-writer', useReasoning: false, thinking: true, thinkingEffort: 'high' },
    };
    const result = resolvePhaseModel(overrides as never, 'writer' as never, globalDraft);
    strictEqual(result?.baseModel, 'custom-writer');
    strictEqual(result?.thinking, true);
    strictEqual(result?.thinkingEffort, 'high');
    strictEqual(result?.jsonStrict, true, 'writer always enforces schema');
    strictEqual(result?.fallbackModel, '', 'writer has no fallback');
    strictEqual(result?.webSearch, false, 'writer has no web search');
  });

  it('writer with useReasoning=true swaps effectiveModel to reasoningModel', () => {
    const overrides = {
      writer: { baseModel: 'base-w', reasoningModel: 'reason-w', useReasoning: true },
    };
    const result = resolvePhaseModel(overrides as never, 'writer' as never, globalDraft);
    strictEqual(result?.useReasoning, true);
    strictEqual(result?.effectiveModel, 'reason-w');
  });

  it('writer with no override returns empty baseModel (no global inheritance)', () => {
    const result = resolvePhaseModel({} as never, 'writer' as never, globalDraft);
    strictEqual(result?.baseModel, '');
    strictEqual(result?.jsonStrict, true);
  });
});

describe('uiPhaseIdToOverrideKey — writer', () => {
  it('returns "writer" for writer phase id', () => {
    strictEqual(uiPhaseIdToOverrideKey('writer' as never), 'writer');
  });
});
