import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import type { PrefetchLlmCall, BrandResolutionData, BrandCandidate, PrefetchLiveSettings } from '../types';
import { llmCallStatusBadgeClass, formatMs, pctString } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';
import { StatCard } from '../components/StatCard';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';
import { Tip } from '../../../components/common/Tip';

interface PrefetchBrandResolverPanelProps {
  calls: PrefetchLlmCall[];
  brandResolution?: BrandResolutionData | null;
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
}

const SKIP_REASON_LABELS: Record<string, string> = {
  no_brand_in_identity_lock: 'No brand name was found in the product identity lock.',
  llm_disabled: 'LLM processing is turned off in the current configuration.',
  no_api_key_for_triage_role: 'No API key is configured for the triage LLM role.',
};

function statusBadgeClass(status: string) {
  switch (status) {
    case 'resolved':
      return 'sf-chip-success';
    case 'resolved_empty':
      return 'sf-chip-warning';
    case 'failed':
      return 'sf-chip-danger';
    case 'skipped':
      return 'sf-chip-neutral';
    default:
      return 'sf-chip-neutral';
  }
}

function confidenceColorClass(confidence: number): string {
  if (confidence >= 0.8) return 'sf-metric-ring-success';
  if (confidence >= 0.5) return 'sf-metric-ring-warning';
  return 'sf-metric-ring-danger';
}


function buildReasoningBullets(br: BrandResolutionData): string[] {
  const reasoning = br.reasoning ?? [];
  if (reasoning.length > 0) return reasoning;

  const bullets: string[] = [];
  if (br.official_domain) {
    bullets.push(`Resolved official domain: ${br.official_domain}`);
  }
  if (br.confidence > 0) {
    bullets.push(`Confidence: ${Math.round(br.confidence * 100)}%`);
  }
  if (br.aliases.length > 0) {
    bullets.push(`${br.aliases.length} alias${br.aliases.length > 1 ? 'es' : ''} identified: ${br.aliases.join(', ')}`);
  }
  if (br.support_domain) {
    bullets.push(`Support domain: ${br.support_domain}`);
  }
  return bullets;
}

function sourceLabel(calls: PrefetchLlmCall[], hasResolution: boolean): { text: string; badgeClass: string } {
  if (!hasResolution) return { text: '', badgeClass: '' };
  if (calls.length === 0) return { text: 'Cache', badgeClass: 'sf-chip-info' };
  return { text: 'LLM', badgeClass: 'sf-chip-warning' };
}

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
                "{s}"
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
          </div>
        </DrawerSection>
      )}
    </DrawerShell>
  );
}

export function PrefetchBrandResolverPanel({ calls, brandResolution, persistScope, liveSettings }: PrefetchBrandResolverPanelProps) {
  const br = brandResolution;
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
  const isLowConfidence = isResolved && br!.confidence < 0.7;
  const hasOfficialDomain = hasStructured && Boolean(br.official_domain);

  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);
  const source = sourceLabel(calls, hasStructured && (isResolved || isResolvedEmpty));

  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Brand Resolver</h3>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128270;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for brand resolution</div>
          <p className="max-w-md leading-relaxed sf-text-caption sf-text-subtle">
            Brand resolution will appear after the LLM identifies the official manufacturer domain and aliases.
            This allows search queries to use targeted site: filters for higher-quality Tier 1 sources.
          </p>
          {liveSettings?.phase2LlmEnabled !== undefined && (
            <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${liveSettings.phase2LlmEnabled ? 'sf-chip-neutral' : 'sf-chip-danger'}`}>
              LLM: {liveSettings.phase2LlmEnabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      {/* A) Header */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold sf-text-primary">
          Brand Resolver
          <Tip text="The Brand Resolver identifies the official manufacturer domain and aliases so search queries can use targeted site: filters for higher-quality sources." />
        </h3>
        {status && (
          <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${statusBadgeClass(status)}`}>
            {status === 'resolved_empty' ? 'no domain found' : status}
          </span>
        )}
        {!status && calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${llmCallStatusBadgeClass(calls[0].status)}`}>
            {calls[0].status}
          </span>
        )}
        {liveSettings?.phase2LlmEnabled !== undefined && (
          <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${
            liveSettings.phase2LlmEnabled
              ? 'sf-chip-warning'
              : 'sf-chip-danger'
          }`}>
            LLM: {liveSettings.phase2LlmEnabled ? 'ON' : 'OFF'}
          </span>
        )}
        {source.text && (
          <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${source.badgeClass} ml-auto`}>
            Source: {source.text}
          </span>
        )}
      </div>

      {/* Skipped Banner */}
      {isSkipped && (
        <div className="px-4 py-3 text-center sf-callout sf-callout-neutral">
          <div className="text-sm font-medium sf-text-muted">Brand resolution was skipped</div>
          <div className="mt-1 sf-text-caption sf-text-subtle">
            {SKIP_REASON_LABELS[br?.skip_reason || ''] || br?.skip_reason || 'Unknown reason'}
          </div>
        </div>
      )}

      {/* Failed Banner */}
      {isFailed && (
        <div className="px-4 py-3 sf-callout sf-callout-danger">
          <div className="text-sm font-medium sf-status-text-danger">Brand resolution failed</div>
          <div className="mt-1 sf-text-caption sf-status-text-danger">
            {br?.skip_reason || 'The LLM call did not return a usable result.'}
          </div>
          {br?.brand && (
            <div className="mt-1 sf-text-caption sf-text-muted">Brand attempted: {br.brand}</div>
          )}
        </div>
      )}

      {/* Resolved Empty Banner */}
      {isResolvedEmpty && (
        <div className="px-4 py-3 sf-callout sf-callout-warning">
          <div className="text-sm font-medium sf-status-text-warning">No official domain found</div>
          <div className="mt-1 sf-text-caption sf-status-text-warning">
            The LLM was unable to identify an official website for "{br?.brand}".
            Search queries will use generic patterns instead of targeted site: filters.
          </div>
        </div>
      )}

      {/* B) Hero Canonical Brand Card */}
      {hasOfficialDomain && (() => {
        const bullets = buildReasoningBullets(br!);
        return (
          <div className="sf-surface-card p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-lg font-bold sf-text-primary">{br!.brand}</div>
                <a href={`https://${br!.official_domain}`} target="_blank" rel="noopener noreferrer" className="mt-0.5 sf-text-caption sf-link-accent hover:underline">{br!.official_domain}</a>
                {br!.support_domain && (
                  <div className="sf-text-caption sf-text-subtle">Support: {br!.support_domain}</div>
                )}
                {br!.aliases.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {br!.aliases.map((a) => (
                      <span key={a} className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-accent">
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-center shrink-0">
                <div className="relative w-16 h-16">
                  <svg viewBox="0 0 36 36" className="w-16 h-16 transform -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="sf-text-subtle" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.5" fill="none"
                      stroke="currentColor"
                      className={confidenceColorClass(br!.confidence)}
                      strokeWidth="3"
                      strokeDasharray={`${br!.confidence * 97.4} 97.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold sf-text-primary">
                    {Math.round(br!.confidence * 100)}%
                  </div>
                </div>
                <div className="mt-0.5 sf-text-caption sf-text-subtle">Confidence</div>
              </div>
            </div>
            {bullets.length > 0 && (
              <div className="mt-3 border-t pt-3 sf-border-soft">
                <div className="mb-1.5 sf-text-caption font-medium uppercase tracking-wider sf-text-muted">Why we believe this</div>
                <ul className="space-y-1">
                  {bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5 sf-text-caption sf-text-muted">
                      <span className="mt-0.5 shrink-0 sf-status-text-success">&#8226;</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {/* C) StatCards Row */}
      {hasStructured && (isResolved || isResolvedEmpty) && (
        <div className="flex items-center gap-3 flex-wrap">
          <StatCard label="Confidence" value={pctString(br!.confidence)} tip="LLM confidence that the resolved brand and domain are correct. Below 70% triggers a low-confidence warning." />
          <StatCard label="Aliases" value={br!.aliases.length} tip="Known alternate names for this brand (e.g. 'Razer Inc', 'razer.com'). Used to match search results to the manufacturer." />
          <StatCard label="Candidates" value={br!.candidates.length} tip="Candidate manufacturer domains considered by the LLM before selecting the best match." />
          <StatCard label="LLM Calls" value={calls.length} tip="Number of LLM calls made during brand resolution. Usually one call unless retries were needed." />
          {totalTokens > 0 && <StatCard label="Tokens" value={totalTokens.toLocaleString()} tip="LLM tokens consumed (input + output) across all brand resolution calls." />}
          {totalDuration > 0 && <StatCard label="Duration" value={formatMs(totalDuration)} tip="Wall-clock time for the brand resolution step." />}
        </div>
      )}

      {/* D) Disambiguation Banner */}
      {isLowConfidence && (
        <div className="px-3 py-2 sf-callout sf-callout-warning">
          <div className="sf-text-caption font-medium sf-status-text-warning">
            Low confidence ({Math.round(br!.confidence * 100)}%) - brand identity may be ambiguous
          </div>
          <div className="mt-1 sf-text-caption sf-status-text-warning">
            Impact: Search queries will use generic patterns instead of targeted site: filters,
            reducing the chance of finding official manufacturer specification pages.
          </div>
          {br!.candidates.length > 0 && (
            <div className="mt-0.5 sf-text-caption sf-status-text-warning">
              Review the {br!.candidates.length} candidate{br!.candidates.length > 1 ? 's' : ''} below for alternative brand identities.
            </div>
          )}
        </div>
      )}

      {/* E) Candidates Table */}
      {hasStructured && br.candidates.length > 0 && (
        <div>
          <div className="mb-2 sf-text-caption font-medium sf-text-muted">Brand Candidates</div>
          <div className="overflow-hidden rounded border sf-border-default">
            <table className="w-full sf-text-caption">
              <thead>
                <tr className="sf-table-head">
                  <th className="px-3 py-2 sf-table-head-cell">Name</th>
                  <th className="w-32 px-3 py-2 sf-table-head-cell">Confidence</th>
                  <th className="px-3 py-2 sf-table-head-cell">Evidence</th>
                  <th className="px-3 py-2 sf-table-head-cell">Note</th>
                </tr>
              </thead>
              <tbody>
                {br.candidates.map((c, i) => (
                  <tr
                    key={i}
                    className="cursor-pointer border-t sf-border-soft sf-table-row"
                    onClick={() => setSelectedCandidateName(selectedCandidateName === c.name ? null : c.name)}
                  >
                    <td className="px-3 py-1.5 font-medium sf-text-primary">{c.name}</td>
                    <td className="px-3 py-1.5">
                      <ScoreBar value={c.confidence} max={1} label={c.confidence.toFixed(2)} />
                    </td>
                    <td className="px-3 py-1.5 sf-text-muted">{c.evidence_snippets.length} snippets</td>
                    <td className="max-w-[12rem] truncate px-3 py-1.5 sf-text-muted">{c.disambiguation_note || '-'}</td>
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

      {/* F) LLM Call Details (collapsible) */}
      {calls.length > 0 && (
        <details className="sf-text-caption">
          <summary className="font-medium sf-summary-toggle">
            LLM Call Details ({calls.length} call{calls.length > 1 ? 's' : ''})
          </summary>
          <div className="mt-2 space-y-2">
            {calls.map((call, i) => (
              <div key={i} className="rounded border sf-border-default p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${llmCallStatusBadgeClass(call.status)}`}>
                    {call.status}
                  </span>
                  {call.model && (
                    <span className="font-mono sf-text-caption sf-text-muted">{call.model}</span>
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
                  <div className="mt-1 sf-text-caption sf-status-text-danger">{call.error}</div>
                )}
                {call.prompt_preview && (
                  <div className="mt-2">
                    <div className="sf-text-caption font-medium uppercase sf-text-subtle">Prompt</div>
                    <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded p-2 font-mono sf-text-caption sf-pre-block">{call.prompt_preview}</pre>
                  </div>
                )}
                {call.response_preview && (
                  <div className="mt-1">
                    <div className="sf-text-caption font-medium uppercase sf-text-subtle">Response</div>
                    <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded p-2 font-mono sf-text-caption sf-pre-block">{call.response_preview}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* G) Debug: Raw JSON (collapsible) */}
      {hasStructured && (
        <details className="sf-text-caption">
          <summary className="sf-summary-toggle">
            Debug: Raw JSON
          </summary>
          <div className="mt-2">
            <pre className="max-h-40 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded p-2 font-mono sf-text-caption sf-pre-block">{JSON.stringify(br, null, 2)}</pre>
          </div>
        </details>
      )}
    </div>
  );
}
