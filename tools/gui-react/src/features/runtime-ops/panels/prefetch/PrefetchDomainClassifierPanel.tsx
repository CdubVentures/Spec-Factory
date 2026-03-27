import { Fragment, useMemo } from 'react';
import { usePersistedNullableTab, usePersistedExpandMap } from '../../../../stores/tabStore.ts';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import type { PrefetchLlmCall, DomainHealthRow, PrefetchLiveSettings, SerpSelectorResult } from '../../types.ts';
import { formatMs, domainRoleBadgeClass, safetyClassBadgeClass, pctString } from '../../helpers.ts';
import { ScoreBar } from '../../components/ScoreBar.tsx';
import { StackedScoreBar } from '../../components/StackedScoreBar.tsx';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails.tsx';
import { ProgressRing } from '../../components/ProgressRing.tsx';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import {
  computeSafetyClassCounts,
  computeRoleCounts,
  computeUniqueDomains,
  buildSafetyClassSegments,
  buildDomainFunnelBullets,
  computeCooldownSummary,
  computeFetchSummary,
  groupKeptUrlsByDomain,
  computeUrlSafetyBreakdown,
} from '../../selectors/domainClassifierHelpers.js';
import { PrefetchEmptyState } from './PrefetchEmptyState.tsx';
import type { RuntimeIdxBadge } from '../../types.ts';

interface PrefetchDomainClassifierPanelProps {
  calls: PrefetchLlmCall[];
  domainHealth?: DomainHealthRow[];
  serpSelector?: SerpSelectorResult[];
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
  idxRuntime?: RuntimeIdxBadge[];
}

/* ── Domain Detail Drawer ── */

function DomainDetailDrawer({
  domain,
  onClose,
}: {
  domain: DomainHealthRow;
  onClose: () => void;
}) {
  return (
    <DrawerShell title={domain.domain} subtitle={domain.role || 'Unknown role'} onClose={onClose}>
      <DrawerSection title="Domain">
        <span className="sf-text-caption sf-link-accent font-mono break-all">{domain.domain}</span>
      </DrawerSection>
      <DrawerSection title="Classification">
        <div className="flex items-center gap-2">
          <Chip label={domain.role || 'unknown'} className={domainRoleBadgeClass(domain.role)} />
          <Chip label={domain.safety_class} className={safetyClassBadgeClass(domain.safety_class)} />
        </div>
      </DrawerSection>
      <DrawerSection title="Success Rate">
        <ScoreBar value={domain.success_rate * 100} max={100} label={pctString(domain.success_rate)} />
      </DrawerSection>
      <DrawerSection title="Latency">
        <span className="sf-text-caption font-mono sf-text-muted">
          {domain.avg_latency_ms > 0 ? formatMs(domain.avg_latency_ms) : 'N/A'}
        </span>
      </DrawerSection>
      <DrawerSection title="Fetch History">
        <div className="flex gap-4 sf-text-caption font-mono">
          <span>{domain.fetch_count || 0} fetches</span>
          {domain.blocked_count > 0 && <span className="text-[var(--sf-state-error-fg)]">{domain.blocked_count} blocked</span>}
          {domain.timeout_count > 0 && <span className="text-[var(--sf-state-warning-fg)]">{domain.timeout_count} timeouts</span>}
        </div>
      </DrawerSection>
      <DrawerSection title="Cooldown">
        <span className="sf-text-caption font-mono sf-text-muted">
          {domain.cooldown_remaining > 0 ? formatMs(domain.cooldown_remaining * 1000) : 'None'}
        </span>
      </DrawerSection>
      {domain.last_blocked_ts && (
        <DrawerSection title="Last Blocked">
          <span className="sf-text-caption font-mono sf-text-muted">{domain.last_blocked_ts}</span>
        </DrawerSection>
      )}
      {domain.notes && (
        <DrawerSection title="Notes">
          <div className="sf-text-caption sf-text-muted">{domain.notes}</div>
        </DrawerSection>
      )}
    </DrawerShell>
  );
}

/* ── Main Panel ── */

export function PrefetchDomainClassifierPanel({ calls, domainHealth, serpSelector, persistScope, idxRuntime }: PrefetchDomainClassifierPanelProps) {
  const scrollRef = usePersistedScroll(`scroll:domainClassifier:${persistScope}`);
  const health = domainHealth || [];
  const hasStructured = health.length > 0;
  const overallStatus = hasStructured ? 'done' : 'pending';

  const safetyCounts = useMemo(() => computeSafetyClassCounts(health), [health]);
  const roleCounts = useMemo(() => computeRoleCounts(health), [health]);
  const uniqueDomains = useMemo(() => computeUniqueDomains(health), [health]);
  const safetySegments = useMemo(() => buildSafetyClassSegments(safetyCounts), [safetyCounts]);
  const funnelBullets = useMemo(() => buildDomainFunnelBullets(health, calls), [health, calls]);
  const cooldownSummary = useMemo(() => computeCooldownSummary(health), [health]);
  const fetchSummary = useMemo(() => computeFetchSummary(health), [health]);
  const hasSafetyData = safetyCounts.safe + safetyCounts.caution + safetyCounts.blocked > 0;

  const urlsByDomain = useMemo(() => groupKeptUrlsByDomain(serpSelector || []), [serpSelector]);
  const urlSafety = useMemo(() => computeUrlSafetyBreakdown(urlsByDomain, health), [urlsByDomain, health]);

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
  const [expandedDomains, toggleExpandedDomain, replaceExpandedDomains] = usePersistedExpandMap(
    `runtimeOps:prefetch:domainClassifier:expandedDomains:${persistScope}`,
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

  // WHY: Build ordered fetch plan from SERP selector kept candidates.
  // Sorted by score descending — mirrors the pipeline's slot+rank ordering.
  const fetchPlan = useMemo(() => {
    const kept: Array<{
      url: string;
      title: string;
      domain: string;
      score: number;
      host_trust_class: string;
      triage_disposition: string;
      doc_kind_guess: string;
      rank: number;
      query: string;
    }> = [];
    for (const group of serpSelector || []) {
      for (const c of group.candidates || []) {
        if (c.decision !== 'keep') continue;
        kept.push({
          url: c.url,
          title: c.title,
          domain: c.domain,
          score: c.score,
          host_trust_class: c.host_trust_class,
          triage_disposition: c.triage_disposition,
          doc_kind_guess: c.doc_kind_guess,
          rank: kept.length + 1,
          query: group.query,
        });
      }
    }
    kept.sort((a, b) => b.score - a.score);
    return kept.map((item, i) => ({ ...item, rank: i + 1 }));
  }, [serpSelector]);

  const [expandedFetchPlan, toggleExpandedFetchPlan, replaceExpandedFetchPlan] = usePersistedExpandMap(
    `runtimeOps:prefetch:domainClassifier:expandedFetchPlan:${persistScope}`,
  );
  const allFetchPlanExpanded = fetchPlan.length > 0 && fetchPlan.every((_, i) => expandedFetchPlan[String(i)]);

  /* ── Empty State ── */
  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-5 p-5 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Domain Classifier</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <PrefetchEmptyState
          icon="&#128737;"
          heading="Waiting for domain classification"
          description="Classification results will appear after deterministic heuristics evaluate each domain for safety, source tier, and pacing constraints. Domains are labeled safe, cautious, or blocked to control fetch behavior and queue routing."
        />
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Domain Classifier</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Safety &amp; Routing</span>
          <Chip label={overallStatus.toUpperCase()} className={overallStatus === 'done' ? 'sf-chip-success' : 'sf-chip-neutral'} />
        </>}
        trailing={<>
          <Chip label="Deterministic" className="sf-chip-neutral" />
          <Tip text="The Domain Classifier assesses each discovered domain for safety, source tier, and pacing constraints using deterministic heuristics (deny-lists, approved hosts, tier resolution). Routes URLs to priority, manufacturer, general, or candidate queues. No LLM call." />
        </>}
        footer={<>
          {cooldownSummary.totalInCooldown > 0 && <span>in cooldown <strong className="text-[var(--sf-state-warning-fg)]">{cooldownSummary.totalInCooldown}</strong></span>}
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        <HeroStatGrid columns={6}>
          <HeroStat value={urlSafety.totalKeptUrls > 0 ? urlSafety.totalKeptUrls : uniqueDomains} label={urlSafety.totalKeptUrls > 0 ? 'URLs' : 'domains'} />
          <HeroStat value={uniqueDomains} label="domains" />
          <HeroStat value={safetyCounts.safe} label="safe" colorClass={safetyCounts.safe > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          <HeroStat value={safetyCounts.caution} label="caution" colorClass={safetyCounts.caution > 0 ? 'text-[var(--sf-state-warning-fg)]' : 'sf-text-muted'} />
          <HeroStat value={safetyCounts.blocked} label="blocked" colorClass={safetyCounts.blocked > 0 ? 'text-[var(--sf-state-error-fg)]' : 'sf-text-muted'} />
          <HeroStat value={fetchSummary.totalFetches} label="fetches" />
        </HeroStatGrid>

        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          {urlSafety.totalKeptUrls > 0 ? (<>
            <strong className="sf-text-primary not-italic">{urlSafety.totalKeptUrls}</strong> URL{urlSafety.totalKeptUrls !== 1 ? 's' : ''} across <strong className="sf-text-primary not-italic">{uniqueDomains}</strong> domain{uniqueDomains !== 1 ? 's' : ''}
            {urlSafety.safeUrls > 0 && <> &mdash; <strong className="sf-text-primary not-italic">{urlSafety.safeUrls}</strong> on safe domains</>}
            {urlSafety.cautionUrls > 0 && <>, <strong className="sf-text-primary not-italic">{urlSafety.cautionUrls}</strong> on caution domains</>}
            {urlSafety.blockedUrls > 0 && <>, <strong className="sf-text-primary not-italic">{urlSafety.blockedUrls}</strong> on blocked domains</>}
          </>) : (<>
            <strong className="sf-text-primary not-italic">{uniqueDomains}</strong> domain{uniqueDomains !== 1 ? 's' : ''} classified
            {safetyCounts.safe > 0 && <> &mdash; <strong className="sf-text-primary not-italic">{safetyCounts.safe}</strong> safe</>}
            {safetyCounts.caution > 0 && <>, <strong className="sf-text-primary not-italic">{safetyCounts.caution}</strong> caution</>}
            {safetyCounts.blocked > 0 && <>, <strong className="sf-text-primary not-italic">{safetyCounts.blocked}</strong> blocked</>}
          </>)}
          {cooldownSummary.totalInCooldown > 0 && <>, <strong className="sf-text-primary not-italic">{cooldownSummary.totalInCooldown}</strong> in cooldown</>}
          .
        </div>
      </HeroBand>

      {/* ── Fetch Capacity Warning ── */}
      {showWarningBanner && (
        <div className="px-4 py-3.5 rounded-sm border border-[var(--sf-state-warning-border)] bg-[var(--sf-state-warning-bg)]">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl leading-none">{'\u26a0'}</span>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--sf-state-warning-fg)]">
                Fetch capacity reduced
              </div>
              <div className="mt-1 text-xs sf-text-muted">
                {safetyCounts.blocked > 0 && `${safetyCounts.blocked} domain${safetyCounts.blocked !== 1 ? 's' : ''} blocked`}
                {safetyCounts.blocked > 0 && cooldownSummary.totalInCooldown > 0 && ' and '}
                {cooldownSummary.totalInCooldown > 0 && `${cooldownSummary.totalInCooldown} in cooldown`}
                {' \u2014 consider waiting for cooldowns to expire or reviewing blocked domains.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Safety Distribution ── */}
      {hasSafetyData && (
        <div>
          <SectionHeader>safety distribution</SectionHeader>
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 space-y-3">
            <StackedScoreBar segments={safetySegments} showLegend />
            {safetyCounts.safe > 0 && (
              <div className="flex items-center gap-4 pt-3 border-t sf-border-soft">
                <ProgressRing
                  numerator={safetyCounts.safe}
                  denominator={health.length}
                  label="Safe Rate"
                  strokeWidth={6}
                />
                <div className="flex-1">
                  {funnelBullets.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">classification summary</div>
                      <ul className="space-y-1">
                        {funnelBullets.map((b, i) => (
                          <li key={i} className="text-xs sf-text-muted flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0 text-[var(--sf-state-success-fg)]">{'\u2022'}</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Domains by Role ── */}
      {roleFilterOptions.length > 0 && (
        <div>
          <SectionHeader>domains by role</SectionHeader>
          <div className="flex flex-wrap gap-1.5">
            {roleFilterOptions.map((role) => {
              const count = roleCounts[role as keyof typeof roleCounts] || 0;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(roleFilter === role ? null : role)}
                  className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.04em] border-[1.5px] border-current transition-colors ${
                    roleFilter === role ? 'sf-chip-info sf-icon-badge' : 'sf-chip-info'
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

      {/* ── Domain Health Table ── */}
      {hasStructured && (() => {
        const expandableDomains = filteredHealth.filter((d) => (urlsByDomain.get(d.domain) || []).length > 0);
        const allDomainsExpanded = expandableDomains.length > 0 && expandableDomains.every((d) => expandedDomains[d.domain]);
        return (
        <div>
          <div className="flex items-baseline gap-2 pt-2 pb-1.5 mb-3 border-b-[1.5px] border-[var(--sf-token-text-primary)]">
            <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary">
              domain health &middot; {filteredHealth.length} domain{filteredHealth.length !== 1 ? 's' : ''}
            </span>
            {expandableDomains.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  for (const d of expandableDomains) {
                    next[d.domain] = !allDomainsExpanded;
                  }
                  replaceExpandedDomains(next);
                }}
                className="px-2 py-0.5 rounded sf-text-caption font-medium sf-icon-button hover:sf-primary-button transition-colors"
              >
                {allDomainsExpanded ? 'Close All' : 'Open All'}
              </button>
            )}
          </div>
          <div className={`overflow-x-auto border sf-border-soft rounded-sm ${selectedDomain ? 'max-h-[50vh] overflow-y-auto' : ''}`}>
            <table className="min-w-full text-xs">
              <thead className="sf-surface-elevated sticky top-0">
                <tr>
                  <th className="py-2 px-1 w-6 border-b sf-border-soft" />
                  {['domain', 'role', 'safety', 'fetches', 'blocks', 'success', 'latency', 'cooldown', 'notes'].map((h) => (
                    <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHealth.map((d, i) => {
                  const domainUrls = urlsByDomain.get(d.domain) || [];
                  const hasUrls = domainUrls.length > 0;
                  const isExpanded = Boolean(expandedDomains[d.domain]);
                  return (
                    <Fragment key={i}>
                      <tr
                        className={`border-b sf-border-soft hover:sf-surface-elevated cursor-pointer ${selectedDomainKey === d.domain ? 'sf-callout sf-callout-info' : ''}`}
                        onClick={() => setSelectedDomainKey(
                          selectedDomainKey === d.domain ? null : d.domain,
                        )}
                      >
                        <td
                          className="py-1.5 px-1 text-center sf-text-subtle cursor-pointer w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hasUrls) toggleExpandedDomain(d.domain);
                          }}
                        >
                          {hasUrls && (
                            <span className="sf-text-caption">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                          )}
                        </td>
                        <td className="py-1.5 px-4 font-mono sf-text-primary">
                          {d.domain}
                          {hasUrls && (
                            <span className="ml-1.5 text-[10px] sf-text-subtle font-normal">({domainUrls.length})</span>
                          )}
                        </td>
                        <td className="py-1.5 px-4">
                          <Chip label={d.role || '-'} className={domainRoleBadgeClass(d.role)} />
                        </td>
                        <td className="py-1.5 px-4">
                          <Chip label={d.safety_class} className={safetyClassBadgeClass(d.safety_class)} />
                        </td>
                        <td className="py-1.5 px-4 text-right font-mono sf-text-subtle">
                          {d.fetch_count > 0 ? d.fetch_count : '-'}
                        </td>
                        <td className="py-1.5 px-4 text-right font-mono">
                          {d.blocked_count > 0 ? (
                            <span className="text-[var(--sf-state-error-fg)]">{d.blocked_count}</span>
                          ) : (
                            <span className="sf-text-subtle">-</span>
                          )}
                        </td>
                        <td className="py-1.5 px-4 text-right font-mono">
                          {d.success_rate > 0 ? pctString(d.success_rate) : '-'}
                        </td>
                        <td className="py-1.5 px-4 text-right font-mono sf-text-subtle">
                          {d.avg_latency_ms > 0 ? formatMs(d.avg_latency_ms) : '-'}
                        </td>
                        <td className="py-1.5 px-4">
                          {d.cooldown_remaining > 0 ? (
                            <Chip label={formatMs(d.cooldown_remaining * 1000)} className="sf-chip-warning" />
                          ) : (
                            <span className="sf-text-subtle">-</span>
                          )}
                        </td>
                        <td className="py-1.5 px-4 sf-text-subtle truncate max-w-[10rem]">{d.notes || '-'}</td>
                      </tr>
                      {isExpanded && domainUrls.map((u, ui) => (
                        <tr key={`${i}-url-${ui}`} className="sf-surface-panel border-b sf-border-soft">
                          <td />
                          <td colSpan={2} className="py-1 px-4 pl-8">
                            <div className="sf-text-caption font-mono sf-link-accent truncate max-w-[24rem]" title={u.url}>
                              {u.url}
                            </div>
                            {u.title && (
                              <div className="sf-text-caption sf-text-muted truncate max-w-[24rem]">{u.title}</div>
                            )}
                          </td>
                          <td className="py-1 px-4">
                            {u.doc_kind_guess && (
                              <Chip label={u.doc_kind_guess.replace(/_/g, ' ')} className="sf-chip-accent" />
                            )}
                          </td>
                          <td colSpan={2} className="py-1 px-4">
                            {u.triage_disposition && (
                              <Chip label={u.triage_disposition.replace(/_/g, ' ')} className="sf-chip-neutral" />
                            )}
                          </td>
                          <td colSpan={5} />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        );
      })()}

      {/* ── Fetch Plan ── */}
      {fetchPlan.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2 pt-2 pb-1.5 mb-3 border-b-[1.5px] border-[var(--sf-token-text-primary)]">
            <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary">
              fetch plan &middot; {fetchPlan.length} URL{fetchPlan.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                const next: Record<string, boolean> = {};
                for (let i = 0; i < fetchPlan.length; i++) {
                  next[String(i)] = !allFetchPlanExpanded;
                }
                replaceExpandedFetchPlan(next);
              }}
              className="px-2 py-0.5 rounded sf-text-caption font-medium sf-icon-button hover:sf-primary-button transition-colors"
            >
              {allFetchPlanExpanded ? 'Close All' : 'Open All'}
            </button>
          </div>
          <div className="overflow-x-auto border sf-border-soft rounded-sm">
            <table className="min-w-full text-xs">
              <thead className="sf-surface-elevated sticky top-0">
                <tr>
                  <th className="py-2 px-2 w-10 text-right border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">#</th>
                  <th className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">url</th>
                  <th className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">trust</th>
                  <th className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">disposition</th>
                  <th className="py-2 px-4 text-right border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">score</th>
                </tr>
              </thead>
              <tbody>
                {fetchPlan.map((row, i) => {
                  const isExpanded = Boolean(expandedFetchPlan[String(i)]);
                  return (
                    <Fragment key={i}>
                      <tr
                        className="border-b sf-border-soft hover:sf-surface-elevated cursor-pointer"
                        onClick={() => toggleExpandedFetchPlan(String(i))}
                      >
                        <td className="py-1.5 px-2 text-right font-mono sf-text-subtle">{row.rank}</td>
                        <td className="py-1.5 px-4 font-mono sf-text-primary truncate max-w-[24rem]" title={row.url}>
                          <span className="sf-text-caption sf-text-subtle mr-1">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                          {row.domain}
                          <span className="sf-text-subtle">/{row.url.split('/').slice(3).join('/')}</span>
                        </td>
                        <td className="py-1.5 px-4">
                          <Chip label={row.host_trust_class || '-'} className={safetyClassBadgeClass(row.host_trust_class === 'official' || row.host_trust_class === 'trusted_specdb' ? 'safe' : row.host_trust_class === 'unknown' ? 'caution' : 'safe')} />
                        </td>
                        <td className="py-1.5 px-4">
                          <Chip label={row.triage_disposition?.replace(/_/g, ' ') || '-'} className="sf-chip-neutral" />
                        </td>
                        <td className="py-1.5 px-4 text-right font-mono sf-text-primary">{Math.round(row.score)}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="sf-surface-panel border-b sf-border-soft">
                          <td />
                          <td colSpan={4} className="py-2 px-4 pl-8 space-y-1">
                            <div className="sf-text-caption font-mono sf-link-accent break-all">{row.url}</div>
                            {row.title && <div className="sf-text-caption sf-text-muted">{row.title}</div>}
                            <div className="flex flex-wrap gap-2 mt-1">
                              {row.doc_kind_guess && <Chip label={row.doc_kind_guess.replace(/_/g, ' ')} className="sf-chip-accent" />}
                              <span className="sf-text-caption sf-text-subtle">query: {row.query}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Domain Detail Drawer ── */}
      {selectedDomain && (
        <DomainDetailDrawer
          domain={selectedDomain}
          onClose={() => setSelectedDomainKey(null)}
        />
      )}

      {/* ── Debug ── */}
      {hasStructured && (
        <DebugJsonDetails label="raw domain classifier json" data={health} />
      )}
    </div>
  );
}
