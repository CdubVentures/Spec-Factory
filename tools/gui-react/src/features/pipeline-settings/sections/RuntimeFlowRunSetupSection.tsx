import { memo } from 'react';
import type { ReactNode } from 'react';
import {
  formatRuntimeSearchProviderLabel,
  RUNTIME_SEARCH_ROUTE_HELP_TEXT,
} from '../../../stores/settingsManifest';
import type { RuntimeDraft, NumberBound } from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const DISCOVERY_PHASE_TIP =
  'Phase coverage: 01 NeedSet, 02 Brand Resolver, 03 Search Profile, 04 Search Planner, 05 Query Journey, 06 Search Results, and 07 SERP Triage.';
const BUDGET_PHASE_TIP =
  'Phase coverage: 05 Query Journey, 06 Search Results, 07 SERP Triage, and 08 Fetch and Parse Entry.';
const RESUME_PHASE_TIP =
  'Phase coverage: runtime bootstrap plus late refresh before Stage 09 Fetch To Extraction.';

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
        <SettingRow
          label="SearXNG Base URL"
          tip={`${DISCOVERY_PHASE_TIP}\nLives in: discovery query execution before results enter SERP triage.\nWhat this controls: the SearXNG endpoint used by every routed discovery query.`}
        >
          <input type="text" value={runtimeDraft.searxngBaseUrl} onChange={(event) => updateDraft('searxngBaseUrl', event.target.value)} disabled={!runtimeSettingsReady} className={inputCls} placeholder="http://localhost:8080" />
        </SettingRow>
        <SettingRow
          label="Fetch Candidate Sources"
          tip={`${DISCOVERY_PHASE_TIP}\nLives in: SERP triage output and planner queue seeding.\nWhat this controls: whether non-approved candidate URLs are still harvested and seeded into candidate fetch queues after triage.`}
        >
          <SettingToggle checked={runtimeDraft.fetchCandidateSources} onChange={(next) => updateDraft('fetchCandidateSources', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow
          label="Discovery Max Queries"
          tip={`${DISCOVERY_PHASE_TIP}\nLives in: Search Planner and Query Journey query-budget enforcement.\nWhat this controls: the maximum number of discovery queries the planner can emit for a single product before execution starts.`}
        >
          <SettingNumberInput draftKey="discoveryMaxQueries" value={runtimeDraft.discoveryMaxQueries} bounds={getNumberBounds('discoveryMaxQueries')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow
          label="Discovery Max Discovered"
          tip={`${DISCOVERY_PHASE_TIP}\nLives in: post-search admission and pre-triage candidate collection.\nWhat this controls: the maximum number of discovered URLs that can survive raw discovery collection before later triage and queue selection narrow them further.`}
        >
          <SettingNumberInput draftKey="discoveryMaxDiscovered" value={runtimeDraft.discoveryMaxDiscovered} bounds={getNumberBounds('discoveryMaxDiscovered')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Planner, Reranker & Manufacturer" count={4}>
          <SettingRow
            label="Manufacturer Auto Promote"
            tip={`${DISCOVERY_PHASE_TIP}\nLives in: Brand Resolver sidecar and planner queue routing.\nWhat this controls: whether resolved official/support manufacturer domains are auto-promoted to tier-1-style treatment so they are favored during source approval and enqueue.`}
          >
            <SettingToggle
              checked={runtimeDraft.manufacturerAutoPromote}
              onChange={(next) => updateDraft('manufacturerAutoPromote', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <SettingRow
            label="Search Profile Caps Map (JSON)"
            tip={`Phase coverage: 03 Search Profile and 05 Query Journey.\nLives in: deterministic query/profile assembly before identity guard and execution.\nWhat this controls: the JSON cap map that limits aliases, hint queries, field-target queries, and duplicate rows while the search profile is being built.`}
            disabled={plannerControlsLocked}
          >
            <textarea value={runtimeDraft.searchProfileCapMapJson} onChange={(event) => updateDraft('searchProfileCapMapJson', event.target.value)} disabled={!runtimeSettingsReady || plannerControlsLocked} className={`${inputCls} min-h-[88px] font-mono sf-text-label`} spellCheck={false} />
          </SettingRow>
          <SettingRow
            label="SERP Reranker Weight Map (JSON)"
            tip={`Phase coverage: 07 SERP Triage.\nLives in: deterministic rerank scoring after search results are deduped and classified.\nWhat this controls: the JSON weight map that applies bonuses and penalties before approved and candidate URLs are chosen.`}
            disabled={plannerControlsLocked}
          >
            <textarea value={runtimeDraft.serpRerankerWeightMapJson} onChange={(event) => updateDraft('serpRerankerWeightMapJson', event.target.value)} disabled={!runtimeSettingsReady || plannerControlsLocked} className={`${inputCls} min-h-[88px] font-mono sf-text-label`} spellCheck={false} />
          </SettingRow>
        </AdvancedSettingsBlock>
        {plannerControlsLocked ? renderDisabledHint('Planner and reranker controls are disabled because Discovery Enabled is OFF.') : null}
      </SettingGroupBlock>

      {/* ── URL Budgets ── */}
      <div id={runtimeSubStepDomId('run-setup-budgets')} className="scroll-mt-24" />
      <SettingGroupBlock title="URL Budgets">
        <SettingRow
          label="Max URLs / Product"
          tip={`${BUDGET_PHASE_TIP}\nLives in: discovery selection and fetch handoff budgeting.\nWhat this controls: the top-level ceiling for how many URLs a single product run is allowed to collect and carry forward.`}
        >
          <SettingNumberInput draftKey="maxUrlsPerProduct" value={runtimeDraft.maxUrlsPerProduct} bounds={getNumberBounds('maxUrlsPerProduct')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow
          label="Max Candidate URLs"
          tip={`${BUDGET_PHASE_TIP}\nLives in: the candidate-url branch after SERP triage and before queue seeding.\nWhat this controls: the upper bound for non-approved URLs that may still be admitted into candidate fetch queues.`}
        >
          <SettingNumberInput draftKey="maxCandidateUrls" value={runtimeDraft.maxCandidateUrls} bounds={getNumberBounds('maxCandidateUrls')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow
          label="Max Pages / Domain"
          tip={`${BUDGET_PHASE_TIP}\nLives in: discovery admission, planner seeding, and fetch scheduling.\nWhat this controls: the per-domain cap that prevents a single host from dominating the search and fetch budget.`}
        >
          <SettingNumberInput draftKey="maxPagesPerDomain" value={runtimeDraft.maxPagesPerDomain} bounds={getNumberBounds('maxPagesPerDomain')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow
          label="Max Run Seconds"
          tip={`${BUDGET_PHASE_TIP}\nLives in: whole-run watchdog logic from bootstrap through finalization.\nWhat this controls: the maximum wall-clock time a single product run can spend before the runtime stops advancing work.`}
        >
          <SettingNumberInput draftKey="maxRunSeconds" value={runtimeDraft.maxRunSeconds} bounds={getNumberBounds('maxRunSeconds')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Advanced URL Budgets" count={2}>
          <SettingRow
            label="Max JSON Bytes"
            tip={`${BUDGET_PHASE_TIP}\nLives in: fetch artifact capture and parser intake.\nWhat this controls: the safety ceiling for JSON payload size before the runtime truncates or rejects oversized structured responses.`}
          >
            <SettingNumberInput draftKey="maxJsonBytes" value={runtimeDraft.maxJsonBytes} bounds={getNumberBounds('maxJsonBytes')} step={1024} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow
            label="User Agent"
            tip={`${BUDGET_PHASE_TIP}\nLives in: outbound HTTP and browser-backed fetch requests.\nWhat this controls: the User-Agent header presented to remote hosts during discovery and fetch.`}
          >
            <input type="text" value={runtimeDraft.userAgent} onChange={(event) => updateDraft('userAgent', event.target.value)} disabled={!runtimeSettingsReady} className={inputCls} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      {/* ── Resume & Re-extract ── */}
      <div id={runtimeSubStepDomId('run-setup-resume')} className="scroll-mt-24" />
      <SettingGroupBlock title="Resume and Re-extract">
        <SettingRow
          label="Resume Mode"
          tip={`${RESUME_PHASE_TIP}\nLives in: runtime bootstrap before NeedSet and discovery start.\nWhat this controls: whether prior run artifacts, queues, and saved state are reused, ignored, or selectively resumed.`}
        >
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
        <SettingRow
          label="Resume Window (hours)"
          tip={`${RESUME_PHASE_TIP}\nLives in: resumable-state filtering during bootstrap.\nWhat this controls: how old saved run state may be before the runtime refuses to resume it even when resume mode allows reuse.`}
        >
          <SettingNumberInput draftKey="resumeWindowHours" value={runtimeDraft.resumeWindowHours} bounds={getNumberBounds('resumeWindowHours')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow
          label="Re-extract Indexed"
          tip={`${RESUME_PHASE_TIP}\nLives in: bootstrap and source-ingestion refresh gating before Stage 09 extraction.\nWhat this controls: whether already indexed sources may be sent back through extraction when they are considered stale.`}
        >
          <SettingToggle checked={runtimeDraft.reextractIndexed} onChange={(next) => updateDraft('reextractIndexed', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow
          label="Re-extract Age (hours)"
          tip={`${RESUME_PHASE_TIP}\nLives in: stale-source refresh checks before a previously successful source is reused.\nWhat this controls: the age threshold after which an indexed source is considered stale enough to force another extraction pass.`}
          disabled={reextractWindowLocked}
        >
          <SettingNumberInput draftKey="reextractAfterHours" value={runtimeDraft.reextractAfterHours} bounds={getNumberBounds('reextractAfterHours')} step={1} disabled={!runtimeSettingsReady || reextractWindowLocked} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
      </SettingGroupBlock>
    </>
  );
});
