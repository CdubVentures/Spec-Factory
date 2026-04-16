import { useState, useRef, useEffect } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { useScrollStore, resolveScrollPosition } from '../../../stores/scrollStore.ts';
import { pct } from '../../../utils/formatting.ts';
import { confidenceColorClass, trafficColor, trafficTextColor, sourceBadgeClass, SOURCE_BADGE_FALLBACK } from '../../../utils/colors.ts';
import { hasKnownValue, tryParseJsonArray } from '../../../utils/fieldNormalize.ts';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import {
  DrawerShell,
  DrawerSection,
  DrawerCard,
  DrawerManualOverride,
} from '../../../shared/ui/overlay/DrawerShell.tsx';
import type { ReviewCandidate } from '../../../types/review.ts';
import { FinderRunModelBadge } from '../../../shared/ui/finder/index.ts';
import { CandidateDeleteConfirm } from './CandidateDeleteConfirm.tsx';

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

/** WHY: Short source codes (cef, pif, pipeline) are opaque — map to human-readable labels. */
const SOURCE_DISPLAY_LABELS: Record<string, string> = {
  cef: 'Color & Edition Finder',
  pif: 'Product Image Finder',
  pipeline: 'Pipeline',
  reference: 'Reference',
  manual: 'Manual',
  user: 'User',
  override: 'Override',
};

function sourceDisplayLabel(source: string): string {
  return SOURCE_DISPLAY_LABELS[source.toLowerCase()] || source;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${date} \u00B7 ${time}`;
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
  onDeleteCandidate?: (sourceId: string) => void;
  onDeleteAllCandidates?: () => void;
  deletePending?: boolean;
}

// ── Collapsible source table (derived from resolved candidates) ─────

function PublishedSourceTable({ candidates }: { candidates: ReviewCandidate[] }) {
  const resolved = candidates.filter((c) => c.status === 'resolved');
  const [open, toggleOpen] = usePersistedToggle('review:drawer:sourcesOpen', false);

  if (resolved.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={toggleOpen}
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
                  <td className="py-1 px-1.5 border-b sf-border-subtle">{c.source ? sourceDisplayLabel(c.source) : '—'}</td>
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

function ValueChips({ value, publishedValue }: { value: string[]; publishedValue: unknown }) {
  if (value.length === 0) return null;
  const parsedPublished = tryParseJsonArray(publishedValue);
  const publishedSet = new Set(parsedPublished ?? []);
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

// ── Metadata renderers ─────────────────────────────────────────────

const METADATA_FILTER_KEYS = new Set(['evidence', 'method']);

// WHY: Format object metadata values as readable key-value lines instead of
// inline JSON.stringify. Keeps the same plain-text layout as original but readable.
function formatMetaValue(key: string, value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);

  if (key === 'color_names') {
    const entries = Object.entries(value as Record<string, string>);
    if (entries.length === 0) return '{}';
    return entries.map(([atom, name]) => `${atom}: ${String(name)}`).join(', ');
  }

  if (key === 'publish_result') {
    const pr = value as Record<string, unknown>;
    const parts: string[] = [];
    if (pr.status) parts.push(String(pr.status));
    if (typeof pr.published_at === 'string') parts.push(formatDate(pr.published_at));
    if (typeof pr.reason === 'string') parts.push(pr.reason);
    return parts.join(' · ');
  }

  if (key === 'edition_details') {
    const editions = Object.entries(value as Record<string, Record<string, unknown>>);
    return editions.map(([slug, detail]) => {
      const name = typeof detail?.display_name === 'string' ? detail.display_name : slug;
      return name;
    }).join(', ');
  }

  return JSON.stringify(value);
}

function MetadataBlock({ meta }: { meta: Record<string, unknown> | null | undefined }) {
  const entries = meta
    ? Object.entries(meta).filter(([k]) => !METADATA_FILTER_KEYS.has(k))
    : [];

  return (
    <div className="text-[10px] sf-text-muted leading-relaxed p-1.5 rounded sf-review-evidence-card mt-0.5 break-words">
      <div className="font-semibold sf-text-subtle uppercase tracking-wide text-[9px] mb-0.5">Metadata</div>
      {entries.length === 0 ? (
        <div className="sf-text-subtle">No metadata</div>
      ) : (
        entries.map(([k, v]) => (
          <div key={k} className="font-mono">{k}: {formatMetaValue(k, v)}</div>
        ))
      )}
    </div>
  );
}

// ── Candidate card ──────────────────────────────────────────────────

function CandidateCard({
  candidate,
  publishedValue,
  onReviewSource,
  onDeleteCandidate,
}: {
  candidate: ReviewCandidate;
  publishedValue: unknown;
  onReviewSource?: (candidateId: string) => void;
  onDeleteCandidate?: (sourceId: string) => void;
}) {
  const isResolved = candidate.status === 'resolved';
  const cardClass = isResolved ? 'sf-candidate-resolved' : '';
  const dateStr = formatDateTime(candidate.submitted_at);
  const host = candidate.evidence_url ? extractHost(candidate.evidence_url) : '';
  const meta = candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata as Record<string, unknown> : null;
  const parsedArray = tryParseJsonArray(candidate.value);

  return (
    <DrawerCard className={cardClass}>
      {/* Value + confidence badge */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold flex-1 truncate break-all" title={String(candidate.value)}>
          {parsedArray ? parsedArray.join(', ') : String(candidate.value)}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono min-w-[2.2rem] text-center ${confidenceColorClass(candidate.score)}`}>
          {pct(candidate.score)}
        </span>
      </div>

      {/* List value chips */}
      {parsedArray && (
        <ValueChips value={parsedArray} publishedValue={publishedValue} />
      )}

      {/* Source label + model badge */}
      {(candidate.source || candidate.model) && (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {candidate.source && (
            <span className="text-[10px] sf-text-muted">{sourceDisplayLabel(candidate.source)}</span>
          )}
          {candidate.model && (
            <FinderRunModelBadge model={candidate.model} accessMode="api" />
          )}
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
      <MetadataBlock meta={meta} />

      {/* Artifact link */}
      {candidate.run_id && (
        <div className="flex items-center gap-1.5 text-[10px] sf-text-subtle mt-0.5">
          <span>artifact:</span>
          <span className="font-mono sf-review-link-accent">{compactId(candidate.run_id)}</span>
          <span className="text-[9px]">&#8599;</span>
        </div>
      )}

      {/* Footer: date + action buttons */}
      <div className="flex items-center justify-between pt-1.5 border-t sf-border-subtle mt-0.5">
        <span className="text-[10px] sf-text-subtle">{dateStr}</span>
        <div className="flex items-center gap-1">
          {onDeleteCandidate && candidate.source_id && (
            <button
              onClick={() => onDeleteCandidate(candidate.source_id)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded sf-danger-button"
              title="Delete this candidate"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[11px] h-[11px]">
                <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
              </svg>
            </button>
          )}
          {onReviewSource && (
            <button
              onClick={() => onReviewSource(candidate.candidate_id)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded sf-review-source-button"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[11px] h-[11px]">
                <path d="M8 1v6m0 0l2.5-2.5M8 7L5.5 4.5M1 10v2.5A2.5 2.5 0 003.5 15h9a2.5 2.5 0 002.5-2.5V10" />
              </svg>
              Review
            </button>
          )}
        </div>
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
  onDeleteCandidate,
  onDeleteAllCandidates,
  deletePending,
}: FieldReviewDrawerProps) {
  const hasCandidates = candidates.length > 0;
  const publishedParsed = tryParseJsonArray(currentValue.value);
  const [deleteConfirm, setDeleteConfirm] = useState<{ mode: 'single'; sourceId: string } | { mode: 'all' } | null>(null);

  // Drawer scroll persistence
  const drawerBodyRef = useRef<HTMLDivElement>(null);
  const scrollKey = 'review:drawer:scroll';
  const scrollSet = useScrollStore((s) => s.set);

  useEffect(() => {
    requestAnimationFrame(() => {
      const stored = resolveScrollPosition(useScrollStore.getState().values[scrollKey]);
      if (stored && drawerBodyRef.current) {
        drawerBodyRef.current.scrollTop = stored.top;
      }
    });
    return () => {
      if (drawerBodyRef.current) {
        scrollSet(scrollKey, { top: drawerBodyRef.current.scrollTop, left: 0 });
      }
    };
  }, [scrollSet]);

  return (
    <DrawerShell title={title} subtitle={subtitle} onClose={onClose} bodyRef={drawerBodyRef}>
      {/* Section 1: Published Value */}
      <DrawerSection title="Published Value">
        <div className="space-y-1">
          {/* Header row: dot + source + confidence */}
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full shrink-0 ${trafficColor(currentValue.color)}`} />
            {publishedParsed ? (
              <span className={`text-xs font-semibold ${trafficTextColor(currentValue.color)}`}>
                {publishedParsed.length} values
              </span>
            ) : (
              <span className={`font-mono text-sm font-semibold break-words min-w-0 ${trafficTextColor(currentValue.color)}`}>
                {currentValue.value}
              </span>
            )}
            {currentValue.source && (
              <span className={`sf-text-nano px-1.5 py-0.5 rounded font-medium ${sourceBadgeClass[currentValue.source] || SOURCE_BADGE_FALLBACK}`}>
                {currentValue.source}
              </span>
            )}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono min-w-[2.2rem] text-center ml-auto ${confidenceColorClass(currentValue.confidence)}`}>
              {pct(currentValue.confidence)}
            </span>
          </div>
          {/* List values as a 2-column grid */}
          {publishedParsed && (
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pl-5">
              {publishedParsed.map((item, i) => (
                <span key={`${item}-${i}`} className="font-mono text-[11px] truncate sf-text-muted">
                  {item}
                </span>
              ))}
            </div>
          )}
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
      {onDeleteAllCandidates && hasCandidates && (
        <DrawerSection>
          <button
            onClick={() => setDeleteConfirm({ mode: 'all' })}
            disabled={deletePending}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold rounded sf-danger-button disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[13px] h-[13px]">
              <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
            </svg>
            {deletePending ? 'Deleting...' : 'Delete All Candidates'}
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
                  onDeleteCandidate={onDeleteCandidate ? (sourceId) => setDeleteConfirm({ mode: 'single', sourceId }) : undefined}
                />
              ))}
            </div>
          )}
        </DrawerSection>
      )}
      {deleteConfirm && (
        <CandidateDeleteConfirm
          mode={deleteConfirm.mode}
          fieldLabel={title}
          candidateCount={candidates.length}
          isPending={deletePending ?? false}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => {
            if (deleteConfirm.mode === 'single' && 'sourceId' in deleteConfirm) {
              onDeleteCandidate?.(deleteConfirm.sourceId);
            } else {
              onDeleteAllCandidates?.();
            }
            setDeleteConfirm(null);
          }}
        />
      )}
    </DrawerShell>
  );
}
