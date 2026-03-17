import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../../stores/tabStore';
import type { PrefetchLlmCall, DomainHealthRow, PrefetchLiveSettings } from '../../types';
import { llmCallStatusBadgeClass, formatMs, domainRoleBadgeClass, safetyClassBadgeClass, pctString } from '../../helpers';
import { ScoreBar } from '../../components/ScoreBar';
import { StackedScoreBar } from '../../components/StackedScoreBar';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { StatCard } from '../../components/StatCard';
import { StageCard } from '../../components/StageCard';
import { ProgressRing } from '../../components/ProgressRing';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
import {
  computeSafetyClassCounts,
  computeRoleCounts,
  computeUniqueDomains,
  buildSafetyClassSegments,
  buildDomainFunnelBullets,
  computeAvgBudgetScore,
  computeCooldownSummary,
} from '../../selectors/domainClassifierHelpers.js';
import type { RuntimeIdxBadge } from '../../types';

interface PrefetchDomainClassifierPanelProps {
  calls: PrefetchLlmCall[];
  domainHealth?: DomainHealthRow[];
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
  idxRuntime?: RuntimeIdxBadge[];
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
        <span className="sf-text-caption sf-link-accent font-mono break-all">{domain.domain}</span>
      </DrawerSection>
      <DrawerSection title="Classification">
        <Tip text="The domain's assigned role and safety classification. Role indicates the source type; safety class controls fetch behavior." />
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${domainRoleBadgeClass(domain.role)}`}>{domain.role || 'unknown'}</span>
          <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${safetyClassBadgeClass(domain.safety_class)}`}>{domain.safety_class}</span>
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
        <span className="sf-text-caption font-mono sf-text-muted">
          {domain.avg_latency_ms > 0 ? formatMs(domain.avg_latency_ms) : 'N/A'}
        </span>
      </DrawerSection>
      <DrawerSection title="Cooldown">
        <Tip text="Time remaining before this domain can be fetched again. Cooldowns are triggered by rate limits or repeated errors." />
        <span className="sf-text-caption font-mono sf-text-muted">
          {domain.cooldown_remaining > 0 ? formatMs(domain.cooldown_remaining * 1000) : 'None'}
        </span>
      </DrawerSection>
      {domain.notes && (
        <DrawerSection title="Notes">
          <div className="sf-text-caption sf-text-muted">{domain.notes}</div>
        </DrawerSection>
      )}
      {call && (
        <DrawerSection title="LLM Context">
          <Tip text="Details about the LLM call that classified this domain." />
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span className="sf-text-subtle">Model</span>
            <span className="font-mono">{call.model || '-'}</span>
            <span className="sf-text-subtle">Provider</span>
            <span className="font-mono">{call.provider || '-'}</span>
            {call.tokens && (
              <>
                <span className="sf-text-subtle">Tokens</span>
                <span className="font-mono">{call.tokens.input}+{call.tokens.output}</span>
              </>
            )}
            {call.duration_ms > 0 && (
              <>
                <span className="sf-text-subtle">Duration</span>
                <span className="font-mono">{formatMs(call.duration_ms)}</span>
              </>
            )}
          </div>
        </DrawerSection>
      )}
    </DrawerShell>
  );
}

export function PrefetchDomainClassifierPanel({ calls, domainHealth, persistScope, liveSettings, idxRuntime }: PrefetchDomainClassifierPanelProps) {
  const domainClassifierLlmLive: boolean | undefined = true;
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

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Empty state ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">
          Domain Classifier
          <Tip text="The Domain Classifier assesses each discovered domain for safety, source tier, and pacing constraints. Domains are labeled safe, caution, or blocked to control fetch behavior and budget allocation." />
        </h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128737;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for domain classification</div>
          <p className="text-xs sf-text-subtle max-w-md leading-relaxed">
            Classification results will appear after the LLM evaluates each domain for safety, source tier,
            and pacing constraints. Domains are labeled safe, cautious, or blocked to control fetch behavior.
          </p>
          {domainClassifierLlmLive !== undefined && (
            <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${domainClassifierLlmLive ? 'sf-chip-info' : 'sf-chip-neutral'}`}>
              Runtime Mode: {domainClassifierLlmLive ? 'LLM-assisted' : 'Deterministic'}
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
        <h3 className="text-sm font-semibold sf-text-primary">
          Domain Classifier
          <Tip text="The Domain Classifier assesses each discovered domain for safety, source tier, and pacing constraints. Domains are labeled safe, caution, or blocked to control fetch behavior and budget allocation." />
        </h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${
            calls.some((c) => c.status === 'failed')
              ? 'sf-chip-danger'
              : 'sf-chip-success'
          }`}>
            {calls.some((c) => c.status === 'failed') ? 'Error' : 'Done'}
          </span>
        )}
        {calls.length > 0 && calls[0].model && (
          <span className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-neutral font-mono">
            {calls[0].model}
          </span>
        )}
        {calls.length > 0 && calls[0].provider && (
          <span className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-accent">
            {calls[0].provider}
          </span>
        )}
        {domainClassifierLlmLive !== undefined && (
          <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${
            domainClassifierLlmLive
              ? 'sf-chip-info'
              : 'sf-chip-neutral'
          }`}>
            Runtime Mode: {domainClassifierLlmLive ? 'LLM-assisted' : 'Deterministic'}
          </span>
        )}
      </div>

      <RuntimeIdxBadgeStrip badges={idxRuntime} />

      {/* B) Heavy Cooldown / Blocked Warning Banner */}
      {showWarningBanner && (
        <div className="px-4 py-2.5 sf-callout sf-callout-warning">
          <div className="text-xs font-medium">
            Fetch capacity reduced
          </div>
          <div className="sf-text-caption mt-0.5">
            {safetyCounts.blocked > 0 && `${safetyCounts.blocked} domain${safetyCounts.blocked !== 1 ? 's' : ''} blocked`}
            {safetyCounts.blocked > 0 && cooldownSummary.totalInCooldown > 0 && ' and '}
            {cooldownSummary.totalInCooldown > 0 && `${cooldownSummary.totalInCooldown} in cooldown`}
            {' \u2014 fetch capacity is reduced. Consider waiting for cooldowns to expire or reviewing blocked domains.'}
          </div>
        </div>
      )}

      {/* C) Decision Pipeline (StageCard) */}
      {hasStructured && (
        <div className="sf-surface-card p-3">
          <div className="sf-text-caption uppercase tracking-wider sf-text-subtle font-medium mb-2">
            Classification Pipeline
            <Tip text="Shows the domain classification funnel: total domains classified into safe, caution, and blocked categories." />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <StageCard
              label="Total"
              value={health.length}
              className="sf-callout sf-callout-neutral"
            />
            <span className="sf-text-subtle sf-text-caption shrink-0">&rarr;</span>
            <StageCard
              label="Safe"
              value={safetyCounts.safe}
              className="sf-callout-success"
            />
            <span className="sf-text-subtle sf-text-caption shrink-0">&rarr;</span>
            <StageCard
              label="Caution"
              value={safetyCounts.caution}
              className="sf-callout-warning"
            />
            <span className="sf-text-subtle sf-text-caption shrink-0">&rarr;</span>
            <StageCard
              label="Blocked"
              value={safetyCounts.blocked}
              className="sf-callout-danger"
            />
          </div>
        </div>
      )}

      {/* D) Hero Card with ProgressRing + funnel narrative + Role filter pills */}
      {hasStructured && health.length > 0 && (
        <div className="sf-surface-card p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-sm sf-text-muted">
                {uniqueDomains} domain{uniqueDomains !== 1 ? 's' : ''} classified.
                {safetyCounts.safe > 0 && <> <strong>{safetyCounts.safe}</strong> safe,</>}
                {safetyCounts.caution > 0 && <> <strong>{safetyCounts.caution}</strong> caution,</>}
                {safetyCounts.blocked > 0 && <> <strong>{safetyCounts.blocked}</strong> blocked.</>}
              </div>
              {funnelBullets.length > 0 && (
                <div className="mt-3 pt-3 border-t sf-border-soft">
                  <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider mb-1.5">
                    Classification Summary
                    <Tip text="A narrative explaining the domain classification: how many domains were evaluated, their safety breakdown, and which model performed the classification." />
                  </div>
                  <ul className="space-y-1">
                    {funnelBullets.map((b, i) => (
                      <li key={i} className="text-xs sf-text-muted flex items-start gap-1.5">
                        <span className="sf-status-text-success mt-0.5 shrink-0">&#8226;</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {roleFilterOptions.length > 0 && (
                <div className="mt-3 pt-3 border-t sf-border-soft">
                  <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider mb-1.5">
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
                          className={`px-2 py-0.5 rounded-full sf-text-caption font-medium transition-colors ${
                            roleFilter === role
                              ? 'sf-chip-info sf-icon-badge'
                              : 'sf-chip-info'
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
                        className="sf-text-caption sf-status-text-danger hover:underline ml-1"
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
          <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider mb-1.5">
            Safety Distribution
            <Tip text="Visual breakdown of domain safety classifications. Safe = normal fetching. Caution = reduced concurrency. Blocked = no fetching." />
          </div>
          <StackedScoreBar segments={safetySegments} showLegend />
        </div>
      )}

      {/* G) Domain Health Table */}
      {hasStructured && (
        <div className={`sf-table-shell rounded overflow-hidden ${selectedDomain ? 'max-h-[50vh] overflow-y-auto' : ''}`}>
          <table className="w-full text-xs">
            <thead>
              <tr className="sf-table-head">
                <th className="sf-table-head-cell text-left px-3 py-2">Domain</th>
                <th className="sf-table-head-cell text-left px-3 py-2">Role</th>
                <th className="sf-table-head-cell text-left px-3 py-2">Safety</th>
                <th className="sf-table-head-cell text-left px-3 py-2 w-24">Budget</th>
                <th className="sf-table-head-cell text-right px-3 py-2">Success</th>
                <th className="sf-table-head-cell text-right px-3 py-2">Latency</th>
                <th className="sf-table-head-cell text-left px-3 py-2">Cooldown</th>
                <th className="sf-table-head-cell text-left px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredHealth.map((d, i) => (
                <tr
                  key={i}
                  className={`border-t sf-border-soft sf-table-row cursor-pointer ${selectedDomainKey === d.domain ? 'sf-table-row-active' : ''}`}
                  onClick={() => setSelectedDomainKey(
                    selectedDomainKey === d.domain ? null : d.domain,
                  )}
                >
                  <td className="px-3 py-1.5 font-mono sf-text-primary">{d.domain}</td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${domainRoleBadgeClass(d.role)}`}>{d.role || '-'}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${safetyClassBadgeClass(d.safety_class)}`}>{d.safety_class}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <ScoreBar value={d.budget_score} max={100} label={String(Math.round(d.budget_score))} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {d.success_rate > 0 ? pctString(d.success_rate) : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono sf-text-subtle">
                    {d.avg_latency_ms > 0 ? formatMs(d.avg_latency_ms) : '-'}
                  </td>
                  <td className="px-3 py-1.5">
                    {d.cooldown_remaining > 0 ? (
                      <span className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-warning">
                        {formatMs(d.cooldown_remaining * 1000)}
                      </span>
                    ) : (
                      <span className="sf-text-subtle">-</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 sf-text-subtle truncate max-w-[10rem]">{d.notes || '-'}</td>
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
          <summary className="cursor-pointer sf-summary-toggle font-medium">
            LLM Call Details ({calls.length} call{calls.length > 1 ? 's' : ''})
            <Tip text="Detailed breakdown of each LLM call made during domain classification. Expand to see prompts, responses, token usage, and timing." />
          </summary>
          <div className="mt-2 space-y-2">
            {calls.map((call, i) => (
              <div key={i} className="sf-surface-elevated rounded p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${llmCallStatusBadgeClass(call.status)}`}>
                    {call.status}
                  </span>
                  {call.model && (
                    <span className="sf-text-caption font-mono sf-text-muted">{call.model}</span>
                  )}
                  {call.provider && (
                    <span className="sf-text-caption sf-text-subtle">{call.provider}</span>
                  )}
                  <span className="ml-auto sf-text-caption sf-text-subtle">
                    {call.tokens ? `${call.tokens.input}+${call.tokens.output} tok` : ''}
                    {call.duration_ms ? ` | ${formatMs(call.duration_ms)}` : ''}
                  </span>
                </div>
                {call.error && (
                  <div className="sf-text-caption sf-status-text-danger mt-1">{call.error}</div>
                )}
                {call.prompt_preview && (
                  <details className="mt-2">
                    <summary className="sf-text-caption font-medium sf-summary-toggle uppercase cursor-pointer">Prompt</summary>
                    <pre className="sf-pre-block sf-text-caption font-mono rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap mt-1">{call.prompt_preview}</pre>
                  </details>
                )}
                {call.response_preview && (
                  <details className="mt-1">
                    <summary className="sf-text-caption font-medium sf-summary-toggle uppercase cursor-pointer">Response</summary>
                    <pre className="sf-pre-block sf-text-caption font-mono rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap mt-1">{call.response_preview}</pre>
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
          <summary className="cursor-pointer sf-summary-toggle">
            Debug: Raw Classification Data
          </summary>
          <pre className="mt-2 sf-pre-block sf-text-caption font-mono rounded p-3 overflow-x-auto overflow-y-auto max-h-60 whitespace-pre-wrap">
            {JSON.stringify(health, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
