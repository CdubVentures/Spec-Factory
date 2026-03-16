import { memo } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

interface RuntimeFlowParsingSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  dynamicFetchControlsLocked: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
}

export const RuntimeFlowParsingSection = memo(function RuntimeFlowParsingSection({
  runtimeDraft,
  runtimeSettingsReady,
  inputCls,
  runtimeSubStepDomId,
  updateDraft,
  onNumberChange,
  getNumberBounds,
}: RuntimeFlowParsingSectionProps) {
  return (
    <>
      <div id={runtimeSubStepDomId('parsing-pdf')} className="scroll-mt-24" />
      <SettingGroupBlock title="PDF Processing">
        <MasterSwitchRow label="PDF Router Enabled" tip="Enable backend PDF router selection logic.">
          <SettingToggle
            checked={runtimeDraft.pdfBackendRouterEnabled}
            onChange={(next) => updateDraft('pdfBackendRouterEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Max PDF Bytes" tip="Maximum PDF payload bytes allowed for parsing.">
          <SettingNumberInput draftKey="maxPdfBytes" value={runtimeDraft.maxPdfBytes} bounds={getNumberBounds('maxPdfBytes')} step={1024} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="PDF Preferred Backend" tip="Preferred PDF backend (auto/pdfplumber/pymupdf/camelot/tabula/legacy)." disabled={!runtimeDraft.pdfBackendRouterEnabled}>
          <input
            type="text"
            value={runtimeDraft.pdfPreferredBackend}
            onChange={(event) => updateDraft('pdfPreferredBackend', event.target.value)}
            disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled}
            className={inputCls}
          />
        </SettingRow>
        <AdvancedSettingsBlock title="PDF Router Limits" count={4}>
          <SettingRow label="PDF Router Timeout (ms)" tip="Maximum wait time for PDF router backend evaluation." disabled={!runtimeDraft.pdfBackendRouterEnabled}>
            <SettingNumberInput draftKey="pdfBackendRouterTimeoutMs" value={runtimeDraft.pdfBackendRouterTimeoutMs} bounds={getNumberBounds('pdfBackendRouterTimeoutMs')} step={1000} disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="PDF Router Max Pages" tip="Maximum pages scanned by the PDF router." disabled={!runtimeDraft.pdfBackendRouterEnabled}>
            <SettingNumberInput draftKey="pdfBackendRouterMaxPages" value={runtimeDraft.pdfBackendRouterMaxPages} bounds={getNumberBounds('pdfBackendRouterMaxPages')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="PDF Router Max Pairs" tip="Maximum candidate key-value pairs evaluated by the PDF router." disabled={!runtimeDraft.pdfBackendRouterEnabled}>
            <SettingNumberInput draftKey="pdfBackendRouterMaxPairs" value={runtimeDraft.pdfBackendRouterMaxPairs} bounds={getNumberBounds('pdfBackendRouterMaxPairs')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="PDF Router Max Text Preview Chars" tip="Max text preview characters sampled for PDF backend routing." disabled={!runtimeDraft.pdfBackendRouterEnabled}>
            <SettingNumberInput draftKey="pdfBackendRouterMaxTextPreviewChars" value={runtimeDraft.pdfBackendRouterMaxTextPreviewChars} bounds={getNumberBounds('pdfBackendRouterMaxTextPreviewChars')} step={256} disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      <div id={runtimeSubStepDomId('parsing-article')} className="scroll-mt-24" />
      <SettingGroupBlock title="Article Extraction">
        <MasterSwitchRow label="Article Extractor V2 Enabled" tip="Enable article extractor readability-v2 path.">
          <SettingToggle
            checked={runtimeDraft.articleExtractorV2Enabled}
            onChange={(next) => updateDraft('articleExtractorV2Enabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Article Extractor Min Chars" tip="Minimum body character count for article extractor acceptance." disabled={!runtimeDraft.articleExtractorV2Enabled}>
          <SettingNumberInput draftKey="articleExtractorMinChars" value={runtimeDraft.articleExtractorMinChars} bounds={getNumberBounds('articleExtractorMinChars')} step={10} disabled={!runtimeSettingsReady || !runtimeDraft.articleExtractorV2Enabled} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Article Extractor Min Score" tip="Minimum extractor score threshold for acceptance." disabled={!runtimeDraft.articleExtractorV2Enabled}>
          <SettingNumberInput draftKey="articleExtractorMinScore" value={runtimeDraft.articleExtractorMinScore} bounds={getNumberBounds('articleExtractorMinScore')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.articleExtractorV2Enabled} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Article Limits & Policies" count={2}>
          <SettingRow label="Article Extractor Max Chars" tip="Maximum extractor body characters retained." disabled={!runtimeDraft.articleExtractorV2Enabled}>
            <SettingNumberInput draftKey="articleExtractorMaxChars" value={runtimeDraft.articleExtractorMaxChars} bounds={getNumberBounds('articleExtractorMaxChars')} step={100} disabled={!runtimeSettingsReady || !runtimeDraft.articleExtractorV2Enabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Article Extractor Domain Policy Map (JSON)" tip="Host policy map JSON override for article-extractor mode selection.">
            <textarea
              value={runtimeDraft.articleExtractorDomainPolicyMapJson}
              onChange={(event) => updateDraft('articleExtractorDomainPolicyMapJson', event.target.value)}
              disabled={!runtimeSettingsReady}
              className={`${inputCls} min-h-[72px]`}
            />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      <div id={runtimeSubStepDomId('parsing-dom')} className="scroll-mt-24" />
      <SettingGroupBlock title="Static DOM">
        <MasterSwitchRow label="Static DOM Extractor Enabled" tip="Enable static DOM extraction fallback path.">
          <SettingToggle
            checked={runtimeDraft.staticDomExtractorEnabled}
            onChange={(next) => updateDraft('staticDomExtractorEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Static DOM Mode" tip="Static DOM extraction mode (cheerio/regex_fallback)." disabled={!runtimeDraft.staticDomExtractorEnabled}>
          <input
            type="text"
            value={runtimeDraft.staticDomMode}
            onChange={(event) => updateDraft('staticDomMode', event.target.value)}
            disabled={!runtimeSettingsReady || !runtimeDraft.staticDomExtractorEnabled}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Static DOM Target Match Threshold" tip="Minimum target-match confidence for static DOM extraction candidates." disabled={!runtimeDraft.staticDomExtractorEnabled}>
          <SettingNumberInput draftKey="staticDomTargetMatchThreshold" value={runtimeDraft.staticDomTargetMatchThreshold} bounds={getNumberBounds('staticDomTargetMatchThreshold')} step={0.01} disabled={!runtimeSettingsReady || !runtimeDraft.staticDomExtractorEnabled} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="DOM Snippet Limits" count={2}>
          <SettingRow label="Static DOM Max Evidence Snippets" tip="Maximum static-DOM snippets retained per candidate field." disabled={!runtimeDraft.staticDomExtractorEnabled}>
            <SettingNumberInput draftKey="staticDomMaxEvidenceSnippets" value={runtimeDraft.staticDomMaxEvidenceSnippets} bounds={getNumberBounds('staticDomMaxEvidenceSnippets')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.staticDomExtractorEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="DOM Snippet Max Chars" tip="Maximum DOM snippet characters retained per source.">
            <SettingNumberInput draftKey="domSnippetMaxChars" value={runtimeDraft.domSnippetMaxChars} bounds={getNumberBounds('domSnippetMaxChars')} step={50} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      <div id={runtimeSubStepDomId('parsing-metadata')} className="scroll-mt-24" />
      <SettingGroupBlock title="Structured Metadata">
        <MasterSwitchRow label="Structured Metadata Extruct Enabled" tip="Enable structured-metadata extruct service client path.">
          <SettingToggle
            checked={runtimeDraft.structuredMetadataExtructEnabled}
            onChange={(next) => updateDraft('structuredMetadataExtructEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Structured Metadata Extruct URL" tip="Base URL for the structured-metadata extruct service." disabled={!runtimeDraft.structuredMetadataExtructEnabled}>
          <input
            type="text"
            value={runtimeDraft.structuredMetadataExtructUrl}
            onChange={(event) => updateDraft('structuredMetadataExtructUrl', event.target.value)}
            disabled={!runtimeSettingsReady || !runtimeDraft.structuredMetadataExtructEnabled}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Structured Metadata Extruct Timeout (ms)" tip="Timeout for extruct service requests." disabled={!runtimeDraft.structuredMetadataExtructEnabled}>
          <SettingNumberInput draftKey="structuredMetadataExtructTimeoutMs" value={runtimeDraft.structuredMetadataExtructTimeoutMs} bounds={getNumberBounds('structuredMetadataExtructTimeoutMs')} step={50} disabled={!runtimeSettingsReady || !runtimeDraft.structuredMetadataExtructEnabled} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Extruct Cache & Limits" count={3}>
          <SettingRow label="Structured Metadata Extruct Max Items / Surface" tip="Maximum extruct metadata items retained per page surface." disabled={!runtimeDraft.structuredMetadataExtructEnabled}>
            <SettingNumberInput draftKey="structuredMetadataExtructMaxItemsPerSurface" value={runtimeDraft.structuredMetadataExtructMaxItemsPerSurface} bounds={getNumberBounds('structuredMetadataExtructMaxItemsPerSurface')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.structuredMetadataExtructEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Structured Metadata Extruct Cache Enabled" tip="Cache extruct responses to reduce repeated metadata fetch calls." disabled={!runtimeDraft.structuredMetadataExtructEnabled}>
            <SettingToggle
              checked={runtimeDraft.structuredMetadataExtructCacheEnabled}
              onChange={(next) => updateDraft('structuredMetadataExtructCacheEnabled', next)}
              disabled={!runtimeSettingsReady || !runtimeDraft.structuredMetadataExtructEnabled}
            />
          </SettingRow>
          <SettingRow label="Structured Metadata Extruct Cache Limit" tip="Maximum number of extruct cache entries retained." disabled={!runtimeDraft.structuredMetadataExtructEnabled || !runtimeDraft.structuredMetadataExtructCacheEnabled}>
            <SettingNumberInput draftKey="structuredMetadataExtructCacheLimit" value={runtimeDraft.structuredMetadataExtructCacheLimit} bounds={getNumberBounds('structuredMetadataExtructCacheLimit')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.structuredMetadataExtructEnabled || !runtimeDraft.structuredMetadataExtructCacheEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      <SettingGroupBlock title="Additional Parsers">
        <SettingRow label="HTML Table Extractor V2" tip="Enable table-focused HTML extractor v2 path.">
          <SettingToggle
            checked={runtimeDraft.htmlTableExtractorV2}
            onChange={(next) => updateDraft('htmlTableExtractorV2', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Chart Extraction Enabled" tip="Enable chart extraction assist path for parse stage.">
          <SettingToggle
            checked={runtimeDraft.chartExtractionEnabled}
            onChange={(next) => updateDraft('chartExtractionEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Spec DB Dir" tip="Root directory for per-category spec SQLite databases.">
          <input
            type="text"
            value={runtimeDraft.specDbDir}
            onChange={(event) => updateDraft('specDbDir', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
      </SettingGroupBlock>
    </>
  );
});
