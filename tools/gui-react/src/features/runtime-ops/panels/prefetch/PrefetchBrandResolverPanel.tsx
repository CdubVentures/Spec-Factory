import { usePersistedToggle } from '../../../../stores/collapseStore';
import type { PrefetchLlmCall, BrandResolutionData, PrefetchLiveSettings } from '../../types';
import { llmCallStatusBadgeClass, formatMs, pctString } from '../../helpers';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
import { LlmCallCard } from '../../components/LlmCallCard';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader';
import { Chip } from '../../../../shared/ui/feedback/Chip';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails';
import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand';
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

function brandResolutionBadgeClass(status: string): string {
  if (status === 'resolved') return 'sf-chip-success';
  if (status === 'resolved_empty') return 'sf-chip-warning';
  if (status === 'failed') return 'sf-chip-danger';
  return 'sf-chip-neutral';
}

function confidenceColorClass(confidence: number | null): string {
  if (confidence == null) return 'sf-metric-ring-muted';
  if (confidence >= 0.8) return 'sf-metric-ring-success';
  if (confidence >= 0.5) return 'sf-metric-ring-warning';
  return 'sf-metric-ring-danger';
}

function confidenceStatColor(confidence: number | null): string {
  if (confidence == null) return 'sf-text-muted';
  if (confidence >= 0.8) return 'text-[var(--sf-state-success-fg)]';
  if (confidence >= 0.5) return 'text-[var(--sf-state-warning-fg)]';
  return 'text-[var(--sf-state-error-fg)]';
}

function buildReasoningBullets(br: BrandResolutionData): string[] {
  const reasoning = br.reasoning ?? [];
  if (reasoning.length > 0) return reasoning;
  const bullets: string[] = [];
  if (br.official_domain) bullets.push(`Resolved official domain: ${br.official_domain}`);
  if ((br.confidence ?? 0) > 0) bullets.push(`Confidence: ${Math.round((br.confidence ?? 0) * 100)}%`);
  if (br.aliases.length > 0) bullets.push(`${br.aliases.length} alias${br.aliases.length > 1 ? 'es' : ''} identified: ${br.aliases.join(', ')}`);
  if (br.support_domain) bullets.push(`Support domain: ${br.support_domain}`);
  return bullets;
}

function sourceLabel(calls: PrefetchLlmCall[], hasResolution: boolean): { text: string; badgeClass: string } {
  if (!hasResolution) return { text: '', badgeClass: '' };
  if (calls.length === 0) return { text: 'Cache', badgeClass: 'sf-chip-info' };
  return { text: 'LLM', badgeClass: 'sf-chip-warning' };
}

/* ── Main Panel ─────────────────────────────────────────────────────── */

export function PrefetchBrandResolverPanel({ calls, brandResolution, persistScope, liveSettings, idxRuntime }: PrefetchBrandResolverPanelProps) {
  const br = brandResolution;
  const [llmCallsOpen, toggleLlmCallsOpen] = usePersistedToggle(`runtimeOps:brandResolver:llmCalls:${persistScope}`, false);
  const hasStructured = br !== null && br !== undefined;
  const status = br?.status || '';
  const isResolved = status === 'resolved';
  const isSkipped = status === 'skipped';
  const isFailed = status === 'failed';
  const isResolvedEmpty = status === 'resolved_empty';
  const isLowConfidence = isResolved && br!.confidence != null && br!.confidence < 0.7;
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
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* ── Hero Band ─────────────────────────────────────── */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Brand Resolver</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Domain Resolution</span>
          {status && (
            <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.06em] ${brandResolutionBadgeClass(status)} border-[1.5px] border-current`}>
              {status === 'resolved_empty' ? 'no domain found' : status}
            </span>
          )}
          {!status && calls.length > 0 && (
            <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.06em] ${llmCallStatusBadgeClass(calls[0].status)} border-[1.5px] border-current`}>
              {calls[0].status}
            </span>
          )}
        </>}
        trailing={<>
          <Chip label="LLM" className="sf-chip-warning" />
          {source.text && (
            <Chip label={`source: ${source.text.toLowerCase()}`} className={source.badgeClass} />
          )}
          <Tip text="The Brand Resolver identifies the official manufacturer domain and aliases so search queries can use targeted site: filters for higher-quality sources." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        {/* Big stat numbers — 4-col grid with colored values */}
        {hasStructured && (isResolved || isResolvedEmpty) && (
          <HeroStatGrid>
            <HeroStat value={br!.confidence != null ? pctString(br!.confidence) : 'N/A'} label="confidence" colorClass={confidenceStatColor(br!.confidence)} />
            <HeroStat value={br!.aliases.length} label="aliases found" />
            <HeroStat value={calls.length} label="llm calls" colorClass="sf-text-primary" />
          </HeroStatGrid>
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
      </HeroBand>

      {/* ── Disambiguation Warning ─────────────────────────── */}
      {isLowConfidence && (
        <div className="px-4 py-3.5 rounded-sm border border-[var(--sf-state-warning-border)] bg-[var(--sf-state-warning-bg)]">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl leading-none">{'\u26a0'}</span>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--sf-state-warning-fg)]">
                Low confidence ({Math.round((br?.confidence ?? 0) * 100)}%) &mdash; brand identity may be ambiguous
              </div>
              <div className="mt-1 text-xs sf-text-muted">
                Search queries will use generic patterns instead of targeted site: filters,
                reducing the chance of finding official manufacturer specification pages.
              </div>
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
                        strokeDasharray={`${(br!.confidence ?? 0) * 97.4} 97.4`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-bold sf-text-primary">
                      {br!.confidence != null ? `${Math.round(br!.confidence * 100)}%` : 'N/A'}
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

      {/* ── LLM Call Details ───────────────────────────────── */}
      {calls.length > 0 && (
        <div>
          <CollapsibleSectionHeader isOpen={llmCallsOpen} onToggle={toggleLlmCallsOpen} summary={<>{calls.length} call{calls.length !== 1 ? 's' : ''}{totalTokens > 0 && <> &middot; {totalTokens.toLocaleString()} tok</>}{totalDuration > 0 && <> &middot; {formatMs(totalDuration)}</>}</>}>llm call details</CollapsibleSectionHeader>

          {llmCallsOpen && (
            <div className="mt-3 space-y-2">
              {calls.map((call, i) => (
                <LlmCallCard key={i} call={call} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Debug ─────────────────────────────────────────── */}
      {hasStructured && (
        <DebugJsonDetails label="raw brand resolver json" data={br} />
      )}
    </div>
  );
}
