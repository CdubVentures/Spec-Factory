import { memo } from 'react';
import {
  SettingGroupBlock,
  SettingNumberInput,
  SettingRow,
  SettingToggle,
  type NumberBound,
  type RuntimeDraft,
} from '../../pipeline-settings';

interface LlmExtractionSectionProps {
  runtimeDraft: RuntimeDraft;
  inputCls: string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
}

export const LlmExtractionSection = memo(function LlmExtractionSection({
  runtimeDraft,
  inputCls,
  updateDraft,
  onNumberChange,
  getNumberBounds,
}: LlmExtractionSectionProps) {
  return (
    <>
      {/* -- Extraction Settings -- */}
      <SettingGroupBlock title="Extraction Settings">
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

      {/* -- Write Settings -- */}
      <SettingGroupBlock title="Write Settings">
        <SettingRow label="Write Summary" tip="Have the LLM write a summary for each product.">
          <SettingToggle
            checked={runtimeDraft.llmWriteSummary}
            onChange={(v) => updateDraft('llmWriteSummary', v)}
          />
        </SettingRow>
      </SettingGroupBlock>
    </>
  );
});
