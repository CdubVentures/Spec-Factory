import { memo } from 'react';
import type { ReactNode } from 'react';
import {
  formatRuntimeSearchProviderLabel,
  RUNTIME_SEARCH_ROUTE_HELP_TEXT,
} from '../../../stores/settingsManifest';
import type { RuntimeDraft, NumberBound } from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

interface RuntimeFlowRunSetupSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  reextractWindowLocked: boolean;
  plannerControlsLocked: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  searchProviderOptions: readonly RuntimeDraft['searchProvider'][];
  resumeModeOptions: readonly RuntimeDraft['resumeMode'][];
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  renderDisabledHint: (message: string) => ReactNode;
}

export const RuntimeFlowRunSetupSection = memo(function RuntimeFlowRunSetupSection({
  runtimeDraft,
  runtimeSettingsReady,
  reextractWindowLocked,
  plannerControlsLocked,
  inputCls,
  runtimeSubStepDomId,
  searchProviderOptions,
  resumeModeOptions,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  renderDisabledHint,
}: RuntimeFlowRunSetupSectionProps) {
  return (
    <>
      {/* ── Discovery ── */}
      <div id={runtimeSubStepDomId('run-setup-discovery')} className="scroll-mt-24" />
      <SettingGroupBlock title="Discovery">
        <SettingRow
          label="Search Route"
          tip={RUNTIME_SEARCH_ROUTE_HELP_TEXT}
                 >
          <select
            value={runtimeDraft.searchProvider}
            onChange={(event) => updateDraft('searchProvider', event.target.value as RuntimeDraft['searchProvider'])}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {searchProviderOptions.map((option) => (
              <option key={`provider:${option}`} value={option}>
                {formatRuntimeSearchProviderLabel(option)}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="SearXNG Base URL" tip="Endpoint used by all discovery search routes.">
          <input type="text" value={runtimeDraft.searxngBaseUrl} onChange={(event) => updateDraft('searxngBaseUrl', event.target.value)} disabled={!runtimeSettingsReady} className={inputCls} placeholder="http://localhost:8080" />
        </SettingRow>
        <SettingRow label="Fetch Candidate Sources" tip="Allow candidate URL harvesting from discovered pages.">
          <SettingToggle checked={runtimeDraft.fetchCandidateSources} onChange={(next) => updateDraft('fetchCandidateSources', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow label="Discovery Max Queries" tip="Maximum discovery search queries emitted for each product.">
          <SettingNumberInput draftKey="discoveryMaxQueries" value={runtimeDraft.discoveryMaxQueries} bounds={getNumberBounds('discoveryMaxQueries')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Discovery Max Discovered" tip="Maximum discovered URLs admitted into the candidate set.">
          <SettingNumberInput draftKey="discoveryMaxDiscovered" value={runtimeDraft.discoveryMaxDiscovered} bounds={getNumberBounds('discoveryMaxDiscovered')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Planner, Reranker & Manufacturer" count={4}>
          <SettingRow label="Manufacturer Auto Promote" tip="Automatically promote manufacturer-domain sources to tier-1 classification.">
            <SettingToggle
              checked={runtimeDraft.manufacturerAutoPromote}
              onChange={(next) => updateDraft('manufacturerAutoPromote', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <SettingRow label="Search Profile Caps Map (JSON)" tip="JSON cap map for search profile generation (alias caps, hint queries, field target queries, dedupe)." disabled={plannerControlsLocked}>
            <textarea value={runtimeDraft.searchProfileCapMapJson} onChange={(event) => updateDraft('searchProfileCapMapJson', event.target.value)} disabled={!runtimeSettingsReady || plannerControlsLocked} className={`${inputCls} min-h-[88px] font-mono sf-text-label`} spellCheck={false} />
          </SettingRow>
          <SettingRow label="SERP Reranker Weight Map (JSON)" tip="JSON weight map used by deterministic SERP reranker scoring bonuses and penalties." disabled={plannerControlsLocked}>
            <textarea value={runtimeDraft.serpRerankerWeightMapJson} onChange={(event) => updateDraft('serpRerankerWeightMapJson', event.target.value)} disabled={!runtimeSettingsReady || plannerControlsLocked} className={`${inputCls} min-h-[88px] font-mono sf-text-label`} spellCheck={false} />
          </SettingRow>
        </AdvancedSettingsBlock>
        {plannerControlsLocked ? renderDisabledHint('Planner and reranker controls are disabled because Discovery Enabled is OFF.') : null}
      </SettingGroupBlock>

      {/* ── URL Budgets ── */}
      <div id={runtimeSubStepDomId('run-setup-budgets')} className="scroll-mt-24" />
      <SettingGroupBlock title="URL Budgets">
        <SettingRow label="Max URLs / Product" tip="Primary ceiling for URLs collected per product.">
          <SettingNumberInput draftKey="maxUrlsPerProduct" value={runtimeDraft.maxUrlsPerProduct} bounds={getNumberBounds('maxUrlsPerProduct')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Max Candidate URLs" tip="Upper bound for candidate URLs admitted before fetch.">
          <SettingNumberInput draftKey="maxCandidateUrls" value={runtimeDraft.maxCandidateUrls} bounds={getNumberBounds('maxCandidateUrls')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Max Pages / Domain" tip="Per-domain page cap for discovery and fetch.">
          <SettingNumberInput draftKey="maxPagesPerDomain" value={runtimeDraft.maxPagesPerDomain} bounds={getNumberBounds('maxPagesPerDomain')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Max Run Seconds" tip="Global wall-clock cap for a single product runtime.">
          <SettingNumberInput draftKey="maxRunSeconds" value={runtimeDraft.maxRunSeconds} bounds={getNumberBounds('maxRunSeconds')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Advanced URL Budgets" count={2}>
          <SettingRow label="Max JSON Bytes" tip="Response JSON payload safety limit.">
            <SettingNumberInput draftKey="maxJsonBytes" value={runtimeDraft.maxJsonBytes} bounds={getNumberBounds('maxJsonBytes')} step={1024} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="User Agent" tip="HTTP User-Agent string for outbound fetch requests.">
            <input type="text" value={runtimeDraft.userAgent} onChange={(event) => updateDraft('userAgent', event.target.value)} disabled={!runtimeSettingsReady} className={inputCls} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      {/* ── Resume & Re-extract ── */}
      <div id={runtimeSubStepDomId('run-setup-resume')} className="scroll-mt-24" />
      <SettingGroupBlock title="Resume and Re-extract">
        <SettingRow label="Resume Mode" tip="Controls whether prior run state is reused or ignored.">
          <select
            value={runtimeDraft.resumeMode}
            onChange={(event) => updateDraft('resumeMode', event.target.value as RuntimeDraft['resumeMode'])}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {resumeModeOptions.map((mode) => (
              <option key={`resume:${mode}`} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Resume Window (hours)" tip="Maximum age of resumable state. Older state is ignored when resume mode allows resume.">
          <SettingNumberInput draftKey="resumeWindowHours" value={runtimeDraft.resumeWindowHours} bounds={getNumberBounds('resumeWindowHours')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Re-extract Indexed" tip="Master toggle for stale indexed-source re-extraction.">
          <SettingToggle checked={runtimeDraft.reextractIndexed} onChange={(next) => updateDraft('reextractIndexed', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow label="Re-extract Age (hours)" tip="Age threshold for re-extracting successful indexed sources." disabled={reextractWindowLocked}>
          <SettingNumberInput draftKey="reextractAfterHours" value={runtimeDraft.reextractAfterHours} bounds={getNumberBounds('reextractAfterHours')} step={1} disabled={!runtimeSettingsReady || reextractWindowLocked} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
      </SettingGroupBlock>
    </>
  );
});
