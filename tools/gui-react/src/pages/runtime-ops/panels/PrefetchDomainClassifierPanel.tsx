import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import type { PrefetchLlmCall, DomainHealthRow, PrefetchLiveSettings } from '../types';
import { llmCallStatusBadgeClass, formatMs, domainRoleBadgeClass, safetyClassBadgeClass, pctString } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';
import { StackedScoreBar } from '../components/StackedScoreBar';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';
import { Tip } from '../../../components/common/Tip';
import { StatCard } from '../components/StatCard';
import { StageCard } from '../components/StageCard';
import { ProgressRing } from '../components/ProgressRing';
import {
  computeSafetyClassCounts,
  computeRoleCounts,
  computeUniqueDomains,
  buildSafetyClassSegments,
  buildDomainFunnelBullets,
  computeAvgBudgetScore,
  computeCooldownSummary,
} from './domainClassifierHelpers.js';

interface PrefetchDomainClassifierPanelProps {
  calls: PrefetchLlmCall[];
  domainHealth?: DomainHealthRow[];
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
}

function DomainDetailDrawer({
  domain,
  call,
  onClose,
}: {
  domain: DomainHealthRow;
  call?: PrefetchLlmCall;
  onClose: () => void;
}) {
  return (
    <DrawerShell title={domain.domain} subtitle={domain.role || 'Unknown role'} onClose={onClose}>
      <DrawerSection title="Domain">
        <Tip text="The domain that was classified during the domain health assessment." />
        <span className="text-xs text-blue-600 dark:text-blue-400 font-mono break-all">{domain.domain}</span>
      </DrawerSection>
      <DrawerSection title="Classification">
        <Tip text="The domain's assigned role and safety classification. Role indicates the source type; safety class controls fetch behavior." />
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${domainRoleBadgeClass(domain.role)}`}>{domain.role || 'unknown'}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${safetyClassBadgeClass(domain.safety_class)}`}>{domain.safety_class}</span>
        </div>
      </DrawerSection>
      <DrawerSection title="Budget Score">
        <Tip text="How much fetch budget remains for this domain (0-100). Higher means more requests can be made." />
        <ScoreBar value={domain.budget_score} max={100} label={String(Math.round(domain.budget_score))} />
      </DrawerSection>
      <DrawerSection title="Success Rate">
        <Tip text="Percentage of successful fetches from this domain. Low rates may trigger cooldown or blocking." />
        <ScoreBar value={domain.success_rate * 100} max={100} label={pctString(domain.success_rate)} />
      </DrawerSection>
      <DrawerSection title="Latency">
        <Tip text="Average response time for fetches from this domain." />
        <span className="text-xs font-mono text-gray-700 dark:text-gray-300">
          {domain.avg_latency_ms > 0 ? formatMs(domain.avg_latency_ms) : 'N/A'}
        </span>
      </DrawerSection>
      <DrawerSection title="Cooldown">
        <Tip text="Time remaining before this domain can be fetched again. Cooldowns are triggered by rate limits or repeated errors." />
        <span className="text-xs font-mono text-gray-700 dark:text-gray-300">
          {domain.cooldown_remaining > 0 ? formatMs(domain.cooldown_remaining * 1000) : 'None'}
        </span>
      </DrawerSection>
      {domain.notes && (
        <DrawerSection title="Notes">
          <div className="text-xs text-gray-600 dark:text-gray-400">{domain.notes}</div>
        </DrawerSection>
      )}
      {call && (
        <DrawerSection title="LLM Context">
          <Tip text="Details about the LLM call that classified this domain." />
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span className="text-gray-500">Model</span>
            <span className="font-mono">{call.model || '-'}</span>
            <span className="text-gray-500">Provider</span>
            <span className="font-mono">{call.provider || '-'}</span>
            {call.tokens && (
              <>
                <span className="text-gray-500">Tokens</span>
                <span className="font-mono">{call.tokens.input}+{call.tokens.output}</span>
              </>
            )}
            {call.duration_ms > 0 && (
              <>
                <span className="text-gray-500">Duration</span>
                <span className="font-mono">{formatMs(call.duration_ms)}</span>
              </>
            )}
          </div>
        </DrawerSection>
      )}
    </DrawerShell>
  );
}

export function PrefetchDomainClassifierPanel({ calls, domainHealth, persistScope, liveSettings }: PrefetchDomainClassifierPanelProps) {
  const health = domainHealth || [];
  const hasStructured = health.length > 0;
  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);

  const safetyCounts = useMemo(() => computeSafetyClassCounts(health), [health]);
  const roleCounts = useMemo(() => computeRoleCounts(health), [health]);
  const uniqueDomains = useMemo(() => computeUniqueDomains(health), [health]);
  const safetySegments = useMemo(() => buildSafetyClassSegments(safetyCounts), [safetyCounts]);
  const funnelBullets = useMemo(() => buildDomainFunnelBullets(health, calls), [health, calls]);
  const avgBudget = useMemo(() => computeAvgBudgetScore(health), [health]);
  const cooldownSummary = useMemo(() => computeCooldownSummary(health), [health]);
  const hasSafetyData = safetyCounts.safe + safetyCounts.caution + safetyCounts.blocked > 0;

  const domainValues = useMemo(
    () => health.map((d) => d.domain),
    [health],
  );
  const [selectedDomainKey, setSelectedDomainKey] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:domainClassifier:selectedDomain:${persistScope}`,
    null,
    { validValues: domainValues },
  );
  const selectedDomain = useMemo(
    () => (selectedDomainKey ? health.find((d) => d.domain === selectedDomainKey) ?? null : null),
    [selectedDomainKey, health],
  );

  const roleFilterOptions = useMemo(() => {
    const roles: string[] = [];
    if (roleCounts.manufacturer > 0) roles.push('manufacturer');
    if (roleCounts.review > 0) roles.push('review');
    if (roleCounts.retail > 0) roles.push('retail');
    if (roleCounts.database > 0) roles.push('database');
    if (roleCounts.unknown > 0) roles.push('unknown');
    return roles;
  }, [roleCounts]);

  const [roleFilter, setRoleFilter] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:domainClassifier:roleFilter:${persistScope}`,
    null,
    { validValues: roleFilterOptions },
  );

  const filteredHealth = useMemo(() => {
    if (!roleFilter) return health;
    return health.filter((d) => {
      const role = d.role || '';
      if (roleFilter === 'review') return role === 'review' || role === 'lab_review';
      if (roleFilter === 'unknown') return !['manufacturer', 'review', 'lab_review', 'retail', 'database'].includes(role);
      return role === roleFilter;
    });
  }, [health, roleFilter]);

  const blockedAndCooldownCount = safetyCounts.blocked + cooldownSummary.totalInCooldown;
  const showWarningBanner = blockedAndCooldownCount >= 2;

  // ── Empty state ──
  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Domain Classifier
          <Tip text="The Domain Classifier assesses each discovered domain for safety, source tier, and pacing constraints. Domains are labeled safe, caution, or blocked to control fetch behavior and budget allocation." />
        </h3>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128737;</div>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300">Waiting for domain classification</div>
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-md leading-relaxed">
            Classification results will appear after the LLM evaluates each domain for safety, source tier,
            and pacing constraints. Domains are labeled safe, cautious, or blocked to control fetch behavior.
          </p>
          {liveSettings?.phase3LlmTriageEnabled !== undefined && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${liveSettings.phase3LlmTriageEnabled ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
              LLM: {liveSettings.phase3LlmTriageEnabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      {/* A) Header Row with model/provider badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Domain Classifier
          <Tip text="The Domain Classifier assesses each discovered domain for safety, source tier, and pacing constraints. Domains are labeled safe, caution, or blocked to control fetch behavior and budget allocation." />
        </h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            calls.some((c) => c.status === 'failed')
              ? 'bg-red-100 text-red-800'
              : 'bg-green-100 text-green-800'
          }`}>
            {calls.some((c) => c.status === 'failed') ? 'Error' : 'Done'}
          </span>
        )}
        {calls.length > 0 && calls[0].model && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-mono">
            {calls[0].model}
          </span>
        )}
        {calls.length > 0 && calls[0].provider && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
            {calls[0].provider}
          </span>
        )}
        {liveSettings?.phase3LlmTriageEnabled !== undefined && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            liveSettings.phase3LlmTriageEnabled
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            LLM: {liveSettings.phase3LlmTriageEnabled ? 'ON' : 'OFF'}
          </span>
        )}
      </div>

      {/* B) Heavy Cooldown / Blocked Warning Banner */}
      {showWarningBanner && (
        <div className="px-4 py-2.5 rounded bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
            Fetch capacity reduced
          </div>
          <div className="text-[10px] text-orange-600 dark:text-orange-400 mt-0.5">
            {safetyCounts.blocked > 0 && `${safetyCounts.blocked} domain${safetyCounts.blocked !== 1 ? 's' : ''} blocked`}
            {safetyCounts.blocked > 0 && cooldownSummary.totalInCooldown > 0 && ' and '}
            {cooldownSummary.totalInCooldown > 0 && `${cooldownSummary.totalInCooldown} in cooldown`}
            {' \u2014 fetch capacity is reduced. Consider waiting for cooldowns to expire or reviewing blocked domains.'}
          </div>
        </div>
      )}

      {/* C) Decision Pipeline (StageCard) */}
      {hasStructured && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-2">
            Classification Pipeline
            <Tip text="Shows the domain classification funnel: total domains classified into safe, caution, and blocked categories." />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <StageCard
              label="Total"
              value={health.length}
              className="border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
            <span className="text-gray-300 dark:text-gray-600 text-xs shrink-0">&rarr;</span>
            <StageCard
              label="Safe"
              value={safetyCounts.safe}
              className="border-green-200 text-green-800 bg-green-50 dark:border-green-800 dark:text-green-200 dark:bg-green-900/20"
            />
            <span className="text-gray-300 dark:text-gray-600 text-xs shrink-0">&rarr;</span>
            <StageCard
              label="Caution"
              value={safetyCounts.caution}
              className="border-yellow-200 text-yellow-800 bg-yellow-50 dark:border-yellow-800 dark:text-yellow-200 dark:bg-yellow-900/20"
            />
            <span className="text-gray-300 dark:text-gray-600 text-xs shrink-0">&rarr;</span>
            <StageCard
              label="Blocked"
              value={safetyCounts.blocked}
              className="border-red-200 text-red-800 bg-red-50 dark:border-red-800 dark:text-red-200 dark:bg-red-900/20"
            />
          </div>
        </div>
      )}

      {/* D) Hero Card with ProgressRing + funnel narrative + Role filter pills */}
      {hasStructured && health.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {uniqueDomains} domain{uniqueDomains !== 1 ? 's' : ''} classified.
                {safetyCounts.safe > 0 && <> <strong>{safetyCounts.safe}</strong> safe,</>}
                {safetyCounts.caution > 0 && <> <strong>{safetyCounts.caution}</strong> caution,</>}
                {safetyCounts.blocked > 0 && <> <strong>{safetyCounts.blocked}</strong> blocked.</>}
              </div>
              {funnelBullets.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Classification Summary
                    <Tip text="A narrative explaining the domain classification: how many domains were evaluated, their safety breakdown, and which model performed the classification." />
                  </div>
                  <ul className="space-y-1">
                    {funnelBullets.map((b, i) => (
                      <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">&#8226;</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {roleFilterOptions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Domains by Role
                    <Tip text="Filter the domain table by source role. Click a role pill to show only domains of that type." />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {roleFilterOptions.map((role) => {
                      const count = roleCounts[role as keyof typeof roleCounts] || 0;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setRoleFilter(roleFilter === role ? null : role)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                            roleFilter === role
                              ? 'bg-blue-500 text-white ring-1 ring-blue-400'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
                          }`}
                        >
                          {role} ({count})
                        </button>
                      );
                    })}
                    {roleFilter && (
                      <button
                        type="button"
                        onClick={() => setRoleFilter(null)}
                        className="text-[10px] text-red-500 hover:underline ml-1"
                      >
                        Clear filter
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            {safetyCounts.safe > 0 && (
              <ProgressRing
                numerator={safetyCounts.safe}
                denominator={health.length}
                label="Safe Rate"
                strokeWidth={6}
              />
            )}
          </div>
        </div>
      )}

      {/* E) StatCards Row */}
      <div className="flex items-center gap-3 flex-wrap">
        {hasStructured && (
          <>
            <StatCard label="Safe" value={safetyCounts.safe} tip="Domains classified as safe for fetching. These have no known pacing or blocking issues." />
            <StatCard label="Caution" value={safetyCounts.caution} tip="Domains with potential pacing concerns. Fetching is allowed but with reduced concurrency." />
            <StatCard label="Blocked" value={safetyCounts.blocked} tip="Domains blocked from fetching due to repeated failures, rate limits, or safety concerns." />
            {cooldownSummary.totalInCooldown > 0 && <StatCard label="In Cooldown" value={cooldownSummary.totalInCooldown} tip="Domains temporarily paused due to rate limiting. They will become available after the cooldown expires." />}
            <StatCard label="Avg Budget" value={avgBudget} tip="Average fetch budget score across all domains (0-100). Higher means more capacity available." />
          </>
        )}
        <StatCard label="LLM Calls" value={calls.length} tip="Number of LLM calls made for domain classification." />
        {totalTokens > 0 && <StatCard label="Tokens" value={totalTokens.toLocaleString()} tip="LLM tokens consumed (input + output) for domain classification." />}
        {totalDuration > 0 && <StatCard label="Duration" value={formatMs(totalDuration)} tip="Wall-clock time for the domain classification step." />}
      </div>

      {/* F) Safety Class Distribution Bar */}
      {hasSafetyData && (
        <div>
          <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Safety Distribution
            <Tip text="Visual breakdown of domain safety classifications. Safe = normal fetching. Caution = reduced concurrency. Blocked = no fetching." />
          </div>
          <StackedScoreBar segments={safetySegments} showLegend />
        </div>
      )}

      {/* G) Domain Health Table */}
      {hasStructured && (
        <div className={`border border-gray-200 dark:border-gray-700 rounded overflow-hidden ${selectedDomain ? 'max-h-[50vh] overflow-y-auto' : ''}`}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2 font-medium">Domain</th>
                <th className="text-left px-3 py-2 font-medium">Role</th>
                <th className="text-left px-3 py-2 font-medium">Safety</th>
                <th className="text-left px-3 py-2 font-medium w-24">Budget</th>
                <th className="text-right px-3 py-2 font-medium">Success</th>
                <th className="text-right px-3 py-2 font-medium">Latency</th>
                <th className="text-left px-3 py-2 font-medium">Cooldown</th>
                <th className="text-left px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredHealth.map((d, i) => (
                <tr
                  key={i}
                  className={`border-t border-gray-100 dark:border-gray-700/50 cursor-pointer ${
                    selectedDomainKey === d.domain
                      ? 'bg-sky-50 dark:bg-sky-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                  }`}
                  onClick={() => setSelectedDomainKey(
                    selectedDomainKey === d.domain ? null : d.domain,
                  )}
                >
                  <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100">{d.domain}</td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${domainRoleBadgeClass(d.role)}`}>{d.role || '-'}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${safetyClassBadgeClass(d.safety_class)}`}>{d.safety_class}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <ScoreBar value={d.budget_score} max={100} label={String(Math.round(d.budget_score))} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {d.success_rate > 0 ? pctString(d.success_rate) : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-500 dark:text-gray-400">
                    {d.avg_latency_ms > 0 ? formatMs(d.avg_latency_ms) : '-'}
                  </td>
                  <td className="px-3 py-1.5">
                    {d.cooldown_remaining > 0 ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                        {formatMs(d.cooldown_remaining * 1000)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 truncate max-w-[10rem]">{d.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* H) Domain Detail Drawer */}
      {selectedDomain && (
        <DomainDetailDrawer
          domain={selectedDomain}
          call={calls[0]}
          onClose={() => setSelectedDomainKey(null)}
        />
      )}

      {/* I) LLM Call Details (structured, collapsible) */}
      {calls.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium">
            LLM Call Details ({calls.length} call{calls.length > 1 ? 's' : ''})
            <Tip text="Detailed breakdown of each LLM call made during domain classification. Expand to see prompts, responses, token usage, and timing." />
          </summary>
          <div className="mt-2 space-y-2">
            {calls.map((call, i) => (
              <div key={i} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${llmCallStatusBadgeClass(call.status)}`}>
                    {call.status}
                  </span>
                  {call.model && (
                    <span className="text-[10px] font-mono text-gray-600 dark:text-gray-400">{call.model}</span>
                  )}
                  {call.provider && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{call.provider}</span>
                  )}
                  <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
                    {call.tokens ? `${call.tokens.input}+${call.tokens.output} tok` : ''}
                    {call.duration_ms ? ` | ${formatMs(call.duration_ms)}` : ''}
                  </span>
                </div>
                {call.error && (
                  <div className="text-[10px] text-red-500 dark:text-red-400 mt-1">{call.error}</div>
                )}
                {call.prompt_preview && (
                  <details className="mt-2">
                    <summary className="text-[10px] font-medium text-gray-400 uppercase cursor-pointer">Prompt</summary>
                    <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400 mt-1">{call.prompt_preview}</pre>
                  </details>
                )}
                {call.response_preview && (
                  <details className="mt-1">
                    <summary className="text-[10px] font-medium text-gray-400 uppercase cursor-pointer">Response</summary>
                    <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400 mt-1">{call.response_preview}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* J) Debug: Raw JSON */}
      {hasStructured && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            Debug: Raw Classification Data
          </summary>
          <pre className="mt-2 text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto overflow-y-auto max-h-60 whitespace-pre-wrap text-gray-600 dark:text-gray-400">
            {JSON.stringify(health, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
