import { memo, useCallback } from 'react';
import { SettingGroupBlock, SettingRow, SettingToggle } from '../../pipeline-settings/index.ts';
import { NumberStepper } from '../../../shared/ui/forms/NumberStepper.tsx';
import { AxisPointTable } from '../components/AxisPointTable.tsx';
import { ModelSelectDropdown, GlobalDefaultIcon } from '../components/ModelSelectDropdown.tsx';
import { buildModelDropdownOptions } from '../state/llmModelDropdownOptions.ts';
import { LlmPhaseSection } from './LlmPhaseSection.tsx';
import type { LlmPhaseId } from '../types/llmPhaseTypes.generated.ts';
import type { LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes.generated.ts';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';
import type { GlobalDraftSlice } from '../state/llmPhaseOverridesBridge.generated.ts';
import type { RuntimeDraft } from '../../pipeline-settings/index.ts';

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
}

const TIER_KEYS = ['easy', 'medium', 'hard', 'very_hard', 'fallback'] as const;
const DIFFICULTY_KEYS = ['easy', 'medium', 'hard', 'very_hard'] as const;
const REQUIRED_KEYS = ['mandatory', 'non_mandatory'] as const;
const AVAILABILITY_KEYS = ['always', 'sometimes', 'rare'] as const;

const TIER_SETTING_KEY: Record<typeof TIER_KEYS[number], keyof RuntimeDraft> = {
  easy: 'keyFinderModelEasy',
  medium: 'keyFinderModelMedium',
  hard: 'keyFinderModelHard',
  very_hard: 'keyFinderModelVeryHard',
  fallback: 'keyFinderModelFallback',
};

function safeParseRecord(raw: unknown): Record<string, number> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') return obj as Record<string, number>;
    return {};
  } catch {
    return {};
  }
}

function prettifyTier(tier: string): string {
  return tier.replace(/_/g, ' ');
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
}: LlmKeyFinderSectionProps) {
  const updateJsonRecord = useCallback(
    (flatKey: keyof RuntimeDraft, rowKey: string, value: number) => {
      const current = safeParseRecord(runtimeDraft[flatKey]);
      const next = { ...current, [rowKey]: value };
      updateDraft(flatKey, JSON.stringify(next) as RuntimeDraft[typeof flatKey]);
    },
    [runtimeDraft, updateDraft],
  );

  const baseOptions = buildModelDropdownOptions(llmModelOptions, registry, 'primary', apiKeyFilter);

  const budgetRequired = safeParseRecord(runtimeDraft.keyFinderBudgetRequiredPointsJson);
  const budgetAvailability = safeParseRecord(runtimeDraft.keyFinderBudgetAvailabilityPointsJson);
  const budgetDifficulty = safeParseRecord(runtimeDraft.keyFinderBudgetDifficultyPointsJson);
  const bundlingCost = safeParseRecord(runtimeDraft.keyFinderBundlingPassengerCostJson);
  const bundlingPool = safeParseRecord(runtimeDraft.keyFinderBundlingPoolPerPrimaryJson);

  return (
    <div>
      <LlmPhaseSection
        phaseId={'key-finder' as LlmPhaseId}
        inputCls={inputCls}
        llmModelOptions={llmModelOptions}
        phaseOverrides={phaseOverrides}
        onPhaseOverrideChange={onPhaseOverrideChange}
        registry={registry}
        globalDraft={globalDraft}
        apiKeyFilter={apiKeyFilter}
        phaseSchema={null}
      />

      <SettingGroupBlock title="Per-Tier Model Overrides" collapsible storageKey="sf:llm-key-finder:tiers">
        {TIER_KEYS.map((tier) => {
          const flatKey = TIER_SETTING_KEY[tier];
          const value = String(runtimeDraft[flatKey] ?? '');
          return (
            <SettingRow
              key={tier}
              label={prettifyTier(tier)}
              tip={`Override model for ${prettifyTier(tier)}-difficulty keys; empty = inherit from base model.`}
            >
              <div className="flex items-center gap-1.5">
                {!value && <GlobalDefaultIcon />}
                <ModelSelectDropdown
                  options={baseOptions}
                  className={inputCls}
                  value={value}
                  onChange={(v: string) => updateDraft(flatKey, v as RuntimeDraft[typeof flatKey])}
                  allowNone
                  noneLabel="↩ inherit"
                  noneModelId={globalDraft.llmModelPlan}
                />
              </div>
            </SettingRow>
          );
        })}
      </SettingGroupBlock>

      <SettingGroupBlock title="Budget Scoring" collapsible storageKey="sf:llm-key-finder:budget">
        <div className="sf-text-label pb-2" style={{ color: 'var(--sf-muted)' }}>
          budget = max(floor, required + availability + difficulty + (variantCount − 1) × variantPointsPerExtra)
        </div>
        <AxisPointTable
          rowKeys={REQUIRED_KEYS as readonly string[]}
          values={budgetRequired}
          onRowChange={(rowKey, value) => updateJsonRecord('keyFinderBudgetRequiredPointsJson', rowKey, value)}
          rowLabel={(key) => `required: ${prettifyTier(key)}`}
        />
        <AxisPointTable
          rowKeys={AVAILABILITY_KEYS as readonly string[]}
          values={budgetAvailability}
          onRowChange={(rowKey, value) => updateJsonRecord('keyFinderBudgetAvailabilityPointsJson', rowKey, value)}
          rowLabel={(key) => `availability: ${prettifyTier(key)}`}
        />
        <AxisPointTable
          rowKeys={DIFFICULTY_KEYS as readonly string[]}
          values={budgetDifficulty}
          onRowChange={(rowKey, value) => updateJsonRecord('keyFinderBudgetDifficultyPointsJson', rowKey, value)}
          rowLabel={(key) => `difficulty: ${prettifyTier(key)}`}
        />
        <SettingRow label="Variant points per extra" tip="Added per variant beyond the first.">
          <NumberStepper
            value={String(runtimeDraft.keyFinderBudgetVariantPointsPerExtra ?? 1)}
            onChange={(v) => {
              const n = Number(v);
              if (Number.isFinite(n)) updateDraft('keyFinderBudgetVariantPointsPerExtra', Math.trunc(n));
            }}
            min={0}
            max={10}
            step={1}
            className="w-28"
            ariaLabel="Variant points per extra"
          />
        </SettingRow>
        <SettingRow label="Budget floor" tip="Minimum attempts regardless of axis sum.">
          <NumberStepper
            value={String(runtimeDraft.keyFinderBudgetFloor ?? 3)}
            onChange={(v) => {
              const n = Number(v);
              if (Number.isFinite(n)) updateDraft('keyFinderBudgetFloor', Math.trunc(n));
            }}
            min={1}
            max={20}
            step={1}
            className="w-28"
            ariaLabel="Budget floor"
          />
        </SettingRow>
      </SettingGroupBlock>

      <SettingGroupBlock title="Bundling" collapsible storageKey="sf:llm-key-finder:bundling">
        <SettingRow label="Enabled" tip="Enable same-group passenger packing during Smart Loop (per-key Run and Loop always solo).">
          <SettingToggle
            checked={Boolean(runtimeDraft.keyFinderBundlingEnabled)}
            onChange={(v) => updateDraft('keyFinderBundlingEnabled', v)}
          />
        </SettingRow>
        <AxisPointTable
          rowKeys={DIFFICULTY_KEYS as readonly string[]}
          values={bundlingCost}
          onRowChange={(rowKey, value) => updateJsonRecord('keyFinderBundlingPassengerCostJson', rowKey, value)}
          rowLabel={(key) => `cost: ${prettifyTier(key)}`}
        />
        <AxisPointTable
          rowKeys={DIFFICULTY_KEYS as readonly string[]}
          values={bundlingPool}
          onRowChange={(rowKey, value) => updateJsonRecord('keyFinderBundlingPoolPerPrimaryJson', rowKey, value)}
          rowLabel={(key) => `pool: ${prettifyTier(key)}`}
        />
        <SettingRow label="Passenger policy" tip="less_or_equal allows easier passengers; same_only restricts to same difficulty.">
          <select
            className={inputCls}
            value={String(runtimeDraft.keyFinderPassengerDifficultyPolicy ?? 'less_or_equal')}
            onChange={(e) => updateDraft('keyFinderPassengerDifficultyPolicy', e.target.value)}
          >
            <option value="less_or_equal">less_or_equal</option>
            <option value="same_only">same_only</option>
          </select>
        </SettingRow>
      </SettingGroupBlock>
    </div>
  );
});
