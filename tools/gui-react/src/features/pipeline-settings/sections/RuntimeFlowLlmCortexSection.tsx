import { memo } from 'react';
import type { ReactNode } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

type RuntimeRoleModelKey =
  | 'llmModelFast'
  | 'llmModelReasoning'
  | 'llmModelExtract'
  | 'llmModelValidate'
  | 'llmModelWrite';

type RuntimeRoleTokenKey =
  | 'llmTokensFast'
  | 'llmTokensReasoning'
  | 'llmTokensExtract'
  | 'llmTokensValidate'
  | 'llmTokensWrite';

interface RuntimeFlowLlmCortexSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  plannerControlsLocked: boolean;
  plannerModelLocked: boolean;
  triageModelLocked: boolean;
  inputCls: string;
  llmModelOptions: readonly string[];
  runtimeSubStepDomId: (id: string) => string;
  onPlannerModelChange: (nextModel: string) => void;
  onPlannerTokenChange: (eventValue: string) => void;
  onTriageModelChange: (nextModel: string) => void;
  onTriageTokenChange: (eventValue: string) => void;
  onLlmMaxOutputTokensPlanChange: (eventValue: string) => void;
  onLlmMaxOutputTokensTriageChange: (eventValue: string) => void;
  onRoleModelChange: (
    modelKey: RuntimeRoleModelKey,
    tokenKey: RuntimeRoleTokenKey,
    model: string,
  ) => void;
  onLlmTokensFastChange: (eventValue: string) => void;
  onLlmTokensReasoningChange: (eventValue: string) => void;
  onLlmTokensExtractChange: (eventValue: string) => void;
  onLlmTokensValidateChange: (eventValue: string) => void;
  onLlmTokensWriteChange: (eventValue: string) => void;
  onLlmMaxOutputTokensFastChange: (eventValue: string) => void;
  onLlmMaxOutputTokensReasoningChange: (eventValue: string) => void;
  onLlmMaxOutputTokensExtractChange: (eventValue: string) => void;
  onLlmMaxOutputTokensValidateChange: (eventValue: string) => void;
  onLlmMaxOutputTokensWriteChange: (eventValue: string) => void;
  onLlmPlanApiKeyChange: (next: string) => void;
  onLlmExtractionCacheEnabledChange: (next: boolean) => void;
  onLlmExtractionCacheDirChange: (next: string) => void;
  onLlmExtractionCacheTtlMsChange: (eventValue: string) => void;
  onLlmMaxCallsPerProductTotalChange: (eventValue: string) => void;
  onLlmMaxCallsPerProductFastChange: (eventValue: string) => void;
  onLlmTokensPlanFallbackChange: (eventValue: string) => void;
  onLlmTokensExtractFallbackChange: (eventValue: string) => void;
  onLlmTokensValidateFallbackChange: (eventValue: string) => void;
  onLlmTokensWriteFallbackChange: (eventValue: string) => void;
  onLlmMaxOutputTokensPlanFallbackChange: (eventValue: string) => void;
  onLlmMaxOutputTokensExtractFallbackChange: (eventValue: string) => void;
  onLlmMaxOutputTokensValidateFallbackChange: (eventValue: string) => void;
  onLlmMaxOutputTokensWriteFallbackChange: (eventValue: string) => void;
  renderTokenOptions: (model: string, prefix: string) => ReactNode;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
}

export const RuntimeFlowLlmCortexSection = memo(function RuntimeFlowLlmCortexSection({
  runtimeDraft,
  runtimeSettingsReady,
  plannerControlsLocked,
  plannerModelLocked,
  triageModelLocked,
  inputCls,
  llmModelOptions,
  runtimeSubStepDomId,
  onPlannerModelChange,
  onPlannerTokenChange,
  onTriageModelChange,
  onTriageTokenChange,
  onLlmMaxOutputTokensPlanChange,
  onLlmMaxOutputTokensTriageChange,
  onRoleModelChange,
  onLlmTokensFastChange,
  onLlmTokensReasoningChange,
  onLlmTokensExtractChange,
  onLlmTokensValidateChange,
  onLlmTokensWriteChange,
  onLlmMaxOutputTokensFastChange,
  onLlmMaxOutputTokensReasoningChange,
  onLlmMaxOutputTokensExtractChange,
  onLlmMaxOutputTokensValidateChange,
  onLlmMaxOutputTokensWriteChange,
  onLlmPlanApiKeyChange,
  onLlmExtractionCacheEnabledChange,
  onLlmExtractionCacheDirChange,
  onLlmExtractionCacheTtlMsChange,
  onLlmMaxCallsPerProductTotalChange,
  onLlmMaxCallsPerProductFastChange,
  onLlmTokensPlanFallbackChange,
  onLlmTokensExtractFallbackChange,
  onLlmTokensValidateFallbackChange,
  onLlmTokensWriteFallbackChange,
  onLlmMaxOutputTokensPlanFallbackChange,
  onLlmMaxOutputTokensExtractFallbackChange,
  onLlmMaxOutputTokensValidateFallbackChange,
  onLlmMaxOutputTokensWriteFallbackChange,
  renderTokenOptions,
  updateDraft,
  onNumberChange,
  getNumberBounds,
}: RuntimeFlowLlmCortexSectionProps) {
  return (
    <>
      {/* Group 1: Primary Models */}
      <div id={runtimeSubStepDomId('llm-cortex-models')} className="scroll-mt-24" />
      <SettingGroupBlock title="Primary Models">
        <SettingRow label="Plan Model" tip="Model used for phase-2 planning prompts." disabled={plannerModelLocked}>
          <select
            value={runtimeDraft.phase2LlmModel}
            onChange={(event) => onPlannerModelChange(event.target.value)}
            disabled={!runtimeSettingsReady || plannerModelLocked}
            className={inputCls}
          >
            {llmModelOptions.map((model) => (
              <option key={`p2:model:${model}`} value={model}>
                {model}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Plan Token Cap" tip="Max output tokens for planner responses." disabled={plannerModelLocked}>
          <select
            value={runtimeDraft.llmTokensPlan}
            onChange={(event) => onPlannerTokenChange(event.target.value)}
            disabled={!runtimeSettingsReady || plannerModelLocked}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.phase2LlmModel, 'planner')}
          </select>
        </SettingRow>
        <SettingRow label="Plan Max Output Tokens" tip="Maximum output tokens the planner model can generate." disabled={plannerModelLocked}>
          <select
            value={runtimeDraft.llmMaxOutputTokensPlan}
            onChange={(event) => onLlmMaxOutputTokensPlanChange(event.target.value)}
            disabled={!runtimeSettingsReady || plannerModelLocked}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.phase2LlmModel, 'plan-max-output')}
          </select>
        </SettingRow>

        <SettingRow label="Triage Model" tip="Model used to score SERP candidates." disabled={triageModelLocked}>
          <select
            value={runtimeDraft.phase3LlmModel}
            onChange={(event) => onTriageModelChange(event.target.value)}
            disabled={!runtimeSettingsReady || triageModelLocked}
            className={inputCls}
          >
            {llmModelOptions.map((model) => (
              <option key={`p3:model:${model}`} value={model}>
                {model}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Triage Token Cap" tip="Max output tokens for triage responses." disabled={triageModelLocked}>
          <select
            value={runtimeDraft.llmTokensTriage}
            onChange={(event) => onTriageTokenChange(event.target.value)}
            disabled={!runtimeSettingsReady || triageModelLocked}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.phase3LlmModel, 'triage')}
          </select>
        </SettingRow>
        <SettingRow label="Triage Max Output Tokens" tip="Maximum output tokens the triage model can generate." disabled={triageModelLocked}>
          <select
            value={runtimeDraft.llmMaxOutputTokensTriage}
            onChange={(event) => onLlmMaxOutputTokensTriageChange(event.target.value)}
            disabled={!runtimeSettingsReady || triageModelLocked}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.phase3LlmModel, 'triage-max-output')}
          </select>
        </SettingRow>

        <SettingRow label="Fast Model" tip="Primary model for fast-pass lane.">
          <select
            value={runtimeDraft.llmModelFast}
            onChange={(event) => onRoleModelChange('llmModelFast', 'llmTokensFast', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {llmModelOptions.map((model) => (
              <option key={`fast:model:${model}`} value={model}>
                {model}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Fast Token Cap" tip="Max output tokens for fast-pass calls.">
          <select
            value={runtimeDraft.llmTokensFast}
            onChange={(event) => onLlmTokensFastChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelFast, 'fast')}
          </select>
        </SettingRow>
        <SettingRow label="Fast Max Output Tokens" tip="Maximum output tokens the fast model can generate.">
          <select
            value={runtimeDraft.llmMaxOutputTokensFast}
            onChange={(event) => onLlmMaxOutputTokensFastChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelFast, 'fast-max-output')}
          </select>
        </SettingRow>

        <SettingRow label="Reasoning Model" tip="Primary model for reasoning lane.">
          <select
            value={runtimeDraft.llmModelReasoning}
            onChange={(event) => onRoleModelChange('llmModelReasoning', 'llmTokensReasoning', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {llmModelOptions.map((model) => (
              <option key={`reasoning:model:${model}`} value={model}>
                {model}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Reasoning Token Cap" tip="Max output tokens for reasoning calls.">
          <select
            value={runtimeDraft.llmTokensReasoning}
            onChange={(event) => onLlmTokensReasoningChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelReasoning, 'reasoning')}
          </select>
        </SettingRow>
        <SettingRow label="Reasoning Max Output Tokens" tip="Maximum output tokens the reasoning model can generate.">
          <select
            value={runtimeDraft.llmMaxOutputTokensReasoning}
            onChange={(event) => onLlmMaxOutputTokensReasoningChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelReasoning, 'reasoning-max-output')}
          </select>
        </SettingRow>

        <SettingRow label="Extract Model" tip="Primary model for extraction lane.">
          <select
            value={runtimeDraft.llmModelExtract}
            onChange={(event) => onRoleModelChange('llmModelExtract', 'llmTokensExtract', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {llmModelOptions.map((model) => (
              <option key={`extract:model:${model}`} value={model}>
                {model}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Extract Token Cap" tip="Max output tokens for extraction calls.">
          <select
            value={runtimeDraft.llmTokensExtract}
            onChange={(event) => onLlmTokensExtractChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelExtract, 'extract')}
          </select>
        </SettingRow>
        <SettingRow label="Extract Max Output Tokens" tip="Maximum output tokens the extract model can generate.">
          <select
            value={runtimeDraft.llmMaxOutputTokensExtract}
            onChange={(event) => onLlmMaxOutputTokensExtractChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelExtract, 'extract-max-output')}
          </select>
        </SettingRow>

        <SettingRow label="Validate Model" tip="Primary model for validation lane.">
          <select
            value={runtimeDraft.llmModelValidate}
            onChange={(event) => onRoleModelChange('llmModelValidate', 'llmTokensValidate', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {llmModelOptions.map((model) => (
              <option key={`validate:model:${model}`} value={model}>
                {model}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Validate Token Cap" tip="Max output tokens for validation calls.">
          <select
            value={runtimeDraft.llmTokensValidate}
            onChange={(event) => onLlmTokensValidateChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelValidate, 'validate')}
          </select>
        </SettingRow>
        <SettingRow label="Validate Max Output Tokens" tip="Maximum output tokens the validate model can generate.">
          <select
            value={runtimeDraft.llmMaxOutputTokensValidate}
            onChange={(event) => onLlmMaxOutputTokensValidateChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelValidate, 'validate-max-output')}
          </select>
        </SettingRow>

        <SettingRow label="Write Model" tip="Primary model for write lane.">
          <select
            value={runtimeDraft.llmModelWrite}
            onChange={(event) => onRoleModelChange('llmModelWrite', 'llmTokensWrite', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {llmModelOptions.map((model) => (
              <option key={`write:model:${model}`} value={model}>
                {model}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Write Token Cap" tip="Max output tokens for write calls.">
          <select
            value={runtimeDraft.llmTokensWrite}
            onChange={(event) => onLlmTokensWriteChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelWrite, 'write')}
          </select>
        </SettingRow>
        <SettingRow label="Write Max Output Tokens" tip="Maximum output tokens the write model can generate.">
          <select
            value={runtimeDraft.llmMaxOutputTokensWrite}
            onChange={(event) => onLlmMaxOutputTokensWriteChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelWrite, 'write-max-output')}
          </select>
        </SettingRow>
      </SettingGroupBlock>

      {/* Group 2: Fallback Routing */}
      <div id={runtimeSubStepDomId('llm-cortex-fallback')} className="scroll-mt-24" />
      <SettingGroupBlock title="Fallback Routing">
        <SettingRow label="LLM Plan API Key" tip="Optional dedicated API key for planner lane provider calls.">
          <input
            type="password"
            value={runtimeDraft.llmPlanApiKey}
            onChange={(event) => onLlmPlanApiKeyChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Plan Fallback Token Cap" tip="Max output tokens for fallback planner calls.">
          <select
            value={runtimeDraft.llmTokensPlanFallback}
            onChange={(event) => onLlmTokensPlanFallbackChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.phase2LlmModel, 'fallback-plan')}
          </select>
        </SettingRow>
        <SettingRow label="Plan Max Output Tokens" tip="Max output tokens for fallback planner.">
          <select
            value={runtimeDraft.llmMaxOutputTokensPlanFallback}
            onChange={(event) => onLlmMaxOutputTokensPlanFallbackChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.phase2LlmModel, 'fallback-plan-max-output')}
          </select>
        </SettingRow>
        <SettingRow label="Extract Fallback Token Cap" tip="Max output tokens for fallback extraction calls.">
          <select
            value={runtimeDraft.llmTokensExtractFallback}
            onChange={(event) => onLlmTokensExtractFallbackChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelExtract, 'fallback-extract')}
          </select>
        </SettingRow>
        <SettingRow label="Extract Max Output Tokens" tip="Max output tokens for fallback extraction.">
          <select
            value={runtimeDraft.llmMaxOutputTokensExtractFallback}
            onChange={(event) => onLlmMaxOutputTokensExtractFallbackChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelExtract, 'fallback-extract-max-output')}
          </select>
        </SettingRow>
        <SettingRow label="Validate Fallback Token Cap" tip="Max output tokens for fallback validation calls.">
          <select
            value={runtimeDraft.llmTokensValidateFallback}
            onChange={(event) => onLlmTokensValidateFallbackChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelValidate, 'fallback-validate')}
          </select>
        </SettingRow>
        <SettingRow label="Validate Max Output Tokens" tip="Max output tokens for fallback validation.">
          <select
            value={runtimeDraft.llmMaxOutputTokensValidateFallback}
            onChange={(event) => onLlmMaxOutputTokensValidateFallbackChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelValidate, 'fallback-validate-max-output')}
          </select>
        </SettingRow>
        <SettingRow label="Write Fallback Token Cap" tip="Max output tokens for fallback write calls.">
          <select
            value={runtimeDraft.llmTokensWriteFallback}
            onChange={(event) => onLlmTokensWriteFallbackChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelWrite, 'fallback-write')}
          </select>
        </SettingRow>
        <SettingRow label="Write Max Output Tokens" tip="Max output tokens for fallback write.">
          <select
            value={runtimeDraft.llmMaxOutputTokensWriteFallback}
            onChange={(event) => onLlmMaxOutputTokensWriteFallbackChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {renderTokenOptions(runtimeDraft.llmModelWrite, 'fallback-write-max-output')}
          </select>
        </SettingRow>
        <SettingRow label="LLM Max Calls / Product Total" tip="Global per-product cap across all extraction lanes.">
          <input
            type="number"
            min={getNumberBounds('llmMaxCallsPerProductTotal').min}
            max={getNumberBounds('llmMaxCallsPerProductTotal').max}
            step={1}
            value={runtimeDraft.llmMaxCallsPerProductTotal}
            onChange={(event) => onLlmMaxCallsPerProductTotalChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="LLM Max Calls / Product Fast" tip="Per-product cap for fast-lane extraction calls.">
          <input
            type="number"
            min={getNumberBounds('llmMaxCallsPerProductFast').min}
            max={getNumberBounds('llmMaxCallsPerProductFast').max}
            step={1}
            value={runtimeDraft.llmMaxCallsPerProductFast}
            onChange={(event) => onLlmMaxCallsPerProductFastChange(event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
      </SettingGroupBlock>

      {/* Group 3: Budgets & Cost */}
      <div id={runtimeSubStepDomId('llm-cortex-budgets')} className="scroll-mt-24" />
      <SettingGroupBlock title="Budgets & Cost">
        <MasterSwitchRow label="LLM Monthly Budget (USD)" tip="Soft monthly LLM spend guardrail in USD.">
          <SettingNumberInput draftKey="llmMonthlyBudgetUsd" value={runtimeDraft.llmMonthlyBudgetUsd} bounds={getNumberBounds('llmMonthlyBudgetUsd')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="LLM Per-Product Budget (USD)" tip="Per-product LLM spend limit in USD.">
          <SettingNumberInput draftKey="llmPerProductBudgetUsd" value={runtimeDraft.llmPerProductBudgetUsd} bounds={getNumberBounds('llmPerProductBudgetUsd')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="LLM Max Calls / Round" tip="Global call cap applied per round across LLM lanes.">
          <SettingNumberInput draftKey="llmMaxCallsPerRound" value={runtimeDraft.llmMaxCallsPerRound} bounds={getNumberBounds('llmMaxCallsPerRound')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="LLM Max Output Tokens" tip="Default output-token cap used when lane-specific caps do not override it.">
          <SettingNumberInput draftKey="llmMaxOutputTokens" value={runtimeDraft.llmMaxOutputTokens} bounds={getNumberBounds('llmMaxOutputTokens')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <MasterSwitchRow label="LLM Timeout (ms)" tip="Request timeout for LLM calls.">
          <SettingNumberInput draftKey="llmTimeoutMs" value={runtimeDraft.llmTimeoutMs} bounds={getNumberBounds('llmTimeoutMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </MasterSwitchRow>
        <AdvancedSettingsBlock title="Cost Tracking" count={4}>
          <SettingRow label="LLM Cost Input / 1M" tip="Input token cost estimate per 1M tokens.">
            <SettingNumberInput draftKey="llmCostInputPer1M" value={runtimeDraft.llmCostInputPer1M} bounds={getNumberBounds('llmCostInputPer1M')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="LLM Cost Output / 1M" tip="Output token cost estimate per 1M tokens.">
            <SettingNumberInput draftKey="llmCostOutputPer1M" value={runtimeDraft.llmCostOutputPer1M} bounds={getNumberBounds('llmCostOutputPer1M')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="LLM Cost Cached Input / 1M" tip="Cached-input token cost estimate per 1M tokens.">
            <SettingNumberInput draftKey="llmCostCachedInputPer1M" value={runtimeDraft.llmCostCachedInputPer1M} bounds={getNumberBounds('llmCostCachedInputPer1M')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Disable LLM Budget Guards" tip="Bypass budget-stop checks (use only for debugging).">
            <SettingToggle
              checked={runtimeDraft.llmDisableBudgetGuards}
              onChange={(next) => updateDraft('llmDisableBudgetGuards', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      {/* Group 4: Extraction & Reasoning */}
      <div id={runtimeSubStepDomId('llm-cortex-extraction')} className="scroll-mt-24" />
      <SettingGroupBlock title="Extraction & Reasoning">
        <SettingRow label="LLM Extract Max Tokens" tip="Token cap per extract completion.">
          <SettingNumberInput draftKey="llmExtractMaxTokens" value={runtimeDraft.llmExtractMaxTokens} bounds={getNumberBounds('llmExtractMaxTokens')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="LLM Extract Max Snippets/Batch" tip="Max evidence snippets grouped into each extract request.">
          <SettingNumberInput draftKey="llmExtractMaxSnippetsPerBatch" value={runtimeDraft.llmExtractMaxSnippetsPerBatch} bounds={getNumberBounds('llmExtractMaxSnippetsPerBatch')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="LLM Extract Max Snippet Chars" tip="Character ceiling per evidence snippet sent to extract lane.">
          <SettingNumberInput draftKey="llmExtractMaxSnippetChars" value={runtimeDraft.llmExtractMaxSnippetChars} bounds={getNumberBounds('llmExtractMaxSnippetChars')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="LLM Extract Skip Low Signal" tip="Skip extraction attempts for low-signal evidence bundles.">
          <SettingToggle
            checked={runtimeDraft.llmExtractSkipLowSignal}
            onChange={(next) => updateDraft('llmExtractSkipLowSignal', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="LLM Extract Reasoning Budget" tip="Reasoning-token budget for extract lane completions.">
          <SettingNumberInput draftKey="llmExtractReasoningBudget" value={runtimeDraft.llmExtractReasoningBudget} bounds={getNumberBounds('llmExtractReasoningBudget')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="LLM Reasoning Mode" tip="Enable reasoning-first model behavior for deep lanes.">
          <SettingToggle
            checked={runtimeDraft.llmReasoningMode}
            onChange={(next) => updateDraft('llmReasoningMode', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="LLM Reasoning Budget" tip="Global reasoning-token budget cap for reasoning lanes.">
          <SettingNumberInput draftKey="llmReasoningBudget" value={runtimeDraft.llmReasoningBudget} bounds={getNumberBounds('llmReasoningBudget')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
      </SettingGroupBlock>

      {/* Group 5: Verification */}
      <div id={runtimeSubStepDomId('llm-cortex-verification')} className="scroll-mt-24" />
      <SettingGroupBlock title="Verification">
        <SettingRow label="LLM Verify Mode" tip="Enable extra verification pass behavior for extracted values.">
          <SettingToggle
            checked={runtimeDraft.llmVerifyMode}
            onChange={(next) => updateDraft('llmVerifyMode', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="LLM Verify Sample Rate" tip="Verification sampling interval; 1 verifies every product, higher values sample less frequently.">
          <SettingNumberInput draftKey="llmVerifySampleRate" value={runtimeDraft.llmVerifySampleRate} bounds={getNumberBounds('llmVerifySampleRate')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
      </SettingGroupBlock>

      {/* Group 6: Extraction Cache */}
      <div id={runtimeSubStepDomId('llm-cortex-cache')} className="scroll-mt-24" />
      <SettingGroupBlock title="Extraction Cache">
        <SettingRow label="LLM Extraction Cache Enabled" tip="Enable cached reuse of prior extraction completions.">
          <SettingToggle
            checked={runtimeDraft.llmExtractionCacheEnabled}
            onChange={onLlmExtractionCacheEnabledChange}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="LLM Extraction Cache Dir" tip="Directory path for extraction cache files." disabled={!runtimeDraft.llmExtractionCacheEnabled}>
          <input
            type="text"
            value={runtimeDraft.llmExtractionCacheDir}
            onChange={(event) => onLlmExtractionCacheDirChange(event.target.value)}
            disabled={!runtimeSettingsReady || !runtimeDraft.llmExtractionCacheEnabled}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="LLM Extraction Cache TTL (ms)" tip="Retention lifetime for extraction-cache entries." disabled={!runtimeDraft.llmExtractionCacheEnabled}>
          <input
            type="number"
            min={getNumberBounds('llmExtractionCacheTtlMs').min}
            max={getNumberBounds('llmExtractionCacheTtlMs').max}
            step={1000}
            value={runtimeDraft.llmExtractionCacheTtlMs}
            onChange={(event) => onLlmExtractionCacheTtlMsChange(event.target.value)}
            disabled={!runtimeSettingsReady || !runtimeDraft.llmExtractionCacheEnabled}
            className={inputCls}
          />
        </SettingRow>
      </SettingGroupBlock>

      {/* Group 7: Cortex Sidecar */}
      <div id={runtimeSubStepDomId('llm-cortex-cortex')} className="scroll-mt-24" />
      <SettingGroupBlock title="Cortex Sidecar">
        <MasterSwitchRow label="CORTEX Enabled" tip="Enable CORTEX orchestration path." hint="Controls all CORTEX orchestration, model routing, and escalation settings below.">
          <SettingToggle
            checked={runtimeDraft.cortexEnabled}
            onChange={(next) => updateDraft('cortexEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="CORTEX Base URL" tip="Primary CORTEX sync endpoint base URL.">
          <input
            type="text"
            value={runtimeDraft.cortexBaseUrl}
            onChange={(event) => updateDraft('cortexBaseUrl', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="CORTEX API Key" tip="API key for CORTEX service authentication.">
          <input
            type="password"
            value={runtimeDraft.cortexApiKey}
            onChange={(event) => updateDraft('cortexApiKey', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="CORTEX Model Fast" tip="Primary fast CORTEX model token.">
          <input
            type="text"
            value={runtimeDraft.cortexModelFast}
            onChange={(event) => updateDraft('cortexModelFast', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <AdvancedSettingsBlock title="Advanced Cortex" count={20}>
          <SettingGroupBlock title="Async Connection">
            <SettingRow label="CORTEX Async Enabled" tip="Use async CORTEX execution and polling flow.">
              <SettingToggle
                checked={runtimeDraft.cortexAsyncEnabled}
                onChange={(next) => updateDraft('cortexAsyncEnabled', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
            <SettingRow label="CORTEX Async Base URL" tip="Base URL for CORTEX async job service.">
              <input
                type="text"
                value={runtimeDraft.cortexAsyncBaseUrl}
                onChange={(event) => updateDraft('cortexAsyncBaseUrl', event.target.value)}
                disabled={!runtimeSettingsReady}
                className={inputCls}
              />
            </SettingRow>
            <SettingRow label="CORTEX Async Submit Path" tip="Relative path used to submit async CORTEX jobs.">
              <input
                type="text"
                value={runtimeDraft.cortexAsyncSubmitPath}
                onChange={(event) => updateDraft('cortexAsyncSubmitPath', event.target.value)}
                disabled={!runtimeSettingsReady}
                className={inputCls}
              />
            </SettingRow>
            <SettingRow label="CORTEX Async Status Path" tip="Relative path template used to poll async jobs.">
              <input
                type="text"
                value={runtimeDraft.cortexAsyncStatusPath}
                onChange={(event) => updateDraft('cortexAsyncStatusPath', event.target.value)}
                disabled={!runtimeSettingsReady}
                className={inputCls}
              />
            </SettingRow>
          </SettingGroupBlock>
          <SettingGroupBlock title="Timeouts & Polling">
            <SettingRow label="CORTEX Sync Timeout (ms)" tip="Timeout for synchronous CORTEX requests.">
              <SettingNumberInput draftKey="cortexSyncTimeoutMs" value={runtimeDraft.cortexSyncTimeoutMs} bounds={getNumberBounds('cortexSyncTimeoutMs')} step={250} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="CORTEX Async Poll Interval (ms)" tip="Polling interval used while waiting for async CORTEX jobs.">
              <SettingNumberInput draftKey="cortexAsyncPollIntervalMs" value={runtimeDraft.cortexAsyncPollIntervalMs} bounds={getNumberBounds('cortexAsyncPollIntervalMs')} step={250} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="CORTEX Async Max Wait (ms)" tip="Maximum async wait window for CORTEX jobs.">
              <SettingNumberInput draftKey="cortexAsyncMaxWaitMs" value={runtimeDraft.cortexAsyncMaxWaitMs} bounds={getNumberBounds('cortexAsyncMaxWaitMs')} step={1000} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="CORTEX Ensure Ready Timeout (ms)" tip="Timeout budget for ready-check probe operations.">
              <SettingNumberInput draftKey="cortexEnsureReadyTimeoutMs" value={runtimeDraft.cortexEnsureReadyTimeoutMs} bounds={getNumberBounds('cortexEnsureReadyTimeoutMs')} step={250} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="CORTEX Start Ready Timeout (ms)" tip="Timeout budget for startup readiness wait loop.">
              <SettingNumberInput draftKey="cortexStartReadyTimeoutMs" value={runtimeDraft.cortexStartReadyTimeoutMs} bounds={getNumberBounds('cortexStartReadyTimeoutMs')} step={250} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
          </SettingGroupBlock>
          <SettingGroupBlock title="Circuit Breaker & Lifecycle">
            <SettingRow label="CORTEX Failure Threshold" tip="Failures before CORTEX circuit-breaker opens.">
              <SettingNumberInput draftKey="cortexFailureThreshold" value={runtimeDraft.cortexFailureThreshold} bounds={getNumberBounds('cortexFailureThreshold')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="CORTEX Circuit Open (ms)" tip="Duration CORTEX circuit remains open after threshold breach.">
              <SettingNumberInput draftKey="cortexCircuitOpenMs" value={runtimeDraft.cortexCircuitOpenMs} bounds={getNumberBounds('cortexCircuitOpenMs')} step={1000} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="CORTEX Auto Start" tip="Auto-start CORTEX service when runtime starts.">
              <SettingToggle
                checked={runtimeDraft.cortexAutoStart}
                onChange={(next) => updateDraft('cortexAutoStart', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
          </SettingGroupBlock>
          <SettingGroupBlock title="Model Routing">
            <SettingRow label="CORTEX Model DOM" tip="Model token used for DOM-analysis CORTEX lane.">
              <input
                type="text"
                value={runtimeDraft.cortexModelDom}
                onChange={(event) => updateDraft('cortexModelDom', event.target.value)}
                disabled={!runtimeSettingsReady}
                className={inputCls}
              />
            </SettingRow>
            <SettingRow label="CORTEX Model Reasoning Deep" tip="Model token used for deep-reasoning CORTEX lane.">
              <input
                type="text"
                value={runtimeDraft.cortexModelReasoningDeep}
                onChange={(event) => updateDraft('cortexModelReasoningDeep', event.target.value)}
                disabled={!runtimeSettingsReady}
                className={inputCls}
              />
            </SettingRow>
            <SettingRow label="CORTEX Model Vision" tip="Model token used for vision-assisted CORTEX lane.">
              <input
                type="text"
                value={runtimeDraft.cortexModelVision}
                onChange={(event) => updateDraft('cortexModelVision', event.target.value)}
                disabled={!runtimeSettingsReady}
                className={inputCls}
              />
            </SettingRow>
            <SettingRow label="CORTEX Model Search Fast" tip="Model token used for fast CORTEX search lane.">
              <input
                type="text"
                value={runtimeDraft.cortexModelSearchFast}
                onChange={(event) => updateDraft('cortexModelSearchFast', event.target.value)}
                disabled={!runtimeSettingsReady}
                className={inputCls}
              />
            </SettingRow>
            <SettingRow label="CORTEX Model Rerank Fast" tip="Model token used for fast reranking in CORTEX.">
              <input
                type="text"
                value={runtimeDraft.cortexModelRerankFast}
                onChange={(event) => updateDraft('cortexModelRerankFast', event.target.value)}
                disabled={!runtimeSettingsReady}
                className={inputCls}
              />
            </SettingRow>
          </SettingGroupBlock>
          <SettingGroupBlock title="Escalation Policy">
            <SettingRow label="CORTEX Escalate Confidence <" tip="Escalate when confidence is below this threshold.">
              <SettingNumberInput draftKey="cortexEscalateConfidenceLt" value={runtimeDraft.cortexEscalateConfidenceLt} bounds={getNumberBounds('cortexEscalateConfidenceLt')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="CORTEX Escalate If Conflict" tip="Escalate when extracted field evidence conflicts.">
              <SettingToggle
                checked={runtimeDraft.cortexEscalateIfConflict}
                onChange={(next) => updateDraft('cortexEscalateIfConflict', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
            <SettingRow label="CORTEX Escalate Critical Only" tip="Limit CORTEX escalation to critical/identity fields only.">
              <SettingToggle
                checked={runtimeDraft.cortexEscalateCriticalOnly}
                onChange={(next) => updateDraft('cortexEscalateCriticalOnly', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
            <SettingRow label="CORTEX Max Deep Fields / Product" tip="Maximum deep-escalated fields per product.">
              <SettingNumberInput draftKey="cortexMaxDeepFieldsPerProduct" value={runtimeDraft.cortexMaxDeepFieldsPerProduct} bounds={getNumberBounds('cortexMaxDeepFieldsPerProduct')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
          </SettingGroupBlock>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      {/* Group 8: Global Limits */}
      <div id={runtimeSubStepDomId('llm-cortex-limits')} className="scroll-mt-24" />
      <SettingGroupBlock title="Global Limits">
        <SettingRow label="LLM Max Batches/Product" tip="Max extraction/validation LLM batches allowed per product.">
          <SettingNumberInput draftKey="llmMaxBatchesPerProduct" value={runtimeDraft.llmMaxBatchesPerProduct} bounds={getNumberBounds('llmMaxBatchesPerProduct')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="LLM Max Evidence Chars" tip="Max accumulated evidence chars sent into LLM lanes.">
          <SettingNumberInput draftKey="llmMaxEvidenceChars" value={runtimeDraft.llmMaxEvidenceChars} bounds={getNumberBounds('llmMaxEvidenceChars')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="LLM Max Tokens" tip="Global max-token ceiling for LLM calls.">
          <SettingNumberInput draftKey="llmMaxTokens" value={runtimeDraft.llmMaxTokens} bounds={getNumberBounds('llmMaxTokens')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
      </SettingGroupBlock>
    </>
  );
});
