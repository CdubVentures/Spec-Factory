export { makeModel, makeProvider } from './llmModelDropdownFixtures.ts';

export function makeDefaults(
  overrides: Partial<{
    llmModelPlan: string;
    llmModelReasoning: string;
    llmPlanFallbackModel: string;
    llmReasoningFallbackModel: string;
  }> = {},
) {
  return {
    llmModelPlan: '',
    llmModelReasoning: '',
    llmPlanFallbackModel: '',
    llmReasoningFallbackModel: '',
    ...overrides,
  };
}
