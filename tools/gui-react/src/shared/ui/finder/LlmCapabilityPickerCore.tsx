import { memo, useCallback, useMemo } from 'react';
import { SettingRow, SettingToggle } from '../../../features/pipeline-settings/index.ts';
import { ModelSelectDropdown, GlobalDefaultIcon } from '../../../features/llm-config/components/ModelSelectDropdown.tsx';
import { buildModelDropdownOptions } from '../../../features/llm-config/state/llmModelDropdownOptions.ts';
import { parseModelKey, resolveProviderForModel } from '../../../features/llm-config/state/llmProviderRegistryBridge.ts';
import { extractEffortFromModelName } from '../../../features/llm-config/state/llmEffortFromModelName.ts';
import type { LlmProviderEntry } from '../../../features/llm-config/types/llmProviderRegistryTypes.ts';

export type LlmCapabilityEffort = '' | 'low' | 'medium' | 'high' | 'xhigh';

export interface LlmCapabilityBundle {
  model: string;
  useReasoning: boolean;
  reasoningModel: string;
  thinking: boolean;
  thinkingEffort: LlmCapabilityEffort;
  webSearch: boolean;
}

export interface LlmCapabilityPickerCoreProps {
  readonly value: LlmCapabilityBundle;
  readonly onChange: (next: LlmCapabilityBundle) => void;
  readonly registry: LlmProviderEntry[];
  readonly llmModelOptions: readonly string[];
  readonly apiKeyFilter?: (provider: LlmProviderEntry) => boolean;
  /** Global plan model — drives the DEFAULT badge in the model option list. */
  readonly globalDefaultPlanModel: string;
  /** Global reasoning model — drives the DEFAULT badge in the reasoning option list. */
  readonly globalDefaultReasoningModel: string;
  /** Model ID that the empty model field inherits from (e.g. fallback tier or phase global). */
  readonly inheritedModelId?: string;
  /** Whether the model field can be cleared back to inherit (false for fallback tier). */
  readonly allowModelNone?: boolean;
  /** When false, hide the Web Search row regardless of model capability. Used for writer phase. */
  readonly allowWebSearch?: boolean;
  readonly inputCls?: string;
}

export interface ResolvedCapabilities {
  readonly thinking: boolean;
  readonly webSearch: boolean;
  readonly thinkingEffortOptions: readonly string[];
  readonly lockedEffort: string | null;
}

export function LockedEffortIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Effort locked by model name"
      style={{ color: 'var(--sf-muted)' }}
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function resolveModelCapabilities(
  registry: LlmProviderEntry[],
  modelKey: string,
): ResolvedCapabilities {
  if (!modelKey) return { thinking: false, webSearch: false, thinkingEffortOptions: [], lockedEffort: null };
  const provider = resolveProviderForModel(registry, modelKey);
  if (!provider) return { thinking: false, webSearch: false, thinkingEffortOptions: [], lockedEffort: null };
  const { modelId } = parseModelKey(modelKey);
  const model = provider.models.find((m) => m.modelId === modelId);
  return {
    thinking: model?.thinking === true,
    webSearch: model?.webSearch === true,
    thinkingEffortOptions: model?.thinkingEffortOptions ?? [],
    lockedEffort: extractEffortFromModelName(modelId),
  };
}

/**
 * Headless picker for the 6-field LLM capability bundle:
 *   model, useReasoning, reasoningModel, thinking, thinkingEffort, webSearch.
 *
 * Mirrors the controls used by the LLM Config phase and key-finder tier
 * sections so the same bundle shape can be edited inline from the Overview
 * Command Console (popover) or from the LLM Config settings panel.
 *
 * Capability gating is registry-driven: thinking / webSearch / thinkingEffort
 * rows hide when the effective model doesn't declare support. Baked-in effort
 * suffixes (e.g. `-xhigh`) render the effort select as a locked single-option.
 */
export const LlmCapabilityPickerCore = memo(function LlmCapabilityPickerCore({
  value,
  onChange,
  registry,
  llmModelOptions,
  apiKeyFilter,
  globalDefaultPlanModel,
  globalDefaultReasoningModel,
  inheritedModelId,
  allowModelNone = true,
  allowWebSearch = true,
  inputCls,
}: LlmCapabilityPickerCoreProps) {
  const update = useCallback(<K extends keyof LlmCapabilityBundle>(key: K, next: LlmCapabilityBundle[K]) => {
    onChange({ ...value, [key]: next });
  }, [onChange, value]);

  const effectiveModelKey = value.useReasoning ? value.reasoningModel : value.model;
  const caps = useMemo(
    () => resolveModelCapabilities(registry, effectiveModelKey),
    [registry, effectiveModelKey],
  );

  const baseOptions = useMemo(
    () => buildModelDropdownOptions(
      llmModelOptions,
      registry as LlmProviderEntry[],
      'primary',
      apiKeyFilter,
      value.model ? [value.model] : undefined,
    ),
    [llmModelOptions, registry, apiKeyFilter, value.model],
  );

  const reasoningOptions = useMemo(
    () => buildModelDropdownOptions(
      llmModelOptions,
      registry as LlmProviderEntry[],
      'reasoning',
      apiKeyFilter,
      value.reasoningModel ? [value.reasoningModel] : undefined,
    ),
    [llmModelOptions, registry, apiKeyFilter, value.reasoningModel],
  );

  const inheritedDisplay = inheritedModelId ? parseModelKey(inheritedModelId).modelId : '';
  const noneLabel = allowModelNone
    ? `↩ ${inheritedDisplay || (parseModelKey(globalDefaultPlanModel).modelId || '(global)')}`
    : undefined;

  return (
    <>
      <SettingRow label="Model" tip="Override the model used for this finder. Empty inherits the configured default.">
        <div className="flex items-center gap-1.5">
          {!value.model && allowModelNone && <GlobalDefaultIcon />}
          <ModelSelectDropdown
            options={baseOptions}
            className={inputCls}
            value={value.model}
            onChange={(next: string) => update('model', next)}
            disabled={value.useReasoning}
            allowNone={allowModelNone}
            noneLabel={noneLabel}
            noneModelId={inheritedModelId || globalDefaultPlanModel}
            globalDefaultModelId={globalDefaultPlanModel}
          />
        </div>
      </SettingRow>

      <SettingRow label="Use Reasoning" tip="Swap to the reasoning model for this finder.">
        <SettingToggle
          checked={value.useReasoning}
          onChange={(next: boolean) => update('useReasoning', next)}
        />
      </SettingRow>

      {value.useReasoning && (
        <SettingRow label="Reasoning Model" tip="Reasoning model used when Use Reasoning is on.">
          <div className="flex items-center gap-1.5">
            {!value.reasoningModel && <GlobalDefaultIcon />}
            <ModelSelectDropdown
              options={reasoningOptions}
              className={inputCls}
              value={value.reasoningModel}
              onChange={(next: string) => update('reasoningModel', next)}
              allowNone
              noneLabel={`↩ ${parseModelKey(globalDefaultReasoningModel).modelId || '(global)'}`}
              noneModelId={globalDefaultReasoningModel}
              globalDefaultModelId={globalDefaultReasoningModel}
            />
          </div>
        </SettingRow>
      )}

      {caps.thinking && (
        <SettingRow label="Thinking" tip="Send the thinking flag to the model for extended reasoning.">
          <SettingToggle
            checked={value.thinking}
            onChange={(next: boolean) => update('thinking', next)}
          />
        </SettingRow>
      )}

      {caps.thinking && value.thinking && caps.lockedEffort && (
        <SettingRow label="Thinking Effort" tip="Effort level is locked in the model name.">
          <div className="flex items-center gap-1.5">
            <LockedEffortIcon />
            <select className={inputCls} disabled value={caps.lockedEffort}>
              <option value={caps.lockedEffort}>{caps.lockedEffort}</option>
            </select>
          </div>
        </SettingRow>
      )}

      {caps.thinking && value.thinking && !caps.lockedEffort && caps.thinkingEffortOptions.length > 1 && (
        <SettingRow label="Thinking Effort" tip="Reasoning effort sent to the model.">
          <select
            className={inputCls}
            value={value.thinkingEffort || 'medium'}
            onChange={(e) => update('thinkingEffort', e.target.value as LlmCapabilityEffort)}
          >
            {caps.thinkingEffortOptions.map((opt: string) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </SettingRow>
      )}

      {allowWebSearch && caps.webSearch && (
        <SettingRow label="Web Search" tip="Send the web_search flag to the model.">
          <SettingToggle
            checked={value.webSearch}
            onChange={(next: boolean) => update('webSearch', next)}
          />
        </SettingRow>
      )}
    </>
  );
});
