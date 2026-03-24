import { memo, Suspense, lazy, useMemo, useCallback } from 'react';
import {
  SettingGroupBlock,
  type NumberBound,
  type RuntimeDraft,
} from '../../pipeline-settings/index.ts';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';
import { resolveProviderForModel, syncCostsFromRegistry } from '../state/llmProviderRegistryBridge.ts';
import { buildModelDropdownOptions } from '../state/llmModelDropdownOptions.ts';
import { detectMixIssues, detectStaleModelIssues, resolveRingColor } from '../state/llmMixDetection.ts';
import { detectEmptyModelFields } from '../state/llmModelValidation.ts';
import { AlertBanner } from '../../../shared/ui/feedback/AlertBanner.tsx';
import { usePersistedExpandMap } from '../../../stores/tabStore.ts';
import { validatePhaseTokenLimits } from '../state/llmTokenLimitValidation.ts';
import { HealthDot } from '../../../shared/ui/feedback/HealthDot.tsx';
import { LlmAllModelsSection } from './LlmAllModelsSection.tsx';
import { ModelSelectDropdown } from '../components/ModelSelectDropdown.tsx';

const LlmProviderRegistrySection = lazy(async () => {
  const module = await import('./LlmProviderRegistrySection.tsx');
  return { default: module.LlmProviderRegistrySection };
});

interface LlmGlobalSectionProps {
  runtimeDraft: RuntimeDraft;
  inputCls: string;
  llmModelOptions: readonly string[];
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  registry: LlmProviderEntry[];
  onRegistryChange: (registry: LlmProviderEntry[]) => void;
  apiKeyFilter?: (provider: LlmProviderEntry) => boolean;
}

export const LlmGlobalSection = memo(function LlmGlobalSection({
  runtimeDraft,
  inputCls,
  llmModelOptions,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  registry,
  onRegistryChange,
  apiKeyFilter,
}: LlmGlobalSectionProps) {
  const [dismissedAlerts, , replaceDismissedAlerts] = usePersistedExpandMap('llmConfig:global:dismissedAlerts');

  const baseOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, 'primary', apiKeyFilter),
    [llmModelOptions, registry, apiKeyFilter],
  );
  const reasoningOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, 'reasoning', apiKeyFilter),
    [llmModelOptions, registry, apiKeyFilter],
  );
  const allOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, undefined, apiKeyFilter),
    [llmModelOptions, registry, apiKeyFilter],
  );

  const globalModelFields = useMemo(() => ({
    llmModelPlan: runtimeDraft.llmModelPlan,
    llmModelReasoning: runtimeDraft.llmModelReasoning,
  }), [runtimeDraft.llmModelPlan, runtimeDraft.llmModelReasoning]);

  const mixIssues = useMemo(
    () => detectMixIssues(registry, {
      llmModelPlan: runtimeDraft.llmModelPlan,
      llmModelReasoning: runtimeDraft.llmModelReasoning,
      llmPlanFallbackModel: runtimeDraft.llmPlanFallbackModel,
      llmReasoningFallbackModel: runtimeDraft.llmReasoningFallbackModel,
    }),
    [registry, runtimeDraft.llmModelPlan, runtimeDraft.llmModelReasoning, runtimeDraft.llmPlanFallbackModel, runtimeDraft.llmReasoningFallbackModel],
  );

  const emptyIssues = useMemo(
    () => detectEmptyModelFields(globalModelFields),
    [globalModelFields],
  );

  const staleIssues = useMemo(
    () => detectStaleModelIssues(registry, globalModelFields, llmModelOptions),
    [registry, globalModelFields, llmModelOptions],
  );

  const allIssues = useMemo(
    () => [...emptyIssues, ...mixIssues, ...staleIssues],
    [emptyIssues, mixIssues, staleIssues],
  );

  const dismissAlert = useCallback((key: string) => {
    replaceDismissedAlerts({ ...dismissedAlerts, [key]: true });
  }, [dismissedAlerts, replaceDismissedAlerts]);

  const handleBaseModelChange = useCallback((newModelId: string) => {
    updateDraft('llmModelPlan', newModelId);
    const costs = syncCostsFromRegistry(registry, newModelId);
    if (costs) {
      updateDraft('llmCostInputPer1M', costs.llmCostInputPer1M);
      updateDraft('llmCostOutputPer1M', costs.llmCostOutputPer1M);
      updateDraft('llmCostCachedInputPer1M', costs.llmCostCachedInputPer1M);
    }
  }, [updateDraft, registry]);

  const ringStyle = useCallback((field: string) => {
    const color = resolveRingColor(field, allIssues, dismissedAlerts);
    return color ? { boxShadow: `0 0 0 2px ${color}` } : undefined;
  }, [allIssues, dismissedAlerts]);

  const tokenWarnings = useMemo(
    () => validatePhaseTokenLimits(runtimeDraft as unknown as Record<string, unknown>, registry),
    [runtimeDraft, registry],
  );

  const baseProv = resolveProviderForModel(registry, runtimeDraft.llmModelPlan);
  const reasonProv = resolveProviderForModel(registry, runtimeDraft.llmModelReasoning);
  const baseFbProv = resolveProviderForModel(registry, runtimeDraft.llmPlanFallbackModel);
  const reasonFbProv = resolveProviderForModel(registry, runtimeDraft.llmReasoningFallbackModel);

  return (
    <>
      {/* ── Section 1: Provider Registry ── */}
      <SettingGroupBlock
        title="Provider Registry"
        collapsible
        storageKey="sf:llm-global:provider-registry"
      >
        <Suspense fallback={null}>
          <LlmProviderRegistrySection
            registry={registry}
            onRegistryChange={onRegistryChange}
          />
        </Suspense>
      </SettingGroupBlock>

      {/* ── Section 2: All Models ── */}
      <SettingGroupBlock
        title="All Models"
        collapsible
        defaultCollapsed
        storageKey="sf:llm-global:all-models"
      >
        <LlmAllModelsSection registry={registry} />
      </SettingGroupBlock>

      {/* ── Section 3: Global Defaults ── */}
      <SettingGroupBlock
        title="Global Defaults"
        collapsible
        storageKey="sf:llm-global:defaults"
      >
        {/* A — Model Selection */}
        <div className="sf-text-caption font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
          Model selection
        </div>
        <div className="sf-text-caption mb-2" style={{ color: 'var(--sf-muted)', opacity: 0.8 }}>
          These propagate to all phases. Override per-phase if needed.
        </div>
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
          {/* Row 1: Base model | Reasoning model */}
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Base model</label>
            <div className="flex items-center gap-1.5">
              <ModelSelectDropdown
                options={baseOptions}
                className={inputCls}
                value={runtimeDraft.llmModelPlan}
                onChange={handleBaseModelChange}
                style={ringStyle('llmModelPlan')}
              />
              <HealthDot status={baseProv?.health ?? 'gray'} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Reasoning model</label>
            <div className="flex items-center gap-1.5">
              <ModelSelectDropdown
                options={reasoningOptions}
                className={inputCls}
                value={runtimeDraft.llmModelReasoning}
                onChange={(v) => updateDraft('llmModelReasoning', v)}
                style={ringStyle('llmModelReasoning')}
              />
              <HealthDot status={reasonProv?.health ?? 'gray'} />
            </div>
          </div>
          {/* Row 2: Base fallback | Reasoning fallback */}
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Base fallback</label>
            <div className="flex items-center gap-1.5">
              <ModelSelectDropdown
                options={allOptions}
                className={inputCls}
                value={runtimeDraft.llmPlanFallbackModel}
                onChange={(v) => updateDraft('llmPlanFallbackModel', v)}
                style={ringStyle('llmPlanFallbackModel')}
                allowNone
              />
              <HealthDot status={baseFbProv?.health ?? 'gray'} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Reasoning fallback</label>
            <div className="flex items-center gap-1.5">
              <ModelSelectDropdown
                options={allOptions}
                className={inputCls}
                value={runtimeDraft.llmReasoningFallbackModel}
                onChange={(v) => updateDraft('llmReasoningFallbackModel', v)}
                style={ringStyle('llmReasoningFallbackModel')}
                allowNone
              />
              <HealthDot status={reasonFbProv?.health ?? 'gray'} />
            </div>
          </div>
        </div>

        {/* Model validation + mix detection alerts */}
        {allIssues.filter((i) => !dismissedAlerts[i.key]).length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3">
            {allIssues
              .filter((i) => !dismissedAlerts[i.key])
              .map((issue) => (
                <AlertBanner
                  key={issue.key}
                  severity={issue.severity}
                  title={issue.title}
                  message={issue.message}
                  onDismiss={issue.severity !== 'error' ? () => dismissAlert(issue.key) : undefined}
                />
              ))}
          </div>
        )}

        {/* Divider */}
        <div className="border-t" style={{ borderColor: 'var(--sf-border)', margin: 'var(--sf-space-4) 0' }} />

        {/* B — Limits */}
        <div className="sf-text-caption font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--sf-muted)' }}>
          Limits
        </div>
        <div className="grid grid-cols-3 gap-x-3.5 gap-y-2.5">
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Max context tokens</label>
            <input
              className={inputCls}
              type="number"
              value={runtimeDraft.llmMaxTokens}
              onChange={(e) => onNumberChange('llmMaxTokens', e.target.value, getNumberBounds('llmMaxTokens'))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Max output tokens</label>
            <input
              className={inputCls}
              type="number"
              value={runtimeDraft.llmMaxOutputTokens}
              onChange={(e) => onNumberChange('llmMaxOutputTokens', e.target.value, getNumberBounds('llmMaxOutputTokens'))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Timeout (ms)</label>
            <input
              className={inputCls}
              type="number"
              value={runtimeDraft.llmTimeoutMs}
              onChange={(e) => onNumberChange('llmTimeoutMs', e.target.value, getNumberBounds('llmTimeoutMs'))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Max calls / round</label>
            <input
              className={inputCls}
              type="number"
              value={runtimeDraft.llmMaxCallsPerRound}
              onChange={(e) => onNumberChange('llmMaxCallsPerRound', e.target.value, getNumberBounds('llmMaxCallsPerRound'))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Max calls / product</label>
            <input
              className={inputCls}
              type="number"
              value={runtimeDraft.llmMaxCallsPerProductTotal}
              onChange={(e) => onNumberChange('llmMaxCallsPerProductTotal', e.target.value, getNumberBounds('llmMaxCallsPerProductTotal'))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Reasoning budget</label>
            <input
              className={inputCls}
              type="number"
              value={runtimeDraft.llmReasoningBudget}
              onChange={(e) => onNumberChange('llmReasoningBudget', e.target.value, getNumberBounds('llmReasoningBudget'))}
            />
          </div>
        </div>

        {/* Token limit warnings */}
        {tokenWarnings.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3">
            {tokenWarnings.map((w) => (
              <AlertBanner
                key={`token-${w.field}-${w.phase}-${w.model}`}
                severity="warning"
                title={w.field === 'contextOverflow'
                  ? `${w.phase}: output allocation exceeds 50% of context window`
                  : `${w.phase}: token cap exceeds model limit`}
                message={w.field === 'contextOverflow'
                  ? `${w.model} context window is ${w.limit.toLocaleString()}, but ${w.phase} output is set to ${w.setting.toLocaleString()} (>${Math.floor(w.limit * 0.5).toLocaleString()}).`
                  : `${w.model} max output is ${w.limit.toLocaleString()}, but ${w.phase} is set to ${w.setting.toLocaleString()}.`}
              />
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="border-t" style={{ borderColor: 'var(--sf-border)', margin: 'var(--sf-space-4) 0' }} />

        {/* C — Budget */}
        <div className="sf-text-caption font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--sf-muted)' }}>
          Budget
        </div>
        <div className="grid grid-cols-3 gap-x-3.5 gap-y-2.5">
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Monthly budget (USD)</label>
            <input
              className={inputCls}
              type="number"
              step={0.01}
              value={runtimeDraft.llmMonthlyBudgetUsd}
              onChange={(e) => onNumberChange('llmMonthlyBudgetUsd', e.target.value, getNumberBounds('llmMonthlyBudgetUsd'))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Per-product budget (USD)</label>
            <input
              className={inputCls}
              type="number"
              step={0.01}
              value={runtimeDraft.llmPerProductBudgetUsd}
              onChange={(e) => onNumberChange('llmPerProductBudgetUsd', e.target.value, getNumberBounds('llmPerProductBudgetUsd'))}
            />
          </div>
        </div>
      </SettingGroupBlock>

    </>
  );
});
