import type { LlmPhaseId, LlmPhaseOverride, LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes';

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
  const keys = Object.keys(overrides) as LlmPhaseId[];
  const hasContent = keys.some((k) => {
    const phase = overrides[k];
    if (!phase) return false;
    return (
      (phase.baseModel !== undefined && phase.baseModel !== '') ||
      (phase.reasoningModel !== undefined && phase.reasoningModel !== '') ||
      phase.useReasoning !== undefined ||
      phase.maxOutputTokens !== undefined
    );
  });
  if (!hasContent) return '{}';
  return JSON.stringify(overrides);
}

export interface ResolvedPhaseModel {
  baseModel: string;
  reasoningModel: string;
  useReasoning: boolean;
  maxOutputTokens: number | null;
  effectiveModel: string;
}

interface GlobalDraftSlice {
  llmModelPlan: string;
  llmModelTriage: string;
  llmModelReasoning: string;
  llmPlanUseReasoning: boolean;
  llmTriageUseReasoning: boolean;
  llmMaxOutputTokensPlan: number;
  llmMaxOutputTokensTriage: number;
}

const PHASE_GLOBAL_MAP: Record<LlmPhaseId, {
  globalModel: keyof GlobalDraftSlice;
  groupToggle: keyof GlobalDraftSlice;
  globalTokens: keyof GlobalDraftSlice;
}> = {
  needset: { globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
  searchPlanner: { globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
  brandResolver: { globalModel: 'llmModelTriage', groupToggle: 'llmTriageUseReasoning', globalTokens: 'llmMaxOutputTokensTriage' },
  serpTriage: { globalModel: 'llmModelTriage', groupToggle: 'llmTriageUseReasoning', globalTokens: 'llmMaxOutputTokensTriage' },
  domainClassifier: { globalModel: 'llmModelTriage', groupToggle: 'llmTriageUseReasoning', globalTokens: 'llmMaxOutputTokensTriage' },
};

export function resolvePhaseModel(
  overrides: LlmPhaseOverrides,
  phaseId: LlmPhaseId,
  globalDraft: GlobalDraftSlice,
): ResolvedPhaseModel {
  const phaseOverride: Partial<LlmPhaseOverride> = overrides[phaseId] || {};
  const mapping = PHASE_GLOBAL_MAP[phaseId];

  const baseModel = phaseOverride.baseModel || (globalDraft[mapping.globalModel] as string);
  const reasoningModel = phaseOverride.reasoningModel || globalDraft.llmModelReasoning;
  const useReasoning = phaseOverride.useReasoning ?? (globalDraft[mapping.groupToggle] as boolean) ?? false;
  const maxOutputTokens = phaseOverride.maxOutputTokens ?? (globalDraft[mapping.globalTokens] as number);

  return {
    baseModel,
    reasoningModel,
    useReasoning,
    maxOutputTokens,
    effectiveModel: useReasoning ? reasoningModel : baseModel,
  };
}

export function clampPhaseTokenCap(
  currentTokens: number | null,
  modelMaxOutputTokens: number | null,
): number | null {
  if (currentTokens === null || modelMaxOutputTokens === null) return currentTokens;
  return Math.min(currentTokens, modelMaxOutputTokens);
}
