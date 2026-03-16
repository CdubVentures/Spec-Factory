import { memo } from 'react';
import type {
  RuntimeAutomationQueueStorageEngine,
  RuntimeRepairDedupeRule,
} from '../../../stores/settingsManifest';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const REPAIR_DEDUPE_RULE_OPTIONS = ['domain_once', 'domain_and_status', 'none'] as const;
const AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS = ['sqlite', 'memory'] as const;

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
        <MasterSwitchRow label="Fetch Scheduler Enabled" tip="Enable scheduler-based fetch orchestration before fallback fetch paths.">
          <SettingToggle
            checked={runtimeDraft.fetchSchedulerEnabled}
            onChange={(next) => updateDraft('fetchSchedulerEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Fetch Concurrency" tip="Maximum number of in-flight fetches.">
          <SettingNumberInput draftKey="fetchConcurrency" value={runtimeDraft.fetchConcurrency} bounds={getNumberBounds('fetchConcurrency')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Per Host Min Delay (ms)" tip="Minimum delay inserted between requests to the same host.">
          <SettingNumberInput draftKey="perHostMinDelayMs" value={runtimeDraft.perHostMinDelayMs} bounds={getNumberBounds('perHostMinDelayMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Search Global RPS" tip="Global search request-per-second throttle across providers.">
          <SettingNumberInput draftKey="searchGlobalRps" value={runtimeDraft.searchGlobalRps} bounds={getNumberBounds('searchGlobalRps')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Search Global Burst" tip="Global burst cap for search requests.">
          <SettingNumberInput draftKey="searchGlobalBurst" value={runtimeDraft.searchGlobalBurst} bounds={getNumberBounds('searchGlobalBurst')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Fetch Budget (ms)" tip="Total time budget for all fetch operations within a single convergence round.">
          <SettingNumberInput draftKey="fetchBudgetMs" value={runtimeDraft.fetchBudgetMs} bounds={getNumberBounds('fetchBudgetMs')} step={1000} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Rate Limits & Scheduler Internals" count={14}>
          <SettingRow label="Search Per-Host RPS" tip="Per-host search request-per-second throttle.">
            <SettingNumberInput draftKey="searchPerHostRps" value={runtimeDraft.searchPerHostRps} bounds={getNumberBounds('searchPerHostRps')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Search Per-Host Burst" tip="Per-host burst cap for search requests.">
            <SettingNumberInput draftKey="searchPerHostBurst" value={runtimeDraft.searchPerHostBurst} bounds={getNumberBounds('searchPerHostBurst')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Domain Request RPS" tip="Per-domain request-per-second throttle.">
            <SettingNumberInput draftKey="domainRequestRps" value={runtimeDraft.domainRequestRps} bounds={getNumberBounds('domainRequestRps')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Domain Request Burst" tip="Per-domain burst cap for requests.">
            <SettingNumberInput draftKey="domainRequestBurst" value={runtimeDraft.domainRequestBurst} bounds={getNumberBounds('domainRequestBurst')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Global Request RPS" tip="Global request-per-second throttle for non-search fetch traffic.">
            <SettingNumberInput draftKey="globalRequestRps" value={runtimeDraft.globalRequestRps} bounds={getNumberBounds('globalRequestRps')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Global Request Burst" tip="Global burst cap for non-search fetch traffic.">
            <SettingNumberInput draftKey="globalRequestBurst" value={runtimeDraft.globalRequestBurst} bounds={getNumberBounds('globalRequestBurst')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Fetch Per-Host Concurrency Cap" tip="Hard cap for concurrent fetches per host.">
            <SettingNumberInput draftKey="fetchPerHostConcurrencyCap" value={runtimeDraft.fetchPerHostConcurrencyCap} bounds={getNumberBounds('fetchPerHostConcurrencyCap')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Fetch Scheduler Max Retries" tip="Maximum scheduler retries before waiting for fallback.">
            <SettingNumberInput draftKey="fetchSchedulerMaxRetries" value={runtimeDraft.fetchSchedulerMaxRetries} bounds={getNumberBounds('fetchSchedulerMaxRetries')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Fetch Scheduler Fallback Wait (ms)" tip="Wait duration before retrying scheduler fallback queues.">
            <SettingNumberInput draftKey="fetchSchedulerFallbackWaitMs" value={runtimeDraft.fetchSchedulerFallbackWaitMs} bounds={getNumberBounds('fetchSchedulerFallbackWaitMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow
            label="Fetch Scheduler Internals Map (JSON)"
            tip="Optional JSON map for fetch-scheduler internals defaults (delay/concurrency/retries/wait)."
          >
            <textarea
              value={runtimeDraft.fetchSchedulerInternalsMapJson}
              onChange={(event) => updateDraft('fetchSchedulerInternalsMapJson', event.target.value)}
              disabled={!runtimeSettingsReady}
              className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
              spellCheck={false}
            />
          </SettingRow>
          <SettingRow label="Prefer HTTP Fetcher" tip="Prefer lightweight HTTP fetcher over browser rendering when possible.">
            <SettingToggle
              checked={runtimeDraft.preferHttpFetcher}
              onChange={(next) => updateDraft('preferHttpFetcher', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <SettingRow label="Page Goto Timeout (ms)" tip="Page navigation timeout used by browser fetch lanes.">
            <SettingNumberInput draftKey="pageGotoTimeoutMs" value={runtimeDraft.pageGotoTimeoutMs} bounds={getNumberBounds('pageGotoTimeoutMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Page Network Idle Timeout (ms)" tip="Maximum wait for network idle before extraction begins.">
            <SettingNumberInput draftKey="pageNetworkIdleTimeoutMs" value={runtimeDraft.pageNetworkIdleTimeoutMs} bounds={getNumberBounds('pageNetworkIdleTimeoutMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Post Load Wait (ms)" tip="Extra delay after load completion before parsing content.">
            <SettingNumberInput draftKey="postLoadWaitMs" value={runtimeDraft.postLoadWaitMs} bounds={getNumberBounds('postLoadWaitMs')} step={100} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      <div id={runtimeSubStepDomId('fetch-network-frontier')} className="scroll-mt-24" />
      <SettingGroupBlock title="Frontier and Repair">
        <MasterSwitchRow label="Frontier Repair Search Enabled" tip="Generate repair search passes after hard URL failures.">
          <SettingToggle
            checked={runtimeDraft.frontierRepairSearchEnabled}
            onChange={(next) => updateDraft('frontierRepairSearchEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Frontier DB Path" tip="Path to the frontier persistence file or sqlite location hint.">
          <input
            type="text"
            value={runtimeDraft.frontierDbPath}
            onChange={(event) => updateDraft('frontierDbPath', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
            placeholder="_intel/frontier/frontier.json"
          />
        </SettingRow>
        <SettingRow label="Frontier SQLite Enabled" tip="Use SQLite-backed frontier tracking store.">
          <SettingToggle
            checked={runtimeDraft.frontierEnableSqlite}
            onChange={(next) => updateDraft('frontierEnableSqlite', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Frontier Query Cooldown (sec)" tip="Cooldown applied between repeated domain query emissions.">
          <SettingNumberInput draftKey="frontierQueryCooldownSeconds" value={runtimeDraft.frontierQueryCooldownSeconds} bounds={getNumberBounds('frontierQueryCooldownSeconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Repair Dedupe Rule" tip="Domain-level dedupe policy for repair-query enqueue behavior.">
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
        <SettingRow label="Automation Queue Storage Engine" tip="Storage engine selector for automation queue persistence.">
          <select
            value={runtimeDraft.automationQueueStorageEngine}
            onChange={(event) => updateDraft('automationQueueStorageEngine', event.target.value as RuntimeAutomationQueueStorageEngine)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            {AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </SettingRow>
        <AdvancedSettingsBlock title="Frontier Cooldowns & Penalties" count={10}>
          <SettingRow label="Frontier Strip Tracking Params" tip="Strip URL tracking params before frontier persistence.">
            <SettingToggle
              checked={runtimeDraft.frontierStripTrackingParams}
              onChange={(next) => updateDraft('frontierStripTrackingParams', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <SettingRow label="Frontier Cooldown 404 (sec)" tip="Cooldown after first 404 outcome.">
            <SettingNumberInput draftKey="frontierCooldown404Seconds" value={runtimeDraft.frontierCooldown404Seconds} bounds={getNumberBounds('frontierCooldown404Seconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Cooldown 404 Repeat (sec)" tip="Cooldown after repeated 404 outcomes.">
            <SettingNumberInput draftKey="frontierCooldown404RepeatSeconds" value={runtimeDraft.frontierCooldown404RepeatSeconds} bounds={getNumberBounds('frontierCooldown404RepeatSeconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Cooldown 410 (sec)" tip="Cooldown after 410 gone responses.">
            <SettingNumberInput draftKey="frontierCooldown410Seconds" value={runtimeDraft.frontierCooldown410Seconds} bounds={getNumberBounds('frontierCooldown410Seconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Cooldown Timeout (sec)" tip="Cooldown after request timeout failures.">
            <SettingNumberInput draftKey="frontierCooldownTimeoutSeconds" value={runtimeDraft.frontierCooldownTimeoutSeconds} bounds={getNumberBounds('frontierCooldownTimeoutSeconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Cooldown 403 Base (sec)" tip="Base cooldown for 403 responses before exponential scaling.">
            <SettingNumberInput draftKey="frontierCooldown403BaseSeconds" value={runtimeDraft.frontierCooldown403BaseSeconds} bounds={getNumberBounds('frontierCooldown403BaseSeconds')} step={10} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Cooldown 429 Base (sec)" tip="Base cooldown for 429 responses before exponential scaling.">
            <SettingNumberInput draftKey="frontierCooldown429BaseSeconds" value={runtimeDraft.frontierCooldown429BaseSeconds} bounds={getNumberBounds('frontierCooldown429BaseSeconds')} step={10} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Backoff Max Exponent" tip="Maximum exponent used when scaling 403/429 frontier cooldown backoff.">
            <SettingNumberInput draftKey="frontierBackoffMaxExponent" value={runtimeDraft.frontierBackoffMaxExponent} bounds={getNumberBounds('frontierBackoffMaxExponent')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Path Penalty Not-Found Threshold" tip="Not-found streak threshold before path-level frontier penalties apply.">
            <SettingNumberInput draftKey="frontierPathPenaltyNotfoundThreshold" value={runtimeDraft.frontierPathPenaltyNotfoundThreshold} bounds={getNumberBounds('frontierPathPenaltyNotfoundThreshold')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Frontier Blocked Domain Threshold" tip="Consecutive blocked outcomes before a domain enters blocked state.">
            <SettingNumberInput draftKey="frontierBlockedDomainThreshold" value={runtimeDraft.frontierBlockedDomainThreshold} bounds={getNumberBounds('frontierBlockedDomainThreshold')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>
    </>
  );
});
