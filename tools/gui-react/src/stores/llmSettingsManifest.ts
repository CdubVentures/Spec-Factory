export interface LlmSettingLimit {
  min: number;
  max: number;
  step?: number;
}

export interface LlmRoutePresetLimits {
  maxTokensMin: number;
  maxTokensMax: number;
}

export interface LlmRoutePresetConfig extends LlmRoutePresetLimits {
  modelLadderToday: string;
  singleSourceData: boolean;
  allSourceData: boolean;
  enableWebsearch: boolean;
  allSourcesConfidenceRepatch: boolean;
  minEvidenceRefsRequired?: number;
}

export const LLM_SETTING_LIMITS = {
  effort: { min: 1, max: 10 },
  maxTokens: { min: 256, max: 65536, step: 256 },
  minEvidenceRefs: { min: 1, max: 5 },
} satisfies {
  effort: LlmSettingLimit;
  maxTokens: LlmSettingLimit;
  minEvidenceRefs: LlmSettingLimit;
};

export const LLM_ROUTE_PRESET_LIMITS = {
  fast: {
    maxTokensMin: 2048,
    maxTokensMax: 6144,
    modelLadderToday: 'gpt-5-low -> gpt-5-medium',
    singleSourceData: true,
    allSourceData: false,
    enableWebsearch: false,
    allSourcesConfidenceRepatch: true,
    minEvidenceRefsRequired: 1,
  },
  balanced: {
    maxTokensMin: 4096,
    maxTokensMax: 8192,
    modelLadderToday: 'gpt-5-medium -> gpt-5.1-medium',
    singleSourceData: true,
    allSourceData: false,
    enableWebsearch: false,
    allSourcesConfidenceRepatch: true,
  },
  deep: {
    maxTokensMin: 12288,
    maxTokensMax: 65536,
    modelLadderToday: 'gpt-5.2-high -> gpt-5.1-high',
    singleSourceData: true,
    allSourceData: true,
    enableWebsearch: true,
    allSourcesConfidenceRepatch: true,
    minEvidenceRefsRequired: 2,
  },
} as const satisfies Record<'fast' | 'balanced' | 'deep', LlmRoutePresetConfig>;
