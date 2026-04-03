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
    () => buildModelDropdownOptions(llmModelOptions, registry, 'primary', apiKeyFilter, resolved ? [resolved.baseModel] : undefined),
    [llmModelOptions, registry, apiKeyFilter, resolved?.baseModel],
  );
  const reasoningOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, 'reasoning', apiKeyFilter, resolved ? [resolved.reasoningModel] : undefined),
    [llmModelOptions, registry, apiKeyFilter, resolved?.reasoningModel],
  );
  const allOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, undefined, apiKeyFilter),
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
  function resolveCapabilities(modelKey: string | undefined) {
    if (!modelKey) return { thinking: false, webSearch: false, thinkingEffortOptions: [] as string[] };
    const provider = resolveProviderForModel(registry, modelKey);
    if (!provider) return { thinking: false, webSearch: false, thinkingEffortOptions: [] as string[] };
    const { modelId } = parseModelKey(modelKey);
    const model = provider.models.find((m) => m.modelId === modelId);
    return {
      thinking: model?.thinking === true,
      webSearch: model?.webSearch === true,
      thinkingEffortOptions: model?.thinkingEffortOptions ?? [],
    };
  }

  const effectiveModelCapabilities = useMemo(
    () => resolveCapabilities(resolved?.effectiveModel),
    [resolved?.effectiveModel, registry],
  );

  const fallbackModelCapabilities = useMemo(
    () => resolveCapabilities(resolved?.effectiveFallbackModel),
    [resolved?.effectiveFallbackModel, registry],
  );

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
    {/* ── Limits ── */}
    <SettingGroupBlock title="Limits" collapsible storageKey={`sf:llm-phase:${phaseId}:limits`}>
      <SettingRow label="Disable Limits" tip="Remove all per-phase token and timeout caps. Only the model's hardware maximum applies.">
        <SettingToggle
          checked={resolved.disableLimits}
          onChange={(v) => updateOverrideField('disableLimits', v)}
        />
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
            disabled={resolved.disableLimits}
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
            disabled={resolved.disableLimits}
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
            disabled={resolved.disableLimits}
            onChange={(e) => {
              const raw = e.target.value;
              updateOverrideField('timeoutMs', raw === '' ? null : (Number.parseInt(raw, 10) || 0));
            }}
          />
        </div>
      </SettingRow>
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

    {/* ── Base Model ── */}
    <SettingGroupBlock title="Base Model" collapsible storageKey={`sf:llm-phase:${phaseId}:base`}>
      <SettingRow label="Model" tip="Override the global base model for this phase. Leave on default to inherit.">
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
      {resolved.useReasoning && (
        <SettingRow label="Reasoning Model" tip="Override the reasoning model for this phase.">
          <div className="flex items-center gap-1.5">
            {!phaseOverrides[overrideKey]?.reasoningModel && <GlobalDefaultIcon />}
            <ModelSelectDropdown
              options={reasoningOptions}
              className={inputCls}
              value={phaseOverrides[overrideKey]?.reasoningModel ?? ''}
              onChange={(v) => updateOverrideField('reasoningModel', v)}
              allowNone
              noneLabel={`↩ ${parseModelKey(globalDraft.llmModelReasoning).modelId}`}
              noneModelId={globalDraft.llmModelReasoning}
            />
          </div>
        </SettingRow>
      )}
      {effectiveModelCapabilities.thinking && (
        <SettingRow label="Thinking" tip="Send thinking flag to the Lab model for extended chain-of-thought reasoning.">
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
        <SettingRow label="Web Search" tip="Send web_search flag to the Lab model for this phase.">
          <SettingToggle
            checked={phaseOverrides[overrideKey]?.webSearch ?? false}
            onChange={(v) => updateOverrideField('webSearch', v)}
          />
        </SettingRow>
      )}
    </SettingGroupBlock>

    {/* ── Fallback (mirrors Base Model panel) ── */}
    <SettingGroupBlock title="Fallback" collapsible storageKey={`sf:llm-phase:${phaseId}:fallback`}>
      <SettingRow label="Model" tip="Fallback model when the primary fails. Leave on default to inherit global fallback.">
        <div className="flex items-center gap-1.5">
          {!phaseOverrides[overrideKey]?.fallbackModel && <GlobalDefaultIcon />}
          <ModelSelectDropdown
            options={baseOptions}
            className={inputCls}
            value={phaseOverrides[overrideKey]?.fallbackModel ?? ''}
            onChange={(v) => updateOverrideField('fallbackModel', v)}
            disabled={resolved.fallbackUseReasoning}
            allowNone
            noneLabel={`↩ ${parseModelKey(resolved.fallbackModel).modelId || '(none)'}`}
            noneModelId={resolved.fallbackModel}
          />
        </div>
      </SettingRow>
      <SettingRow label="Use Reasoning" tip="Enable reasoning model for the fallback.">
        <SettingToggle
          checked={resolved.fallbackUseReasoning}
          onChange={(v) => updateOverrideField('fallbackUseReasoning', v)}
        />
      </SettingRow>
      {resolved.fallbackUseReasoning && (
        <SettingRow label="Reasoning Model" tip="Reasoning model for the fallback.">
          <div className="flex items-center gap-1.5">
            {!phaseOverrides[overrideKey]?.fallbackReasoningModel && <GlobalDefaultIcon />}
            <ModelSelectDropdown
              options={reasoningOptions}
              className={inputCls}
              value={phaseOverrides[overrideKey]?.fallbackReasoningModel ?? ''}
              onChange={(v) => updateOverrideField('fallbackReasoningModel', v)}
              allowNone
              noneLabel={`↩ ${parseModelKey(globalDraft.llmReasoningFallbackModel).modelId || '(none)'}`}
              noneModelId={globalDraft.llmReasoningFallbackModel}
            />
          </div>
        </SettingRow>
      )}
      {fallbackModelCapabilities.thinking && (
        <SettingRow label="Thinking" tip="Send thinking flag to the fallback model.">
          <SettingToggle
            checked={phaseOverrides[overrideKey]?.fallbackThinking ?? false}
            onChange={(v) => updateOverrideField('fallbackThinking', v)}
          />
        </SettingRow>
      )}
      {fallbackModelCapabilities.thinking && (phaseOverrides[overrideKey]?.fallbackThinking ?? false) && fallbackModelCapabilities.thinkingEffortOptions.length > 1 && (
        <SettingRow label="Thinking Effort" tip="Reasoning effort for the fallback model.">
          <select
            className={inputCls}
            value={phaseOverrides[overrideKey]?.fallbackThinkingEffort ?? 'medium'}
            onChange={(e) => updateOverrideField('fallbackThinkingEffort', e.target.value)}
          >
            {fallbackModelCapabilities.thinkingEffortOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </SettingRow>
      )}
      {fallbackModelCapabilities.webSearch && (
        <SettingRow label="Web Search" tip="Send web_search flag to the fallback model.">
          <SettingToggle
            checked={phaseOverrides[overrideKey]?.fallbackWebSearch ?? false}
            onChange={(v) => updateOverrideField('fallbackWebSearch', v)}
          />
        </SettingRow>
      )}
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
