import { memo } from 'react';
import type { ReactNode } from 'react';
import {
  SettingGroupBlock,
  SettingRow,
  SettingToggle,
  type NumberBound,
  type RuntimeDraft,
} from '../../pipeline-settings';
import { LLM_PROVIDER_OPTIONS } from '../state/llmProviderOptions';
import type { LlmPhaseId } from '../types/llmPhaseTypes';

interface LlmPlanRoleSectionProps {
  phaseId: LlmPhaseId;
  runtimeDraft: RuntimeDraft;
  inputCls: string;
  llmModelOptions: readonly string[];
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onPlannerModelChange: (nextModel: string) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  renderTokenOptions: (model: string, prefix: string) => ReactNode;
}

export const LlmPlanRoleSection = memo(function LlmPlanRoleSection({
  phaseId,
  runtimeDraft,
  inputCls,
  llmModelOptions,
  updateDraft,
  onPlannerModelChange,
  onNumberChange,
  getNumberBounds,
  renderTokenOptions,
}: LlmPlanRoleSectionProps) {
  const peerPhase = phaseId === 'needset' ? 'Search Planner' : 'Needset';

  return (
    <>
      <div className="rounded sf-callout sf-callout-info px-3 py-2 sf-text-label mb-4">
        This phase uses the <strong>Plan</strong> role. Changes here affect both{' '}
        <strong>Needset</strong> and <strong>{peerPhase}</strong>.
      </div>

      <SettingGroupBlock title="Model">
        <SettingRow label="Plan Model" tip="Model used for plan-role LLM calls.">
          <select
            className={inputCls}
            value={runtimeDraft.llmModelPlan}
            onChange={(e) => onPlannerModelChange(e.target.value)}
          >
            {llmModelOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Plan Token Cap" tip="Max output tokens for plan calls.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensPlan)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensPlan', e.target.value, getNumberBounds('llmMaxOutputTokensPlan'))}
          >
            {renderTokenOptions(runtimeDraft.llmModelPlan, 'plan')}
          </select>
        </SettingRow>
      </SettingGroupBlock>

      <SettingGroupBlock title="Provider Override">
        <SettingRow label="Provider" tip="Override the global provider for plan-role calls.">
          <select
            className={inputCls}
            value={runtimeDraft.llmPlanProvider}
            onChange={(e) => updateDraft('llmPlanProvider', e.target.value)}
          >
            {LLM_PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Base URL" tip="Override base URL for plan-role calls.">
          <input
            className={inputCls}
            value={runtimeDraft.llmPlanBaseUrl}
            onChange={(e) => updateDraft('llmPlanBaseUrl', e.target.value)}
            placeholder="(inherit global)"
          />
        </SettingRow>
        <SettingRow label="API Key" tip="Override API key for plan-role calls.">
          <input
            className={inputCls}
            type="password"
            value={runtimeDraft.llmPlanApiKey}
            onChange={(e) => updateDraft('llmPlanApiKey', e.target.value)}
            placeholder="(inherit global)"
          />
        </SettingRow>
      </SettingGroupBlock>

      <SettingGroupBlock title="Fallback">
        <SettingRow label="Fallback Model" tip="Fallback model if the plan model fails.">
          <select
            className={inputCls}
            value={runtimeDraft.llmPlanFallbackModel}
            onChange={(e) => updateDraft('llmPlanFallbackModel', e.target.value)}
          >
            <option value="">(none)</option>
            {llmModelOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Fallback Token Cap" tip="Max output tokens for fallback plan calls.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensPlanFallback)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensPlanFallback', e.target.value, getNumberBounds('llmMaxOutputTokensPlanFallback'))}
          >
            {renderTokenOptions(runtimeDraft.llmPlanFallbackModel, 'plan-fallback')}
          </select>
        </SettingRow>
      </SettingGroupBlock>

      {phaseId === 'search-planner' && (
        <SettingGroupBlock title="Search Planner Settings">
          <SettingRow label="Write Summary" tip="Have the LLM write a summary after search planning.">
            <SettingToggle
              checked={runtimeDraft.llmWriteSummary}
              onChange={(v) => updateDraft('llmWriteSummary', v)}
            />
          </SettingRow>
        </SettingGroupBlock>
      )}
    </>
  );
});
