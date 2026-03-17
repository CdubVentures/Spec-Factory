import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../../stores/tabStore';
import { usePersistedToggle } from '../../../../stores/collapseStore';
import type { PrefetchLlmCall, BrandResolutionData, BrandCandidate, PrefetchLiveSettings } from '../../types';
import { llmCallStatusBadgeClass, formatMs, pctString } from '../../helpers';
import { ScoreBar } from '../../components/ScoreBar';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import type { RuntimeIdxBadge } from '../../types';

/* ── Props ──────────────────────────────────────────────────────────── */

interface PrefetchBrandResolverPanelProps {
  calls: PrefetchLlmCall[];
  brandResolution?: BrandResolutionData | null;
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
  idxRuntime?: RuntimeIdxBadge[];
}

/* ── Constants ──────────────────────────────────────────────────────── */

const SKIP_REASON_LABELS: Record<string, string> = {
  no_brand_in_identity_lock: 'No brand name was found in the product identity lock.',
  no_api_key_for_triage_role: 'No API key is configured for the triage LLM role.',
};

/* ── Theme-aligned badge helpers ───────────────────────────────────── */

function statusBadgeClass(status: string): string {
  if (status === 'resolved') return 'sf-chip-success';
  if (status === 'resolved_empty') return 'sf-chip-warning';
  if (status === 'failed') return 'sf-chip-danger';
  return 'sf-chip-neutral';
}

function confidenceColorClass(confidence: number): string {
  if (confidence >= 0.8) return 'sf-metric-ring-success';
  if (confidence >= 0.5) return 'sf-metric-ring-warning';
  return 'sf-metric-ring-danger';
}

function confidenceStatColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-[var(--sf-state-success-fg)]';
  if (confidence >= 0.5) return 'text-[var(--sf-state-warning-fg)]';
  return 'text-[var(--sf-state-error-fg)]';
}

function buildReasoningBullets(br: BrandResolutionData): string[] {
  const reasoning = br.reasoning ?? [];
  if (reasoning.length > 0) return reasoning;
  const bullets: string[] = [];
  if (br.official_domain) bullets.push(`Resolved official domain: ${br.official_domain}`);
  if (br.confidence > 0) bullets.push(`Confidence: ${Math.round(br.confidence * 100)}%`);
  if (br.aliases.length > 0) bullets.push(`${br.aliases.length} alias${br.aliases.length > 1 ? 'es' : ''} identified: ${br.aliases.join(', ')}`);
  if (br.support_domain) bullets.push(`Support domain: ${br.support_domain}`);
  return bullets;
}

function sourceLabel(calls: PrefetchLlmCall[], hasResolution: boolean): { text: string; badgeClass: string } {
  if (!hasResolution) return { text: '', badgeClass: '' };
  if (calls.length === 0) return { text: 'Cache', badgeClass: 'sf-chip-info' };
  return { text: 'LLM', badgeClass: 'sf-chip-warning' };
}

/* ── Section header (matches NeedSet) ─────────────────────────────── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 pt-2 pb-1.5 mb-3 border-b-[1.5px] border-[var(--sf-token-text-primary)]">
      <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary">{children}</span>
    </div>
  );
}

/* ── Candidate Drawer ─────────────────────────────────────────────── */

function CandidateDrawer({ candidate, call, onClose }: { candidate: BrandCandidate; call?: PrefetchLlmCall; onClose: () => void }) {
  return (
    <DrawerShell title={candidate.name} subtitle="Brand Candidate" onClose={onClose}>
      <DrawerSection title="Confidence">
        <ScoreBar value={candidate.confidence} max={1} label={candidate.confidence.toFixed(2)} />
      </DrawerSection>
      {candidate.evidence_snippets.length > 0 && (
        <DrawerSection title="Evidence Snippets">
          <div className="space-y-1">
            {candidate.evidence_snippets.map((s, i) => (
              <div key={i} className="rounded p-2 italic sf-text-caption sf-pre-block">
                &ldquo;{s}&rdquo;
              </div>
            ))}
          </div>
        </DrawerSection>
      )}
      {candidate.disambiguation_note && (
        <DrawerSection title="Disambiguation">
          <div className="sf-text-caption sf-text-muted">{candidate.disambiguation_note}</div>
        </DrawerSection>
      )}
      {call && (
        <DrawerSection title="LLM Context">
          <div className="grid grid-cols-2 gap-1 sf-text-caption">
            <span className="sf-text-muted">Model</span>
            <span className="font-mono">{call.model || '-'}</span>
            <span className="sf-text-muted">Provider</span>
            <span className="font-mono">{call.provider || '-'}</span>
            {call.tokens && (
              <>
                <span className="sf-text-muted">Tokens</span>
                <span className="font-mono">{call.tokens.input}+{call.tokens.output}</span>
              </>
            )}
            {call.duration_ms !== undefined && (
              <>
                <span className="sf-text-muted">Duration</span>
                <span className="font-mono">{formatMs(call.duration_ms)}</span>
              </>
            )}
          </div>
        </DrawerSection>
      )}
    </DrawerShell>
  );
}

/* ── Main Panel ─────────────────────────────────────────────────────── */

export function PrefetchBrandResolverPanel({ calls, brandResolution, persistScope, liveSettings, idxRuntime }: PrefetchBrandResolverPanelProps) {
  const br = brandResolution;
  const llmBadgeEnabled: boolean | undefined = true;
  const [llmCallsOpen, toggleLlmCallsOpen] = usePersistedToggle(`runtimeOps:brandResolver:llmCalls:${persistScope}`, false);
  const candidateValues = useMemo(
    () => (br?.candidates ?? []).map((candidate) => candidate.name),
    [br?.candidates],
  );
  const [selectedCandidateName, setSelectedCandidateName] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:brandResolver:selectedCandidate:${persistScope}`,
    null,
    { validValues: candidateValues },
  );
  const selectedCandidate = useMemo(
    () => (selectedCandidateName ? (br?.candidates ?? []).find((candidate) => candidate.name === selectedCandidateName) ?? null : null),
    [br?.candidates, selectedCandidateName],
  );
  const hasStructured = br !== null && br !== undefined;
  const status = br?.status || '';
  const isResolved = status === 'resolved';
  const isSkipped = status === 'skipped';
  const isFailed = status === 'failed';
  const isResolvedEmpty = status === 'resolved_empty';
  const forcedLlmOffFromSkip = isSkipped && br?.skip_reason === 'no_api_key_for_triage_role';
  const effectiveLlmBadgeEnabled = forcedLlmOffFromSkip ? false : llmBadgeEnabled;
  const isLowConfidence = isResolved && br!.confidence < 0.7;
  const hasOfficialDomain = hasStructured && Boolean(br.official_domain);

  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);
  const source = sourceLabel(calls, hasStructured && (isResolved || isResolvedEmpty));

  /* ── Empty state ──────────────────────────────────────────────────── */
  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Brand Resolver</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128270;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for brand resolution</div>
          <p className="max-w-md leading-relaxed sf-text-caption sf-text-subtle">
            Brand resolution will appear after the LLM identifies the official manufacturer domain and aliases.
            This allows search queries to use targeted site: filters for higher-quality Tier 1 sources.
          </p>
          {llmBadgeEnabled !== undefined && (
            <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${llmBadgeEnabled ? 'sf-chip-neutral' : 'sf-chip-danger'}`}>
              LLM Runtime: {llmBadgeEnabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* ── Hero Band ─────────────────────────────────────── */}
      <div className="sf-surface-elevated rounded-sm border sf-border-soft px-7 py-6 space-y-5">
        {/* Title row */}
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
          <div className="flex items-baseline gap-3">
            <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Brand Resolver</span>
            <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Domain Resolution</span>
            {status && (
              <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.06em] ${statusBadgeClass(status)} border-[1.5px] border-current`}>
                {status === 'resolved_empty' ? 'no domain found' : status}
              </span>
            )}
            {!status && calls.length > 0 && (
              <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.06em] ${llmCallStatusBadgeClass(calls[0].status)} border-[1.5px] border-current`}>
                {calls[0].status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {effectiveLlmBadgeEnabled !== undefined && (
              <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.06em] ${effectiveLlmBadgeEnabled ? 'sf-chip-warning' : 'sf-chip-danger'} border-[1.5px] border-current`}>
                llm {effectiveLlmBadgeEnabled ? 'on' : 'off'}
              </span>
            )}
            {source.text && (
              <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.06em] ${source.badgeClass} border-[1.5px] border-current`}>
                source: {source.text.toLowerCase()}
              </span>
            )}
            <Tip text="The Brand Resolver identifies the official manufacturer domain and aliases so search queries can use targeted site: filters for higher-quality sources." />
          </div>
        </div>

        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        {/* Big stat numbers — 4-col grid with colored values */}
        {hasStructured && (isResolved || isResolvedEmpty) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-5">
            <div>
              <div className={`text-4xl font-bold leading-none tracking-tight ${confidenceStatColor(br!.confidence)}`}>
                {pctString(br!.confidence)}
              </div>
              <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">confidence</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-[var(--sf-token-accent)] leading-none tracking-tight">{br!.aliases.length}</div>
              <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">aliases found</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-[var(--sf-token-accent)] leading-none tracking-tight">{br!.candidates.length}</div>
              <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">candidates</div>
            </div>
            <div>
              <div className="text-4xl font-bold sf-text-primary leading-none tracking-tight">{calls.length}</div>
              <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">llm calls</div>
            </div>
          </div>
        )}

        {/* Narrative */}
        {hasStructured && isResolved && hasOfficialDomain && (
          <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
            Resolved <strong className="sf-text-primary not-italic">{br!.brand}</strong> to{' '}
            <strong className="sf-text-primary not-italic">{br!.official_domain}</strong>
            {br!.aliases.length > 0 && (
              <> with {br!.aliases.length} known alias{br!.aliases.length > 1 ? 'es' : ''}</>
            )}
            {br!.support_domain && (
              <> and support domain <strong className="sf-text-primary not-italic">{br!.support_domain}</strong></>
            )}
            {' '}&mdash; search queries will use targeted <code className="text-[11px] font-mono sf-text-primary">site:</code> filters for higher-quality Tier 1 sources.
            {totalTokens > 0 && (
              <> Used {totalTokens.toLocaleString()} tokens in {formatMs(totalDuration)}.</>
            )}
          </div>
        )}
        {hasStructured && isResolvedEmpty && (
          <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
            Unable to identify an official website for <strong className="sf-text-primary not-italic">{br!.brand}</strong>
            {' '}&mdash; search queries will fall back to generic patterns instead of targeted site: filters.
          </div>
        )}
        {hasStructured && isSkipped && (
          <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
            Brand resolution was skipped &mdash; {SKIP_REASON_LABELS[br!.skip_reason || ''] || br!.skip_reason || 'unknown reason'}.
          </div>
        )}
        {hasStructured && isFailed && (
          <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
            Brand resolution failed{br!.brand ? ` for "${br!.brand}"` : ''} &mdash;{' '}
            {br!.skip_reason || 'the LLM call did not return a usable result.'}
          </div>
        )}
      </div>

      {/* ── Disambiguation Warning ─────────────────────────── */}
      {isLowConfidence && (
        <div className="px-4 py-3.5 rounded-sm border border-[var(--sf-state-warning-border)] bg-[var(--sf-state-warning-bg)]">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl leading-none">{'\u26a0'}</span>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--sf-state-warning-fg)]">
                Low confidence ({Math.round(br!.confidence * 100)}%) &mdash; brand identity may be ambiguous
              </div>
              <div className="mt-1 text-xs sf-text-muted">
                Search queries will use generic patterns instead of targeted site: filters,
                reducing the chance of finding official manufacturer specification pages.
              </div>
              {br!.candidates.length > 0 && (
                <div className="mt-0.5 text-xs sf-text-muted">
                  Review the {br!.candidates.length} candidate{br!.candidates.length > 1 ? 's' : ''} below for alternative brand identities.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Resolved Brand Card ────────────────────────────── */}
      {hasOfficialDomain && (() => {
        const bullets = buildReasoningBullets(br!);
        return (
          <div>
            <SectionHeader>resolved identity</SectionHeader>
            <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4">
              <div className="grid gap-4" style={{ gridTemplateColumns: '1fr auto' }}>
                {/* Left: brand info */}
                <div className="min-w-0">
                  <div className="text-[22px] font-bold sf-text-primary leading-tight tracking-tight">{br!.brand}</div>
                  <a
                    href={`https://${br!.official_domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-[13px] font-mono text-[var(--sf-token-accent)] hover:underline"
                  >
                    {br!.official_domain}
                  </a>
                  {br!.support_domain && (
                    <div className="mt-0.5 text-[11px] font-mono sf-text-subtle">support: {br!.support_domain}</div>
                  )}
                  {br!.aliases.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {br!.aliases.map((a) => (
                        <span key={a} className="px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.04em] sf-chip-accent border-[1.5px] border-current">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: confidence ring */}
                <div className="text-center shrink-0">
                  <div className="relative w-20 h-20">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 transform -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="sf-text-subtle" strokeWidth="2.5" />
                      <circle
                        cx="18" cy="18" r="15.5" fill="none"
                        stroke="currentColor"
                        className={confidenceColorClass(br!.confidence)}
                        strokeWidth="2.5"
                        strokeDasharray={`${br!.confidence * 97.4} 97.4`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-bold sf-text-primary">
                      {Math.round(br!.confidence * 100)}%
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] sf-text-subtle">confidence</div>
                </div>
              </div>

              {/* Reasoning bullets */}
              {bullets.length > 0 && (
                <div className="mt-4 pt-3.5 border-t sf-border-soft">
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">why we believe this</div>
                  <ul className="space-y-1.5">
                    {bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs sf-text-muted">
                        <span className="mt-0.5 shrink-0 text-[var(--sf-state-success-fg)]">{'\u2022'}</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Inline stat row */}
              {(totalTokens > 0 || totalDuration > 0) && (
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted pt-3.5 mt-3.5 border-t sf-border-soft">
                  {totalTokens > 0 && <span>tokens <strong className="sf-text-primary">{totalTokens.toLocaleString()}</strong></span>}
                  {totalDuration > 0 && <span>duration <strong className="sf-text-primary">{formatMs(totalDuration)}</strong></span>}
                  <span>source <strong className="sf-text-primary">{source.text || 'n/a'}</strong></span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Skipped / Failed state cards (non-resolved) ──── */}
      {isSkipped && !hasOfficialDomain && (
        <div>
          <SectionHeader>resolution status</SectionHeader>
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 text-center space-y-2">
            <div className="text-[22px] font-bold sf-text-muted leading-none">{'\u25CB'}</div>
            <div className="text-xs font-bold uppercase tracking-[0.06em] sf-text-muted">skipped</div>
            <div className="text-xs sf-text-subtle">
              {SKIP_REASON_LABELS[br?.skip_reason || ''] || br?.skip_reason || 'Unknown reason'}
            </div>
          </div>
        </div>
      )}

      {isFailed && !hasOfficialDomain && (
        <div>
          <SectionHeader>resolution status</SectionHeader>
          <div className="px-5 py-4 rounded-sm border border-[var(--sf-state-error-border)] bg-[var(--sf-state-error-bg)] text-center space-y-2">
            <div className="text-[22px] font-bold text-[var(--sf-state-error-fg)] leading-none">{'\u2298'}</div>
            <div className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--sf-state-error-fg)]">failed</div>
            <div className="text-xs sf-text-muted">
              {br?.skip_reason || 'The LLM call did not return a usable result.'}
            </div>
            {br?.brand && (
              <div className="text-xs sf-text-subtle">Brand attempted: {br.brand}</div>
            )}
          </div>
        </div>
      )}

      {isResolvedEmpty && !hasOfficialDomain && (
        <div>
          <SectionHeader>resolution status</SectionHeader>
          <div className="px-5 py-4 rounded-sm border border-[var(--sf-state-warning-border)] bg-[var(--sf-state-warning-bg)] text-center space-y-2">
            <div className="text-[22px] font-bold text-[var(--sf-state-warning-fg)] leading-none">{'\u25D0'}</div>
            <div className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--sf-state-warning-fg)]">no domain found</div>
            <div className="text-xs sf-text-muted">
              The LLM was unable to identify an official website for &ldquo;{br?.brand}&rdquo;.
              Search queries will use generic patterns instead of targeted site: filters.
            </div>
          </div>
        </div>
      )}

      {/* ── Brand Candidates ───────────────────────────────── */}
      {hasStructured && br.candidates.length > 0 && (
        <div>
          <SectionHeader>brand candidates</SectionHeader>
          <div className="overflow-x-auto overflow-y-auto max-h-[56rem] border sf-border-soft rounded-sm">
            <table className="min-w-full text-xs">
              <thead className="sf-surface-elevated sticky top-0">
                <tr>
                  {['name', 'confidence', 'evidence', 'disambiguation'].map(h => (
                    <th key={h} className="py-2 px-5 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {br.candidates.map((c, i) => (
                  <tr
                    key={i}
                    className="cursor-pointer border-b sf-border-soft hover:sf-surface-elevated"
                    onClick={() => setSelectedCandidateName(selectedCandidateName === c.name ? null : c.name)}
                  >
                    <td className="py-1.5 px-5 font-mono font-medium sf-text-primary">{c.name}</td>
                    <td className="py-1.5 px-5 w-36">
                      <ScoreBar value={c.confidence} max={1} label={c.confidence.toFixed(2)} />
                    </td>
                    <td className="py-1.5 px-5">
                      <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.08em] sf-chip-info">
                        {c.evidence_snippets.length} snippet{c.evidence_snippets.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="py-1.5 px-5 max-w-[14rem] truncate sf-text-muted">{c.disambiguation_note || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedCandidate && (
        <CandidateDrawer
          candidate={selectedCandidate}
          call={calls[0]}
          onClose={() => setSelectedCandidateName(null)}
        />
      )}

      {/* ── LLM Call Details ───────────────────────────────── */}
      {calls.length > 0 && (
        <div>
          <div
            onClick={toggleLlmCallsOpen}
            className="flex items-baseline gap-2 pt-2 pb-1.5 border-b-[1.5px] border-[var(--sf-token-text-primary)] cursor-pointer select-none"
          >
            <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary flex-1">llm call details</span>
            <span className="text-[11px] font-mono sf-text-subtle">
              {calls.length} call{calls.length !== 1 ? 's' : ''}
              {totalTokens > 0 && <> &middot; {totalTokens.toLocaleString()} tok</>}
              {totalDuration > 0 && <> &middot; {formatMs(totalDuration)}</>}
              {' '}&middot; {llmCallsOpen ? 'collapse \u25B4' : 'expand \u25BE'}
            </span>
          </div>

          {llmCallsOpen && (
            <div className="mt-3 space-y-2">
              {calls.map((call, i) => (
                <div key={i} className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-3.5 space-y-2">
                  {/* Call header row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold font-mono uppercase tracking-[0.06em] ${llmCallStatusBadgeClass(call.status)} border-[1.5px] border-current`}>
                      {call.status}
                    </span>
                    {call.model && (
                      <span className="text-[11px] font-mono sf-text-muted">{call.model}</span>
                    )}
                    {call.provider && (
                      <span className="text-[11px] font-mono sf-text-subtle">{call.provider}</span>
                    )}
                    <span className="ml-auto flex items-baseline gap-3 text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted">
                      {call.tokens && <span>tok <strong className="sf-text-primary">{call.tokens.input}+{call.tokens.output}</strong></span>}
                      {call.duration_ms !== undefined && <span>dur <strong className="sf-text-primary">{formatMs(call.duration_ms)}</strong></span>}
                    </span>
                  </div>
                  {call.error && (
                    <div className="px-3 py-2 rounded-sm border border-[var(--sf-state-error-border)] bg-[var(--sf-state-error-bg)] text-xs text-[var(--sf-state-error-fg)]">
                      {call.error}
                    </div>
                  )}
                  {call.prompt_preview && (
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle mb-1">prompt</div>
                      <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded-sm p-3 font-mono text-[11px] sf-pre-block">{call.prompt_preview}</pre>
                    </div>
                  )}
                  {call.response_preview && (
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle mb-1">response</div>
                      <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded-sm p-3 font-mono text-[11px] sf-pre-block">{call.response_preview}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Debug ─────────────────────────────────────────── */}
      {hasStructured && (
        <details className="text-xs">
          <summary className="cursor-pointer sf-summary-toggle flex items-baseline gap-2 pb-1.5 border-b border-dashed sf-border-soft select-none">
            <span className="text-[10px] font-semibold font-mono sf-text-subtle tracking-[0.04em] uppercase">debug &middot; raw brand resolver json</span>
          </summary>
          <pre className="mt-3 sf-pre-block text-xs font-mono rounded-sm p-4 overflow-x-auto overflow-y-auto max-h-[25rem] whitespace-pre-wrap break-all">
            {JSON.stringify(br, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
