import { useState, useRef, useEffect } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { useScrollStore, resolveScrollPosition } from '../../../stores/scrollStore.ts';
import { pct } from '../../../utils/formatting.ts';
import { confidenceColorClass, trafficColor, trafficTextColor, sourceBadgeClass, SOURCE_BADGE_FALLBACK } from '../../../utils/colors.ts';
import { hasKnownValue, tryParseJsonArray, formatCellValue } from '../../../utils/fieldNormalize.ts';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import {
  DrawerShell,
  DrawerSection,
  DrawerCard,
  DrawerManualOverride,
} from '../../../shared/ui/overlay/DrawerShell.tsx';
import type { ReviewCandidate, VariantValueEntry } from '../../../types/review.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import type { LlmAccessMode } from '../../llm-config/types/llmProviderRegistryTypes.ts';
import { resolveEffortLabel } from '../../llm-config/state/resolveEffortLabel.ts';
import { CandidateDeleteConfirm } from './CandidateDeleteConfirm.tsx';
import { PublishedBadge } from '../../../shared/ui/feedback/PublishedBadge.tsx';
import { resolveDrawerBadge } from '../selectors/drawerBadgeSelector.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { ColorSwatch } from '../../../shared/ui/finder/ColorSwatch.tsx';
import { useFinderColorHexMap } from '../../../shared/ui/finder/useFinderColorHexMap.ts';
import { useFormatDate, useFormatDateTime } from '../../../utils/dateTime.ts';

// ── Helpers ─────────────────────────────────────────────────────────

function extractHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
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

function compactId(value: string, max = 28): string {
  const token = String(value || '').trim();
  if (!token || token.length <= max) return token;
  return `${token.slice(0, 12)}...${token.slice(-8)}`;
}

// ── Props ───────────────────────────────────────────────────────────

interface FieldReviewDrawerProps {
  title: string;
  subtitle: string;
  fieldKey: string;
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
  // Variant-dependent field support (release_date, future discontinued/SKU/price).
  // When `variantDependent` is true and `variantValues` is populated, the drawer renders
  // a per-variant published-value table instead of a single scalar. Candidates are
  // expected to carry variant_id/variant_label/variant_type/color_atoms.
  variantDependent?: boolean;
  variantValues?: Record<string, VariantValueEntry>;
}

// ── Collapsible source table (derived from resolved candidates) ─────

function PublishedSourceTable({ candidates }: { candidates: ReviewCandidate[] }) {
  const resolved = candidates.filter((c) => c.status === 'resolved');
  const [open, toggleOpen] = usePersistedToggle('review:drawer:sourcesOpen', true);

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

// ── Published array list (colors / editions / generic) ─────────────

function PublishedArrayList({
  items,
  fieldKey,
  hexMap,
}: {
  items: readonly string[];
  fieldKey: string;
  hexMap: ReadonlyMap<string, string>;
}) {
  if (fieldKey === 'colors') {
    return (
      <div className="flex flex-wrap gap-1 pl-5">
        {items.map((item, i) => {
          const parts = item.split('+').map((a) => hexMap.get(a.trim()) || '');
          return (
            <span
              key={`${item}-${i}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 sf-surface-panel rounded text-[11px] font-mono sf-text-primary"
            >
              <ColorSwatch hexParts={parts} size="sm" />
              {item}
            </span>
          );
        })}
      </div>
    );
  }
  if (fieldKey === 'editions') {
    return (
      <div className="flex flex-wrap gap-1 pl-5">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 sf-surface-panel rounded text-[11px] font-mono sf-text-primary"
          >
            <span className="inline-block w-3 h-3 rounded-sm border sf-border-soft shrink-0 bg-[var(--sf-token-accent-strong)]" />
            {item}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pl-5">
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="font-mono text-[11px] truncate sf-text-muted">
          {item}
        </span>
      ))}
    </div>
  );
}

// ── Variant chip helpers ───────────────────────────────────────────

function variantChipLabel(variantType: string | null | undefined): 'ED' | 'CLR' {
  return variantType === 'edition' ? 'ED' : 'CLR';
}

function variantChipClass(variantType: string | null | undefined): string {
  return variantType === 'edition' ? 'sf-chip-accent' : 'sf-chip-info';
}

function colorAtomsToHexParts(
  atoms: readonly string[] | null | undefined,
  hexMap: ReadonlyMap<string, string>,
): string[] {
  if (!Array.isArray(atoms) || atoms.length === 0) return [];
  return atoms.map((atom) => hexMap.get(atom) || '').filter(Boolean);
}

// ── Published variant table (variant-dependent fields) ─────────────

function candidateMatchesVariant(
  candidate: ReviewCandidate,
  entry: VariantValueEntry,
  variantId: string,
): boolean {
  if (candidate.variant_id && candidate.variant_id === variantId) return true;
  const meta = candidate.metadata && typeof candidate.metadata === 'object'
    ? (candidate.metadata as Record<string, unknown>)
    : null;
  const metaLabel = typeof meta?.variant_label === 'string' ? meta.variant_label : null;
  const metaType = typeof meta?.variant_type === 'string' ? meta.variant_type : null;
  const candLabel = candidate.variant_label || metaLabel;
  const candType = candidate.variant_type || metaType;
  if (!entry.variant_label || !candLabel || candLabel !== entry.variant_label) return false;
  if (entry.variant_type && candType && entry.variant_type !== candType) return false;
  return true;
}

function dedupeEvidenceSources(sources: readonly EvidenceSource[]): EvidenceSource[] {
  const seen = new Set<string>();
  const result: EvidenceSource[] = [];
  for (const s of sources) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    result.push(s);
  }
  return result;
}

function VariantSourceList({ sources }: { sources: readonly EvidenceSource[] }) {
  return (
    <ul className="space-y-0.5 px-3 py-1.5 border-t sf-border-subtle">
      {sources.map((src, i) => {
        const host = extractHost(src.url);
        return (
          <li key={`${src.url}-${i}`} className="flex items-center gap-1.5 text-[10px] min-w-0">
            <a
              href={src.url}
              target="_blank"
              rel="noreferrer"
              title={src.url}
              className="sf-review-link-accent hover:underline truncate flex-1 min-w-0"
            >
              {host || src.url}
            </a>
            {src.tier && (
              <span className="font-mono text-[9px] px-1 py-0.5 rounded sf-chip-neutral shrink-0">
                {src.tier}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PublishedVariantRow({
  entry,
  hexParts,
  sources,
  displayName,
}: {
  entry: VariantValueEntry;
  hexParts: readonly string[];
  sources: readonly EvidenceSource[];
  displayName: string;
}) {
  const displayValue = entry.value != null ? formatCellValue(entry.value) || 'unk' : 'unk';

  return (
    <div className="border-b sf-border-soft last:border-b-0">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <ColorSwatch hexParts={hexParts} />
        <span className="text-[11px] font-semibold sf-text-primary truncate min-w-0 flex-1" title={displayName}>
          {displayName}
        </span>
        <span className="font-mono text-[11px] font-semibold sf-text-primary shrink-0" title={displayValue}>
          {displayValue}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono text-center shrink-0 ${confidenceColorClass(entry.confidence)}`}>
          {pct(entry.confidence)}
        </span>
        {sources.length > 0 && (
          <span className="font-mono text-[9px] sf-text-subtle shrink-0" title={`${sources.length} source${sources.length !== 1 ? 's' : ''}`}>
            {sources.length}
          </span>
        )}
      </div>
      {sources.length > 0 && <VariantSourceList sources={sources} />}
    </div>
  );
}

function PublishedVariantTable({
  variantValues,
  candidates,
}: {
  variantValues: Record<string, VariantValueEntry>;
  candidates: readonly ReviewCandidate[];
}) {
  const hexMap = useFinderColorHexMap();
  const entries = Object.entries(variantValues);
  if (entries.length === 0) return null;

  const sorted = [...entries].sort(([, a], [, b]) => {
    const aIsEdition = a.variant_type === 'edition' ? 0 : 1;
    const bIsEdition = b.variant_type === 'edition' ? 0 : 1;
    if (aIsEdition !== bIsEdition) return aIsEdition - bIsEdition;
    return String(a.variant_label || '').localeCompare(String(b.variant_label || ''));
  });

  return (
    <div className="sf-surface-panel rounded-lg overflow-hidden border sf-border-soft">
      {sorted.map(([vid, entry]) => {
        const matched = candidates.filter((c) => candidateMatchesVariant(c, entry, vid));
        const firstMeta = matched.reduce<Record<string, unknown> | null>((acc, c) => {
          if (acc) return acc;
          return c.metadata && typeof c.metadata === 'object'
            ? (c.metadata as Record<string, unknown>)
            : null;
        }, null);

        const displayName =
          resolveVariantDisplayName(firstMeta, entry.variant_label || null, entry.variant_type) ||
          entry.variant_label ||
          '—';

        const atoms: readonly string[] | null =
          entry.color_atoms && entry.color_atoms.length > 0
            ? entry.color_atoms
            : entry.variant_type === 'color' && entry.variant_label
              ? entry.variant_label.split('+').map((s) => s.trim()).filter(Boolean)
              : null;

        const allSources = matched.flatMap((c) => {
          const meta = c.metadata && typeof c.metadata === 'object'
            ? (c.metadata as Record<string, unknown>)
            : null;
          return resolveEvidenceSources(c, meta);
        });
        const sources = dedupeEvidenceSources(allSources);

        return (
          <PublishedVariantRow
            key={vid}
            entry={entry}
            hexParts={colorAtomsToHexParts(atoms, hexMap)}
            sources={sources}
            displayName={displayName}
          />
        );
      })}
    </div>
  );
}

// ── Variant display name (priority: edition name > color name > atom) ─

function resolveVariantDisplayName(
  meta: Record<string, unknown> | null,
  variantLabel: string | null,
  variantType: string | null | undefined,
): string | null {
  if (!variantLabel) return null;

  if (variantType === 'edition') {
    const details = meta?.edition_details;
    if (details && typeof details === 'object') {
      const detail = (details as Record<string, unknown>)[variantLabel];
      if (detail && typeof detail === 'object') {
        const name = (detail as Record<string, unknown>).display_name;
        if (typeof name === 'string' && name) return name;
      }
    }
    return variantLabel;
  }

  if (variantType === 'color') {
    const names = meta?.color_names;
    if (names && typeof names === 'object') {
      const atoms = variantLabel.split('+').map((s) => s.trim()).filter(Boolean);
      const pretty = atoms.map((atom) => {
        const v = (names as Record<string, unknown>)[atom];
        return typeof v === 'string' && v ? v : atom;
      });
      return pretty.join(' + ');
    }
    return variantLabel;
  }

  return variantLabel;
}

// ── Evidence metadata (count + clickable URL list + tier per source) ──

interface EvidenceSource {
  url: string;
  tier: string | null;
}

function resolveEvidenceSources(
  candidate: ReviewCandidate,
  meta: Record<string, unknown> | null,
): EvidenceSource[] {
  const metaSources = meta?.evidence_sources;
  if (Array.isArray(metaSources) && metaSources.length > 0) {
    return metaSources
      .map((s): EvidenceSource | null => {
        if (!s || typeof s !== 'object') return null;
        const rec = s as Record<string, unknown>;
        const url = typeof rec.source_url === 'string' ? rec.source_url : '';
        if (!url) return null;
        const raw = rec.tier;
        const tier =
          typeof raw === 'string' && raw ? raw
          : typeof raw === 'number' ? `tier${raw}`
          : null;
        return { url, tier };
      })
      .filter((s): s is EvidenceSource => s !== null);
  }
  if (candidate.evidence_url) {
    const tier = candidate.tier != null ? `tier${candidate.tier}` : null;
    return [{ url: candidate.evidence_url, tier }];
  }
  return [];
}

function MetadataBlock({ sources }: { sources: readonly EvidenceSource[] }) {
  return (
    <div className="text-[10px] sf-text-muted p-1.5 rounded sf-review-evidence-card mt-0.5">
      <div className="font-semibold sf-text-subtle uppercase tracking-wide text-[9px] mb-1">
        Evidence &middot; {sources.length}
      </div>
      {sources.length === 0 ? (
        <div className="sf-text-subtle">No evidence</div>
      ) : (
        <ul className="space-y-0.5">
          {sources.map((src, i) => {
            const host = extractHost(src.url);
            return (
              <li key={`${src.url}-${i}`} className="flex items-center gap-1.5 min-w-0">
                <a
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  title={src.url}
                  className="sf-review-link-accent hover:underline truncate flex-1 min-w-0"
                >
                  {host || src.url}
                </a>
                {src.tier && (
                  <span className="font-mono text-[9px] px-1 py-0.5 rounded sf-chip-neutral shrink-0">
                    {src.tier}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
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
  hexMap,
  forceVariantAttribution = false,
}: {
  candidate: ReviewCandidate;
  publishedValue: unknown;
  onReviewSource?: (candidateId: string) => void;
  onDeleteCandidate?: (sourceId: string) => void;
  hexMap: ReadonlyMap<string, string>;
  forceVariantAttribution?: boolean;
}) {
  const formatDateTime = useFormatDateTime();
  const isResolved = candidate.status === 'resolved';
  const cardClass = isResolved ? 'sf-candidate-resolved' : '';
  const dateStr = formatDateTime(candidate.submitted_at);
  const host = candidate.evidence_url ? extractHost(candidate.evidence_url) : '';
  const meta = candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata as Record<string, unknown> : null;
  const parsedArray = tryParseJsonArray(candidate.value);

  // WHY: RDF writes variant attribution into metadata.variant_label/variant_type
  // instead of the top-level candidate columns, so fall back to metadata.
  const metaVariantLabel = typeof meta?.variant_label === 'string' ? meta.variant_label : null;
  const metaVariantType = typeof meta?.variant_type === 'string' ? meta.variant_type : null;
  const resolvedVariantLabel = candidate.variant_label || metaVariantLabel;
  const resolvedVariantType = candidate.variant_type || metaVariantType;
  const hasVariant = Boolean(candidate.variant_id || metaVariantLabel);

  const colorAtomsFromMeta: readonly string[] | null =
    !candidate.color_atoms && resolvedVariantType === 'color' && resolvedVariantLabel
      ? resolvedVariantLabel.split('+').map((s) => s.trim()).filter(Boolean)
      : null;
  const variantHexParts = hasVariant
    ? colorAtomsToHexParts(candidate.color_atoms || colorAtomsFromMeta, hexMap)
    : [];
  const variantDisplayName = resolveVariantDisplayName(meta, resolvedVariantLabel, resolvedVariantType);
  const showVariantAttribution = hasVariant || forceVariantAttribution;

  return (
    <DrawerCard className={cardClass}>
      {/* Value + confidence badge */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold flex-1 truncate break-all" title={String(candidate.value)}>
          {parsedArray ? parsedArray.join(', ') : formatCellValue(candidate.value)}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono min-w-[2.2rem] text-center ${confidenceColorClass(candidate.score)}`}>
          {pct(candidate.score)}
        </span>
      </div>

      {/* List value chips */}
      {parsedArray && (
        <ValueChips value={parsedArray} publishedValue={publishedValue} />
      )}

      {/* Variant attribution — always shown for variant-dependent fields */}
      {showVariantAttribution && (
        <div className="flex items-center gap-2 pt-1 border-t sf-border-soft">
          <ColorSwatch hexParts={variantHexParts} />
          <span className="text-[11px] font-semibold sf-text-primary truncate flex-1 min-w-0" title={variantDisplayName || ''}>
            {variantDisplayName || '—'}
          </span>
          {resolvedVariantType && (
            <Chip
              label={variantChipLabel(resolvedVariantType)}
              className={variantChipClass(resolvedVariantType)}
            />
          )}
        </div>
      )}

      {/* Source label */}
      {candidate.source && (
        <span className="text-[10px] sf-text-muted mt-0.5">{sourceDisplayLabel(candidate.source)}</span>
      )}
      {/* Model line — exact operations sidebar format: [badges] model-name effort */}
      {candidate.model && (
        <span className="flex items-center gap-1 text-[8px] sf-text-muted mt-0.5">
          Model:{' '}
          <span className="inline-flex items-center gap-0.5 font-mono font-bold sf-text-subtle">
            {typeof meta?.llm_access_mode === 'string' && (
              <ModelBadgeGroup
                accessMode={meta.llm_access_mode as LlmAccessMode}
                thinking={Boolean(meta?.llm_thinking)}
                webSearch={Boolean(meta?.llm_web_search)}
              />
            )}
            {candidate.model}
            {(() => {
              const e = resolveEffortLabel({ model: candidate.model, effortLevel: typeof meta?.llm_effort_level === 'string' ? meta.llm_effort_level : '', thinking: Boolean(meta?.llm_thinking) });
              return e ? <span className="sf-text-muted font-normal">{e}</span> : null;
            })()}
          </span>
        </span>
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

      {/* Evidence block */}
      <MetadataBlock sources={resolveEvidenceSources(candidate, meta)} />

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
              className="inline-flex items-center justify-center gap-1 px-2 h-[22px] text-[10px] font-medium rounded sf-danger-button"
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
              className="inline-flex items-center justify-center gap-1 px-2 h-[22px] text-[10px] font-medium rounded sf-review-source-button"
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
  fieldKey,
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
  variantDependent = false,
  variantValues,
}: FieldReviewDrawerProps) {
  const formatDate = useFormatDate();
  const hasCandidates = candidates.length > 0;
  const publishedParsed = tryParseJsonArray(currentValue.value);
  const hasPublished = hasKnownValue(currentValue.value);
  const hexMap = useFinderColorHexMap();
  const variantValueEntries = variantValues ? Object.keys(variantValues).length : 0;
  const hasVariantTable = variantDependent && variantValueEntries > 0;
  const badgeKind = resolveDrawerBadge(fieldKey, hasPublished || hasVariantTable, variantDependent);
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
      {/* Section 1: Published value / variant */}
      <DrawerSection title={hasVariantTable ? 'Published Variant Values' : (badgeKind === 'variant' ? 'Published Variant' : 'Published Value')}>
        {badgeKind && (
          <div className="mb-2">
            <PublishedBadge kind={badgeKind} />
          </div>
        )}
        {hasVariantTable ? (
          <PublishedVariantTable variantValues={variantValues!} candidates={candidates} />
        ) : (
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
            {publishedParsed && (
              <PublishedArrayList items={publishedParsed} fieldKey={fieldKey} hexMap={hexMap} />
            )}
            {currentValue.sourceTimestamp && (
              <div className="sf-text-nano sf-drawer-meta pl-5">
                set {formatDate(currentValue.sourceTimestamp)}
              </div>
            )}
          </div>
        )}
        {currentValue.overridden && (
          <div className="mt-1 px-2 py-1 text-center font-medium sf-status sf-status-info">
            Overridden (manual)
          </div>
        )}
        {!candidatesLoading && !hasVariantTable && (
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
                  hexMap={hexMap}
                  forceVariantAttribution={fieldKey === 'release_date'}
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
