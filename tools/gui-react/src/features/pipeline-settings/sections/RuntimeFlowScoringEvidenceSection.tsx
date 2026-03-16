import { memo } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

interface RuntimeFlowScoringEvidenceSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
}

export const RuntimeFlowScoringEvidenceSection = memo(function RuntimeFlowScoringEvidenceSection({
  runtimeDraft,
  runtimeSettingsReady,
  inputCls,
  runtimeSubStepDomId,
  updateDraft,
  onNumberChange,
  getNumberBounds,
}: RuntimeFlowScoringEvidenceSectionProps) {
  return (
    <>
      {/* ── Group 1: Identity Gate ── */}
      <div id={runtimeSubStepDomId('scoring-evidence-identity')} className="scroll-mt-24" />
      <SettingGroupBlock title="Identity Gate">
        <MasterSwitchRow label="Identity Gate Publish Threshold" tip="Minimum identity confidence required to publish extracted values.">
          <SettingNumberInput draftKey="identityGatePublishThreshold" value={runtimeDraft.identityGatePublishThreshold} bounds={getNumberBounds('identityGatePublishThreshold')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="Identity Gate Base Match Threshold" tip="Minimum brand+model similarity score required for a source to be labeled as identity-matched.">
          <SettingNumberInput draftKey="identityGateBaseMatchThreshold" value={runtimeDraft.identityGateBaseMatchThreshold} bounds={getNumberBounds('identityGateBaseMatchThreshold')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="Quality Gate Identity Threshold" tip="Minimum identity confidence required by the validation quality gate.">
          <SettingNumberInput draftKey="qualityGateIdentityThreshold" value={runtimeDraft.qualityGateIdentityThreshold} bounds={getNumberBounds('qualityGateIdentityThreshold')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
      </SettingGroupBlock>

      {/* ── Group 3: Consensus Engine ── */}
      <div id={runtimeSubStepDomId('scoring-evidence-consensus')} className="scroll-mt-24" />
      <SettingGroupBlock title="Consensus Engine">
        <MasterSwitchRow label="Consensus Weighted Majority Threshold" tip="Threshold required for weighted-majority consensus acceptance.">
          <SettingNumberInput draftKey="consensusWeightedMajorityThreshold" value={runtimeDraft.consensusWeightedMajorityThreshold} bounds={getNumberBounds('consensusWeightedMajorityThreshold')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="Consensus Strict Acceptance Domain Count" tip="Minimum agreeing domains required for strict consensus acceptance.">
          <SettingNumberInput draftKey="consensusStrictAcceptanceDomainCount" value={runtimeDraft.consensusStrictAcceptanceDomainCount} bounds={getNumberBounds('consensusStrictAcceptanceDomainCount')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="Consensus Confidence Scoring Base" tip="Base multiplier used in consensus confidence scoring.">
          <SettingNumberInput draftKey="consensusConfidenceScoringBase" value={runtimeDraft.consensusConfidenceScoringBase} bounds={getNumberBounds('consensusConfidenceScoringBase')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="Consensus Pass Target (Identity/Strong)" tip="Pass-target threshold used for strong identity fields.">
          <SettingNumberInput draftKey="consensusPassTargetIdentityStrong" value={runtimeDraft.consensusPassTargetIdentityStrong} bounds={getNumberBounds('consensusPassTargetIdentityStrong')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="Allow Below Pass-Target Fill" tip="Allow low-confidence fill below pass-target threshold.">
          <SettingToggle checked={runtimeDraft.allowBelowPassTargetFill} onChange={(next) => updateDraft('allowBelowPassTargetFill', next)} disabled={!runtimeSettingsReady} />
        </MasterSwitchRow>
        <AdvancedSettingsBlock title="Advanced Consensus Tuning" count={11}>
          <SettingRow label="Consensus Method Weight (Network JSON)" tip="Relative consensus weighting for network JSON evidence sources.">
            <SettingNumberInput draftKey="consensusMethodWeightNetworkJson" value={runtimeDraft.consensusMethodWeightNetworkJson} bounds={getNumberBounds('consensusMethodWeightNetworkJson')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Consensus Method Weight (Adapter API)" tip="Relative consensus weighting for adapter API evidence sources.">
            <SettingNumberInput draftKey="consensusMethodWeightAdapterApi" value={runtimeDraft.consensusMethodWeightAdapterApi} bounds={getNumberBounds('consensusMethodWeightAdapterApi')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Consensus Method Weight (Structured Metadata)" tip="Relative consensus weighting for structured metadata evidence sources.">
            <SettingNumberInput draftKey="consensusMethodWeightStructuredMeta" value={runtimeDraft.consensusMethodWeightStructuredMeta} bounds={getNumberBounds('consensusMethodWeightStructuredMeta')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Consensus Method Weight (PDF)" tip="Relative consensus weighting for PDF evidence sources.">
            <SettingNumberInput draftKey="consensusMethodWeightPdf" value={runtimeDraft.consensusMethodWeightPdf} bounds={getNumberBounds('consensusMethodWeightPdf')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Consensus Method Weight (Table/KV)" tip="Relative consensus weighting for table/KV evidence sources.">
            <SettingNumberInput draftKey="consensusMethodWeightTableKv" value={runtimeDraft.consensusMethodWeightTableKv} bounds={getNumberBounds('consensusMethodWeightTableKv')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Consensus Method Weight (DOM)" tip="Relative consensus weighting for DOM evidence sources.">
            <SettingNumberInput draftKey="consensusMethodWeightDom" value={runtimeDraft.consensusMethodWeightDom} bounds={getNumberBounds('consensusMethodWeightDom')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Consensus Method Weight (LLM Extract Base)" tip="Base consensus method weight used for llm_extract evidence fallback tiers.">
            <SettingNumberInput draftKey="consensusMethodWeightLlmExtractBase" value={runtimeDraft.consensusMethodWeightLlmExtractBase} bounds={getNumberBounds('consensusMethodWeightLlmExtractBase')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Consensus Policy Bonus" tip="Policy-aligned evidence bonus applied during consensus scoring.">
            <SettingNumberInput draftKey="consensusPolicyBonus" value={runtimeDraft.consensusPolicyBonus} bounds={getNumberBounds('consensusPolicyBonus')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Consensus Relaxed Acceptance Domain Count" tip="Minimum agreeing domains required for relaxed consensus acceptance.">
            <SettingNumberInput draftKey="consensusRelaxedAcceptanceDomainCount" value={runtimeDraft.consensusRelaxedAcceptanceDomainCount} bounds={getNumberBounds('consensusRelaxedAcceptanceDomainCount')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Consensus Instrumented Field Threshold" tip="Instrumentation threshold for consensus field acceptance telemetry.">
            <SettingNumberInput draftKey="consensusInstrumentedFieldThreshold" value={runtimeDraft.consensusInstrumentedFieldThreshold} bounds={getNumberBounds('consensusInstrumentedFieldThreshold')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Consensus Pass Target (Normal)" tip="Pass-target threshold used for non-identity consensus fields.">
            <SettingNumberInput draftKey="consensusPassTargetNormal" value={runtimeDraft.consensusPassTargetNormal} bounds={getNumberBounds('consensusPassTargetNormal')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      {/* ── Group 4: Retrieval & Evidence ── */}
      <div id={runtimeSubStepDomId('scoring-evidence-retrieval')} className="scroll-mt-24" />
      <SettingGroupBlock title="Retrieval & Evidence">
        <MasterSwitchRow label="Retrieval Tier Weight (Tier 1)" tip="Score multiplier for tier-1 sources in phase-07 retrieval ranking.">
          <SettingNumberInput draftKey="retrievalTierWeightTier1" value={runtimeDraft.retrievalTierWeightTier1} bounds={getNumberBounds('retrievalTierWeightTier1')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="Evidence Text Max Chars" tip="Maximum evidence text characters retained per normalized evidence row.">
          <SettingNumberInput draftKey="evidenceTextMaxChars" value={runtimeDraft.evidenceTextMaxChars} bounds={getNumberBounds('evidenceTextMaxChars')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <AdvancedSettingsBlock title="Advanced Retrieval & Evidence Tuning" count={21}>
          <SettingRow label="Retrieval Tier Weight (Tier 2)" tip="Score multiplier for tier-2 sources in phase-07 retrieval ranking.">
            <SettingNumberInput draftKey="retrievalTierWeightTier2" value={runtimeDraft.retrievalTierWeightTier2} bounds={getNumberBounds('retrievalTierWeightTier2')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Tier Weight (Tier 3)" tip="Score multiplier for tier-3 sources in phase-07 retrieval ranking.">
            <SettingNumberInput draftKey="retrievalTierWeightTier3" value={runtimeDraft.retrievalTierWeightTier3} bounds={getNumberBounds('retrievalTierWeightTier3')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Tier Weight (Tier 4)" tip="Score multiplier for tier-4 sources in phase-07 retrieval ranking.">
            <SettingNumberInput draftKey="retrievalTierWeightTier4" value={runtimeDraft.retrievalTierWeightTier4} bounds={getNumberBounds('retrievalTierWeightTier4')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Tier Weight (Tier 5)" tip="Score multiplier for tier-5 sources in phase-07 retrieval ranking.">
            <SettingNumberInput draftKey="retrievalTierWeightTier5" value={runtimeDraft.retrievalTierWeightTier5} bounds={getNumberBounds('retrievalTierWeightTier5')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Doc Weight (Manual PDF)" tip="Ranking multiplier for manual PDF evidence in retrieval scoring.">
            <SettingNumberInput draftKey="retrievalDocKindWeightManualPdf" value={runtimeDraft.retrievalDocKindWeightManualPdf} bounds={getNumberBounds('retrievalDocKindWeightManualPdf')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Doc Weight (Spec PDF)" tip="Ranking multiplier for spec PDF evidence in retrieval scoring.">
            <SettingNumberInput draftKey="retrievalDocKindWeightSpecPdf" value={runtimeDraft.retrievalDocKindWeightSpecPdf} bounds={getNumberBounds('retrievalDocKindWeightSpecPdf')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Doc Weight (Support)" tip="Ranking multiplier for support pages in retrieval scoring.">
            <SettingNumberInput draftKey="retrievalDocKindWeightSupport" value={runtimeDraft.retrievalDocKindWeightSupport} bounds={getNumberBounds('retrievalDocKindWeightSupport')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Doc Weight (Lab Review)" tip="Ranking multiplier for lab-review evidence in retrieval scoring.">
            <SettingNumberInput draftKey="retrievalDocKindWeightLabReview" value={runtimeDraft.retrievalDocKindWeightLabReview} bounds={getNumberBounds('retrievalDocKindWeightLabReview')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Doc Weight (Product Page)" tip="Ranking multiplier for product-page evidence in retrieval scoring.">
            <SettingNumberInput draftKey="retrievalDocKindWeightProductPage" value={runtimeDraft.retrievalDocKindWeightProductPage} bounds={getNumberBounds('retrievalDocKindWeightProductPage')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Doc Weight (Other)" tip="Ranking multiplier for uncategorized evidence in retrieval scoring.">
            <SettingNumberInput draftKey="retrievalDocKindWeightOther" value={runtimeDraft.retrievalDocKindWeightOther} bounds={getNumberBounds('retrievalDocKindWeightOther')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Method Weight (Table)" tip="Ranking multiplier for table extraction evidence.">
            <SettingNumberInput draftKey="retrievalMethodWeightTable" value={runtimeDraft.retrievalMethodWeightTable} bounds={getNumberBounds('retrievalMethodWeightTable')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Method Weight (KV)" tip="Ranking multiplier for key-value extraction evidence.">
            <SettingNumberInput draftKey="retrievalMethodWeightKv" value={runtimeDraft.retrievalMethodWeightKv} bounds={getNumberBounds('retrievalMethodWeightKv')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Method Weight (JSON-LD)" tip="Ranking multiplier for JSON-LD extraction evidence.">
            <SettingNumberInput draftKey="retrievalMethodWeightJsonLd" value={runtimeDraft.retrievalMethodWeightJsonLd} bounds={getNumberBounds('retrievalMethodWeightJsonLd')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Method Weight (LLM Extract)" tip="Ranking multiplier for LLM extraction evidence.">
            <SettingNumberInput draftKey="retrievalMethodWeightLlmExtract" value={runtimeDraft.retrievalMethodWeightLlmExtract} bounds={getNumberBounds('retrievalMethodWeightLlmExtract')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Method Weight (Helper Supportive)" tip="Ranking multiplier for helper-supportive evidence.">
            <SettingNumberInput draftKey="retrievalMethodWeightHelperSupportive" value={runtimeDraft.retrievalMethodWeightHelperSupportive} bounds={getNumberBounds('retrievalMethodWeightHelperSupportive')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Anchor Score Per Match" tip="Incremental score added per anchor-term match.">
            <SettingNumberInput draftKey="retrievalAnchorScorePerMatch" value={runtimeDraft.retrievalAnchorScorePerMatch} bounds={getNumberBounds('retrievalAnchorScorePerMatch')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Identity Score Per Match" tip="Incremental score added per identity-token match.">
            <SettingNumberInput draftKey="retrievalIdentityScorePerMatch" value={runtimeDraft.retrievalIdentityScorePerMatch} bounds={getNumberBounds('retrievalIdentityScorePerMatch')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Unit Match Bonus" tip="Bonus score applied when a candidate includes unit match context.">
            <SettingNumberInput draftKey="retrievalUnitMatchBonus" value={runtimeDraft.retrievalUnitMatchBonus} bounds={getNumberBounds('retrievalUnitMatchBonus')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Direct Field Match Bonus" tip="Bonus score applied for direct field-key matches in evidence rows.">
            <SettingNumberInput draftKey="retrievalDirectFieldMatchBonus" value={runtimeDraft.retrievalDirectFieldMatchBonus} bounds={getNumberBounds('retrievalDirectFieldMatchBonus')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Retrieval Internals Map (JSON)" tip="Optional JSON map for retrieval internals (pool caps, anchor limits, and scoring multipliers).">
            <textarea value={runtimeDraft.retrievalInternalsMapJson} onChange={(event) => updateDraft('retrievalInternalsMapJson', event.target.value)} disabled={!runtimeSettingsReady} className={`${inputCls} min-h-[88px] font-mono sf-text-label`} spellCheck={false} />
          </SettingRow>
          <SettingRow label="Parsing Confidence Base Map (JSON)" tip="Optional JSON map overriding parsing confidence bases for network_json, embedded_state, json_ld, microdata, opengraph, and microformat_rdfa.">
            <textarea value={runtimeDraft.parsingConfidenceBaseMapJson} onChange={(event) => updateDraft('parsingConfidenceBaseMapJson', event.target.value)} disabled={!runtimeSettingsReady} className={`${inputCls} min-h-[88px] font-mono sf-text-label`} spellCheck={false} />
          </SettingRow>
          <SettingRow label="Evidence Pack Limits Map (JSON)" tip="Optional JSON map for evidence-pack extraction limits (headings/chunk/spec sections).">
            <textarea value={runtimeDraft.evidencePackLimitsMapJson} onChange={(event) => updateDraft('evidencePackLimitsMapJson', event.target.value)} disabled={!runtimeSettingsReady} className={`${inputCls} min-h-[88px] font-mono sf-text-label`} spellCheck={false} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

    </>
  );
});
