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
import { resolveProviderForModel, parseModelKey } from '../state/llmProviderRegistryBridge.ts';
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
  phaseSchema?: { system_prompt: string; response_schema: Record<string, unknown> } | null;
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
  phaseSchema,
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

  // WHY: Capability flags gate Lab-only toggles per-model, not per-provider.
  const effectiveModelCapabilities = useMemo((): { thinking: boolean; webSearch: boolean; thinkingEffortOptions: string[] } => {
    const effectiveKey = resolved?.useReasoning ? resolved.reasoningModel : resolved?.baseModel;
    if (!effectiveKey) return { thinking: false, webSearch: false, thinkingEffortOptions: [] };
    const provider = resolveProviderForModel(registry, effectiveKey);
    if (!provider) return { thinking: false, webSearch: false, thinkingEffortOptions: [] };
    const { modelId } = parseModelKey(effectiveKey);
    const model = provider.models.find((m) => m.modelId === modelId);
    return {
      thinking: model?.thinking === true,
      webSearch: model?.webSearch === true,
      thinkingEffortOptions: model?.thinkingEffortOptions ?? [],
    };
  }, [resolved, registry]);

  const phaseTokenWarnings = useMemo(() => {
    if (!overrideKey || !resolved) return [];
    const tokenCap = phaseOverrides[overrideKey]?.maxOutputTokens;
    if (tokenCap == null || tokenCap <= 0) return [];
    const rawModelKey = resolved.baseModel;
    if (!rawModelKey) return [];
    const provider = resolveProviderForModel(registry, rawModelKey);
    if (!provider) return [];
    const { modelId: bareModelId } = parseModelKey(rawModelKey);
    const model = provider.models.find((m) => m.modelId === bareModelId);
    if (!model) return [];
    const warnings: { field: 'maxOutput' | 'contextOverflow'; model: string; setting: number; limit: number }[] = [];
    if (model.maxOutputTokens != null && tokenCap > model.maxOutputTokens) {
      warnings.push({ field: 'maxOutput', model: bareModelId, setting: tokenCap, limit: model.maxOutputTokens });
    }
    if (model.maxContextTokens != null && tokenCap > model.maxContextTokens * 0.5) {
      warnings.push({ field: 'contextOverflow', model: bareModelId, setting: tokenCap, limit: model.maxContextTokens });
    }
    return warnings;
  }, [overrideKey, resolved, phaseOverrides, registry]);

  if (!overrideKey || !resolved) return null;

  return (
    <>
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
            noneLabel={`↩ ${parseModelKey(resolved.baseModel).modelId}`}
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
            noneLabel={`↩ ${parseModelKey(globalDraft.llmModelReasoning).modelId}`}
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
      {effectiveModelCapabilities.thinking && (
        <SettingRow label="Enable Thinking" tip="Send thinking flag to the Lab model for extended chain-of-thought reasoning.">
          <SettingToggle
            checked={phaseOverrides[overrideKey]?.thinking ?? false}
            onChange={(v) => updateOverrideField('thinking', v)}
          />
        </SettingRow>
      )}
      {effectiveModelCapabilities.thinking && (phaseOverrides[overrideKey]?.thinking ?? false) && effectiveModelCapabilities.thinkingEffortOptions.length > 1 && (
        <SettingRow label="Thinking Effort" tip="Reasoning effort level sent to the Lab model.">
          <select
            className={inputCls}
            value={phaseOverrides[overrideKey]?.thinkingEffort ?? 'medium'}
            onChange={(e) => updateOverrideField('thinkingEffort', e.target.value)}
          >
            {effectiveModelCapabilities.thinkingEffortOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </SettingRow>
      )}
      {effectiveModelCapabilities.webSearch && (
        <SettingRow label="Enable Web Search" tip="Send web_search flag to the Lab model for this phase.">
          <SettingToggle
            checked={phaseOverrides[overrideKey]?.webSearch ?? false}
            onChange={(v) => updateOverrideField('webSearch', v)}
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
    {phaseSchema && (
      <SettingGroupBlock title="LLM Call Contract">
        <div className="space-y-3">
          {phaseSchema.system_prompt && (
            <div>
              <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">System Prompt</div>
              <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed opacity-70 select-none">
                {String(phaseSchema.system_prompt)}
              </pre>
            </div>
          )}
          {phaseSchema.response_schema && (
            <div>
              <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">Response Schema</div>
              <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed opacity-70 select-none">
                {JSON.stringify(phaseSchema.response_schema, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </SettingGroupBlock>
    )}
  </>
  );
});
