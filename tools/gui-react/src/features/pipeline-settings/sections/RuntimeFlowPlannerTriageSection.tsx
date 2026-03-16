import { memo } from 'react';
import type { ReactNode } from 'react';
import type { RuntimeDraft } from '../types/settingPrimitiveTypes';
import { FlowOptionPanel, SettingGroupBlock, SettingRow } from '../components/RuntimeFlowPrimitives';

interface RuntimeFlowPlannerTriageSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  plannerControlsLocked: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  renderDisabledHint: (message: string) => ReactNode;
}

export const RuntimeFlowPlannerTriageSection = memo(function RuntimeFlowPlannerTriageSection({
  runtimeDraft,
  runtimeSettingsReady,
  plannerControlsLocked,
  inputCls,
  runtimeSubStepDomId,
  updateDraft,
  renderDisabledHint,
}: RuntimeFlowPlannerTriageSectionProps) {
  return (
    <div className="space-y-3">
      <FlowOptionPanel
        title="Search & Reranker"
        subtitle="Search planner, LLM discovery queries, and SERP reranker scoring policy."
      >
        <SettingGroupBlock title="Search Planner">
          <SettingRow label="Search Profile Cap Map (JSON)" tip="JSON cap map for search profile generation (alias caps, hint queries, field target queries, dedupe)." disabled={plannerControlsLocked}>
            <textarea
              value={runtimeDraft.searchProfileCapMapJson}
              onChange={(event) => updateDraft('searchProfileCapMapJson', event.target.value)}
              disabled={!runtimeSettingsReady || plannerControlsLocked}
              className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
              spellCheck={false}
            />
          </SettingRow>
        </SettingGroupBlock>
        <div id={runtimeSubStepDomId('planner-triage-reranker')} className="scroll-mt-24" />
        <SettingGroupBlock title="Reranker Policy">
          <SettingRow
            label="SERP Reranker Weight Map (JSON)"
            tip="JSON weight map used by deterministic SERP reranker scoring bonuses and penalties."
            disabled={plannerControlsLocked}
          >
            <textarea
              value={runtimeDraft.serpRerankerWeightMapJson}
              onChange={(event) => updateDraft('serpRerankerWeightMapJson', event.target.value)}
              disabled={!runtimeSettingsReady || plannerControlsLocked}
              className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
              spellCheck={false}
            />
          </SettingRow>
        </SettingGroupBlock>
      </FlowOptionPanel>
      {plannerControlsLocked ? renderDisabledHint('Search and reranker controls are disabled because Discovery Enabled is OFF.') : null}
    </div>
  );
});
