import { memo } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const PARSING_PHASE_TIP =
  'Phase coverage: 09 Fetch To Extraction.';

interface RuntimeFlowParsingSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
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
        <MasterSwitchRow label="PDF Router Enabled" tip={`${PARSING_PHASE_TIP}\nLives in: PDF intake before deterministic parsing and extraction candidates are built.\nWhat this controls: whether the runtime chooses among PDF backends instead of relying on a fixed parser path.`} hint="Controls PDF backend, page limits, and text preview settings below">
          <SettingToggle
            checked={runtimeDraft.pdfBackendRouterEnabled}
            onChange={(next) => updateDraft('pdfBackendRouterEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Max PDF Bytes" tip={`${PARSING_PHASE_TIP}\nLives in: PDF payload safety checks before parsing begins.\nWhat this controls: the maximum PDF size the runtime will accept for downstream extraction work.`}>
          <SettingNumberInput draftKey="maxPdfBytes" value={runtimeDraft.maxPdfBytes} bounds={getNumberBounds('maxPdfBytes')} step={1024} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="PDF Preferred Backend" tip={`${PARSING_PHASE_TIP}\nLives in: PDF backend routing preferences.\nWhat this controls: the preferred parser backend when the PDF router is enabled and more than one backend is available.`} disabled={!runtimeDraft.pdfBackendRouterEnabled}>
          <input
            type="text"
            value={runtimeDraft.pdfPreferredBackend}
            onChange={(event) => updateDraft('pdfPreferredBackend', event.target.value)}
            disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled}
            className={inputCls}
          />
        </SettingRow>
        <AdvancedSettingsBlock title="PDF Router Limits" count={4}>
          <SettingRow label="PDF Router Timeout (ms)" tip={`${PARSING_PHASE_TIP}\nLives in: PDF router backend selection.\nWhat this controls: how long the router may spend evaluating backend options for a PDF before timing out.`} disabled={!runtimeDraft.pdfBackendRouterEnabled}>
            <SettingNumberInput draftKey="pdfBackendRouterTimeoutMs" value={runtimeDraft.pdfBackendRouterTimeoutMs} bounds={getNumberBounds('pdfBackendRouterTimeoutMs')} step={1000} disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="PDF Router Max Pages" tip={`${PARSING_PHASE_TIP}\nLives in: PDF router sampling.\nWhat this controls: the maximum number of pages scanned while deciding which PDF backend to use.`} disabled={!runtimeDraft.pdfBackendRouterEnabled}>
            <SettingNumberInput draftKey="pdfBackendRouterMaxPages" value={runtimeDraft.pdfBackendRouterMaxPages} bounds={getNumberBounds('pdfBackendRouterMaxPages')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="PDF Router Max Pairs" tip={`${PARSING_PHASE_TIP}\nLives in: PDF router evidence sampling.\nWhat this controls: the maximum number of candidate key-value pairs the router evaluates while comparing backends.`} disabled={!runtimeDraft.pdfBackendRouterEnabled}>
            <SettingNumberInput draftKey="pdfBackendRouterMaxPairs" value={runtimeDraft.pdfBackendRouterMaxPairs} bounds={getNumberBounds('pdfBackendRouterMaxPairs')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="PDF Router Max Text Preview Chars" tip={`${PARSING_PHASE_TIP}\nLives in: PDF text preview generation for backend selection.\nWhat this controls: how many preview characters are sampled before the router chooses a backend.`} disabled={!runtimeDraft.pdfBackendRouterEnabled}>
            <SettingNumberInput draftKey="pdfBackendRouterMaxTextPreviewChars" value={runtimeDraft.pdfBackendRouterMaxTextPreviewChars} bounds={getNumberBounds('pdfBackendRouterMaxTextPreviewChars')} step={256} disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      <div id={runtimeSubStepDomId('parsing-article')} className="scroll-mt-24" />
      <SettingGroupBlock title="Article Extraction">
        <SettingRow label="Article Extractor Min Chars" tip={`${PARSING_PHASE_TIP}\nLives in: article acceptance gating.\nWhat this controls: the minimum extracted body length required before article output is treated as usable evidence.`}>
          <SettingNumberInput draftKey="articleExtractorMinChars" value={runtimeDraft.articleExtractorMinChars} bounds={getNumberBounds('articleExtractorMinChars')} step={10} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Article Extractor Min Score" tip={`${PARSING_PHASE_TIP}\nLives in: article quality gating.\nWhat this controls: the minimum extractor score required before article output survives into extraction context.`}>
          <SettingNumberInput draftKey="articleExtractorMinScore" value={runtimeDraft.articleExtractorMinScore} bounds={getNumberBounds('articleExtractorMinScore')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Article Limits & Policies" count={2}>
          <SettingRow label="Article Extractor Max Chars" tip={`${PARSING_PHASE_TIP}\nLives in: article evidence truncation.\nWhat this controls: the maximum amount of extracted article body text retained for downstream use.`}>
            <SettingNumberInput draftKey="articleExtractorMaxChars" value={runtimeDraft.articleExtractorMaxChars} bounds={getNumberBounds('articleExtractorMaxChars')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Article Extractor Domain Policy Map (JSON)" tip={`${PARSING_PHASE_TIP}\nLives in: host-specific article parsing policy.\nWhat this controls: an optional JSON override map for per-domain article-extractor mode decisions.`}>
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
        <SettingRow label="Static DOM Mode" tip={`${PARSING_PHASE_TIP}\nLives in: static DOM parser selection.\nWhat this controls: which deterministic DOM extraction mode is used when the static extractor is enabled.`}>
          <input
            type="text"
            value={runtimeDraft.staticDomMode}
            onChange={(event) => updateDraft('staticDomMode', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Static DOM Target Match Threshold" tip={`${PARSING_PHASE_TIP}\nLives in: static DOM candidate admission.\nWhat this controls: the minimum target-match confidence a DOM-derived candidate must reach before it is accepted.`}>
          <SettingNumberInput draftKey="staticDomTargetMatchThreshold" value={runtimeDraft.staticDomTargetMatchThreshold} bounds={getNumberBounds('staticDomTargetMatchThreshold')} step={0.01} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="DOM Snippet Limits" count={2}>
          <SettingRow label="Static DOM Max Evidence Snippets" tip={`${PARSING_PHASE_TIP}\nLives in: DOM evidence retention.\nWhat this controls: how many DOM snippets may be stored per candidate field.`}>
            <SettingNumberInput draftKey="staticDomMaxEvidenceSnippets" value={runtimeDraft.staticDomMaxEvidenceSnippets} bounds={getNumberBounds('staticDomMaxEvidenceSnippets')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="DOM Snippet Max Chars" tip={`${PARSING_PHASE_TIP}\nLives in: DOM snippet truncation.\nWhat this controls: the maximum number of DOM characters retained from a single source snippet.`}>
            <SettingNumberInput draftKey="domSnippetMaxChars" value={runtimeDraft.domSnippetMaxChars} bounds={getNumberBounds('domSnippetMaxChars')} step={50} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      <SettingGroupBlock title="Additional Parsers">
        <SettingRow label="Spec DB Dir" tip={`Phase coverage: 13 Validation To Output and durable storage.\nLives in: final artifact persistence rather than the extraction stage itself.\nWhat this controls: the root directory used for per-category spec SQLite databases.`}>
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
