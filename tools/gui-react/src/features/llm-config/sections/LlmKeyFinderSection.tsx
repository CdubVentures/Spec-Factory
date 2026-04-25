import { memo, useCallback, useMemo } from 'react';
import { SettingGroupBlock, SettingRow, SettingToggle } from '../../pipeline-settings/index.ts';
import { NumberStepper } from '../../../shared/ui/forms/NumberStepper.tsx';
import { GlobalDefaultIcon } from '../components/ModelSelectDropdown.tsx';
import {
  LlmCapabilityPickerCore,
  type LlmCapabilityBundle,
} from '../../../shared/ui/finder/LlmCapabilityPickerCore.tsx';
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

  const disableLimits = Boolean(override.disableLimits);

  const renderTierCard = (tierKey: keyof TierSettings, label: string, isFallback: boolean) => {
    const tier = tiers[tierKey];
    const inheritedFromFallback = !isFallback ? tiers.fallback.model : '';
    const handleTierChange = (next: LlmCapabilityBundle) => {
      updateTier(tierKey, next);
    };
    return (
      <SettingGroupBlock
        key={tierKey}
        title={label}
        collapsible
        storageKey={`sf:llm-key-finder:tier:${tierKey}`}
      >
        <LlmCapabilityPickerCore
          value={tier}
          onChange={handleTierChange}
          registry={registry}
          llmModelOptions={llmModelOptions}
          apiKeyFilter={apiKeyFilter}
          globalDefaultPlanModel={globalDraft.llmModelPlan}
          globalDefaultReasoningModel={globalDraft.llmModelReasoning}
          inheritedModelId={inheritedFromFallback}
          allowModelNone={!isFallback}
          inputCls={inputCls}
        />
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
