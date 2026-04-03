// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

import type { LlmOverridePhaseId, LlmPhaseOverride, LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes.generated.ts';
import type { LlmPhaseId } from '../types/llmPhaseTypes.generated.ts';

export function parsePhaseOverrides(json: string): LlmPhaseOverrides {
  if (!json || !json.trim() || json.trim() === '{}') return {};
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as LlmPhaseOverrides;
  } catch {
    return {};
  }
}

export function serializePhaseOverrides(overrides: LlmPhaseOverrides): string {
  const keys = Object.keys(overrides) as LlmOverridePhaseId[];
  const hasContent = keys.some((k) => {
    const phase = overrides[k];
    if (!phase) return false;
    return (
      (phase.baseModel !== undefined && phase.baseModel !== '') ||
      (phase.reasoningModel !== undefined && phase.reasoningModel !== '') ||
      (phase.fallbackModel !== undefined && phase.fallbackModel !== '') ||
      (phase.fallbackReasoningModel !== undefined && phase.fallbackReasoningModel !== '') ||
      phase.fallbackUseReasoning !== undefined ||
      phase.fallbackThinking !== undefined ||
      phase.fallbackThinkingEffort !== undefined ||
      phase.fallbackWebSearch !== undefined ||
      phase.useReasoning !== undefined ||
      phase.maxOutputTokens !== undefined ||
      phase.timeoutMs !== undefined ||
      phase.maxContextTokens !== undefined ||
      phase.webSearch !== undefined ||
      phase.thinking !== undefined ||
      phase.thinkingEffort !== undefined ||
      phase.disableLimits !== undefined
    );
  });
  if (!hasContent) return '{}';
  return JSON.stringify(overrides);
}

export interface ResolvedPhaseModel {
  baseModel: string;
  reasoningModel: string;
  fallbackModel: string;
  fallbackReasoningModel: string;
  fallbackUseReasoning: boolean;
  fallbackThinking: boolean;
  fallbackThinkingEffort: string;
  fallbackWebSearch: boolean;
  effectiveFallbackModel: string;
  useReasoning: boolean;
  maxOutputTokens: number | null;
  timeoutMs: number | null;
  maxContextTokens: number | null;
  webSearch: boolean;
  thinking: boolean;
  thinkingEffort: string;
  disableLimits: boolean;
  effectiveModel: string;
}

export interface GlobalDraftSlice {
  llmModelPlan: string;
  llmModelReasoning: string;
  llmPlanFallbackModel: string;
  llmReasoningFallbackModel: string;
  llmPlanUseReasoning: boolean;
  llmMaxOutputTokensPlan: number;
  llmMaxOutputTokensTriage: number;
  llmTimeoutMs: number;
  llmMaxTokens: number;
}

export interface PhaseOverrideRegistryEntry {
  uiPhaseId: LlmPhaseId;
  overrideKey: LlmOverridePhaseId;
  globalModel: keyof GlobalDraftSlice;
  groupToggle: keyof GlobalDraftSlice;
  globalTokens: keyof GlobalDraftSlice;
  globalTimeout: keyof GlobalDraftSlice;
  globalContextTokens: keyof GlobalDraftSlice;
  globalFallbackModel: keyof GlobalDraftSlice;
  globalFallbackReasoningModel: keyof GlobalDraftSlice;
}

export const PHASE_OVERRIDE_REGISTRY: readonly PhaseOverrideRegistryEntry[] = [
  { uiPhaseId: 'needset', overrideKey: 'needset', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel' },
  { uiPhaseId: 'search-planner', overrideKey: 'searchPlanner', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel' },
  { uiPhaseId: 'brand-resolver', overrideKey: 'brandResolver', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel' },
  { uiPhaseId: 'serp-selector', overrideKey: 'serpSelector', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensTriage', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel' },
  { uiPhaseId: 'validate', overrideKey: 'validate', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel' },
  { uiPhaseId: 'color-finder', overrideKey: 'colorFinder', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel' },
];

const PHASE_GLOBAL_MAP: ReadonlyMap<LlmOverridePhaseId, PhaseOverrideRegistryEntry> =
  new Map(PHASE_OVERRIDE_REGISTRY.map((e) => [e.overrideKey, e]));

const UI_TO_OVERRIDE: ReadonlyMap<LlmPhaseId, LlmOverridePhaseId> =
  new Map(PHASE_OVERRIDE_REGISTRY.map((e) => [e.uiPhaseId, e.overrideKey]));

export function uiPhaseIdToOverrideKey(uiPhaseId: LlmPhaseId): LlmOverridePhaseId | undefined {
  return UI_TO_OVERRIDE.get(uiPhaseId);
}

export function resolvePhaseModel(
  overrides: LlmPhaseOverrides,
  phaseId: LlmOverridePhaseId,
  globalDraft: GlobalDraftSlice,
): ResolvedPhaseModel | null {
  const mapping = PHASE_GLOBAL_MAP.get(phaseId);
  if (!mapping) return null;

  const phaseOverride: Partial<LlmPhaseOverride> = overrides[phaseId] || {};

  const baseModel = phaseOverride.baseModel || (globalDraft[mapping.globalModel] as string);
  const reasoningModel = phaseOverride.reasoningModel || globalDraft.llmModelReasoning;
  const fallbackModel = phaseOverride.fallbackModel || (globalDraft[mapping.globalFallbackModel] as string);
  const fallbackReasoningModel = phaseOverride.fallbackReasoningModel || (globalDraft[mapping.globalFallbackReasoningModel] as string);
  const fallbackUseReasoning = phaseOverride.fallbackUseReasoning ?? false;
  const fallbackThinking = phaseOverride.fallbackThinking ?? false;
  const fallbackThinkingEffort = phaseOverride.fallbackThinkingEffort ?? '';
  const fallbackWebSearch = phaseOverride.fallbackWebSearch ?? false;
  const useReasoning = phaseOverride.useReasoning ?? (globalDraft[mapping.groupToggle] as boolean) ?? false;
  const maxOutputTokens = phaseOverride.maxOutputTokens ?? (globalDraft[mapping.globalTokens] as number);
  const timeoutMs = phaseOverride.timeoutMs ?? (globalDraft[mapping.globalTimeout] as number);
  const maxContextTokens = phaseOverride.maxContextTokens ?? (globalDraft[mapping.globalContextTokens] as number);
  const webSearch = phaseOverride.webSearch ?? false;
  const thinking = phaseOverride.thinking ?? false;
  const thinkingEffort = phaseOverride.thinkingEffort ?? '';
  const disableLimits = phaseOverride.disableLimits ?? false;

  return {
    baseModel,
    reasoningModel,
    fallbackModel,
    fallbackReasoningModel,
    fallbackUseReasoning,
    fallbackThinking,
    fallbackThinkingEffort,
    fallbackWebSearch,
    effectiveFallbackModel: fallbackUseReasoning ? fallbackReasoningModel : fallbackModel,
    useReasoning,
    maxOutputTokens,
    timeoutMs,
    maxContextTokens,
    webSearch,
    thinking,
    thinkingEffort,
    disableLimits,
    effectiveModel: useReasoning ? reasoningModel : baseModel,
  };
}
