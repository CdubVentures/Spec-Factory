import { memo, useCallback, useEffect } from 'react';
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
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

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
  // WHY: On hydration, domainClassifierUrlCap may exceed serpSelectorUrlCap
  // (e.g. stale saved value of 200 vs serp selector default of 50). Clamp it.
  useEffect(() => {
    const serpCap = Number(runtimeDraft.serpSelectorUrlCap) || 0;
    const dcCap = Number(runtimeDraft.domainClassifierUrlCap) || 0;
    if (serpCap > 0 && dcCap > serpCap) {
      updateDraft('domainClassifierUrlCap', serpCap);
    }
  }, [runtimeDraft.serpSelectorUrlCap, runtimeDraft.domainClassifierUrlCap, updateDraft]);

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
      {/* ── Run Timeout ── */}
      <div id={runtimeSubStepDomId('run-setup-timeout')} className="scroll-mt-24" />
      <SettingGroupBlock title="Run Timeout">
        <SettingRow
          label="Max Run Seconds"
          tip="Maximum wall-clock time a single product run can spend before the runtime stops advancing work. Enforced at scheduler loop, lifecycle checks, hypothesis followups, preflight phase, and repair search."
        >
          <SettingNumberInput draftKey="maxRunSeconds" value={runtimeDraft.maxRunSeconds} bounds={getNumberBounds('maxRunSeconds')} step={30} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
      </SettingGroupBlock>

      {/* ── Discovery ── */}
      <div id={runtimeSubStepDomId('run-setup-discovery')} className="scroll-mt-24" />
      <SettingGroupBlock title="Discovery">
        <MasterSwitchRow
          label="Serper.dev"
          tip="When enabled with a valid API key, Serper becomes the exclusive search provider. Proxy Crawl engines and Google Crawlee are bypassed. Real Google organic results via API — no browser, no proxy, no CAPTCHA."
          description={runtimeDraft.serperEnabled ? 'Active — all searches route through Serper.dev API' : 'Disabled — using Proxy Crawl engines below'}
        >
          <SettingToggle checked={runtimeDraft.serperEnabled} onChange={(next) => updateDraft('serperEnabled', next)} disabled={!runtimeSettingsReady} />
        </MasterSwitchRow>
        <SettingRow label="API Key" tip="Serper.dev API key for real Google organic results.">
          <input
            type="password"
            value={runtimeDraft.serperApiKey}
            onChange={(event) => updateDraft('serperApiKey', event.target.value)}
            disabled={!runtimeSettingsReady || !runtimeDraft.serperEnabled}
            className={`${inputCls} font-mono sf-text-label`}
            spellCheck={false}
            placeholder="Enter Serper.dev API key"
            autoComplete="off"
          />
        </SettingRow>
        <AdvancedSettingsBlock title="Proxy Crawl" count={10} disabled={runtimeDraft.serperEnabled}>
          <SettingRow label="Primary Engine" tip={RUNTIME_SEARCH_PRIMARY_HELP}>
            <select
              value={slots.primary}
              onChange={(e) => handleSlotChange('primary', e.target.value)}
              disabled={!runtimeSettingsReady || runtimeDraft.serperEnabled}
              className={inputCls}
            >
              {availableOptions('primary', true).map((opt) => (
                <option key={`primary-${opt.value}`} value={opt.value} disabled={opt.disabled}>
                  {opt.label}{opt.disabled ? ' (in use)' : ''}
                </option>
              ))}
            </select>
            {!runtimeDraft.serperEnabled && slots.primary === 'none' ? (
              <span className="sf-text-muted text-xs mt-1">No primary engine — discovery search will be skipped.</span>
            ) : null}
          </SettingRow>
          <SettingRow label="Dual Engine" tip={RUNTIME_SEARCH_DUAL_HELP}>
            <select
              value={slots.dual}
              onChange={(e) => handleSlotChange('dual', e.target.value)}
              disabled={!runtimeSettingsReady || runtimeDraft.serperEnabled}
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
              disabled={!runtimeSettingsReady || runtimeDraft.serperEnabled}
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
              disabled={!runtimeSettingsReady || runtimeDraft.serperEnabled}
              className={inputCls}
            >
              {availableOptions('fallback', true).map((opt) => (
                <option key={`fallback-${opt.value}`} value={opt.value} disabled={opt.disabled}>
                  {opt.label}{opt.disabled ? ' (in use)' : ''}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label="SearXNG Base URL" tip="SearXNG endpoint for Bing/Brave/DuckDuckGo engine queries.">
            <input type="text" value={runtimeDraft.searxngBaseUrl} onChange={(event) => updateDraft('searxngBaseUrl', event.target.value)} disabled={!runtimeSettingsReady || runtimeDraft.serperEnabled} className={inputCls} placeholder="http://localhost:8080" />
          </SettingRow>
          <SettingRow label="Max Engine Retries" tip="Retry limit for search engines. Each retry rotates to a fresh proxy.">
            <SettingNumberInput draftKey="searchMaxRetries" value={runtimeDraft.searchMaxRetries} bounds={getNumberBounds('searchMaxRetries')} step={1} disabled={!runtimeSettingsReady || runtimeDraft.serperEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <AdvancedSettingsBlock title="Google Crawlee" count={4}>
            <SettingRow label="Proxy URLs (JSON array)" tip="Rotating proxy URLs for Google searches.">
              <textarea
                value={runtimeDraft.googleSearchProxyUrlsJson}
                onChange={(event) => updateDraft('googleSearchProxyUrlsJson', event.target.value)}
                disabled={!runtimeSettingsReady || runtimeDraft.serperEnabled}
                className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
                spellCheck={false}
                placeholder='["http://user:pass@proxy1:80", "http://user:pass@proxy2:80"]'
              />
            </SettingRow>
            <SettingRow label="SERP Screenshots" tip="Capture a JPEG screenshot of each Google SERP.">
              <SettingToggle checked={runtimeDraft.googleSearchScreenshotsEnabled} onChange={(next) => updateDraft('googleSearchScreenshotsEnabled', next)} disabled={!runtimeSettingsReady || runtimeDraft.serperEnabled} />
            </SettingRow>
            <SettingRow label="Timeout (ms)" tip="Maximum time for a single Google search request.">
              <SettingNumberInput draftKey="googleSearchTimeoutMs" value={runtimeDraft.googleSearchTimeoutMs} bounds={getNumberBounds('googleSearchTimeoutMs')} step={1000} disabled={!runtimeSettingsReady || runtimeDraft.serperEnabled} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="Min Query Interval (ms)" tip="Minimum delay between Google searches.">
              <SettingNumberInput draftKey="googleSearchMinQueryIntervalMs" value={runtimeDraft.googleSearchMinQueryIntervalMs} bounds={getNumberBounds('googleSearchMinQueryIntervalMs')} step={500} disabled={!runtimeSettingsReady || runtimeDraft.serperEnabled} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
          </AdvancedSettingsBlock>
        </AdvancedSettingsBlock>
        {plannerControlsLocked ? renderDisabledHint('Planner and reranker controls are disabled because Discovery Enabled is OFF.') : null}
      </SettingGroupBlock>

      {/* ── URL Budgets ── */}
      <div id={runtimeSubStepDomId('run-setup-budgets')} className="scroll-mt-24" />
      <SettingGroupBlock title="URL Budgets">
        <SettingRow
          label="Max Pages / Domain"
          tip={`${BUDGET_PHASE_TIP}\nLives in: discovery admission, planner seeding, and fetch scheduling.\nWhat this controls: the per-domain cap that prevents a single host from dominating the search and fetch budget.`}
        >
          <SettingNumberInput draftKey="maxPagesPerDomain" value={runtimeDraft.maxPagesPerDomain} bounds={getNumberBounds('maxPagesPerDomain')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Query & URL Counts" count={3}>
          <SettingRow
            label="Search Query Count / Run"
            tip="Hard cap on the final merged query profile output (deterministic + LLM planner combined). The Query Journey enforces this as the ceiling on total queries sent to search."
          >
            <SettingNumberInput draftKey="searchProfileQueryCap" value={runtimeDraft.searchProfileQueryCap} bounds={getNumberBounds('searchProfileQueryCap')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow
            label="Serp Selector URL Count / Run"
            tip="Exact number of URLs the SERP selector LLM keeps per discovery pass. Controls max_total_keep in the selector prompt — hard-validated post-LLM. Domain Classifier URL Count is auto-clamped to this value."
          >
            <SettingNumberInput
              draftKey="serpSelectorUrlCap"
              value={runtimeDraft.serpSelectorUrlCap}
              bounds={getNumberBounds('serpSelectorUrlCap')}
              step={1}
              disabled={!runtimeSettingsReady}
              className={inputCls}
              onNumberChange={(key, rawValue, bounds) => {
                onNumberChange(key, rawValue, bounds);
                const parsed = Math.round(Math.min(bounds.max, Math.max(bounds.min, Number(rawValue) || 0)));
                const currentDc = Number(runtimeDraft.domainClassifierUrlCap) || 0;
                if (currentDc > parsed) {
                  updateDraft('domainClassifierUrlCap', parsed);
                }
              }}
            />
          </SettingRow>
          <SettingRow
            label="Domain Classifier URL Count / Run"
            tip="Exact number of candidate URLs seeded into the source planner from the domain classifier. Set to 0 to disable candidate seeding entirely. Clamped to Serp Selector URL Count since candidates feed into the selector."
          >
            <SettingNumberInput
              draftKey="domainClassifierUrlCap"
              value={runtimeDraft.domainClassifierUrlCap}
              bounds={{ ...getNumberBounds('domainClassifierUrlCap'), max: Math.max(0, Number(runtimeDraft.serpSelectorUrlCap) || 50) }}
              step={1}
              disabled={!runtimeSettingsReady}
              className={inputCls}
              onNumberChange={onNumberChange}
            />
          </SettingRow>
        </AdvancedSettingsBlock>
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
