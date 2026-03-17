import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  AdvancedSettingsBlock,
  SettingGroupBlock,
  SettingNumberInput,
  SettingRow,
  SettingToggle,
  type NumberBound,
  type RuntimeDraft,
} from '../../pipeline-settings';
import { LLM_PROVIDER_OPTIONS } from '../state/llmProviderOptions';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';
import { buildModelDropdownOptions } from '../state/llmModelDropdownOptions';

interface LlmExtractionSectionProps {
  runtimeDraft: RuntimeDraft;
  inputCls: string;
  llmModelOptions: readonly string[];
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  renderTokenOptions: (model: string, prefix: string) => ReactNode;
  registry: LlmProviderEntry[];
}

function ProviderOverrideGroup({
  title,
  providerValue,
  apiKeyValue,
  onProviderChange,
  onApiKeyChange,
  inputCls,
}: {
  title: string;
  providerValue: string;
  apiKeyValue: string;
  onProviderChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  inputCls: string;
}) {
  return (
    <AdvancedSettingsBlock title={title} count={2}>
      <SettingRow label="Provider" tip="Override the global provider for this sub-role.">
        <select
          className={inputCls}
          value={providerValue}
          onChange={(e) => onProviderChange(e.target.value)}
        >
          {LLM_PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </SettingRow>
      <SettingRow label="API Key" tip="Override API key for this sub-role.">
        <input
          className={inputCls}
          type="password"
          value={apiKeyValue}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder="(inherit global)"
        />
      </SettingRow>
    </AdvancedSettingsBlock>
  );
}

export const LlmExtractionSection = memo(function LlmExtractionSection({
  runtimeDraft,
  inputCls,
  llmModelOptions,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  renderTokenOptions,
  registry,
}: LlmExtractionSectionProps) {
  const allModelOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry),
    [llmModelOptions, registry],
  );
  return (
    <>
      {/* -- Extract Sub-Role -- */}
      <SettingGroupBlock title="Extract Sub-Role">
        <SettingRow label="Extract Model" tip="Model used for extraction LLM calls.">
          <select
            className={inputCls}
            value={runtimeDraft.llmModelExtract}
            onChange={(e) => updateDraft('llmModelExtract', e.target.value)}
          >
            {allModelOptions.map((o) => (
              <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Extract Token Cap" tip="Max output tokens for extract calls.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensExtract)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensExtract', e.target.value, getNumberBounds('llmMaxOutputTokensExtract'))}
          >
            {renderTokenOptions(runtimeDraft.llmModelExtract, 'extract')}
          </select>
        </SettingRow>
        <ProviderOverrideGroup
          title="Extract Provider Override"
          providerValue={runtimeDraft.llmExtractProvider}
          apiKeyValue={runtimeDraft.llmExtractApiKey}
          onProviderChange={(v) => updateDraft('llmExtractProvider', v)}
          onApiKeyChange={(v) => updateDraft('llmExtractApiKey', v)}
          inputCls={inputCls}
        />
        <SettingRow label="Fallback Model" tip="Fallback model if extract model fails.">
          <select
            className={inputCls}
            value={runtimeDraft.llmExtractFallbackModel}
            onChange={(e) => updateDraft('llmExtractFallbackModel', e.target.value)}
          >
            <option value="">(none)</option>
            {allModelOptions.map((o) => (
              <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Fallback Token Cap" tip="Max output tokens for extract fallback.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensExtractFallback)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensExtractFallback', e.target.value, getNumberBounds('llmMaxOutputTokensExtractFallback'))}
          >
            {renderTokenOptions(runtimeDraft.llmExtractFallbackModel, 'extract-fallback')}
          </select>
        </SettingRow>
      </SettingGroupBlock>

      {/* -- Extraction Settings -- */}
      <SettingGroupBlock title="Extraction Settings">
        <SettingRow label="Extract Max Tokens" tip="Max input tokens for extraction prompts.">
          <SettingNumberInput
            draftKey="llmExtractMaxTokens"
            value={runtimeDraft.llmExtractMaxTokens}
            bounds={getNumberBounds('llmExtractMaxTokens')}
            step={1}
            className={inputCls}
            onNumberChange={onNumberChange}
          />
        </SettingRow>
        <SettingRow label="Max Snippets Per Batch" tip="Maximum evidence snippets per extraction batch.">
          <SettingNumberInput
            draftKey="llmExtractMaxSnippetsPerBatch"
            value={runtimeDraft.llmExtractMaxSnippetsPerBatch}
            bounds={getNumberBounds('llmExtractMaxSnippetsPerBatch')}
            step={1}
            className={inputCls}
            onNumberChange={onNumberChange}
          />
        </SettingRow>
        <SettingRow label="Max Snippet Chars" tip="Maximum characters per evidence snippet.">
          <SettingNumberInput
            draftKey="llmExtractMaxSnippetChars"
            value={runtimeDraft.llmExtractMaxSnippetChars}
            bounds={getNumberBounds('llmExtractMaxSnippetChars')}
            step={1}
            className={inputCls}
            onNumberChange={onNumberChange}
          />
        </SettingRow>
        <SettingRow label="Skip Low Signal" tip="Skip extraction for low-signal evidence.">
          <SettingToggle
            checked={runtimeDraft.llmExtractSkipLowSignal}
            onChange={(v) => updateDraft('llmExtractSkipLowSignal', v)}
          />
        </SettingRow>
        <SettingRow label="Extract Reasoning Budget" tip="Token budget for extraction reasoning chains.">
          <SettingNumberInput
            draftKey="llmExtractReasoningBudget"
            value={runtimeDraft.llmExtractReasoningBudget}
            bounds={getNumberBounds('llmExtractReasoningBudget')}
            step={1}
            className={inputCls}
            onNumberChange={onNumberChange}
          />
        </SettingRow>
        <SettingRow label="Max Batches Per Product" tip="Maximum extraction batches per product.">
          <SettingNumberInput
            draftKey="llmMaxBatchesPerProduct"
            value={runtimeDraft.llmMaxBatchesPerProduct}
            bounds={getNumberBounds('llmMaxBatchesPerProduct')}
            step={1}
            className={inputCls}
            onNumberChange={onNumberChange}
          />
        </SettingRow>
        <SettingRow label="Max Evidence Chars" tip="Maximum total evidence characters sent to extraction.">
          <SettingNumberInput
            draftKey="llmMaxEvidenceChars"
            value={runtimeDraft.llmMaxEvidenceChars}
            bounds={getNumberBounds('llmMaxEvidenceChars')}
            step={1}
            className={inputCls}
            onNumberChange={onNumberChange}
          />
        </SettingRow>
      </SettingGroupBlock>

      {/* -- Validate Sub-Role -- */}
      <SettingGroupBlock title="Validate Sub-Role">
        <SettingRow label="Validate Model" tip="Model used for validation LLM calls.">
          <select
            className={inputCls}
            value={runtimeDraft.llmModelValidate}
            onChange={(e) => updateDraft('llmModelValidate', e.target.value)}
          >
            {allModelOptions.map((o) => (
              <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Validate Token Cap" tip="Max output tokens for validate calls.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensValidate)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensValidate', e.target.value, getNumberBounds('llmMaxOutputTokensValidate'))}
          >
            {renderTokenOptions(runtimeDraft.llmModelValidate, 'validate')}
          </select>
        </SettingRow>
        <ProviderOverrideGroup
          title="Validate Provider Override"
          providerValue={runtimeDraft.llmValidateProvider}
          apiKeyValue={runtimeDraft.llmValidateApiKey}
          onProviderChange={(v) => updateDraft('llmValidateProvider', v)}
          onApiKeyChange={(v) => updateDraft('llmValidateApiKey', v)}
          inputCls={inputCls}
        />
        <SettingRow label="Fallback Model" tip="Fallback model if validate model fails.">
          <select
            className={inputCls}
            value={runtimeDraft.llmValidateFallbackModel}
            onChange={(e) => updateDraft('llmValidateFallbackModel', e.target.value)}
          >
            <option value="">(none)</option>
            {allModelOptions.map((o) => (
              <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Fallback Token Cap" tip="Max output tokens for validate fallback.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensValidateFallback)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensValidateFallback', e.target.value, getNumberBounds('llmMaxOutputTokensValidateFallback'))}
          >
            {renderTokenOptions(runtimeDraft.llmValidateFallbackModel, 'validate-fallback')}
          </select>
        </SettingRow>
      </SettingGroupBlock>

      {/* -- Verification -- */}
      <SettingGroupBlock title="Verification">
        <SettingRow label="Verify Mode" tip="Enable post-extraction verification passes.">
          <SettingToggle
            checked={runtimeDraft.llmVerifyMode}
            onChange={(v) => updateDraft('llmVerifyMode', v)}
          />
        </SettingRow>
        <SettingRow label="Verify Sample Rate" tip="Percentage of fields to verify.">
          <SettingNumberInput
            draftKey="llmVerifySampleRate"
            value={runtimeDraft.llmVerifySampleRate}
            bounds={getNumberBounds('llmVerifySampleRate')}
            step={0.01}
            className={inputCls}
            onNumberChange={onNumberChange}
          />
        </SettingRow>
      </SettingGroupBlock>

      {/* -- Write Sub-Role -- */}
      <SettingGroupBlock title="Write Sub-Role">
        <SettingRow label="Write Model" tip="Model used for write-role LLM calls.">
          <select
            className={inputCls}
            value={runtimeDraft.llmModelWrite}
            onChange={(e) => updateDraft('llmModelWrite', e.target.value)}
          >
            {allModelOptions.map((o) => (
              <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Write Token Cap" tip="Max output tokens for write calls.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensWrite)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensWrite', e.target.value, getNumberBounds('llmMaxOutputTokensWrite'))}
          >
            {renderTokenOptions(runtimeDraft.llmModelWrite, 'write')}
          </select>
        </SettingRow>
        <ProviderOverrideGroup
          title="Write Provider Override"
          providerValue={runtimeDraft.llmWriteProvider}
          apiKeyValue={runtimeDraft.llmWriteApiKey}
          onProviderChange={(v) => updateDraft('llmWriteProvider', v)}
          onApiKeyChange={(v) => updateDraft('llmWriteApiKey', v)}
          inputCls={inputCls}
        />
        <SettingRow label="Fallback Model" tip="Fallback model if write model fails.">
          <select
            className={inputCls}
            value={runtimeDraft.llmWriteFallbackModel}
            onChange={(e) => updateDraft('llmWriteFallbackModel', e.target.value)}
          >
            <option value="">(none)</option>
            {allModelOptions.map((o) => (
              <option key={o.providerId ? `reg-${o.providerId}-${o.value}` : o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Fallback Token Cap" tip="Max output tokens for write fallback.">
          <select
            className={inputCls}
            value={String(runtimeDraft.llmMaxOutputTokensWriteFallback)}
            onChange={(e) => onNumberChange('llmMaxOutputTokensWriteFallback', e.target.value, getNumberBounds('llmMaxOutputTokensWriteFallback'))}
          >
            {renderTokenOptions(runtimeDraft.llmWriteFallbackModel, 'write-fallback')}
          </select>
        </SettingRow>
        <SettingRow label="Write Summary" tip="Have the LLM write a summary for each product.">
          <SettingToggle
            checked={runtimeDraft.llmWriteSummary}
            onChange={(v) => updateDraft('llmWriteSummary', v)}
          />
        </SettingRow>
      </SettingGroupBlock>

      {/* -- Cortex Deep Reasoning -- */}
      {runtimeDraft.cortexEnabled && (
        <SettingGroupBlock title="Cortex Deep Reasoning">
          <SettingRow label="Deep Reasoning Model" tip="Cortex model for deep reasoning escalation.">
            <input
              className={inputCls}
              value={runtimeDraft.cortexModelReasoningDeep}
              onChange={(e) => updateDraft('cortexModelReasoningDeep', e.target.value)}
            />
          </SettingRow>
          <SettingRow label="Vision Model" tip="Cortex model for vision tasks.">
            <input
              className={inputCls}
              value={runtimeDraft.cortexModelVision}
              onChange={(e) => updateDraft('cortexModelVision', e.target.value)}
            />
          </SettingRow>
          <SettingRow label="DOM Model" tip="Cortex model for DOM analysis.">
            <input
              className={inputCls}
              value={runtimeDraft.cortexModelDom}
              onChange={(e) => updateDraft('cortexModelDom', e.target.value)}
            />
          </SettingRow>
          <SettingRow label="Escalate Below Confidence" tip="Escalate to cortex when confidence is below this threshold.">
            <SettingNumberInput
              draftKey="cortexEscalateConfidenceLt"
              value={runtimeDraft.cortexEscalateConfidenceLt}
              bounds={getNumberBounds('cortexEscalateConfidenceLt')}
              step={0.01}
              className={inputCls}
              onNumberChange={onNumberChange}
            />
          </SettingRow>
          <SettingRow label="Escalate on Conflict" tip="Escalate to cortex when extraction evidence conflicts.">
            <SettingToggle
              checked={runtimeDraft.cortexEscalateIfConflict}
              onChange={(v) => updateDraft('cortexEscalateIfConflict', v)}
            />
          </SettingRow>
          <SettingRow label="Escalate Critical Only" tip="Only escalate critical fields to cortex.">
            <SettingToggle
              checked={runtimeDraft.cortexEscalateCriticalOnly}
              onChange={(v) => updateDraft('cortexEscalateCriticalOnly', v)}
            />
          </SettingRow>
          <SettingRow label="Max Deep Fields Per Product" tip="Maximum fields per product that can be escalated to cortex deep reasoning.">
            <SettingNumberInput
              draftKey="cortexMaxDeepFieldsPerProduct"
              value={runtimeDraft.cortexMaxDeepFieldsPerProduct}
              bounds={getNumberBounds('cortexMaxDeepFieldsPerProduct')}
              step={1}
              className={inputCls}
              onNumberChange={onNumberChange}
            />
          </SettingRow>
        </SettingGroupBlock>
      )}
    </>
  );
});
