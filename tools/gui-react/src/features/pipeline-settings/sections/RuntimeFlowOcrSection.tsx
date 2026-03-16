import { memo } from 'react';
import type { ReactNode } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { FlowOptionPanel, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const OCR_BACKEND_OPTIONS = ['auto', 'tesseract', 'none'] as const;

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
          <MasterSwitchRow label="OCR Enabled" tip="Master toggle for OCR fallback on scanned or image-only PDFs." hint="Controls all OCR sampling and threshold settings below">
            <SettingToggle
              checked={runtimeDraft.scannedPdfOcrEnabled}
              onChange={(next) => updateDraft('scannedPdfOcrEnabled', next)}
              disabled={!runtimeSettingsReady}
            />
          </MasterSwitchRow>
          <SettingRow label="Promote OCR Candidates" tip="Allows OCR-extracted candidates to be promoted into extraction context." disabled={ocrControlsLocked}>
            <SettingToggle
              checked={runtimeDraft.scannedPdfOcrPromoteCandidates}
              onChange={(next) => updateDraft('scannedPdfOcrPromoteCandidates', next)}
              disabled={!runtimeSettingsReady || ocrControlsLocked}
            />
          </SettingRow>
          <SettingRow label="OCR Backend" tip="OCR engine selection for scanned documents." disabled={ocrControlsLocked}>
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
          <SettingRow label="OCR Max Pages" tip="Maximum number of pages sampled by OCR fallback." disabled={ocrControlsLocked}>
            <SettingNumberInput draftKey="scannedPdfOcrMaxPages" value={runtimeDraft.scannedPdfOcrMaxPages} bounds={getNumberBounds('scannedPdfOcrMaxPages')} step={1} disabled={!runtimeSettingsReady || ocrControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="OCR Max Pairs" tip="Maximum source pairs promoted from OCR extraction." disabled={ocrControlsLocked}>
            <SettingNumberInput draftKey="scannedPdfOcrMaxPairs" value={runtimeDraft.scannedPdfOcrMaxPairs} bounds={getNumberBounds('scannedPdfOcrMaxPairs')} step={1} disabled={!runtimeSettingsReady || ocrControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="OCR Min Chars / Page" tip="Minimum characters required per OCR page." disabled={ocrControlsLocked}>
            <SettingNumberInput draftKey="scannedPdfOcrMinCharsPerPage" value={runtimeDraft.scannedPdfOcrMinCharsPerPage} bounds={getNumberBounds('scannedPdfOcrMinCharsPerPage')} step={10} disabled={!runtimeSettingsReady || ocrControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="OCR Min Lines / Page" tip="Minimum OCR line count required per page." disabled={ocrControlsLocked}>
            <SettingNumberInput draftKey="scannedPdfOcrMinLinesPerPage" value={runtimeDraft.scannedPdfOcrMinLinesPerPage} bounds={getNumberBounds('scannedPdfOcrMinLinesPerPage')} step={1} disabled={!runtimeSettingsReady || ocrControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="OCR Min Confidence" tip="Minimum OCR confidence required before candidate promotion." disabled={ocrControlsLocked}>
            <SettingNumberInput draftKey="scannedPdfOcrMinConfidence" value={runtimeDraft.scannedPdfOcrMinConfidence} bounds={getNumberBounds('scannedPdfOcrMinConfidence')} step={0.01} disabled={!runtimeSettingsReady || ocrControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </SettingGroupBlock>
      </FlowOptionPanel>
      {ocrControlsLocked ? renderDisabledHint('OCR controls are disabled because OCR Enabled is OFF.') : null}
    </div>
  );
});
