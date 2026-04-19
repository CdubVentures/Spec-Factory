// Pure helpers for published-source display in the Review Grid Drawer.
//
// Inputs: ReviewCandidate-like objects streamed from /review/:cat/candidates
// with metadata.evidence_refs = [{url, tier, confidence}] (or legacy shapes).
//
// Contract: "published sources" = evidence_refs drawn from candidates where
// status === 'resolved'. The publisher already enforces (above-threshold AND
// value-match OR set_union overlap) before flipping status, so resolved is
// the canonical client-side filter for "sources backing the published value."

export interface EvidenceSource {
  url: string;
  tier: string | null;
  confidence: number | null;
}

interface CandidateLike {
  status?: string | null;
  value?: unknown;
  variant_id?: string | null;
  variant_label?: string | null;
  variant_type?: string | null;
  evidence_url?: string | null;
  tier?: number | string | null;
  metadata?: Record<string, unknown> | null;
}

interface VariantEntryLike {
  variant_label?: string | null;
  variant_type?: string | null;
}

// ── Normalizers ─────────────────────────────────────────────────

export function normalizeTier(raw: unknown): string | null {
  if (typeof raw === 'string' && raw) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return `tier${raw}`;
  return null;
}

export function normalizeConfidence(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ── Per-candidate shape resolver ────────────────────────────────

export function resolveEvidenceSources(candidate: CandidateLike): EvidenceSource[] {
  const meta = candidate.metadata && typeof candidate.metadata === 'object'
    ? (candidate.metadata as Record<string, unknown>)
    : null;

  // Universal shape: metadata.evidence_refs = [{url, tier, confidence}]
  const refs = meta?.evidence_refs;
  if (Array.isArray(refs) && refs.length > 0) {
    return refs
      .map((s): EvidenceSource | null => {
        if (!s || typeof s !== 'object') return null;
        const rec = s as Record<string, unknown>;
        const url = typeof rec.url === 'string' ? rec.url : '';
        if (!url) return null;
        return {
          url,
          tier: normalizeTier(rec.tier),
          confidence: normalizeConfidence(rec.confidence),
        };
      })
      .filter((s): s is EvidenceSource => s !== null);
  }

  // Legacy shape (pre-migration RDF rows): evidence_sources = [{source_url,...}]
  const legacy = meta?.evidence_sources;
  if (Array.isArray(legacy) && legacy.length > 0) {
    return legacy
      .map((s): EvidenceSource | null => {
        if (!s || typeof s !== 'object') return null;
        const rec = s as Record<string, unknown>;
        const url = typeof rec.source_url === 'string' ? rec.source_url : '';
        if (!url) return null;
        return {
          url,
          tier: normalizeTier(rec.tier),
          confidence: normalizeConfidence(rec.confidence),
        };
      })
      .filter((s): s is EvidenceSource => s !== null);
  }

  // Final fallback: top-level evidence_url + tier.
  if (typeof candidate.evidence_url === 'string' && candidate.evidence_url) {
    return [{
      url: candidate.evidence_url,
      tier: normalizeTier(candidate.tier),
      confidence: null,
    }];
  }

  return [];
}

// ── Variant scoping ─────────────────────────────────────────────

export function candidateMatchesVariant(
  candidate: CandidateLike,
  entry: VariantEntryLike,
  variantId: string,
): boolean {
  if (candidate.variant_id && candidate.variant_id === variantId) return true;
  const meta = candidate.metadata && typeof candidate.metadata === 'object'
    ? (candidate.metadata as Record<string, unknown>)
    : null;
  const metaLabel = typeof meta?.variant_label === 'string' ? (meta.variant_label as string) : null;
  const metaType = typeof meta?.variant_type === 'string' ? (meta.variant_type as string) : null;
  const candLabel = candidate.variant_label || metaLabel;
  const candType = candidate.variant_type || metaType;
  if (!entry.variant_label || !candLabel || candLabel !== entry.variant_label) return false;
  if (entry.variant_type && candType && entry.variant_type !== candType) return false;
  return true;
}

// ── Status filter ───────────────────────────────────────────────

export function filterResolvedCandidates<T extends CandidateLike>(
  candidates: readonly T[],
): T[] {
  return candidates.filter((c) => c.status === 'resolved');
}

// ── Value matching (serialization-based, mirrors publisher) ────

export function serializeCandidateValue(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function candidateValueMatches(a: unknown, b: unknown): boolean {
  return serializeCandidateValue(a) === serializeCandidateValue(b);
}

// ── Dedupe + sort ───────────────────────────────────────────────

// WHY: Multiple candidates can report the same URL with different per-source
// confidences. Keep the max so the displayed chip reflects the strongest
// signal. Null confidences are treated as lower than any numeric value.
function mergeSources(a: EvidenceSource, b: EvidenceSource): EvidenceSource {
  const aConf = a.confidence;
  const bConf = b.confidence;
  if (aConf == null && bConf == null) return a;
  if (aConf == null) return b;
  if (bConf == null) return a;
  return aConf >= bConf ? a : b;
}

function compareSources(a: EvidenceSource, b: EvidenceSource): number {
  const aConf = a.confidence ?? -1;
  const bConf = b.confidence ?? -1;
  if (bConf !== aConf) return bConf - aConf;
  return a.url.localeCompare(b.url);
}

// ── Per-source threshold gate ──────────────────────────────────
// WHY: publishConfidenceThreshold (0-1) gates candidate-level publishing.
// The same rule applies per-source: a source backing the value only counts
// if its own per-source confidence (stored 0-100) is at or above the
// threshold. Null per-source confidence fails any positive threshold —
// we can't prove it's above the bar, so we hide it.
export function sourceIsAboveThreshold(src: EvidenceSource, threshold: number): boolean {
  if (!(threshold > 0)) return true;
  if (src.confidence == null) return false;
  return src.confidence / 100 >= threshold;
}

// ── Top-level composition ───────────────────────────────────────

export function collectPublishedSources(
  candidates: readonly CandidateLike[],
  threshold = 0,
): EvidenceSource[] {
  const byUrl = new Map<string, EvidenceSource>();
  for (const c of filterResolvedCandidates(candidates)) {
    for (const src of resolveEvidenceSources(c)) {
      const existing = byUrl.get(src.url);
      byUrl.set(src.url, existing ? mergeSources(existing, src) : src);
    }
  }
  return Array.from(byUrl.values())
    .filter((src) => sourceIsAboveThreshold(src, threshold))
    .sort(compareSources);
}

// ── Per-variant source collection (colors / editions) ──────────
// WHY: Variant-scoped finders (CEF, RDF, and other variantFieldProducers) submit
// one field_candidates row per variant. Each row has its own variant_id and
// metadata.variant_key, with evidence_refs scoped to that variant. To collect
// a single variant's sources, match candidates where metadata.variant_key ===
// variantKey and pull their evidence_refs directly.

function sourcesForVariantFromCandidate(
  candidate: CandidateLike,
  variantKey: string,
): EvidenceSource[] {
  const meta = candidate.metadata && typeof candidate.metadata === 'object'
    ? (candidate.metadata as Record<string, unknown>)
    : null;
  const candVariantKey = typeof meta?.variant_key === 'string' ? (meta.variant_key as string) : null;
  if (candVariantKey !== variantKey) return [];
  return resolveEvidenceSources(candidate);
}

export function collectPublishedSourcesForVariant(
  candidates: readonly CandidateLike[],
  variantKey: string,
  threshold = 0,
): EvidenceSource[] {
  const byUrl = new Map<string, EvidenceSource>();
  for (const c of filterResolvedCandidates(candidates)) {
    for (const src of sourcesForVariantFromCandidate(c, variantKey)) {
      const existing = byUrl.get(src.url);
      byUrl.set(src.url, existing ? mergeSources(existing, src) : src);
    }
  }
  return Array.from(byUrl.values())
    .filter((src) => sourceIsAboveThreshold(src, threshold))
    .sort(compareSources);
}
