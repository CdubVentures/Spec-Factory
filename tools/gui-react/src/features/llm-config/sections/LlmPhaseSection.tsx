import { memo, useCallback, useMemo } from 'react';
import {
  SettingGroupBlock,
  SettingRow,
  SettingToggle,
} from '../../pipeline-settings/index.ts';
import type { LlmPhaseId } from '../types/llmPhaseTypes.generated.ts';
import type { LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes.generated.ts';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';
import { resolvePhaseModel, uiPhaseIdToOverrideKey, type GlobalDraftSlice } from '../state/llmPhaseOverridesBridge.generated.ts';
import { buildModelDropdownOptions } from '../state/llmModelDropdownOptions.ts';
import { AlertBanner } from '../../../shared/ui/feedback/AlertBanner.tsx';
import { resolveProviderForModel } from '../state/llmProviderRegistryBridge.ts';
import { ModelSelectDropdown, GlobalDefaultIcon } from '../components/ModelSelectDropdown.tsx';

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
    () => buildModelDropdownOptions(llmModelOptions, registry, 'primary', apiKeyFilter),
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

  const resolvedModelHasCapability = useCallback((cap: 'web' | 'thinking'): boolean => {
    if (!resolved) return false;
    const modelId = resolved.effectiveModel;
    for (const provider of registry) {
      const model = provider.models.find((m) => m.modelId === modelId);
      if (model?.capabilities?.[cap]) return true;
    }
    return false;
  }, [resolved, registry]);

  const phaseTokenWarnings = useMemo(() => {
    if (!overrideKey || !resolved) return [];
    const tokenCap = phaseOverrides[overrideKey]?.maxOutputTokens;
    if (tokenCap == null || tokenCap <= 0) return [];
    const modelId = resolved.baseModel;
    if (!modelId) return [];
    const provider = resolveProviderForModel(registry, modelId);
    if (!provider) return [];
    const model = provider.models.find((m) => m.modelId === modelId);
    if (!model) return [];
    const warnings: { field: 'maxOutput' | 'contextOverflow'; model: string; setting: number; limit: number }[] = [];
    if (model.maxOutputTokens != null && tokenCap > model.maxOutputTokens) {
      warnings.push({ field: 'maxOutput', model: modelId, setting: tokenCap, limit: model.maxOutputTokens });
    }
    if (model.maxContextTokens != null && tokenCap > model.maxContextTokens * 0.5) {
      warnings.push({ field: 'contextOverflow', model: modelId, setting: tokenCap, limit: model.maxContextTokens });
    }
    return warnings;
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
            disabled={resolved.useReasoning}
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
      <SettingRow label="Max Output Tokens" tip="Maximum output tokens for this phase. Leave empty to inherit global default.">
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
      <SettingRow label="Max Context Tokens" tip="Maximum context window tokens for this phase. Leave empty to inherit global default.">
        <div className="flex items-center gap-1.5">
          {phaseOverrides[overrideKey]?.maxContextTokens == null && <GlobalDefaultIcon />}
          <input
            className={inputCls}
            type="number"
            min={128}
            step={1}
            value={phaseOverrides[overrideKey]?.maxContextTokens ?? ''}
            placeholder={`↩ ${resolved.maxContextTokens ?? 'auto'}`}
            onChange={(e) => {
              const raw = e.target.value;
              updateOverrideField('maxContextTokens', raw === '' ? null : (Number.parseInt(raw, 10) || 0));
            }}
          />
        </div>
      </SettingRow>
      <SettingRow label="Timeout (ms)" tip="LLM request timeout for this phase. Leave empty to inherit global default.">
        <div className="flex items-center gap-1.5">
          {phaseOverrides[overrideKey]?.timeoutMs == null && <GlobalDefaultIcon />}
          <input
            className={inputCls}
            type="number"
            min={1000}
            step={1000}
            value={phaseOverrides[overrideKey]?.timeoutMs ?? ''}
            placeholder={`↩ ${resolved.timeoutMs ?? 'auto'}`}
            onChange={(e) => {
              const raw = e.target.value;
              updateOverrideField('timeoutMs', raw === '' ? null : (Number.parseInt(raw, 10) || 0));
            }}
          />
        </div>
      </SettingRow>
      {resolvedModelHasCapability('web') && (
        <SettingRow label="Enable Web Search" tip="Send web_search in request_options for this phase. Only available for Lab models with web capability.">
          <SettingToggle
            checked={phaseOverrides[overrideKey]?.webSearch ?? false}
            onChange={(v) => updateOverrideField('webSearch', v)}
          />
        </SettingRow>
      )}
      {resolvedModelHasCapability('thinking') && (
        <SettingRow label="Enable Thinking" tip="Send thinking in request_options for this phase. Only available for Lab models with thinking capability.">
          <SettingToggle
            checked={phaseOverrides[overrideKey]?.thinking ?? false}
            onChange={(v) => updateOverrideField('thinking', v)}
          />
        </SettingRow>
      )}
      {phaseTokenWarnings.map((w) => (
        <AlertBanner
          key={`phase-token-${w.field}`}
          severity="warning"
          title={w.field === 'contextOverflow'
            ? 'Output allocation exceeds 50% of context window'
            : 'Token cap exceeds model limit'}
          message={w.field === 'contextOverflow'
            ? `${w.model} context window is ${w.limit.toLocaleString()}, but this phase output is set to ${w.setting.toLocaleString()} (>${Math.floor(w.limit * 0.5).toLocaleString()}).`
            : `${w.model} max output is ${w.limit.toLocaleString()}, but this phase is set to ${w.setting.toLocaleString()}.`}
        />
      ))}
    </SettingGroupBlock>
  );
});
