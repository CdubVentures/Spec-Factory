export interface LlmSettingLimit {
  min: number;
  max: number;
  step?: number;
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
