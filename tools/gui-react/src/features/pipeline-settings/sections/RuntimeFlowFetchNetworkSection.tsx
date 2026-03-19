import { memo } from 'react';
import type {
  RuntimeRepairDedupeRule,
} from '../../../stores/settingsManifest';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const REPAIR_DEDUPE_RULE_OPTIONS = ['domain_once', 'domain_and_status', 'none'] as const;
const FETCH_ENTRY_PHASE_TIP =
  'Phase coverage: 08 Fetch and Parse Entry.';
const FRONTIER_PHASE_TIP =
  'Phase coverage: 07 Planner Queue Seeding into 08 Fetch and Parse Entry.';

interface RuntimeFlowFetchNetworkSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  dynamicFetchControlsLocked: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
}

export const RuntimeFlowFetchNetworkSection = memo(function RuntimeFlowFetchNetworkSection({
  runtimeDraft,
  runtimeSettingsReady,
  inputCls,
  runtimeSubStepDomId,
  updateDraft,
  onNumberChange,
  getNumberBounds,
}: RuntimeFlowFetchNetworkSectionProps) {
  return (
    <>
      <div id={runtimeSubStepDomId('fetch-network-throughput')} className="scroll-mt-24" />
      <SettingGroupBlock title="Core Throughput">
        <SettingRow label="Fetch Concurrency" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: scheduler worker dispatch.\nWhat this controls: the maximum number of fetch jobs allowed to run at the same time across hosts.`}>
          <SettingNumberInput draftKey="fetchConcurrency" value={runtimeDraft.fetchConcurrency} bounds={getNumberBounds('fetchConcurrency')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Per Host Min Delay (ms)" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: host pacing and polite-fetch enforcement.\nWhat this controls: the minimum wait inserted between consecutive requests to the same host.`}>
          <SettingNumberInput draftKey="perHostMinDelayMs" value={runtimeDraft.perHostMinDelayMs} bounds={getNumberBounds('perHostMinDelayMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Fetch Budget (ms)" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: round-level fetch budgeting before extraction can continue.\nWhat this controls: the total time budget available for fetch work in a single round before the runtime stops admitting more fetch activity.`}>
          <SettingNumberInput draftKey="fetchBudgetMs" value={runtimeDraft.fetchBudgetMs} bounds={getNumberBounds('fetchBudgetMs')} step={1000} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Rate Limits & Scheduler Internals" count={12}>
          <SettingRow label="Domain Request RPS" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: per-host rate limiting.\nWhat this controls: the sustained requests-per-second ceiling applied to each domain.`}>
            <SettingNumberInput draftKey="domainRequestRps" value={runtimeDraft.domainRequestRps} bounds={getNumberBounds('domainRequestRps')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Domain Request Burst" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: per-host burst limiter.\nWhat this controls: how many requests a single domain may burst before pacing has to catch up.`}>
            <SettingNumberInput draftKey="domainRequestBurst" value={runtimeDraft.domainRequestBurst} bounds={getNumberBounds('domainRequestBurst')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Global Request RPS" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: global fetch throttling across all hosts.\nWhat this controls: the sustained request rate for non-search fetch traffic across the whole runtime.`}>
            <SettingNumberInput draftKey="globalRequestRps" value={runtimeDraft.globalRequestRps} bounds={getNumberBounds('globalRequestRps')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Global Request Burst" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: global scheduler burst limiter.\nWhat this controls: the burst allowance for non-search fetch traffic before global throttling re-engages.`}>
            <SettingNumberInput draftKey="globalRequestBurst" value={runtimeDraft.globalRequestBurst} bounds={getNumberBounds('globalRequestBurst')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Fetch Per-Host Concurrency Cap" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: host-level queue dispatch.\nWhat this controls: the hard cap on how many simultaneous fetches one host may own at once.`}>
            <SettingNumberInput draftKey="fetchPerHostConcurrencyCap" value={runtimeDraft.fetchPerHostConcurrencyCap} bounds={getNumberBounds('fetchPerHostConcurrencyCap')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Fetch Scheduler Max Retries" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: scheduler retry loop before fallback handling.\nWhat this controls: how many scheduler-managed retries a fetch may consume before the runtime waits for fallback or gives up on that attempt.`}>
            <SettingNumberInput draftKey="fetchSchedulerMaxRetries" value={runtimeDraft.fetchSchedulerMaxRetries} bounds={getNumberBounds('fetchSchedulerMaxRetries')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Fetch Scheduler Fallback Wait (ms)" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: scheduler fallback queue timing.\nWhat this controls: how long the runtime waits before it revisits queued fetch work that previously had to fall back.`}>
            <SettingNumberInput draftKey="fetchSchedulerFallbackWaitMs" value={runtimeDraft.fetchSchedulerFallbackWaitMs} bounds={getNumberBounds('fetchSchedulerFallbackWaitMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow
            label="Fetch Scheduler Internals Map (JSON)"
            tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: scheduler internal defaults override layer.\nWhat this controls: an optional JSON map for low-level delay, concurrency, retry, and fallback-wait defaults used by the fetch scheduler.`}
          >
            <textarea
              value={runtimeDraft.fetchSchedulerInternalsMapJson}
              onChange={(event) => updateDraft('fetchSchedulerInternalsMapJson', event.target.value)}
              disabled={!runtimeSettingsReady}
              className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
              spellCheck={false}
            />
          </SettingRow>
          <SettingRow label="Prefer HTTP Fetcher" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: fetch mode selection before browser fallback is considered.\nWhat this controls: whether the runtime should prefer the lightweight HTTP lane and only escalate to browser-backed fetch when needed.`}>
            <SettingToggle
              checked={runtimeDraft.preferHttpFetcher}
              onChange={(next) => updateDraft('preferHttpFetcher', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <SettingRow label="Page Goto Timeout (ms)" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: browser-backed fetch navigation.\nWhat this controls: the maximum time a page navigation may spend loading before the browser lane times out.`}>
            <SettingNumberInput draftKey="pageGotoTimeoutMs" value={runtimeDraft.pageGotoTimeoutMs} bounds={getNumberBounds('pageGotoTimeoutMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Page Network Idle Timeout (ms)" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: browser-backed fetch completion checks before Stage 09 parsing.\nWhat this controls: how long the runtime waits for network activity to settle before it considers the page ready for extraction.`}>
            <SettingNumberInput draftKey="pageNetworkIdleTimeoutMs" value={runtimeDraft.pageNetworkIdleTimeoutMs} bounds={getNumberBounds('pageNetworkIdleTimeoutMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Post Load Wait (ms)" tip={`${FETCH_ENTRY_PHASE_TIP}\nLives in: browser-backed fetch stabilization after load.\nWhat this controls: the extra fixed delay inserted after a page reports loaded and before parsing starts.`}>
            <SettingNumberInput draftKey="postLoadWaitMs" value={runtimeDraft.postLoadWaitMs} bounds={getNumberBounds('postLoadWaitMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      <div id={runtimeSubStepDomId('fetch-network-frontier')} className="scroll-mt-24" />
      <SettingGroupBlock title="Frontier and Repair">
        <SettingRow label="Frontier DB Path" tip={`${FRONTIER_PHASE_TIP}\nLives in: frontier persistence and cache reuse.\nWhat this controls: where the frontier tracker stores durable query, URL, and cooldown state.`}>
          <input
            type="text"
            value={runtimeDraft.frontierDbPath}
            onChange={(event) => updateDraft('frontierDbPath', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
            placeholder="_intel/frontier/frontier.json"
          />
        </SettingRow>
        <SettingRow label="Frontier Query Cooldown (sec)" tip={`${FRONTIER_PHASE_TIP}\nLives in: repair-query reuse and repeated search suppression.\nWhat this controls: how long the runtime waits before it is allowed to emit another similar query against the same domain context.`}>
          <SettingNumberInput draftKey="frontierQueryCooldownSeconds" value={runtimeDraft.frontierQueryCooldownSeconds} bounds={getNumberBounds('frontierQueryCooldownSeconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Repair Dedupe Rule" tip={`${FRONTIER_PHASE_TIP}\nLives in: repair query enqueue rules.\nWhat this controls: the dedupe policy used when deciding whether another repair query for a domain or outcome should be admitted.`}>
          <select
            value={runtimeDraft.repairDedupeRule}
            onChange={(event) => updateDraft('repairDedupeRule', event.target.value as RuntimeRepairDedupeRule)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {REPAIR_DEDUPE_RULE_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </SettingRow>
        <AdvancedSettingsBlock title="Frontier Cooldowns & Penalties" count={10}>
          <SettingRow label="Frontier Strip Tracking Params" tip={`${FRONTIER_PHASE_TIP}\nLives in: canonical URL persistence.\nWhat this controls: whether tracking parameters are removed before the frontier stores and compares URLs.`}>
            <SettingToggle
              checked={runtimeDraft.frontierStripTrackingParams}
              onChange={(next) => updateDraft('frontierStripTrackingParams', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <SettingRow label="Frontier Cooldown 404 (sec)" tip={`${FRONTIER_PHASE_TIP}\nLives in: frontier cooldown tables for not-found outcomes.\nWhat this controls: the cooldown applied after an initial 404 before the same path is reconsidered.`}>
            <SettingNumberInput draftKey="frontierCooldown404Seconds" value={runtimeDraft.frontierCooldown404Seconds} bounds={getNumberBounds('frontierCooldown404Seconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Cooldown 404 Repeat (sec)" tip={`${FRONTIER_PHASE_TIP}\nLives in: repeated not-found backoff logic.\nWhat this controls: the stronger cooldown applied when a path keeps returning 404.`}>
            <SettingNumberInput draftKey="frontierCooldown404RepeatSeconds" value={runtimeDraft.frontierCooldown404RepeatSeconds} bounds={getNumberBounds('frontierCooldown404RepeatSeconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Cooldown 410 (sec)" tip={`${FRONTIER_PHASE_TIP}\nLives in: gone-resource frontier penalties.\nWhat this controls: the cooldown applied after a 410 Gone response indicates a path is permanently removed.`}>
            <SettingNumberInput draftKey="frontierCooldown410Seconds" value={runtimeDraft.frontierCooldown410Seconds} bounds={getNumberBounds('frontierCooldown410Seconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Cooldown Timeout (sec)" tip={`${FRONTIER_PHASE_TIP}\nLives in: timeout penalty handling.\nWhat this controls: the cooldown applied after request timeouts so repeatedly slow paths do not thrash the frontier.`}>
            <SettingNumberInput draftKey="frontierCooldownTimeoutSeconds" value={runtimeDraft.frontierCooldownTimeoutSeconds} bounds={getNumberBounds('frontierCooldownTimeoutSeconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Cooldown 403 Base (sec)" tip={`${FRONTIER_PHASE_TIP}\nLives in: blocked-access backoff logic.\nWhat this controls: the base cooldown used for 403 outcomes before exponential scaling is applied.`}>
            <SettingNumberInput draftKey="frontierCooldown403BaseSeconds" value={runtimeDraft.frontierCooldown403BaseSeconds} bounds={getNumberBounds('frontierCooldown403BaseSeconds')} step={10} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Cooldown 429 Base (sec)" tip={`${FRONTIER_PHASE_TIP}\nLives in: rate-limit backoff logic.\nWhat this controls: the base cooldown used for 429 outcomes before exponential scaling is applied.`}>
            <SettingNumberInput draftKey="frontierCooldown429BaseSeconds" value={runtimeDraft.frontierCooldown429BaseSeconds} bounds={getNumberBounds('frontierCooldown429BaseSeconds')} step={10} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Backoff Max Exponent" tip={`${FRONTIER_PHASE_TIP}\nLives in: 403/429 exponential backoff calculation.\nWhat this controls: the maximum exponent the runtime may use when growing cooldown windows for repeated blocked or rate-limited responses.`}>
            <SettingNumberInput draftKey="frontierBackoffMaxExponent" value={runtimeDraft.frontierBackoffMaxExponent} bounds={getNumberBounds('frontierBackoffMaxExponent')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Path Penalty Not-Found Threshold" tip={`${FRONTIER_PHASE_TIP}\nLives in: path-level not-found penalty gate.\nWhat this controls: how many not-found outcomes a path can accumulate before harsher penalties start applying.`}>
            <SettingNumberInput draftKey="frontierPathPenaltyNotfoundThreshold" value={runtimeDraft.frontierPathPenaltyNotfoundThreshold} bounds={getNumberBounds('frontierPathPenaltyNotfoundThreshold')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Blocked Domain Threshold" tip={`${FRONTIER_PHASE_TIP}\nLives in: blocked-domain state transition.\nWhat this controls: how many consecutive blocked outcomes a domain can accumulate before the runtime marks it blocked and temporarily stops sending traffic there.`}>
            <SettingNumberInput draftKey="frontierBlockedDomainThreshold" value={runtimeDraft.frontierBlockedDomainThreshold} bounds={getNumberBounds('frontierBlockedDomainThreshold')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>
    </>
  );
});
