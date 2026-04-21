import { memo, useCallback, useMemo } from 'react';
import { SettingGroupBlock, SettingRow, SettingToggle } from '../../pipeline-settings/index.ts';
import { NumberStepper } from '../../../shared/ui/forms/NumberStepper.tsx';
import { ModelSelectDropdown, GlobalDefaultIcon } from '../components/ModelSelectDropdown.tsx';
import { buildModelDropdownOptions } from '../state/llmModelDropdownOptions.ts';
import { parseModelKey, resolveProviderForModel } from '../state/llmProviderRegistryBridge.ts';
import { extractEffortFromModelName } from '../state/llmEffortFromModelName.ts';
import { PromptTemplatesSection } from './LlmPhaseSection.tsx';
import type { PromptTemplateDef } from './LlmPhaseSection.tsx';
import type { LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes.generated.ts';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';
import type { GlobalDraftSlice } from '../state/llmPhaseOverridesBridge.generated.ts';
import type { RuntimeDraft } from '../../pipeline-settings/index.ts';

const OVERRIDE_KEY = 'keyFinder' as const;

interface TierBundle {
  model: string;
  useReasoning: boolean;
  reasoningModel: string;
  thinking: boolean;
  thinkingEffort: '' | 'low' | 'medium' | 'high' | 'xhigh';
  webSearch: boolean;
}

interface TierSettings {
  easy: TierBundle;
  medium: TierBundle;
  hard: TierBundle;
  very_hard: TierBundle;
  fallback: TierBundle;
}

const EMPTY_TIER: TierBundle = {
  model: '',
  useReasoning: false,
  reasoningModel: '',
  thinking: false,
  thinkingEffort: '',
  webSearch: false,
};

const DEFAULT_TIER_SETTINGS: TierSettings = {
  easy: { ...EMPTY_TIER },
  medium: { ...EMPTY_TIER },
  hard: { ...EMPTY_TIER },
  very_hard: { ...EMPTY_TIER },
  fallback: { model: 'gpt-5.4', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
};

const DIFFICULTY_TIERS: Array<{ key: 'easy' | 'medium' | 'hard' | 'very_hard'; label: string }> = [
  { key: 'easy', label: 'Easy Tier' },
  { key: 'medium', label: 'Medium Tier' },
  { key: 'hard', label: 'Hard Tier' },
  { key: 'very_hard', label: 'Very Hard Tier' },
];

interface PhaseSchema {
  system_prompt?: string;
  response_schema?: Record<string, unknown>;
  prompt_templates?: readonly PromptTemplateDef[];
}

interface LlmKeyFinderSectionProps {
  inputCls: string;
  llmModelOptions: readonly string[];
  phaseOverrides: LlmPhaseOverrides;
  onPhaseOverrideChange: (overrides: LlmPhaseOverrides) => void;
  registry: LlmProviderEntry[];
  globalDraft: GlobalDraftSlice;
  apiKeyFilter?: (provider: LlmProviderEntry) => boolean;
  runtimeDraft: RuntimeDraft;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  phaseSchema?: PhaseSchema | null;
}

function parseTiers(raw: unknown): TierSettings {
  if (typeof raw !== 'string' || !raw) return DEFAULT_TIER_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        easy: { ...EMPTY_TIER, ...(parsed.easy ?? {}) },
        medium: { ...EMPTY_TIER, ...(parsed.medium ?? {}) },
        hard: { ...EMPTY_TIER, ...(parsed.hard ?? {}) },
        very_hard: { ...EMPTY_TIER, ...(parsed.very_hard ?? {}) },
        fallback: { ...DEFAULT_TIER_SETTINGS.fallback, ...(parsed.fallback ?? {}) },
      };
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_TIER_SETTINGS;
}

export const LlmKeyFinderSection = memo(function LlmKeyFinderSection({
  inputCls,
  llmModelOptions,
  phaseOverrides,
  onPhaseOverrideChange,
  registry,
  globalDraft,
  apiKeyFilter,
  runtimeDraft,
  updateDraft,
  phaseSchema,
}: LlmKeyFinderSectionProps) {
  const tiers = useMemo(() => parseTiers(runtimeDraft.keyFinderTierSettingsJson), [runtimeDraft.keyFinderTierSettingsJson]);
  const override = phaseOverrides[OVERRIDE_KEY] ?? {};

  const baseOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, 'primary', apiKeyFilter),
    [llmModelOptions, registry, apiKeyFilter],
  );
  const reasoningOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, 'reasoning', apiKeyFilter),
    [llmModelOptions, registry, apiKeyFilter],
  );

  const updateOverrideField = useCallback(
    <K extends string>(field: K, value: unknown) => {
      const current = phaseOverrides[OVERRIDE_KEY] ?? {};
      onPhaseOverrideChange({
        ...phaseOverrides,
        [OVERRIDE_KEY]: { ...current, [field]: value },
      });
    },
    [phaseOverrides, onPhaseOverrideChange],
  );

  const updateTier = useCallback(
    (tierKey: keyof TierSettings, patch: Partial<TierBundle>) => {
      const next: TierSettings = { ...tiers, [tierKey]: { ...tiers[tierKey], ...patch } };
      updateDraft('keyFinderTierSettingsJson', JSON.stringify(next));
    },
    [tiers, updateDraft],
  );

  function resolveCapabilities(modelKey: string): { thinking: boolean; webSearch: boolean; thinkingEffortOptions: readonly string[]; lockedEffort: string | null } {
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

  const disableLimits = Boolean(override.disableLimits);

  const renderTierCard = (tierKey: keyof TierSettings, label: string, isFallback: boolean) => {
    const tier = tiers[tierKey];
    const effectiveModelId = tier.useReasoning ? tier.reasoningModel : tier.model;
    const caps = resolveCapabilities(effectiveModelId);
    const inheritedFromFallback = !isFallback ? tiers.fallback.model : '';
    return (
      <SettingGroupBlock
        key={tierKey}
        title={label}
        collapsible
        storageKey={`sf:llm-key-finder:tier:${tierKey}`}
      >
        <SettingRow
          label="Model"
          tip={isFallback
            ? 'Primary model for the Key Finder fallback path. All difficulty tiers inherit this when empty.'
            : `Model for ${label.replace(' Tier', '').toLowerCase()}-difficulty keys. Empty inherits from Fallback.`}
        >
          <div className="flex items-center gap-1.5">
            {!tier.model && !isFallback && <GlobalDefaultIcon />}
            <ModelSelectDropdown
              options={baseOptions}
              className={inputCls}
              value={tier.model}
              onChange={(v: string) => updateTier(tierKey, { model: v })}
              allowNone={!isFallback}
              noneLabel={isFallback ? undefined : `↩ ${parseModelKey(inheritedFromFallback).modelId || '(fallback)'}`}
              noneModelId={inheritedFromFallback}
              globalDefaultModelId={globalDraft.llmModelPlan}
            />
          </div>
        </SettingRow>
        <SettingRow label="Use Reasoning" tip="Swap to the reasoning model for this tier.">
          <SettingToggle
            checked={tier.useReasoning}
            onChange={(v: boolean) => updateTier(tierKey, { useReasoning: v })}
          />
        </SettingRow>
        {tier.useReasoning && (
          <SettingRow label="Reasoning Model" tip="Reasoning model used when Use Reasoning is on.">
            <ModelSelectDropdown
              options={reasoningOptions}
              className={inputCls}
              value={tier.reasoningModel}
              onChange={(v: string) => updateTier(tierKey, { reasoningModel: v })}
              allowNone
              noneLabel={`↩ ${parseModelKey(globalDraft.llmModelReasoning).modelId}`}
              noneModelId={globalDraft.llmModelReasoning}
              globalDefaultModelId={globalDraft.llmModelReasoning}
            />
          </SettingRow>
        )}
        {caps.thinking && (
          <SettingRow label="Thinking" tip="Send thinking flag to the model.">
            <SettingToggle
              checked={tier.thinking}
              onChange={(v: boolean) => updateTier(tierKey, { thinking: v })}
            />
          </SettingRow>
        )}
        {caps.thinking && tier.thinking && caps.lockedEffort && (
          <SettingRow label="Thinking Effort" tip="Effort level is locked in the model name.">
            <select className={inputCls} disabled value={caps.lockedEffort}>
              <option value={caps.lockedEffort}>{caps.lockedEffort}</option>
            </select>
          </SettingRow>
        )}
        {caps.thinking && tier.thinking && !caps.lockedEffort && caps.thinkingEffortOptions.length > 1 && (
          <SettingRow label="Thinking Effort" tip="Reasoning effort level sent to the model.">
            <select
              className={inputCls}
              value={tier.thinkingEffort || 'medium'}
              onChange={(e) =>
                updateTier(tierKey, { thinkingEffort: e.target.value as TierBundle['thinkingEffort'] })
              }
            >
              {caps.thinkingEffortOptions.map((opt: string) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </SettingRow>
        )}
        {caps.webSearch && (
          <SettingRow label="Web Search" tip="Send web_search flag to the model for this tier.">
            <SettingToggle
              checked={tier.webSearch}
              onChange={(v: boolean) => updateTier(tierKey, { webSearch: v })}
            />
          </SettingRow>
        )}
      </SettingGroupBlock>
    );
  };

  return (
    <>
      <SettingGroupBlock title="Limits" collapsible storageKey="sf:llm-phase:key-finder:limits">
        <SettingRow label="Disable Limits" tip="Remove all per-phase token and timeout caps. Only the model's hardware maximum applies.">
          <SettingToggle
            checked={disableLimits}
            onChange={(v: boolean) => updateOverrideField('disableLimits', v)}
          />
        </SettingRow>
        <SettingRow label="JSON Strict Mode" tip="When ON, one LLM call with strict JSON schema. When OFF, two-phase: free-form research then the global Writer phase formats the JSON.">
          <SettingToggle
            checked={override.jsonStrict ?? true}
            onChange={(v: boolean) => updateOverrideField('jsonStrict', v)}
          />
        </SettingRow>
        <SettingRow label="Max Output Tokens" tip="Maximum output tokens for this phase. Leave empty to inherit global default.">
          <div className="flex items-center gap-1.5">
            {override.maxOutputTokens == null && !disableLimits && <GlobalDefaultIcon />}
            <NumberStepper
              className="w-full"
              min={0}
              step={1}
              value={disableLimits ? '' : String(override.maxOutputTokens ?? '')}
              placeholder={disableLimits ? 'hardware max' : `↩ ${globalDraft.llmMaxOutputTokensPlan ?? 'auto'}`}
              disabled={disableLimits}
              ariaLabel="max output tokens"
              onChange={(next) => {
                updateOverrideField('maxOutputTokens', next === '' ? null : Number.parseInt(next, 10) || 0);
              }}
            />
          </div>
        </SettingRow>
        <SettingRow label="Max Context Tokens" tip="Maximum context window tokens for this phase. Leave empty to inherit global default.">
          <div className="flex items-center gap-1.5">
            {override.maxContextTokens == null && !disableLimits && <GlobalDefaultIcon />}
            <NumberStepper
              className="w-full"
              min={128}
              step={1}
              value={disableLimits ? '' : String(override.maxContextTokens ?? '')}
              placeholder={disableLimits ? 'hardware max' : `↩ ${globalDraft.llmMaxTokens ?? 'auto'}`}
              disabled={disableLimits}
              ariaLabel="max context tokens"
              onChange={(next) => {
                updateOverrideField('maxContextTokens', next === '' ? null : Number.parseInt(next, 10) || 0);
              }}
            />
          </div>
        </SettingRow>
        <SettingRow label="Reasoning Budget" tip="Thinking/reasoning token budget for this phase. Leave empty to inherit global default.">
          <div className="flex items-center gap-1.5">
            {override.reasoningBudget == null && !disableLimits && <GlobalDefaultIcon />}
            <NumberStepper
              className="w-full"
              min={0}
              step={1}
              value={disableLimits ? '' : String(override.reasoningBudget ?? '')}
              placeholder={disableLimits ? 'hardware max' : `↩ ${globalDraft.llmReasoningBudget ?? 'auto'}`}
              disabled={disableLimits}
              ariaLabel="reasoning budget"
              onChange={(next) => {
                updateOverrideField('reasoningBudget', next === '' ? null : Number.parseInt(next, 10) || 0);
              }}
            />
          </div>
        </SettingRow>
        <SettingRow label="Timeout (ms)" tip="LLM request timeout for this phase. Leave empty to inherit global default.">
          <div className="flex items-center gap-1.5">
            {override.timeoutMs == null && !disableLimits && <GlobalDefaultIcon />}
            <NumberStepper
              className="w-full"
              min={1000}
              step={1000}
              value={disableLimits ? '' : String(override.timeoutMs ?? '')}
              placeholder={disableLimits ? '1200000 (20 min)' : `↩ ${globalDraft.llmTimeoutMs ?? 'auto'}`}
              disabled={disableLimits}
              ariaLabel="timeout ms"
              onChange={(next) => {
                updateOverrideField('timeoutMs', next === '' ? null : Number.parseInt(next, 10) || 0);
              }}
            />
          </div>
        </SettingRow>
      </SettingGroupBlock>

      {DIFFICULTY_TIERS.map(({ key, label }) => renderTierCard(key, label, false))}

      {renderTierCard('fallback', 'Fallback', true)}

      {phaseSchema && (
        <SettingGroupBlock title="LLM Call Contract" collapsible storageKey="sf:llm-phase:key-finder:contract">
          {phaseSchema.prompt_templates && phaseSchema.prompt_templates.length > 0 ? (
            <PromptTemplatesSection
              phaseId="key-finder"
              promptTemplates={phaseSchema.prompt_templates}
              phaseOverrides={phaseOverrides}
              onPhaseOverrideChange={onPhaseOverrideChange}
              responseSchemas={phaseSchema.response_schema ? [phaseSchema.response_schema] : []}
            />
          ) : (
            <>
              {phaseSchema.system_prompt && (
                <div className="mb-3">
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
            </>
          )}
        </SettingGroupBlock>
      )}
    </>
  );
});
