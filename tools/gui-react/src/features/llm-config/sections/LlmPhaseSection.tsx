import { memo, useCallback, useMemo } from 'react';
import {
  SettingGroupBlock,
  SettingRow,
  SettingToggle,
} from '../../pipeline-settings';

/** Small "inherit from global" indicator rendered next to a select/input when it uses the global default. */
function GlobalDefaultIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Using global default"
      style={{ color: 'var(--sf-muted)' }}
    >
      <circle cx="8" cy="8" r="6.5" />
      <ellipse cx="8" cy="8" rx="3" ry="6.5" />
      <path d="M1.5 8h13M2.5 4.5h11M2.5 11.5h11" />
    </svg>
  );
}
import type { LlmPhaseId } from '../types/llmPhaseTypes';
import type { LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes';
import type { LlmPhaseId as OverridePhaseId } from '../types/llmPhaseOverrideTypes';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';
import { resolvePhaseModel } from '../state/llmPhaseOverridesBridge';
import { buildModelDropdownOptions } from '../state/llmModelDropdownOptions';

/** Maps hyphenated UI phase IDs to the camelCase keys used in LlmPhaseOverrides. */
const TAB_TO_OVERRIDE_KEY: Partial<Record<LlmPhaseId, OverridePhaseId>> = {
  'needset': 'needset',
  'brand-resolver': 'brandResolver',
  'search-planner': 'searchPlanner',
  'serp-triage': 'serpTriage',
  'domain-classifier': 'domainClassifier',
};

interface PhaseGlobalDraft {
  llmModelPlan: string;
  llmModelTriage: string;
  llmModelReasoning: string;
  llmPlanUseReasoning: boolean;
  llmTriageUseReasoning: boolean;
  llmMaxOutputTokensPlan: number;
  llmMaxOutputTokensTriage: number;
}

interface LlmPhaseSectionProps {
  phaseId: LlmPhaseId;
  inputCls: string;
  llmModelOptions: readonly string[];
  phaseOverrides: LlmPhaseOverrides;
  onPhaseOverrideChange: (overrides: LlmPhaseOverrides) => void;
  registry: LlmProviderEntry[];
  globalDraft: PhaseGlobalDraft;
}

export const LlmPhaseSection = memo(function LlmPhaseSection({
  phaseId,
  inputCls,
  llmModelOptions,
  phaseOverrides,
  onPhaseOverrideChange,
  registry,
  globalDraft,
}: LlmPhaseSectionProps) {
  const overrideKey = TAB_TO_OVERRIDE_KEY[phaseId];
  const resolved = overrideKey
    ? resolvePhaseModel(phaseOverrides, overrideKey, globalDraft)
    : null;

  const allOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry),
    [llmModelOptions, registry],
  );
  const reasoningOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, 'reasoning'),
    [llmModelOptions, registry],
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

  if (!overrideKey || !resolved) return null;

  return (
    <SettingGroupBlock title="Model Configuration">
      <SettingRow label="Base Model" tip="Override the global base model for this phase. Leave on default to inherit.">
        <div className="flex items-center gap-1.5">
          {!phaseOverrides[overrideKey]?.baseModel && <GlobalDefaultIcon />}
          <select
            className={inputCls}
            value={phaseOverrides[overrideKey]?.baseModel ?? ''}
            onChange={(e) => updateOverrideField('baseModel', e.target.value)}
          >
            <option value="">↩ {resolved.baseModel}</option>
            {allOptions.map((o) => (
              <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
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
          <select
            className={inputCls}
            value={phaseOverrides[overrideKey]?.reasoningModel ?? ''}
            onChange={(e) => updateOverrideField('reasoningModel', e.target.value)}
            disabled={!resolved.useReasoning}
          >
            <option value="">↩ {globalDraft.llmModelReasoning}</option>
            {reasoningOptions.map((o) => (
              <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
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
    </SettingGroupBlock>
  );
});
