import { useState, useRef, useEffect, useMemo } from 'react';
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
} from '../../../shared/ui/overlay/DrawerShell.tsx';
import type { ReviewCandidate, VariantValueEntry, ProductVariantInfo } from '../../../types/review.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import type { LlmAccessMode } from '../../llm-config/types/llmProviderRegistryTypes.ts';
import { resolveEffortLabel } from '../../llm-config/state/resolveEffortLabel.ts';
import { CandidateDeleteConfirm } from './CandidateDeleteConfirm.tsx';
import { PublishedBadge } from '../../../shared/ui/feedback/PublishedBadge.tsx';
import { DefaultVariantMark } from '../../../shared/ui/feedback/DefaultVariantMark.tsx';
import { resolveDrawerBadge } from '../selectors/drawerBadgeSelector.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { EvidenceKindTooltip } from '../../../shared/ui/feedback/EvidenceKindTooltip.tsx';
import { formatEvidenceTier } from '../../../shared/ui/finder/evidenceTierLabels.ts';
import { ColorSwatch } from '../../../shared/ui/finder/ColorSwatch.tsx';
import { useFinderColorHexMap } from '../../../shared/ui/finder/useFinderColorHexMap.ts';
import { useFormatDate, useFormatDateTime } from '../../../utils/dateTime.ts';
import {
  collectPublishedSources,
  collectPublishedSourcesForVariant,
  candidateMatchesVariant,
  candidateValueMatches,
  resolveEvidenceSources,
  type EvidenceSource,
} from '../selectors/publishedSourceSelectors.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import { deriveOverrideFormState, VARIANT_GENERATOR_FIELD_KEYS } from '../selectors/overrideFormState.ts';

// WHY: Gate the per-source display list on the same publisher threshold that
// decides candidate publishing. A candidate can be resolved (i.e. its overall
// confidence cleared the bar) while still carrying individual evidence_refs
// whose per-source confidence (0-100 in evidence_refs[]) is below the bar.
// Those low-confidence sources shouldn't pose as "published sources" — hide
// them. Reads the setting via Zustand so the list live-updates when the user
// changes publishConfidenceThreshold in Publisher settings.
function useSourceThreshold(): number {
  const raw = useRuntimeSettingsValueStore((s) => s.values?.publishConfidenceThreshold);
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

// WHY: Variant-generator fields (colors, editions) ship ONE candidate per CEF
// run whose value is the full JSON array. Per-variant rows match by
// "published combo/slug appears in candidate.value array" rather than
// candidateMatchesVariant (candidate has no variant_id for generators).
// Single source of truth lives in selectors/overrideFormState.ts — aliased here
// for backward-compat with existing local references in this file.
const VARIANT_GENERATOR_FIELDS = VARIANT_GENERATOR_FIELD_KEYS;

function candidateValueIncludes(candidateValue: unknown, entryValue: unknown): boolean {
  let parsed: unknown = candidateValue;
  if (typeof candidateValue === 'string') {
    try {
      parsed = JSON.parse(candidateValue);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(parsed)) return false;
  const target = String(entryValue ?? '');
  return parsed.some((item) => String(item ?? '') === target);
}

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
  onManualOverride: (value: string, variantId?: string) => void;
  onClearPublished?: (opts: { variantId?: string; allVariants?: boolean }) => void;
  clearPending?: boolean;
  overrideError?: string | null;
  clearError?: string | null;
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
  // Full variant catalog — includes variants that don't yet have a value for this field.
  variantCatalog?: ProductVariantInfo[];
}

// ── Source list (universal URL + tier + confidence row) ────────────

function SourceListItem({ src }: { src: EvidenceSource }) {
  const host = extractHost(src.url);
  // WHY: identity_only refs are dimmed — the URL is cited only to pin SKU
  // identity, not as evidence for the claim, and the publisher gate doesn't
  // count them toward min_evidence_refs. Visually discount them to match.
  const isIdentityOnly = src.evidence_kind === 'identity_only';
  return (
    <li className={`flex items-center gap-1.5 text-[10px] min-w-0 ${isIdentityOnly ? 'opacity-60' : ''}`}>
      {src.evidence_kind ? (
        <EvidenceKindTooltip
          kind={src.evidence_kind}
          supportingEvidence={src.supporting_evidence}
          tier={src.tier}
          confidence={src.confidence}
          size={12}
        />
      ) : null}
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
          {formatEvidenceTier(src.tier)}
        </span>
      )}
      {src.confidence != null && (
        <span
          className="font-mono text-[9px] px-1 py-0.5 rounded sf-chip-success shrink-0"
          title="Per-source confidence (0-100)"
        >
          {src.confidence}
        </span>
      )}
    </li>
  );
}

function SourceList({ sources }: { sources: readonly EvidenceSource[] }) {
  return (
    <ul className="space-y-0.5 px-3 py-1.5 border-t sf-border-subtle">
      {sources.map((src, i) => (
        <SourceListItem key={`${src.url}-${i}`} src={src} />
      ))}
    </ul>
  );
}

// ── Collapsible source-row primitive ───────────────────────────────
// WHY: Unified shell shared across variant rows, scalar rows, and list rows
// so every published field renders the same header + collapsed-by-default
// URL list. Header gets a caret + source count; body is SourceList when open.

function CollapsibleSourceRow({
  persistKey,
  headerContent,
  sources,
}: {
  persistKey: string;
  headerContent: React.ReactNode;
  sources: readonly EvidenceSource[];
}) {
  const [open, toggleOpen] = usePersistedToggle(persistKey, false);
  const hasSources = sources.length > 0;

  return (
    <div className="border-b sf-border-soft last:border-b-0">
      <button
        type="button"
        onClick={hasSources ? toggleOpen : undefined}
        disabled={!hasSources}
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-left ${hasSources ? 'cursor-pointer hover:bg-[var(--sf-token-surface-hover,transparent)]' : 'cursor-default'}`}
      >
        <span
          className={`inline-block transition-transform text-[9px] shrink-0 ${open ? 'rotate-90' : ''} ${hasSources ? 'sf-text-subtle' : 'sf-text-subtle opacity-30'}`}
          aria-hidden="true"
        >
          &#9656;
        </span>
        <span className="flex items-center gap-2 flex-1 min-w-0">{headerContent}</span>
        {hasSources && (
          <span
            className="font-mono text-[9px] sf-text-subtle shrink-0"
            title={`${sources.length} source${sources.length !== 1 ? 's' : ''}`}
          >
            {sources.length}
          </span>
        )}
      </button>
      {open && hasSources && <SourceList sources={sources} />}
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

function PublishedVariantRow({
  entry,
  hexParts,
  sources,
  displayName,
  persistKey,
}: {
  entry: VariantValueEntry;
  hexParts: readonly string[];
  sources: readonly EvidenceSource[];
  displayName: string;
  persistKey: string;
}) {
  const threshold = useSourceThreshold();
  const displayValue = entry.value != null ? formatCellValue(entry.value) || 'unk' : 'unk';
  // WHY: entry.confidence is the LLM's overall value-level rating, calibrated
  // at prompt time against the cited evidence (via valueConfidencePromptFragment).
  // Trust it directly — the per-source evidence breakdown renders separately below.
  const derivedConfidence = entry.confidence;

  const headerContent = (
    <>
      <ColorSwatch hexParts={hexParts} />
      <DefaultVariantMark isDefault={Boolean(entry.is_default)} size={10} />
      <span className="text-[11px] font-semibold sf-text-primary truncate min-w-0 flex-1" title={displayName}>
        {displayName}
      </span>
      <span className="font-mono text-[11px] font-semibold sf-text-primary shrink-0" title={displayValue}>
        {displayValue}
      </span>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono text-center shrink-0 ${confidenceColorClass(derivedConfidence, threshold)}`}>
        {pct(derivedConfidence)}
      </span>
    </>
  );

  return (
    <CollapsibleSourceRow
      persistKey={persistKey}
      headerContent={headerContent}
      sources={sources}
    />
  );
}

function PublishedVariantTable({
  variantValues,
  candidates,
  fieldKey,
}: {
  variantValues: Record<string, VariantValueEntry>;
  candidates: readonly ReviewCandidate[];
  fieldKey: string;
}) {
  const hexMap = useFinderColorHexMap();
  const threshold = useSourceThreshold();
  const entries = Object.entries(variantValues);
  if (entries.length === 0) return null;

  const isGenerator = VARIANT_GENERATOR_FIELDS.has(fieldKey);

  // Sort: default variant first (only one per product, pinned to top),
  // then editions, then alpha by label. WHY: the default variant drives the
  // grid cell value for scalar variant-dependent fields, so surfacing it first
  // in the drawer keeps the user's mental model aligned.
  const sorted = [...entries].sort(([, a], [, b]) => {
    const aIsDefault = a.is_default ? 0 : 1;
    const bIsDefault = b.is_default ? 0 : 1;
    if (aIsDefault !== bIsDefault) return aIsDefault - bIsDefault;
    const aIsEdition = a.variant_type === 'edition' ? 0 : 1;
    const bIsEdition = b.variant_type === 'edition' ? 0 : 1;
    if (aIsEdition !== bIsEdition) return aIsEdition - bIsEdition;
    return String(a.variant_label || '').localeCompare(String(b.variant_label || ''));
  });

  return (
    <div className="sf-surface-panel rounded-lg overflow-hidden border sf-border-soft">
      {sorted.map(([vid, entry]) => {
        // WHY: Two matching strategies:
        //  - Variant-dependent (release_date etc.): candidate is scoped to a
        //    variant_id AND its value is the per-variant published value.
        //    Match = candidateMatchesVariant AND candidateValueMatches.
        //  - Variant-generator (colors, editions): candidate carries the full
        //    array (no variant_id). Match = candidate.value array INCLUDES
        //    this entry's combo/slug.
        const matched = candidates.filter((c) => {
          if (c.status !== 'resolved') return false;
          if (isGenerator) return candidateValueIncludes(c.value, entry.value);
          return candidateMatchesVariant(c, entry, vid) && candidateValueMatches(c.value, entry.value);
        });
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

        // WHY: For generators, route per-variant source lookup through
        // variant_key so CEF identity-check evidence (keyed by "color:<combo>"
        // / "edition:<slug>") lights up. Falls back to the candidate's global
        // evidence_refs when per-variant entries aren't present (Run 1). Both
        // selectors apply the publisher threshold per-source to hide refs
        // whose self-rated confidence doesn't clear the bar.
        const sources = isGenerator && entry.variant_key
          ? collectPublishedSourcesForVariant(matched, entry.variant_key, threshold)
          : collectPublishedSources(matched, threshold);

        return (
          <PublishedVariantRow
            key={vid}
            entry={entry}
            hexParts={colorAtomsToHexParts(atoms, hexMap)}
            sources={sources}
            displayName={displayName}
            persistKey={`review:drawer:variantSources:${fieldKey}:${vid}`}
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
            const isIdentityOnly = src.evidence_kind === 'identity_only';
            return (
              <li
                key={`${src.url}-${i}`}
                className={`flex items-center gap-1.5 min-w-0 ${isIdentityOnly ? 'opacity-60' : ''}`}
              >
                {src.evidence_kind ? (
                  <EvidenceKindTooltip
                    kind={src.evidence_kind}
                    supportingEvidence={src.supporting_evidence}
                    tier={src.tier}
                    confidence={src.confidence}
                    size={12}
                  />
                ) : null}
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
                    {formatEvidenceTier(src.tier)}
                  </span>
                )}
                {src.confidence != null && (
                  <span className="font-mono text-[9px] px-1 py-0.5 rounded sf-chip-neutral shrink-0" title="Per-source confidence (0-100)">
                    {src.confidence}
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
  const threshold = useSourceThreshold();
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
        <span className="font-mono text-sm font-bold flex-1 truncate break-all" title={parsedArray ? parsedArray.join(', ') : formatCellValue(candidate.value)}>
          {parsedArray ? parsedArray.join(', ') : formatCellValue(candidate.value)}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono min-w-[2.2rem] text-center ${confidenceColorClass(candidate.score, threshold)}`}>
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
      <MetadataBlock sources={resolveEvidenceSources(candidate)} />

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

// ── Published non-variant row (scalar + list fields) ───────────────
// WHY: Single collapsible row matching the variant-row pattern — header
// shows the published value (or "N values" for lists) + source badge +
// confidence + source count; body expands to the deduped source list. For
// list fields the value chips render below the row so the user can see the
// full published set alongside the sources that back it.

function PublishedNonVariantRow({
  currentValue,
  fieldKey,
  publishedParsed,
  candidates,
  hexMap,
  formatDate,
}: {
  currentValue: FieldReviewDrawerProps['currentValue'];
  fieldKey: string;
  publishedParsed: string[] | null;
  candidates: ReviewCandidate[];
  hexMap: ReadonlyMap<string, string>;
  formatDate: (raw: string | null | undefined) => string;
}) {
  const threshold = useSourceThreshold();
  const sources = collectPublishedSources(candidates, threshold);
  // WHY: currentValue.confidence is the LLM's overall value-level rating,
  // calibrated at prompt time against cited evidence. Trust it directly —
  // per-source breakdown renders below.
  const derivedConfidence = currentValue.confidence;

  const headerContent = (
    <>
      <span className={`inline-block w-3 h-3 rounded-full shrink-0 ${trafficColor(currentValue.color)}`} />
      {publishedParsed ? (
        <span className={`text-xs font-semibold ${trafficTextColor(currentValue.color)}`}>
          {publishedParsed.length} values
        </span>
      ) : (
        <span className={`font-mono text-sm font-semibold break-words min-w-0 flex-1 ${trafficTextColor(currentValue.color)}`}>
          {currentValue.value}
        </span>
      )}
      {currentValue.source && (
        <span className={`sf-text-nano px-1.5 py-0.5 rounded font-medium ${sourceBadgeClass[currentValue.source] || SOURCE_BADGE_FALLBACK}`}>
          {currentValue.source}
        </span>
      )}
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono min-w-[2.2rem] text-center ${confidenceColorClass(derivedConfidence, threshold)}`}>
        {pct(derivedConfidence)}
      </span>
    </>
  );

  return (
    <div className="sf-surface-panel rounded-lg overflow-hidden border sf-border-soft">
      <CollapsibleSourceRow
        persistKey={`review:drawer:nonVariantSources:${fieldKey}`}
        headerContent={headerContent}
        sources={sources}
      />
      {publishedParsed && publishedParsed.length > 0 && (
        <div className="px-2 py-1.5 border-t sf-border-subtle">
          <PublishedArrayList items={publishedParsed} fieldKey={fieldKey} hexMap={hexMap} />
        </div>
      )}
      {currentValue.sourceTimestamp && (
        <div className="sf-text-nano sf-drawer-meta px-3 py-1 border-t sf-border-subtle">
          set {formatDate(currentValue.sourceTimestamp)}
        </div>
      )}
    </div>
  );
}

// ── Override + Clear section ────────────────────────────────────────
//
// Decides the UI shape via deriveOverrideFormState (pure selector, tested).
// variantGenerator fields (colors/editions) render nothing — CEF is authoritative.
// variant-dependent fields render a variant <select> + manual input + per-variant
// Clear + "Clear all variants". Scalar fields render a single input + Clear.

interface OverrideAndClearSectionProps {
  fieldKey: string;
  variantDependent: boolean;
  variantValues?: Record<string, VariantValueEntry>;
  variantCatalog?: ProductVariantInfo[];
  onManualOverride: (value: string, variantId?: string) => void;
  onClearPublished?: (opts: { variantId?: string; allVariants?: boolean }) => void;
  isPending: boolean;
  clearPending?: boolean;
  overrideError?: string | null;
  clearError?: string | null;
}

function OverrideAndClearSection({
  fieldKey,
  variantDependent,
  variantValues,
  variantCatalog,
  onManualOverride,
  onClearPublished,
  isPending,
  clearPending,
  overrideError,
  clearError,
}: OverrideAndClearSectionProps) {
  const moduleClass = VARIANT_GENERATOR_FIELDS.has(fieldKey) ? 'variantGenerator' : null;

  // WHY: Prefer the full catalog (every variant) over the sparse variant_values
  // map (only variants with a resolved value). Users must be able to seed a
  // value for a variant that RDF/CEF hasn't produced yet, and the catalog
  // survives "Clear All Variant Values" while variant_values empties.
  const variantInputs = useMemo(() => {
    if (Array.isArray(variantCatalog) && variantCatalog.length > 0) {
      return variantCatalog.map((v) => ({
        variant_id: v.variant_id,
        variant_label: v.variant_label ?? v.variant_id,
      }));
    }
    if (!variantValues) return [];
    return Object.entries(variantValues).map(([id, entry]) => ({
      variant_id: id,
      variant_label: entry.variant_label ?? id,
    }));
  }, [variantCatalog, variantValues]);

  const formState = useMemo(
    () => deriveOverrideFormState({
      fieldKey,
      fieldRule: { variant_dependent: variantDependent },
      moduleClass,
      variants: variantInputs,
    }),
    [fieldKey, variantDependent, moduleClass, variantInputs],
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    formState.variantOptions[0]?.id ?? '',
  );

  useEffect(() => {
    if (formState.mode !== 'variant') return;
    if (formState.variantOptions.length === 0) {
      if (selectedVariantId !== '') setSelectedVariantId('');
      return;
    }
    if (!formState.variantOptions.some((opt) => opt.id === selectedVariantId)) {
      setSelectedVariantId(formState.variantOptions[0].id);
    }
  }, [formState.mode, formState.variantOptions, selectedVariantId]);

  if (formState.mode === 'suppressed') return null;

  const variantId = formState.mode === 'variant' && selectedVariantId ? selectedVariantId : undefined;
  const isVariant = formState.mode === 'variant';

  return (
    <DrawerSection title="Override" className="pt-3 border-t sf-border-subtle">
      {isVariant && formState.variantOptions.length > 0 && (
        <div className="space-y-1">
          <p className="sf-text-nano sf-drawer-meta">Target variant</p>
          <select
            value={selectedVariantId}
            onChange={(event) => setSelectedVariantId(event.target.value)}
            className="sf-input sf-primitive-input sf-drawer-input w-full"
          >
            {formState.variantOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}
      <OverrideInputRow
        onApply={(value) => onManualOverride(value, variantId)}
        isPending={isPending}
        errorMessage={overrideError}
      />
      {onClearPublished && (
        <div className="space-y-1">
          <p className="sf-text-nano sf-drawer-meta">Clear published</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onClearPublished(
                isVariant && variantId ? { variantId } : {},
              )}
              disabled={clearPending || (isVariant && !variantId)}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold rounded sf-review-source-button disabled:opacity-50"
            >
              {isVariant ? 'Clear Variant Value' : 'Clear Value'}
            </button>
            {isVariant && (
              <button
                type="button"
                onClick={() => onClearPublished({ allVariants: true })}
                disabled={clearPending}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold rounded sf-review-source-button disabled:opacity-50"
              >
                Clear All Variant Values
              </button>
            )}
          </div>
          {clearError && (
            <p className="sf-text-nano text-red-500 mt-1">{clearError}</p>
          )}
        </div>
      )}
    </DrawerSection>
  );
}

// WHY: Inline variant of DrawerManualOverride that matches the compact section
// style — smaller text, no secondary label, just input + Apply button on a row.
// DrawerManualOverride still used elsewhere; this stays private to the drawer.
function OverrideInputRow({ onApply, isPending, errorMessage }: { onApply: (value: string) => void; isPending: boolean; errorMessage?: string | null }) {
  const [value, setValue] = useState('');
  function apply() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onApply(trimmed);
    setValue('');
  }
  return (
    <div className="space-y-1">
      <p className="sf-text-nano sf-drawer-meta">Manual override</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="sf-input sf-primitive-input sf-drawer-input flex-1 text-[11px]"
          placeholder="Enter new value..."
          onKeyDown={(event) => {
            if (event.key === 'Enter') apply();
          }}
        />
        <button
          type="button"
          onClick={apply}
          disabled={!value.trim() || isPending}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded sf-review-source-button disabled:opacity-50"
        >
          Apply
        </button>
      </div>
      {errorMessage && (
        <p className="sf-text-nano text-red-500">{errorMessage}</p>
      )}
    </div>
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
  onClearPublished,
  clearPending,
  overrideError,
  clearError,
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
  variantCatalog,
}: FieldReviewDrawerProps) {
  const formatDate = useFormatDate();
  const hasCandidates = candidates.length > 0;
  const publishedParsed = tryParseJsonArray(currentValue.value);
  const hasPublished = hasKnownValue(currentValue.value);
  const hexMap = useFinderColorHexMap();
  const variantValueEntries = variantValues ? Object.keys(variantValues).length : 0;
  // WHY: variant_values drives the per-variant table regardless of whether
  // field_rule.variant_dependent is true. Variant-dependent fields
  // (release_date, sku) and variant-generator fields (colors, editions) both
  // emit variant_values from the backend — the drawer renders them the same
  // way, only the candidate-matching strategy inside PublishedVariantTable
  // differs (see VARIANT_GENERATOR_FIELDS).
  const hasVariantTable = variantValueEntries > 0;
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
          <PublishedVariantTable variantValues={variantValues!} candidates={candidates} fieldKey={fieldKey} />
        ) : (
          <PublishedNonVariantRow
            currentValue={currentValue}
            fieldKey={fieldKey}
            publishedParsed={publishedParsed}
            candidates={candidates}
            hexMap={hexMap}
            formatDate={formatDate}
          />
        )}
        {currentValue.overridden && (
          <div className="mt-1 px-2 py-1 text-center font-medium sf-status sf-status-info">
            Overridden (manual)
          </div>
        )}
      </DrawerSection>

      {/* Section 2: Manual Override + Clear Published + Review All */}
      <OverrideAndClearSection
        fieldKey={fieldKey}
        variantDependent={variantDependent}
        variantValues={variantValues}
        variantCatalog={variantCatalog}
        onManualOverride={onManualOverride}
        onClearPublished={onClearPublished}
        isPending={isPending}
        clearPending={clearPending}
        overrideError={overrideError}
        clearError={clearError}
      />
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
      {/* Section 3: Candidates (delete-all + list, grouped with a border so the
          three sections — Published / Override / Candidates — read as distinct
          blocks at a glance). */}
      {(hasCandidates || candidatesLoading) && (
        <DrawerSection
          title={`Candidates (${candidatesLoading ? '...' : candidates.length})`}
          className="pt-3 border-t sf-border-subtle"
          meta={onDeleteAllCandidates && hasCandidates ? (
            <button
              onClick={() => setDeleteConfirm({ mode: 'all' })}
              disabled={deletePending}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded sf-danger-button disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[11px] h-[11px]">
                <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
              </svg>
              {deletePending ? 'Deleting...' : 'Delete All'}
            </button>
          ) : undefined}
        >
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
                  forceVariantAttribution={variantDependent}
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
