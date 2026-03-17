import { memo, Suspense, lazy, useMemo, useState, useCallback } from 'react';
import {
  MasterSwitchRow,
  SettingGroupBlock,
  SettingToggle,
  type NumberBound,
  type RuntimeDraft,
} from '../../pipeline-settings';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';
import { resolveProviderForModel } from '../state/llmProviderRegistryBridge';
import { buildModelDropdownOptions } from '../state/llmModelDropdownOptions';
import { detectMixIssues, resolveRingColor } from '../state/llmMixDetection';
import { AlertBanner } from '../../../shared/ui/feedback/AlertBanner';
import { HealthDot } from '../../../shared/ui/feedback/HealthDot';

const LlmProviderRegistrySection = lazy(async () => {
  const module = await import('./LlmProviderRegistrySection');
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
}: LlmGlobalSectionProps) {
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const baseOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, ['base', 'fast']),
    [llmModelOptions, registry],
  );
  const reasoningOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, 'reasoning'),
    [llmModelOptions, registry],
  );
  const allOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry),
    [llmModelOptions, registry],
  );

  const mixIssues = useMemo(
    () => detectMixIssues(registry, {
      llmModelPlan: runtimeDraft.llmModelPlan,
      llmModelReasoning: runtimeDraft.llmModelReasoning,
      llmPlanFallbackModel: runtimeDraft.llmPlanFallbackModel,
      llmReasoningFallbackModel: runtimeDraft.llmReasoningFallbackModel,
    }),
    [registry, runtimeDraft.llmModelPlan, runtimeDraft.llmModelReasoning, runtimeDraft.llmPlanFallbackModel, runtimeDraft.llmReasoningFallbackModel],
  );

  const dismissAlert = useCallback((key: string) => {
    setDismissedAlerts((prev) => new Set([...prev, key]));
  }, []);

  const ringStyle = useCallback((field: string) => {
    const color = resolveRingColor(field, mixIssues, dismissedAlerts);
    return color ? { boxShadow: `0 0 0 2px ${color}` } : undefined;
  }, [mixIssues, dismissedAlerts]);

  const baseProv = resolveProviderForModel(registry, runtimeDraft.llmModelPlan);
  const reasonProv = resolveProviderForModel(registry, runtimeDraft.llmModelReasoning);
  const baseFbProv = resolveProviderForModel(registry, runtimeDraft.llmPlanFallbackModel);
  const reasonFbProv = resolveProviderForModel(registry, runtimeDraft.llmReasoningFallbackModel);

  return (
    <>
      {/* ── Section 1: Provider Registry ── */}
      <Suspense fallback={null}>
        <LlmProviderRegistrySection
          registry={registry}
          onRegistryChange={onRegistryChange}
        />
      </Suspense>

      {/* ── Section 2: Global Defaults ── */}
      <SettingGroupBlock title="Global Defaults">
        {/* A — Model Selection */}
        <div className="sf-text-label font-medium" style={{ color: 'var(--sf-muted)' }}>
          Model selection
        </div>
        <div className="sf-text-caption mb-2" style={{ color: 'var(--sf-muted)' }}>
          These propagate to all phases. Override per-phase if needed.
        </div>
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
          {/* Row 1: Base model | Reasoning model */}
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Base model</label>
            <div className="flex items-center gap-1.5">
              <select
                className={inputCls}
                value={runtimeDraft.llmModelPlan}
                onChange={(e) => updateDraft('llmModelPlan', e.target.value)}
                style={ringStyle('llmModelPlan')}
              >
                {baseOptions.map((o) => (
                  <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <HealthDot status={baseProv?.health ?? 'gray'} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Reasoning model</label>
            <div className="flex items-center gap-1.5">
              <select
                className={inputCls}
                value={runtimeDraft.llmModelReasoning}
                onChange={(e) => updateDraft('llmModelReasoning', e.target.value)}
                style={ringStyle('llmModelReasoning')}
              >
                {reasoningOptions.map((o) => (
                  <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <HealthDot status={reasonProv?.health ?? 'gray'} />
            </div>
          </div>
          {/* Row 2: Base fallback | Reasoning fallback */}
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Base fallback</label>
            <div className="flex items-center gap-1.5">
              <select
                className={inputCls}
                value={runtimeDraft.llmPlanFallbackModel}
                onChange={(e) => updateDraft('llmPlanFallbackModel', e.target.value)}
                style={ringStyle('llmPlanFallbackModel')}
              >
                <option value="">(none)</option>
                {allOptions.map((o) => (
                  <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <HealthDot status={baseFbProv?.health ?? 'gray'} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Reasoning fallback</label>
            <div className="flex items-center gap-1.5">
              <select
                className={inputCls}
                value={runtimeDraft.llmReasoningFallbackModel}
                onChange={(e) => updateDraft('llmReasoningFallbackModel', e.target.value)}
                style={ringStyle('llmReasoningFallbackModel')}
              >
                <option value="">(none)</option>
                {allOptions.map((o) => (
                  <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <HealthDot status={reasonFbProv?.health ?? 'gray'} />
            </div>
          </div>
        </div>

        {/* Mix detection alerts */}
        {mixIssues.filter((i) => !dismissedAlerts.has(i.key)).length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3">
            {mixIssues
              .filter((i) => !dismissedAlerts.has(i.key))
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
        <div className="border-t" style={{ borderColor: 'var(--sf-border)', margin: '16px 0' }} />

        {/* B — Limits */}
        <div className="sf-text-label font-medium mb-2" style={{ color: 'var(--sf-muted)' }}>
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
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Max fast calls / product</label>
            <input
              className={inputCls}
              type="number"
              value={runtimeDraft.llmMaxCallsPerProductFast}
              onChange={(e) => onNumberChange('llmMaxCallsPerProductFast', e.target.value, getNumberBounds('llmMaxCallsPerProductFast'))}
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

        {/* Divider */}
        <div className="border-t" style={{ borderColor: 'var(--sf-border)', margin: '16px 0' }} />

        {/* C — Budget */}
        <div className="sf-text-label font-medium mb-2" style={{ color: 'var(--sf-muted)' }}>
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
          <div className="flex flex-col gap-1">
            <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Budget guards</label>
            <div className="flex items-center gap-2 h-9">
              <SettingToggle
                checked={!runtimeDraft.llmDisableBudgetGuards}
                onChange={(v) => updateDraft('llmDisableBudgetGuards', !v)}
              />
              <span className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
                {runtimeDraft.llmDisableBudgetGuards ? 'Disabled' : 'Enabled'}
              </span>
            </div>
          </div>
        </div>
      </SettingGroupBlock>

      {/* ── Section 3: Extraction Cache ── */}
      <SettingGroupBlock title="Extraction Cache">
        <MasterSwitchRow
          label="Cache Enabled"
          tip="Cache LLM extraction results to avoid redundant calls."
        >
          <SettingToggle
            checked={runtimeDraft.llmExtractionCacheEnabled}
            onChange={(v) => updateDraft('llmExtractionCacheEnabled', v)}
          />
        </MasterSwitchRow>
        {runtimeDraft.llmExtractionCacheEnabled && (
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
            <div className="flex flex-col gap-1">
              <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Cache dir</label>
              <input
                className={inputCls}
                value={runtimeDraft.llmExtractionCacheDir}
                onChange={(e) => updateDraft('llmExtractionCacheDir', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Cache TTL (ms)</label>
              <input
                className={inputCls}
                type="number"
                value={runtimeDraft.llmExtractionCacheTtlMs}
                onChange={(e) => onNumberChange('llmExtractionCacheTtlMs', e.target.value, getNumberBounds('llmExtractionCacheTtlMs'))}
              />
            </div>
          </div>
        )}
      </SettingGroupBlock>
    </>
  );
});
