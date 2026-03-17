import { memo, useCallback, useMemo } from 'react';
import {
  SettingGroupBlock,
  SettingRow,
  SettingToggle,
} from '../../pipeline-settings';
import type { LlmPhaseId } from '../types/llmPhaseTypes';
import type { LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';
import { resolvePhaseModel, uiPhaseIdToOverrideKey, type GlobalDraftSlice } from '../state/llmPhaseOverridesBridge';
import { buildModelDropdownOptions } from '../state/llmModelDropdownOptions';
import { AlertBanner } from '../../../shared/ui/feedback/AlertBanner';
import { resolveProviderForModel } from '../state/llmProviderRegistryBridge';
import { ModelSelectDropdown, GlobalDefaultIcon } from '../components/ModelSelectDropdown';

interface LlmPhaseSectionProps {
  phaseId: LlmPhaseId;
  inputCls: string;
  llmModelOptions: readonly string[];
  phaseOverrides: LlmPhaseOverrides;
  onPhaseOverrideChange: (overrides: LlmPhaseOverrides) => void;
  registry: LlmProviderEntry[];
  globalDraft: GlobalDraftSlice;
  apiKeyFilter?: (provider: LlmProviderEntry) => boolean;
}

export const LlmPhaseSection = memo(function LlmPhaseSection({
  phaseId,
  inputCls,
  llmModelOptions,
  phaseOverrides,
  onPhaseOverrideChange,
  registry,
  globalDraft,
  apiKeyFilter,
}: LlmPhaseSectionProps) {
  const overrideKey = uiPhaseIdToOverrideKey(phaseId);
  const resolved = overrideKey
    ? resolvePhaseModel(phaseOverrides, overrideKey, globalDraft)
    : null;

  const baseOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, ['primary', 'fast'], apiKeyFilter),
    [llmModelOptions, registry, apiKeyFilter],
  );
  const reasoningOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, 'reasoning', apiKeyFilter),
    [llmModelOptions, registry, apiKeyFilter],
  );

  const updateOverrideField = useCallback((field: string, value: string | boolean | number | null) => {
    if (!overrideKey) return;
    const current = phaseOverrides[overrideKey] ?? {};
    const next: LlmPhaseOverrides = {
      ...phaseOverrides,
      [overrideKey]: { ...current, [field]: value },
    };
    onPhaseOverrideChange(next);
  }, [overrideKey, phaseOverrides, onPhaseOverrideChange]);

  const phaseTokenWarning = useMemo(() => {
    if (!overrideKey || !resolved) return null;
    const tokenCap = phaseOverrides[overrideKey]?.maxOutputTokens;
    if (tokenCap == null || tokenCap <= 0) return null;
    const modelId = resolved.baseModel;
    if (!modelId) return null;
    const provider = resolveProviderForModel(registry, modelId);
    if (!provider) return null;
    const model = provider.models.find((m) => m.modelId === modelId);
    if (!model || model.maxOutputTokens == null) return null;
    if (tokenCap > model.maxOutputTokens) {
      return { model: modelId, setting: tokenCap, limit: model.maxOutputTokens };
    }
    return null;
  }, [overrideKey, resolved, phaseOverrides, registry]);

  if (!overrideKey || !resolved) return null;

  return (
    <SettingGroupBlock title="Model Configuration">
      <SettingRow label="Base Model" tip="Override the global base model for this phase. Leave on default to inherit.">
        <div className="flex items-center gap-1.5">
          {!phaseOverrides[overrideKey]?.baseModel && <GlobalDefaultIcon />}
          <ModelSelectDropdown
            options={baseOptions}
            className={inputCls}
            value={phaseOverrides[overrideKey]?.baseModel ?? ''}
            onChange={(v) => updateOverrideField('baseModel', v)}
            allowNone
            noneLabel={`↩ ${resolved.baseModel}`}
            noneModelId={resolved.baseModel}
          />
        </div>
      </SettingRow>
      <SettingRow label="Use Reasoning" tip="Override reasoning toggle for this phase.">
        <SettingToggle
          checked={resolved.useReasoning}
          onChange={(v) => updateOverrideField('useReasoning', v)}
        />
      </SettingRow>
      <SettingRow label="Reasoning Model" tip="Override the reasoning model for this phase.">
        <div className="flex items-center gap-1.5">
          {!phaseOverrides[overrideKey]?.reasoningModel && <GlobalDefaultIcon />}
          <ModelSelectDropdown
            options={reasoningOptions}
            className={inputCls}
            value={phaseOverrides[overrideKey]?.reasoningModel ?? ''}
            onChange={(v) => updateOverrideField('reasoningModel', v)}
            disabled={!resolved.useReasoning}
            allowNone
            noneLabel={`↩ ${globalDraft.llmModelReasoning}`}
            noneModelId={globalDraft.llmModelReasoning}
          />
        </div>
      </SettingRow>
      <SettingRow label="Token Cap" tip="Override the max output tokens for this phase. Leave empty to use global default.">
        <div className="flex items-center gap-1.5">
          {phaseOverrides[overrideKey]?.maxOutputTokens == null && <GlobalDefaultIcon />}
          <input
            className={inputCls}
            type="number"
            min={0}
            step={1}
            value={phaseOverrides[overrideKey]?.maxOutputTokens ?? ''}
            placeholder={`↩ ${resolved.maxOutputTokens ?? 'auto'}`}
            onChange={(e) => {
              const raw = e.target.value;
              updateOverrideField('maxOutputTokens', raw === '' ? null : (Number.parseInt(raw, 10) || 0));
            }}
          />
        </div>
      </SettingRow>
      {phaseTokenWarning && (
        <AlertBanner
          severity="warning"
          title="Token cap exceeds model limit"
          message={`${phaseTokenWarning.model} max output is ${phaseTokenWarning.limit.toLocaleString()}, but this phase is set to ${phaseTokenWarning.setting.toLocaleString()}.`}
        />
      )}
    </SettingGroupBlock>
  );
});
