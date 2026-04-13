import { memo, useCallback, useMemo, useState } from 'react';
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
import { extractEffortFromModelName } from '../state/llmEffortFromModelName.ts';

/** Small lock icon shown next to disabled effort selects when the level is baked into the model name. */
function LockedEffortIcon() {
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

interface LlmPhaseSectionProps {
  phaseId: LlmPhaseId;
  inputCls: string;
  llmModelOptions: readonly string[];
  phaseOverrides: LlmPhaseOverrides;
  onPhaseOverrideChange: (overrides: LlmPhaseOverrides) => void;
  registry: LlmProviderEntry[];
  globalDraft: GlobalDraftSlice;
  apiKeyFilter?: (provider: LlmProviderEntry) => boolean;
  phaseSchema?: { system_prompt: string; hero_system_prompt?: string; response_schema: Record<string, unknown>; hero_response_schema?: Record<string, unknown>; view_prompts?: Record<string, string> } | null;
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
  // lockedEffort detects baked-in effort from model name suffix (e.g. gpt-5.4-xhigh → "xhigh").
  function resolveCapabilities(modelKey: string | undefined) {
    if (!modelKey) return { thinking: false, webSearch: false, thinkingEffortOptions: [] as string[], lockedEffort: null as string | null };
    const provider = resolveProviderForModel(registry, modelKey);
    if (!provider) return { thinking: false, webSearch: false, thinkingEffortOptions: [] as string[], lockedEffort: null as string | null };
    const { modelId } = parseModelKey(modelKey);
    const model = provider.models.find((m) => m.modelId === modelId);
    return {
      thinking: model?.thinking === true,
      webSearch: model?.webSearch === true,
      thinkingEffortOptions: model?.thinkingEffortOptions ?? [],
      lockedEffort: extractEffortFromModelName(modelId),
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

  const writerModelCapabilities = useMemo(
    () => resolveCapabilities(resolved?.effectiveWriterModel),
    [resolved?.effectiveWriterModel, registry],
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
      <SettingRow label="JSON Strict Mode" tip="When ON (default), one LLM call with strict JSON schema. When OFF, two-phase: free-form research then a writer model formats the JSON.">
        <SettingToggle
          checked={resolved.jsonStrict}
          onChange={(v) => updateOverrideField('jsonStrict', v)}
        />
      </SettingRow>
      {!resolved.jsonStrict && (
        <div className="sf-text-caption sf-text-muted px-1 -mt-1">
          Research uses the primary model freely. The fallback model formats the JSON output.
        </div>
      )}
      <SettingRow label="Max Output Tokens" tip="Maximum output tokens for this phase. Leave empty to inherit global default.">
        <div className="flex items-center gap-1.5">
          {phaseOverrides[overrideKey]?.maxOutputTokens == null && !resolved.disableLimits && <GlobalDefaultIcon />}
          <input
            className={inputCls}
            type="number"
            min={0}
            step={1}
            value={resolved.disableLimits ? '' : (phaseOverrides[overrideKey]?.maxOutputTokens ?? '')}
            placeholder={resolved.disableLimits ? 'hardware max' : `↩ ${resolved.maxOutputTokens ?? 'auto'}`}
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
          {phaseOverrides[overrideKey]?.maxContextTokens == null && !resolved.disableLimits && <GlobalDefaultIcon />}
          <input
            className={inputCls}
            type="number"
            min={128}
            step={1}
            value={resolved.disableLimits ? '' : (phaseOverrides[overrideKey]?.maxContextTokens ?? '')}
            placeholder={resolved.disableLimits ? 'hardware max' : `↩ ${resolved.maxContextTokens ?? 'auto'}`}
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
          {phaseOverrides[overrideKey]?.timeoutMs == null && !resolved.disableLimits && <GlobalDefaultIcon />}
          <input
            className={inputCls}
            type="number"
            min={1000}
            step={1000}
            value={resolved.disableLimits ? '' : (phaseOverrides[overrideKey]?.timeoutMs ?? '')}
            placeholder={resolved.disableLimits ? '1200000 (20 min)' : `↩ ${resolved.timeoutMs ?? 'auto'}`}
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
      {effectiveModelCapabilities.thinking && (phaseOverrides[overrideKey]?.thinking ?? false) && effectiveModelCapabilities.lockedEffort && (
        <SettingRow label="Thinking Effort" tip="Effort level is locked in the model name.">
          <div className="flex items-center gap-1.5">
            <LockedEffortIcon />
            <select className={inputCls} disabled value={effectiveModelCapabilities.lockedEffort}>
              <option value={effectiveModelCapabilities.lockedEffort}>{effectiveModelCapabilities.lockedEffort}</option>
            </select>
          </div>
        </SettingRow>
      )}
      {effectiveModelCapabilities.thinking && (phaseOverrides[overrideKey]?.thinking ?? false) && !effectiveModelCapabilities.lockedEffort && effectiveModelCapabilities.thinkingEffortOptions.length > 1 && (
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

    {/* ── Fallback (error recovery — independent of writer) ── */}
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
      {fallbackModelCapabilities.thinking && (phaseOverrides[overrideKey]?.fallbackThinking ?? false) && fallbackModelCapabilities.lockedEffort && (
        <SettingRow label="Thinking Effort" tip="Effort level is locked in the model name.">
          <div className="flex items-center gap-1.5">
            <LockedEffortIcon />
            <select className={inputCls} disabled value={fallbackModelCapabilities.lockedEffort}>
              <option value={fallbackModelCapabilities.lockedEffort}>{fallbackModelCapabilities.lockedEffort}</option>
            </select>
          </div>
        </SettingRow>
      )}
      {fallbackModelCapabilities.thinking && (phaseOverrides[overrideKey]?.fallbackThinking ?? false) && !fallbackModelCapabilities.lockedEffort && fallbackModelCapabilities.thinkingEffortOptions.length > 1 && (
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

    {/* ── Writer Model (Phase 2 formatter — only visible when JSON Strict is OFF) ── */}
    {!resolved.jsonStrict && (
      <SettingGroupBlock title="Writer Model" collapsible storageKey={`sf:llm-phase:${phaseId}:writer`}>
        <SettingRow label="Model" tip="Model used to format research output into the JSON schema. Leave empty to use the primary model.">
          <div className="flex items-center gap-1.5">
            {!phaseOverrides[overrideKey]?.writerModel && <GlobalDefaultIcon />}
            <ModelSelectDropdown
              options={allOptions}
              className={inputCls}
              value={phaseOverrides[overrideKey]?.writerModel ?? ''}
              onChange={(v) => updateOverrideField('writerModel', v)}
              disabled={resolved.writerUseReasoning}
              allowNone
              noneLabel={`↩ ${parseModelKey(resolved.baseModel).modelId} (primary)`}
              noneModelId={resolved.baseModel}
            />
          </div>
        </SettingRow>
        <SettingRow label="Use Reasoning" tip="Enable reasoning model for the writer.">
          <SettingToggle
            checked={resolved.writerUseReasoning}
            onChange={(v) => updateOverrideField('writerUseReasoning', v)}
          />
        </SettingRow>
        {resolved.writerUseReasoning && (
          <SettingRow label="Reasoning Model" tip="Reasoning model for the writer.">
            <div className="flex items-center gap-1.5">
              {!phaseOverrides[overrideKey]?.writerReasoningModel && <GlobalDefaultIcon />}
              <ModelSelectDropdown
                options={reasoningOptions}
                className={inputCls}
                value={phaseOverrides[overrideKey]?.writerReasoningModel ?? ''}
                onChange={(v) => updateOverrideField('writerReasoningModel', v)}
                allowNone
                noneLabel={`↩ ${parseModelKey(globalDraft.llmModelReasoning).modelId || '(none)'}`}
                noneModelId={globalDraft.llmModelReasoning}
              />
            </div>
          </SettingRow>
        )}
        {writerModelCapabilities.thinking && (
          <SettingRow label="Thinking" tip="Send thinking flag to the writer model.">
            <SettingToggle
              checked={phaseOverrides[overrideKey]?.writerThinking ?? false}
              onChange={(v) => updateOverrideField('writerThinking', v)}
            />
          </SettingRow>
        )}
        {writerModelCapabilities.thinking && (phaseOverrides[overrideKey]?.writerThinking ?? false) && writerModelCapabilities.lockedEffort && (
          <SettingRow label="Thinking Effort" tip="Effort level is locked in the model name.">
            <div className="flex items-center gap-1.5">
              <LockedEffortIcon />
              <select className={inputCls} disabled value={writerModelCapabilities.lockedEffort}>
                <option value={writerModelCapabilities.lockedEffort}>{writerModelCapabilities.lockedEffort}</option>
              </select>
            </div>
          </SettingRow>
        )}
        {writerModelCapabilities.thinking && (phaseOverrides[overrideKey]?.writerThinking ?? false) && !writerModelCapabilities.lockedEffort && writerModelCapabilities.thinkingEffortOptions.length > 1 && (
          <SettingRow label="Thinking Effort" tip="Reasoning effort for the writer model.">
            <select
              className={inputCls}
              value={phaseOverrides[overrideKey]?.writerThinkingEffort ?? 'medium'}
              onChange={(e) => updateOverrideField('writerThinkingEffort', e.target.value)}
            >
              {writerModelCapabilities.thinkingEffortOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </SettingRow>
        )}
      </SettingGroupBlock>
    )}

    {phaseSchema && (
      <SettingGroupBlock title="LLM Call Contract">
        {phaseSchema.view_prompts ? (
          <ViewPromptTabs phaseSchema={phaseSchema} />
        ) : phaseSchema.hero_system_prompt ? (
          /* Two-column layout: View prompt (left) + Hero prompt (right) */
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">View System Prompt</div>
                <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text" style={{ maxHeight: '500px' }}>
                  {String(phaseSchema.system_prompt)}
                </pre>
              </div>
              <div>
                <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">Hero System Prompt</div>
                <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text" style={{ maxHeight: '500px' }}>
                  {String(phaseSchema.hero_system_prompt)}
                </pre>
              </div>
            </div>
            {phaseSchema.response_schema && (
              <div>
                <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">Response Schema (shared)</div>
                <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                  {JSON.stringify(phaseSchema.response_schema, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          /* Single-column layout (default for non-PIF phases) */
          <div className="space-y-3">
            {phaseSchema.system_prompt && (
              <div>
                <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">System Prompt</div>
                <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                  {String(phaseSchema.system_prompt)}
                </pre>
              </div>
            )}
            {phaseSchema.response_schema && (
              <div>
                <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">Response Schema</div>
                <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                  {JSON.stringify(phaseSchema.response_schema, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </SettingGroupBlock>
    )}
  </>
  );
});

/* ── View Prompt Tabs (Carousel Builder) ────────────────────────── */

function ViewPromptTabs({ phaseSchema }: {
  readonly phaseSchema: {
    system_prompt: string;
    hero_system_prompt?: string;
    response_schema: Record<string, unknown>;
    hero_response_schema?: Record<string, unknown>;
    view_prompts?: Record<string, string>;
  };
}) {
  const viewEntries = Object.entries(phaseSchema.view_prompts ?? {});
  const tabs = [
    ...viewEntries.map(([view]) => view),
    ...(phaseSchema.hero_system_prompt ? ['hero'] : []),
    'schema',
  ];
  const [activeTab, setActiveTab] = useState(tabs[0] ?? 'schema');

  const activePrompt = activeTab === 'hero'
    ? phaseSchema.hero_system_prompt ?? ''
    : activeTab === 'schema'
      ? null
      : (phaseSchema.view_prompts?.[activeTab] ?? '');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer transition-opacity ${
              activeTab === tab
                ? 'sf-primary-button'
                : 'sf-btn-ghost sf-text-muted hover:opacity-80'
            }`}
          >
            {tab === 'schema' ? 'Schema' : tab === 'hero' ? 'Hero' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'schema' ? (
        <div className="space-y-3">
          <div>
            <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">View Eval Response Schema</div>
            <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
              {JSON.stringify(phaseSchema.response_schema, null, 2)}
            </pre>
          </div>
          {phaseSchema.hero_response_schema && (
            <div>
              <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">Hero Selection Response Schema</div>
              <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                {JSON.stringify(phaseSchema.hero_response_schema, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">
            {activeTab === 'hero' ? 'Hero Selection' : `${activeTab} View`} System Prompt
          </div>
          <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text" style={{ minHeight: '300px' }}>
            {String(activePrompt)}
          </pre>
        </div>
      )}
    </div>
  );
}
