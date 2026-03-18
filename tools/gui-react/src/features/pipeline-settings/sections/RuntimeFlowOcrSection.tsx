import { memo } from 'react';
import type { ReactNode } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { FlowOptionPanel, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const OCR_BACKEND_OPTIONS = ['auto', 'tesseract', 'none'] as const;
const OCR_PHASE_TIP =
  'Phase coverage: 09 Fetch To Extraction for scanned or image-only PDFs.';

interface RuntimeFlowOcrSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  ocrControlsLocked: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  renderDisabledHint: (message: string) => ReactNode;
}

export const RuntimeFlowOcrSection = memo(function RuntimeFlowOcrSection({
  runtimeDraft,
  runtimeSettingsReady,
  ocrControlsLocked,
  inputCls,
  runtimeSubStepDomId,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  renderDisabledHint,
}: RuntimeFlowOcrSectionProps) {
  return (
    <div className="space-y-3">
      <FlowOptionPanel
        title="OCR"
        subtitle="Scanned PDF OCR activation and evidence-promotion controls."
      >
        <div id={runtimeSubStepDomId('ocr-activation')} className="scroll-mt-24" />
        <SettingGroupBlock title="OCR Activation">
          <MasterSwitchRow label="OCR Enabled" tip={`${OCR_PHASE_TIP}\nLives in: scanned-PDF fallback before evidence and candidates are emitted.\nWhat this controls: whether the runtime is allowed to invoke OCR when a PDF lacks usable embedded text.`} hint="Controls all OCR sampling and threshold settings below">
            <SettingToggle
              checked={runtimeDraft.scannedPdfOcrEnabled}
              onChange={(next) => updateDraft('scannedPdfOcrEnabled', next)}
              disabled={!runtimeSettingsReady}
            />
          </MasterSwitchRow>
          <SettingRow label="Promote OCR Candidates" tip={`${OCR_PHASE_TIP}\nLives in: OCR candidate admission into the broader extraction context.\nWhat this controls: whether values discovered through OCR may be promoted into the main extraction candidate set.`} disabled={ocrControlsLocked}>
            <SettingToggle
              checked={runtimeDraft.scannedPdfOcrPromoteCandidates}
              onChange={(next) => updateDraft('scannedPdfOcrPromoteCandidates', next)}
              disabled={!runtimeSettingsReady || ocrControlsLocked}
            />
          </SettingRow>
          <SettingRow label="OCR Backend" tip={`${OCR_PHASE_TIP}\nLives in: OCR engine routing.\nWhat this controls: which OCR backend is selected for scanned-document processing.`} disabled={ocrControlsLocked}>
            <select
              value={runtimeDraft.scannedPdfOcrBackend}
              onChange={(event) => updateDraft('scannedPdfOcrBackend', event.target.value as RuntimeDraft['scannedPdfOcrBackend'])}
              disabled={!runtimeSettingsReady || ocrControlsLocked}
              className={inputCls}
            >
              {OCR_BACKEND_OPTIONS.map((backend) => (
                <option key={`ocr:${backend}`} value={backend}>
                  {backend}
                </option>
              ))}
            </select>
          </SettingRow>
        </SettingGroupBlock>
        <div id={runtimeSubStepDomId('ocr-thresholds')} className="scroll-mt-24" />
        <SettingGroupBlock title="OCR Sampling Thresholds">
          <SettingRow label="OCR Max Pages" tip={`${OCR_PHASE_TIP}\nLives in: OCR sampling limits.\nWhat this controls: how many pages OCR is allowed to inspect from a scanned PDF.`} disabled={ocrControlsLocked}>
            <SettingNumberInput draftKey="scannedPdfOcrMaxPages" value={runtimeDraft.scannedPdfOcrMaxPages} bounds={getNumberBounds('scannedPdfOcrMaxPages')} step={1} disabled={!runtimeSettingsReady || ocrControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="OCR Max Pairs" tip={`${OCR_PHASE_TIP}\nLives in: OCR evidence-to-candidate promotion.\nWhat this controls: the maximum number of OCR-derived source pairs that may be promoted forward.`} disabled={ocrControlsLocked}>
            <SettingNumberInput draftKey="scannedPdfOcrMaxPairs" value={runtimeDraft.scannedPdfOcrMaxPairs} bounds={getNumberBounds('scannedPdfOcrMaxPairs')} step={1} disabled={!runtimeSettingsReady || ocrControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="OCR Min Chars / Page" tip={`${OCR_PHASE_TIP}\nLives in: OCR page-quality gating.\nWhat this controls: the minimum number of recognized characters a page must contain before its OCR output is considered usable.`} disabled={ocrControlsLocked}>
            <SettingNumberInput draftKey="scannedPdfOcrMinCharsPerPage" value={runtimeDraft.scannedPdfOcrMinCharsPerPage} bounds={getNumberBounds('scannedPdfOcrMinCharsPerPage')} step={10} disabled={!runtimeSettingsReady || ocrControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="OCR Min Lines / Page" tip={`${OCR_PHASE_TIP}\nLives in: OCR page-quality gating.\nWhat this controls: the minimum number of detected lines required before a page's OCR output can survive.`} disabled={ocrControlsLocked}>
            <SettingNumberInput draftKey="scannedPdfOcrMinLinesPerPage" value={runtimeDraft.scannedPdfOcrMinLinesPerPage} bounds={getNumberBounds('scannedPdfOcrMinLinesPerPage')} step={1} disabled={!runtimeSettingsReady || ocrControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="OCR Min Confidence" tip={`${OCR_PHASE_TIP}\nLives in: OCR confidence filtering before promotion.\nWhat this controls: the minimum confidence score OCR output must reach before it can contribute candidates.`} disabled={ocrControlsLocked}>
            <SettingNumberInput draftKey="scannedPdfOcrMinConfidence" value={runtimeDraft.scannedPdfOcrMinConfidence} bounds={getNumberBounds('scannedPdfOcrMinConfidence')} step={0.01} disabled={!runtimeSettingsReady || ocrControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </SettingGroupBlock>
      </FlowOptionPanel>
      {ocrControlsLocked ? renderDisabledHint('OCR controls are disabled because OCR Enabled is OFF.') : null}
    </div>
  );
});
