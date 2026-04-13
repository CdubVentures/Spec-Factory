import { useState } from 'react';
import { pct } from '../../../utils/formatting.ts';
import { confidenceColorClass, trafficColor, trafficTextColor, sourceBadgeClass, SOURCE_BADGE_FALLBACK } from '../../../utils/colors.ts';
import { hasKnownValue } from '../../../utils/fieldNormalize.ts';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import {
  DrawerShell,
  DrawerSection,
  DrawerCard,
  DrawerManualOverride,
} from '../../../shared/ui/overlay/DrawerShell.tsx';
import type { ReviewCandidate } from '../../../types/review.ts';

// ── Helpers ─────────────────────────────────────────────────────────

function extractHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function compactId(value: string, max = 28): string {
  const token = String(value || '').trim();
  if (!token || token.length <= max) return token;
  return `${token.slice(0, 12)}...${token.slice(-8)}`;
}

// ── Props ───────────────────────────────────────────────────────────

interface FieldReviewDrawerProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  currentValue: {
    value: string;
    confidence: number;
    color: 'green' | 'yellow' | 'red' | 'gray';
    source?: string;
    sourceTimestamp?: string | null;
    overridden?: boolean;
  };
  onManualOverride: (value: string) => void;
  isPending: boolean;
  candidates: ReviewCandidate[];
  candidatesLoading?: boolean;
  publishedValue?: unknown;
  onReviewSource?: (candidateId: string) => void;
  onRunAIReview?: () => void;
  aiReviewPending?: boolean;
}

// ── Collapsible source table (derived from resolved candidates) ─────

function PublishedSourceTable({ candidates }: { candidates: ReviewCandidate[] }) {
  const resolved = candidates.filter((c) => c.status === 'resolved');
  const [open, setOpen] = useState(false);

  if (resolved.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 sf-text-nano sf-text-subtle font-medium cursor-pointer select-none hover:text-blue-500 transition-colors"
      >
        <span className={`inline-block transition-transform text-[9px] ${open ? 'rotate-90' : ''}`}>&#9656;</span>
        {resolved.length} linked source{resolved.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <table className="mt-1.5 w-full text-[10px] border-collapse">
          <thead>
            <tr className="sf-text-subtle">
              <th className="text-left font-semibold py-1 px-1.5 border-b sf-border-subtle uppercase tracking-wide text-[9px]">Source</th>
              <th className="text-left font-semibold py-1 px-1.5 border-b sf-border-subtle uppercase tracking-wide text-[9px]">Model</th>
              <th className="text-left font-semibold py-1 px-1.5 border-b sf-border-subtle uppercase tracking-wide text-[9px]">Conf</th>
              <th className="text-left font-semibold py-1 px-1.5 border-b sf-border-subtle uppercase tracking-wide text-[9px]">Link</th>
            </tr>
          </thead>
          <tbody>
            {resolved
              .sort((a, b) => (b.score || 0) - (a.score || 0))
              .map((c, i) => (
                <tr key={`${c.candidate_id}-${i}`} className="sf-text-muted">
                  <td className="py-1 px-1.5 border-b sf-border-subtle">{c.source || '—'}</td>
                  <td className="py-1 px-1.5 border-b sf-border-subtle font-mono">{c.model || '—'}</td>
                  <td className="py-1 px-1.5 border-b sf-border-subtle font-mono font-semibold">{pct(c.score)}</td>
                  <td className="py-1 px-1.5 border-b sf-border-subtle">
                    {c.evidence_url ? (
                      <a href={c.evidence_url} target="_blank" rel="noreferrer" className="sf-review-link-accent hover:underline truncate max-w-[120px] inline-block">
                        {extractHost(c.evidence_url)} &#8599;
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── List value chips ────────────────────────────────────────────────

function ValueChips({ value, publishedValue }: { value: unknown; publishedValue: unknown }) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const publishedSet = new Set(Array.isArray(publishedValue) ? publishedValue.map(String) : []);
  const hasPublished = publishedSet.size > 0;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {value.map((item, i) => {
        const str = String(item);
        const inPublished = hasPublished && publishedSet.has(str);
        return (
          <span
            key={`${str}-${i}`}
            className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
              inPublished
                ? 'sf-chip-success'
                : hasPublished
                  ? 'border border-dashed sf-border-subtle sf-text-subtle'
                  : 'sf-chip-neutral'
            }`}
          >
            {str}
          </span>
        );
      })}
    </div>
  );
}

// ── Candidate card ──────────────────────────────────────────────────

function CandidateCard({
  candidate,
  publishedValue,
  onReviewSource,
}: {
  candidate: ReviewCandidate;
  publishedValue: unknown;
  onReviewSource?: (candidateId: string) => void;
}) {
  const isResolved = candidate.status === 'resolved';
  const cardClass = isResolved ? 'sf-candidate-resolved' : '';
  const dateStr = formatDate(candidate.submitted_at);
  const host = candidate.evidence_url ? extractHost(candidate.evidence_url) : '';
  const meta = candidate.metadata;
  const hasMeta = meta && typeof meta === 'object' && Object.keys(meta).length > 0
    && !(Object.keys(meta).length === 1 && 'evidence' in meta)
    && !(Object.keys(meta).length === 2 && 'evidence' in meta && 'method' in meta);

  return (
    <DrawerCard className={cardClass}>
      {/* Value + confidence badge */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold flex-1 truncate" title={String(candidate.value)}>
          {String(candidate.value)}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono min-w-[2.2rem] text-center ${confidenceColorClass(candidate.score)}`}>
          {pct(candidate.score)}
        </span>
      </div>

      {/* List value chips */}
      {Array.isArray(candidate.value) && (
        <ValueChips value={candidate.value} publishedValue={publishedValue} />
      )}

      {/* Method + model */}
      {(candidate.source || candidate.model) && (
        <div className="flex items-center gap-1.5 text-xs sf-text-muted mt-0.5">
          {candidate.source && <span>{candidate.source}</span>}
          {candidate.source && candidate.model && <span className="sf-text-subtle text-[8px]">&bull;</span>}
          {candidate.model && <span className="font-mono">{candidate.model}</span>}
        </div>
      )}

      {/* Source URL */}
      {candidate.evidence_url && (
        <div className="flex items-center gap-1.5 mt-0.5">
          <a
            href={candidate.evidence_url}
            target="_blank"
            rel="noreferrer"
            className="sf-review-link-accent hover:underline text-xs truncate"
            title={candidate.evidence_url}
          >
            {host || candidate.evidence_url}
          </a>
          <span className="sf-text-subtle text-[10px] shrink-0">&#8599;</span>
        </div>
      )}

      {/* Metadata block */}
      {hasMeta && (
        <div className="text-[10px] sf-text-muted font-mono leading-relaxed p-1.5 rounded sf-review-evidence-card mt-0.5">
          {Object.entries(meta as Record<string, unknown>)
            .filter(([k]) => k !== 'evidence' && k !== 'method')
            .map(([k, v]) => (
              <div key={k}>{k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
            ))}
        </div>
      )}

      {/* Artifact link */}
      {candidate.run_id && (
        <div className="flex items-center gap-1.5 text-[10px] sf-text-subtle mt-0.5">
          <span>artifact:</span>
          <span className="font-mono sf-review-link-accent">{compactId(candidate.run_id)}</span>
          <span className="text-[9px]">&#8599;</span>
        </div>
      )}

      {/* Footer: date + review button */}
      <div className="flex items-center justify-between pt-1.5 border-t sf-border-subtle mt-0.5">
        <span className="text-[10px] sf-text-subtle">{dateStr}</span>
        {onReviewSource && (
          <button
            onClick={() => onReviewSource(candidate.candidate_id)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded sf-review-source-button"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[11px] h-[11px]">
              <path d="M8 1v6m0 0l2.5-2.5M8 7L5.5 4.5M1 10v2.5A2.5 2.5 0 003.5 15h9a2.5 2.5 0 002.5-2.5V10" />
            </svg>
            Review
          </button>
        )}
      </div>
    </DrawerCard>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function FieldReviewDrawer({
  title,
  subtitle,
  onClose,
  currentValue,
  onManualOverride,
  isPending,
  candidates,
  candidatesLoading,
  publishedValue,
  onReviewSource,
  onRunAIReview,
  aiReviewPending,
}: FieldReviewDrawerProps) {
  const hasCandidates = candidates.length > 0;

  return (
    <DrawerShell title={title} subtitle={subtitle} onClose={onClose}>
      {/* Section 1: Published Value */}
      <DrawerSection title="Published Value">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${trafficColor(currentValue.color)}`} />
            <span className={`font-mono text-sm font-semibold ${trafficTextColor(currentValue.color)}`}>
              {currentValue.value}
            </span>
            {currentValue.source && (
              <span className={`sf-text-nano px-1.5 py-0.5 rounded font-medium ${sourceBadgeClass[currentValue.source] || SOURCE_BADGE_FALLBACK}`}>
                {currentValue.source}
              </span>
            )}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono min-w-[2.2rem] text-center ml-auto ${confidenceColorClass(currentValue.confidence)}`}>
              {pct(currentValue.confidence)}
            </span>
          </div>
          {currentValue.sourceTimestamp && (
            <div className="sf-text-nano sf-drawer-meta pl-5">
              set {formatDate(currentValue.sourceTimestamp)}
            </div>
          )}
        </div>
        {currentValue.overridden && (
          <div className="mt-1 px-2 py-1 text-center font-medium sf-status sf-status-info">
            Overridden (manual)
          </div>
        )}
        {!candidatesLoading && (
          <PublishedSourceTable candidates={candidates} />
        )}
      </DrawerSection>

      {/* Section 2: Manual Override + Review All */}
      <DrawerManualOverride onApply={onManualOverride} isPending={isPending} />
      {onRunAIReview && (
        <DrawerSection>
          <button
            onClick={onRunAIReview}
            disabled={aiReviewPending}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold rounded sf-review-source-button disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[13px] h-[13px]">
              <path d="M8 1v6m0 0l2.5-2.5M8 7L5.5 4.5M1 10v2.5A2.5 2.5 0 003.5 15h9a2.5 2.5 0 002.5-2.5V10" />
            </svg>
            {aiReviewPending ? 'Reviewing...' : 'Review All'}
          </button>
        </DrawerSection>
      )}

      {/* Section 3: Candidates (display-only) */}
      {(hasCandidates || candidatesLoading) && (
        <DrawerSection title={`Candidates (${candidatesLoading ? '...' : candidates.length})`}>
          {candidatesLoading ? (
            <div className="flex justify-center py-4">
              <Spinner className="h-5 w-5" />
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.length === 0 && (
                <div className="sf-text-caption sf-text-subtle px-1 py-2">
                  No candidates available yet. Run a pipeline or enter manually.
                </div>
              )}
              {candidates.map((candidate, index) => (
                <CandidateCard
                  key={candidate.candidate_id ? `${candidate.candidate_id}::${index}` : `c::${index}`}
                  candidate={candidate}
                  publishedValue={publishedValue}
                  onReviewSource={onReviewSource}
                />
              ))}
            </div>
          )}
        </DrawerSection>
      )}
    </DrawerShell>
  );
}
