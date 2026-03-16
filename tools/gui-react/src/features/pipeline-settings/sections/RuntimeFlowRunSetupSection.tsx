import { memo } from 'react';
import {
  formatRuntimeSearchProviderLabel,
  RUNTIME_SEARCH_ROUTE_HELP_TEXT,
} from '../../../stores/settingsManifest';
import type { RuntimeDraft, NumberBound } from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

interface RuntimeFlowRunSetupSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  reextractWindowLocked: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  searchProviderOptions: readonly RuntimeDraft['searchProvider'][];
  resumeModeOptions: readonly RuntimeDraft['resumeMode'][];
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
}

export const RuntimeFlowRunSetupSection = memo(function RuntimeFlowRunSetupSection({
  runtimeDraft,
  runtimeSettingsReady,
  reextractWindowLocked,
  inputCls,
  runtimeSubStepDomId,
  searchProviderOptions,
  resumeModeOptions,
  updateDraft,
  onNumberChange,
  getNumberBounds,
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
        <SettingRow label="Source Registry" tip="Load and validate per-category source registries at startup. Required for tier expansion and host policies.">
          <SettingToggle checked={runtimeDraft.enableSourceRegistry} onChange={(next) => updateDraft('enableSourceRegistry', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow label="Domain Hint Resolver v2" tip="Use registry-backed tier expansion and host policies instead of legacy dot-filter.">
          <SettingToggle checked={runtimeDraft.enableDomainHintResolverV2} onChange={(next) => updateDraft('enableDomainHintResolverV2', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow label="Query Compiler" tip="Use provider-aware query compilation with operator support detection.">
          <SettingToggle checked={runtimeDraft.enableQueryCompiler} onChange={(next) => updateDraft('enableQueryCompiler', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow label="Core / Deep Gates" tip="Enforce tier-based acceptance policy for core facts vs. deep claims.">
          <SettingToggle checked={runtimeDraft.enableCoreDeepGates} onChange={(next) => updateDraft('enableCoreDeepGates', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow label="Fetch Candidate Sources" tip="Allow candidate URL harvesting from discovered pages.">
          <SettingToggle checked={runtimeDraft.fetchCandidateSources} onChange={(next) => updateDraft('fetchCandidateSources', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <AdvancedSettingsBlock title="Advanced Discovery" count={1}>
          <SettingRow label="Search Profile Caps Map (JSON)" tip="JSON map for deterministic alias, validation, hint, and dedupe caps used by search profile generation.">
            <textarea value={runtimeDraft.searchProfileCapMapJson} onChange={(event) => updateDraft('searchProfileCapMapJson', event.target.value)} disabled={!runtimeSettingsReady} className={`${inputCls} min-h-[88px] font-mono sf-text-label`} spellCheck={false} />
          </SettingRow>
        </AdvancedSettingsBlock>
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

      {/* ── Manufacturer Discovery ── */}
      <div id={runtimeSubStepDomId('run-setup-manufacturer')} className="scroll-mt-24" />
      <SettingGroupBlock title="Manufacturer Discovery">
        <MasterSwitchRow label="Manufacturer Deep Research Enabled" tip="Enable deeper manufacturer-only follow-up discovery strategy." hint="Controls manufacturer URL budgets and seed search below.">
          <SettingToggle checked={runtimeDraft.manufacturerDeepResearchEnabled} onChange={(next) => updateDraft('manufacturerDeepResearchEnabled', next)} disabled={!runtimeSettingsReady} />
        </MasterSwitchRow>
        <SettingRow label="Manufacturer Broad Discovery" tip="Enable expanded manufacturer-domain search strategy.">
          <SettingToggle checked={runtimeDraft.manufacturerBroadDiscovery} onChange={(next) => updateDraft('manufacturerBroadDiscovery', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow label="Manufacturer Seed Search URLs" tip="Seed manufacturer-specific discovery URLs in early rounds.">
          <SettingToggle checked={runtimeDraft.manufacturerSeedSearchUrls} onChange={(next) => updateDraft('manufacturerSeedSearchUrls', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow label="Max Manufacturer URLs / Product" tip="Manufacturer-specific URL budget per product.">
          <SettingNumberInput draftKey="maxManufacturerUrlsPerProduct" value={runtimeDraft.maxManufacturerUrlsPerProduct} bounds={getNumberBounds('maxManufacturerUrlsPerProduct')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Max Manufacturer Pages / Domain" tip="Manufacturer domain page cap.">
          <SettingNumberInput draftKey="maxManufacturerPagesPerDomain" value={runtimeDraft.maxManufacturerPagesPerDomain} bounds={getNumberBounds('maxManufacturerPagesPerDomain')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Manufacturer Reserve URLs" tip="Reserved URL budget kept for manufacturer domains.">
          <SettingNumberInput draftKey="manufacturerReserveUrls" value={runtimeDraft.manufacturerReserveUrls} bounds={getNumberBounds('manufacturerReserveUrls')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Manufacturer Auto Promote" tip="Automatically promote manufacturer-domain sources to tier-1 classification.">
          <SettingToggle
            checked={runtimeDraft.manufacturerAutoPromote}
            onChange={(next) => updateDraft('manufacturerAutoPromote', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
      </SettingGroupBlock>

      {/* ── Discovery Results ── */}
      <div id={runtimeSubStepDomId('run-setup-results')} className="scroll-mt-24" />
      <SettingGroupBlock title="Discovery Results">
        <SettingRow label="Discovery Max Queries" tip="Maximum discovery search queries emitted for each product.">
          <SettingNumberInput draftKey="discoveryMaxQueries" value={runtimeDraft.discoveryMaxQueries} bounds={getNumberBounds('discoveryMaxQueries')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Discovery Max Discovered" tip="Maximum discovered URLs admitted into the candidate set.">
          <SettingNumberInput draftKey="discoveryMaxDiscovered" value={runtimeDraft.discoveryMaxDiscovered} bounds={getNumberBounds('discoveryMaxDiscovered')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Query Index Enabled" tip="Persist search queries across runs for dedup and learning.">
          <SettingToggle
            checked={runtimeDraft.enableQueryIndex}
            onChange={(next) => updateDraft('enableQueryIndex', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="URL Index Enabled" tip="Persist discovered URLs across runs for dedup and learning.">
          <SettingToggle
            checked={runtimeDraft.enableUrlIndex}
            onChange={(next) => updateDraft('enableUrlIndex', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
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
