import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  RUNTIME_SEARCH_PRIMARY_HELP,
  RUNTIME_SEARCH_DUAL_HELP,
  RUNTIME_SEARCH_TRIPLE_HELP,
  RUNTIME_SEARCH_FALLBACK_HELP,
  SEARXNG_ENGINE_OPTIONS,
  SEARXNG_ENGINE_LABELS,
} from '../../../stores/settingsManifest';
import type { SearxngEngine } from '../../../stores/settingsManifest';
import type { RuntimeDraft, NumberBound } from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const DISCOVERY_PHASE_TIP =
  'Phase coverage: 01 NeedSet, 02 Brand Resolver, 03 Search Profile, 04 Search Planner, 05 Query Journey, 06 Search Results, and 07 SERP Selector.';
const PROFILE_PLANNER_JOURNEY_NOTE =
  'Ordering note: Search Planner is precomputed early from NeedSet, Search Profile is the deterministic and fallback profile branch inside searchDiscovery(), and Query Journey chooses the Schema 4 handoff or the legacy profile chain before search executes.';
const BUDGET_PHASE_TIP =
  'Phase coverage: 05 Query Journey, 06 Search Results, 07 SERP Selector, and 08 Fetch and Parse Entry.';
const RESUME_PHASE_TIP =
  'Phase coverage: runtime bootstrap plus late refresh before Stage 09 Fetch To Extraction.';

type EngineSlot = SearxngEngine | 'none';

function parseEngineSlots(csv: string): { primary: EngineSlot; dual: EngineSlot; triple: EngineSlot } {
  const tokens = csv.split(',').map(t => t.trim()).filter(Boolean) as SearxngEngine[];
  return {
    primary: tokens[0] || 'none',
    dual: tokens[1] || 'none',
    triple: tokens[2] || 'none',
  };
}

function composeEnginesCsv(primary: EngineSlot, dual: EngineSlot, triple: EngineSlot): string {
  return [primary, dual, triple].filter(v => v !== 'none').join(',');
}

interface RuntimeFlowRunSetupSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  reextractWindowLocked: boolean;
  plannerControlsLocked: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
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
  resumeModeOptions,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  renderDisabledHint,
}: RuntimeFlowRunSetupSectionProps) {
  const slots = parseEngineSlots(runtimeDraft.searchEngines);
  const fallbackRaw = (runtimeDraft.searchEnginesFallback ?? '').split(',')[0]?.trim() || '';
  const fallbackEngine: EngineSlot = (SEARXNG_ENGINE_OPTIONS as readonly string[]).includes(fallbackRaw) ? fallbackRaw as SearxngEngine : 'none';

  // Collect all currently used engines to filter out duplicates from each dropdown
  const usedBy: Record<string, string> = {};
  if (slots.primary !== 'none') usedBy[slots.primary] = 'primary';
  if (slots.dual !== 'none') usedBy[slots.dual] = 'dual';
  if (slots.triple !== 'none') usedBy[slots.triple] = 'triple';
  if (fallbackEngine !== 'none') usedBy[fallbackEngine] = 'fallback';

  const handleSlotChange = useCallback((slot: 'primary' | 'dual' | 'triple' | 'fallback', value: string) => {
    let nextPrimary: EngineSlot = slots.primary;
    let nextDual: EngineSlot = slots.dual;
    let nextTriple: EngineSlot = slots.triple;
    let nextFallback: EngineSlot = fallbackEngine;

    if (slot === 'primary') nextPrimary = value as EngineSlot;
    if (slot === 'dual') nextDual = value as EngineSlot;
    if (slot === 'triple') nextTriple = value as EngineSlot;
    if (slot === 'fallback') nextFallback = value as EngineSlot;

    // Auto-clear duplicates: if the new value collides with another slot, clear the other
    if (value !== 'none') {
      if (slot !== 'primary' && nextPrimary === value) nextPrimary = 'none';
      if (slot !== 'dual' && nextDual === value) nextDual = 'none';
      if (slot !== 'triple' && nextTriple === value) nextTriple = 'none';
      if (slot !== 'fallback' && nextFallback === value) nextFallback = 'none';
    }

    updateDraft('searchEngines', composeEnginesCsv(nextPrimary, nextDual, nextTriple) as RuntimeDraft['searchEngines']);
    updateDraft('searchEnginesFallback', (nextFallback === 'none' ? '' : nextFallback) as RuntimeDraft['searchEnginesFallback']);
  }, [slots.primary, slots.dual, slots.triple, fallbackEngine, updateDraft]);

  function availableOptions(currentSlot: string, includeNone: boolean): { value: string; label: string; disabled: boolean }[] {
    const options: { value: string; label: string; disabled: boolean }[] = [];
    if (includeNone) {
      options.push({ value: 'none', label: 'None', disabled: false });
    }
    for (const engine of SEARXNG_ENGINE_OPTIONS) {
      const owner = usedBy[engine];
      const taken = owner !== undefined && owner !== currentSlot;
      options.push({ value: engine, label: SEARXNG_ENGINE_LABELS[engine], disabled: taken });
    }
    return options;
  }

  return (
    <>
      {/* ── Discovery ── */}
      <div id={runtimeSubStepDomId('run-setup-discovery')} className="scroll-mt-24" />
      <SettingGroupBlock title="Discovery">
        <SettingRow label="Primary Engine" tip={RUNTIME_SEARCH_PRIMARY_HELP}>
          <select
            value={slots.primary}
            onChange={(e) => handleSlotChange('primary', e.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {availableOptions('primary', true).map((opt) => (
              <option key={`primary-${opt.value}`} value={opt.value} disabled={opt.disabled}>
                {opt.label}{opt.disabled ? ' (in use)' : ''}
              </option>
            ))}
          </select>
          {slots.primary === 'none' ? (
            <span className="sf-text-muted text-xs mt-1">No primary engine — discovery search will be skipped.</span>
          ) : null}
        </SettingRow>
        <SettingRow label="Dual Engine" tip={RUNTIME_SEARCH_DUAL_HELP}>
          <select
            value={slots.dual}
            onChange={(e) => handleSlotChange('dual', e.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {availableOptions('dual', true).map((opt) => (
              <option key={`dual-${opt.value}`} value={opt.value} disabled={opt.disabled}>
                {opt.label}{opt.disabled ? ' (in use)' : ''}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Triple Engine" tip={RUNTIME_SEARCH_TRIPLE_HELP}>
          <select
            value={slots.triple}
            onChange={(e) => handleSlotChange('triple', e.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {availableOptions('triple', true).map((opt) => (
              <option key={`triple-${opt.value}`} value={opt.value} disabled={opt.disabled}>
                {opt.label}{opt.disabled ? ' (in use)' : ''}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Fallback Engine" tip={RUNTIME_SEARCH_FALLBACK_HELP}>
          <select
            value={fallbackEngine}
            onChange={(e) => handleSlotChange('fallback', e.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {availableOptions('fallback', true).map((opt) => (
              <option key={`fallback-${opt.value}`} value={opt.value} disabled={opt.disabled}>
                {opt.label}{opt.disabled ? ' (in use)' : ''}
              </option>
            ))}
          </select>
          {fallbackEngine === 'none' ? (
            <span className="sf-text-muted text-xs mt-1">No fallback — if primary engines fail, search returns empty.</span>
          ) : null}
        </SettingRow>
        <SettingRow
          label="SearXNG Base URL"
          tip={`${DISCOVERY_PHASE_TIP}\n${PROFILE_PLANNER_JOURNEY_NOTE}\nLives in: discovery query execution after Query Journey picks the final rows.\nWhat this controls: the SearXNG endpoint used when those chosen discovery queries are actually executed.`}
        >
          <input type="text" value={runtimeDraft.searxngBaseUrl} onChange={(event) => updateDraft('searxngBaseUrl', event.target.value)} disabled={!runtimeSettingsReady} className={inputCls} placeholder="http://localhost:8080" />
        </SettingRow>
        <SettingRow
          label="Max Engine Retries"
          tip={`Global retry limit for all search engines (Google Crawlee, SearXNG-routed Bing/Brave/DuckDuckGo, etc.).\nWhen a search attempt fails or returns zero results, the engine retries up to this many times.\nEach retry rotates to a fresh proxy from the configured proxy pool before re-sending the request.\nFor Google Crawlee, retries use Crawlee's built-in proxy rotation via session pool.\nFor SearXNG engines, retries re-send the query to the SearXNG instance.\nSet to 0 to disable retries entirely.`}
        >
          <SettingNumberInput draftKey="searchMaxRetries" value={runtimeDraft.searchMaxRetries} bounds={getNumberBounds('searchMaxRetries')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Serper.dev" count={2}>
          <SettingRow
            label="API Key"
            tip="Serper.dev API key for real Google organic results. When set, Serper becomes the exclusive search provider — Crawlee and SearXNG are bypassed. No browser, no proxy, no CAPTCHA."
          >
            <input
              type="password"
              value={runtimeDraft.serperApiKey}
              onChange={(event) => updateDraft('serperApiKey', event.target.value)}
              disabled={!runtimeSettingsReady}
              className={`${inputCls} font-mono sf-text-label`}
              spellCheck={false}
              placeholder="Enter Serper.dev API key"
              autoComplete="off"
            />
          </SettingRow>
          <SettingRow label="Results Per Query" tip="Number of Google organic results to request per query (10-100). Google caps at ~10 organic results per page, so values above 10 depend on Serper's internal pagination.">
            <SettingNumberInput draftKey="serperResultCount" value={runtimeDraft.serperResultCount} bounds={getNumberBounds('serperResultCount')} step={10} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
        <AdvancedSettingsBlock title="Google Crawlee" count={4}>
          <SettingRow
            label="Proxy URLs (JSON array)"
            tip="Rotating proxy URLs for Google searches. Each retry uses a fresh IP from the pool."
          >
            <textarea
              value={runtimeDraft.googleSearchProxyUrlsJson}
              onChange={(event) => updateDraft('googleSearchProxyUrlsJson', event.target.value)}
              disabled={!runtimeSettingsReady || Boolean(runtimeDraft.serperApiKey)}
              className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
              spellCheck={false}
              placeholder='["http://user:pass@proxy1:80", "http://user:pass@proxy2:80"]'
            />
          </SettingRow>
          <SettingRow label="SERP Screenshots" tip="Capture a JPEG screenshot of each Google SERP. Adds a render delay per query but provides visual proof of results.">
            <SettingToggle checked={runtimeDraft.googleSearchScreenshotsEnabled} onChange={(next) => updateDraft('googleSearchScreenshotsEnabled', next)} disabled={!runtimeSettingsReady || Boolean(runtimeDraft.serperApiKey)} />
          </SettingRow>
          <SettingRow label="Timeout (ms)" tip="Maximum time for a single Google search request.">
            <SettingNumberInput draftKey="googleSearchTimeoutMs" value={runtimeDraft.googleSearchTimeoutMs} bounds={getNumberBounds('googleSearchTimeoutMs')} step={1000} disabled={!runtimeSettingsReady || Boolean(runtimeDraft.serperApiKey)} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Min Query Interval (ms)" tip="Minimum delay between Google searches. Random jitter is added on top. Set to 0 for no delay.">
            <SettingNumberInput draftKey="googleSearchMinQueryIntervalMs" value={runtimeDraft.googleSearchMinQueryIntervalMs} bounds={getNumberBounds('googleSearchMinQueryIntervalMs')} step={500} disabled={!runtimeSettingsReady || Boolean(runtimeDraft.serperApiKey)} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
        <SettingRow
          label="Fetch Candidate Sources"
          tip={`${DISCOVERY_PHASE_TIP}\nLives in: SERP triage output and planner queue seeding.\nWhat this controls: whether non-approved candidate URLs are still harvested and seeded into candidate fetch queues after triage.`}
        >
          <SettingToggle checked={runtimeDraft.fetchCandidateSources} onChange={(next) => updateDraft('fetchCandidateSources', next)} disabled={!runtimeSettingsReady} />
        </SettingRow>
        <SettingRow
          label="Discovery Max Queries"
          tip={`Phase coverage: 04 Search Planner and 05 Query Journey.\n${PROFILE_PLANNER_JOURNEY_NOTE}\nLives in: Schema 4 planner output capping before Query Journey applies identity guard and final selection.\nWhat this controls: the global query cap for planner-produced discovery output. It shapes the Schema 4 handoff first and only then constrains what Query Journey can forward to execution.`}
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
            tip={`Phase coverage: 03 Search Profile with downstream effect on 05 Query Journey.\n${PROFILE_PLANNER_JOURNEY_NOTE}\nLives in: buildSearchProfile() and planned profile assembly inside searchDiscovery().\nWhat this controls: the JSON cap map for aliases, hint rows, field-target queries, and duplicate suppression in the deterministic/fallback profile branch. It does not directly cap Schema 4 planner output.`}
            disabled={plannerControlsLocked}
          >
            <textarea value={runtimeDraft.searchProfileCapMapJson} onChange={(event) => updateDraft('searchProfileCapMapJson', event.target.value)} disabled={!runtimeSettingsReady || plannerControlsLocked} className={`${inputCls} min-h-[88px] font-mono sf-text-label`} spellCheck={false} />
          </SettingRow>
          <SettingRow
            label="SERP Reranker Weight Map (JSON)"
            tip={`Phase coverage: 07 SERP Selector.\nLives in: deterministic rerank scoring after search results are deduped and classified.\nWhat this controls: the JSON weight map that applies bonuses and penalties before approved and candidate URLs are chosen.`}
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
