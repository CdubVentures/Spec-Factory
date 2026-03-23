// WHY: Frontend default LlmPolicy assembled from the same registry defaults
// that the backend uses. This provides the bootstrap policy for useLlmPolicyAuthority
// before the server hydration completes. Assembly function is auto-generated
// from backend LLM_POLICY_GROUPS SSOT.

import { RUNTIME_SETTING_DEFAULTS } from '../../../stores/settingsManifest';
import type { LlmPolicy } from './llmPolicyAdapter.generated';
export { assembleLlmPolicyFromFlat } from './llmPolicyAdapter.generated';
import { assembleLlmPolicyFromFlat } from './llmPolicyAdapter.generated';

export const DEFAULT_LLM_POLICY: LlmPolicy = assembleLlmPolicyFromFlat(
  RUNTIME_SETTING_DEFAULTS as unknown as Record<string, unknown>,
);
