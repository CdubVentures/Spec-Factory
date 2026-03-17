import { memo } from 'react';
import type { ReactNode } from 'react';
import {
  SettingGroupBlock,
  SettingRow,
  type NumberBound,
  type RuntimeDraft,
} from '../../pipeline-settings';
import type { LlmPhaseId } from '../types/llmPhaseTypes';
import { LLM_PHASES } from '../state/llmPhaseRegistry';

interface LlmTriageRoleSectionProps {
  phaseId: LlmPhaseId;
  runtimeDraft: RuntimeDraft;
  inputCls: string;
  llmModelOptions: readonly string[];
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  renderTokenOptions: (model: string, prefix: string) => ReactNode;
}

export const LlmTriageRoleSection = memo(function LlmTriageRoleSection({
  phaseId,
  runtimeDraft,
  inputCls,
  llmModelOptions,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  renderTokenOptions,
}: LlmTriageRoleSectionProps) {
  const phaseDef = LLM_PHASES.find((p) => p.id === phaseId);
  const sharedNames = (phaseDef?.sharedWith ?? [])
    .map((id) => LLM_PHASES.find((p) => p.id === id)?.label ?? id)
    .join(', ');

  return (
    <>
      <div className="rounded sf-callout sf-callout-info px-3 py-2 sf-text-label mb-4">
        This phase uses the <strong>Triage</strong> model. Changes here also affect{' '}
        <strong>{sharedNames}</strong>.
      </div>

      <SettingGroupBlock title="Triage Model">
        <SettingRow label="Model" tip="Model used for triage-role LLM calls.">
          <select
            className={inputCls}
            value={runtimeDraft.llmModelTriage}
            onChange={(e) => updateDraft('llmModelTriage', e.target.value)}
          >
            {llmModelOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Triage Token Cap" tip="Max output tokens for triage calls.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensTriage)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensTriage', e.target.value, getNumberBounds('llmMaxOutputTokensTriage'))}
          >
            {renderTokenOptions(runtimeDraft.llmModelTriage, 'triage')}
          </select>
        </SettingRow>
      </SettingGroupBlock>

      <SettingGroupBlock title="Fast Model">
        <SettingRow label="Fast Model" tip="Lightweight model for fast-lane triage tasks.">
          <select
            className={inputCls}
            value={runtimeDraft.llmModelFast}
            onChange={(e) => updateDraft('llmModelFast', e.target.value)}
          >
            {llmModelOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Fast Token Cap" tip="Max output tokens for fast calls.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensFast)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensFast', e.target.value, getNumberBounds('llmMaxOutputTokensFast'))}
          >
            {renderTokenOptions(runtimeDraft.llmModelFast, 'fast')}
          </select>
        </SettingRow>
      </SettingGroupBlock>

      <SettingGroupBlock title="Reasoning Model">
        <SettingRow label="Reasoning Model" tip="High-capability model for complex reasoning tasks.">
          <select
            className={inputCls}
            value={runtimeDraft.llmModelReasoning}
            onChange={(e) => updateDraft('llmModelReasoning', e.target.value)}
          >
            {llmModelOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Reasoning Token Cap" tip="Max output tokens for reasoning calls.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensReasoning)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensReasoning', e.target.value, getNumberBounds('llmMaxOutputTokensReasoning'))}
          >
            {renderTokenOptions(runtimeDraft.llmModelReasoning, 'reasoning')}
          </select>
        </SettingRow>
      </SettingGroupBlock>

      {runtimeDraft.cortexEnabled && (
        <SettingGroupBlock title="Cortex Models (Triage)">
          <SettingRow label="Cortex Rerank Fast" tip="Cortex model for fast reranking.">
            <input
              className={inputCls}
              value={runtimeDraft.cortexModelRerankFast}
              onChange={(e) => updateDraft('cortexModelRerankFast', e.target.value)}
            />
          </SettingRow>
          <SettingRow label="Cortex Search Fast" tip="Cortex model for fast search.">
            <input
              className={inputCls}
              value={runtimeDraft.cortexModelSearchFast}
              onChange={(e) => updateDraft('cortexModelSearchFast', e.target.value)}
            />
          </SettingRow>
          <SettingRow label="Cortex Fast" tip="Cortex general fast model.">
            <input
              className={inputCls}
              value={runtimeDraft.cortexModelFast}
              onChange={(e) => updateDraft('cortexModelFast', e.target.value)}
            />
          </SettingRow>
        </SettingGroupBlock>
      )}
    </>
  );
});
