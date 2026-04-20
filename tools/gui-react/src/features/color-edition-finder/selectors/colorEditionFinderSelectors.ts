import type { ColorEditionFinderResult, ColorEditionFinderSelected, ColorRegistryEntry, CefCandidateEntry } from '../types.ts';
import type { EvidenceSource } from '../../review/selectors/publishedSourceSelectors.ts';
import { normalizeTier, normalizeConfidence } from '../../review/selectors/publishedSourceSelectors.ts';

export interface ColorPill {
  readonly name: string;
  readonly displayName: string;
  readonly hex: string;
  readonly hexParts: readonly string[];
  readonly isDefault: boolean;
  readonly sources: readonly EvidenceSource[];
  readonly confidenceMax: number | null;
  readonly variantId: string | null;
  readonly isPublished: boolean;
}

export interface EditionBlock {
  readonly slug: string;
  readonly displayName: string;
  readonly pairedColors: readonly ColorPill[];
  readonly sources: readonly EvidenceSource[];
  readonly confidenceMax: number | null;
  readonly variantId: string | null;
  readonly isPublished: boolean;
}

export interface SelectedStateDisplay {
  readonly colors: readonly ColorPill[];
  readonly editions: readonly EditionBlock[];
  readonly defaultColorHex: string;
}

export interface PublishedItemSets {
  readonly colors: readonly string[];
  readonly editions: readonly string[];
}

export interface RunDiscoveryLog {
  readonly confirmedCount: number;
  readonly addedNewCount: number;
  readonly rejectedCount: number;
  readonly urlsCheckedCount: number;
  readonly queriesRunCount: number;
  readonly confirmedFromKnown: readonly string[];
  readonly addedNew: readonly string[];
  readonly rejectedFromKnown: readonly string[];
  readonly urlsChecked: readonly string[];
  readonly queriesRun: readonly string[];
}

export interface RunHistoryRow {
  readonly runNumber: number;
  readonly ranAt: string;
  readonly model: string;
  readonly fallbackUsed: boolean;
  readonly effortLevel: string;
  readonly accessMode: string;
  readonly thinking: boolean;
  readonly webSearch: boolean;
  readonly colorCount: number;
  readonly editionCount: number;
  readonly isLatest: boolean;
  readonly validationStatus: 'valid' | 'rejected';
  readonly rejectionSummary: string;
  readonly startedAt: string;
  readonly durationMs: number | null;
  readonly selected: ColorEditionFinderSelected;
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly responseJson: string;
  readonly siblingsExcluded: readonly string[];
  readonly discoveryLog: RunDiscoveryLog;
}

export interface KpiCard {
  readonly label: string;
  readonly value: string;
  readonly tone: string;
}

export interface StatusChip {
  readonly label: string;
  readonly tone: string;
}

export function deriveFinderKpiCards(result: ColorEditionFinderResult | null): KpiCard[] {
  const colors = result?.published?.colors?.length ?? 0;
  const editions = result?.published?.editions?.length ?? 0;
  const defaultColor = result?.published?.default_color || '--';
  const runCount = result?.run_count ?? 0;

  return [
    { label: 'Colors', value: String(colors), tone: 'accent' },
    { label: 'Editions', value: String(editions), tone: 'purple' },
    { label: 'Default Color', value: defaultColor, tone: 'teal' },
    { label: 'Runs', value: String(runCount), tone: 'success' },
  ];
}

export function deriveFinderStatusChip(result: ColorEditionFinderResult | null): StatusChip {
  if (!result) return { label: 'Not Run', tone: 'neutral' };
  return { label: `Run ${result.run_count}`, tone: 'success' };
}

function resolveHexParts(name: string, hexMap: Map<string, string>): string[] {
  return name.split('+').map(atom => hexMap.get(atom.trim()) || '');
}

function resolveHex(name: string, hexMap: Map<string, string>): string {
  const firstAtom = name.split('+')[0] || name;
  return hexMap.get(firstAtom) || hexMap.get(name) || '';
}

function toColorPill(
  name: string,
  defaultColor: string,
  hexMap: Map<string, string>,
  displayName = '',
  sources: readonly EvidenceSource[] = [],
  confidenceMax: number | null = null,
  variantId: string | null = null,
  isPublished = true,
): ColorPill {
  return {
    name,
    displayName,
    hex: resolveHex(name, hexMap),
    hexParts: resolveHexParts(name, hexMap),
    isDefault: name === defaultColor,
    sources,
    confidenceMax,
    variantId,
    isPublished,
  };
}

/**
 * Extract this variant's evidence from its candidate row(s).
 * WHY: Per-variant model — each candidate row has variant_id set and metadata.evidence_refs
 * scoped to that variant. Union across rows (Run 1 + Run 2 submissions for the same variant),
 * dedupe by url+tier, keep the max per-source confidence.
 */
function variantSources(candidates: readonly CefCandidateEntry[], variantId: string | null): EvidenceSource[] {
  if (!variantId) return [];
  const byUrl = new Map<string, EvidenceSource>();
  for (const c of candidates) {
    if (c.variant_id !== variantId) continue;
    const meta = c.metadata as Record<string, unknown> | null | undefined;
    const refs = meta?.evidence_refs;
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      if (!ref || typeof ref !== 'object') continue;
      const rec = ref as Record<string, unknown>;
      const url = typeof rec.url === 'string' ? rec.url : '';
      if (!url) continue;
      const key = `${url}|${rec.tier ?? ''}`;
      const next: EvidenceSource = {
        url,
        tier: normalizeTier(rec.tier),
        confidence: normalizeConfidence(rec.confidence),
      };
      const existing = byUrl.get(key);
      if (!existing) {
        byUrl.set(key, next);
      } else if ((next.confidence ?? -1) > (existing.confidence ?? -1)) {
        byUrl.set(key, next);
      }
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));
}

function maxConfidence(sources: readonly EvidenceSource[]): number | null {
  let best: number | null = null;
  for (const s of sources) {
    if (s.confidence == null) continue;
    if (best == null || s.confidence > best) best = s.confidence;
  }
  return best;
}

export function deriveSelectedStateDisplay(
  result: ColorEditionFinderResult | null,
  colorRegistry: ColorRegistryEntry[],
  publishedSets?: PublishedItemSets,
): SelectedStateDisplay {
  const hexMap = new Map(colorRegistry.map(c => [c.name, c.hex]));

  // Prefer published truth from field_candidates; fall back to selected
  const pub = result?.published;
  const cands = result?.candidates;

  if (pub && (pub.colors.length > 0 || pub.editions.length > 0)) {
    const colorNameMap = pub.color_names ?? {};
    const editionDetailsMap = pub.edition_details ?? {};
    const defaultColor = pub.default_color || pub.colors[0] || '';
    const colorCands = cands?.colors ?? [];
    const editionCands = cands?.editions ?? [];

    // WHY: Look up variant_id from variant_registry for each color/edition.
    // variant_key format is 'color:{atom}' or 'edition:{slug}'.
    const registry = result?.variant_registry ?? [];
    const variantByKey = new Map(registry.map(v => [v.variant_key, v.variant_id]));

    // WHY: When publishedSets is omitted, every rendered item is treated as
    // published (back-compat). When provided (from the publisher endpoint's
    // resolved arrays), isPublished is set by Set containment per item.
    const hasPublishedSets = publishedSets !== undefined;
    const publishedColorSet = hasPublishedSets ? new Set(publishedSets.colors) : null;
    const publishedEditionSet = hasPublishedSets ? new Set(publishedSets.editions) : null;
    const colorPublished = (combo: string, editionSlug: string | null) => {
      if (!publishedColorSet && !publishedEditionSet) return true;
      if (publishedColorSet?.has(combo)) return true;
      if (editionSlug && publishedEditionSet?.has(editionSlug)) return true;
      return false;
    };
    const editionPublished = (slug: string) => publishedEditionSet ? publishedEditionSet.has(slug) : true;

    // WHY: One chip per variant in the registry — never collapse two variants
    // into one chip even when their atoms match. Pre-fix bug (M75 Wireless):
    // 3 distinct SKUs (plain Black + 2 black-bodied editions) all rendered
    // as one "black" chip, hiding 2/3 of the evidence. Each variant carries
    // its own variant_id, evidence trail, and Del button — registry is SSOT.
    // Variants with empty color_atoms are skipped (degenerate edition data).
    const colors = registry
      .filter(v => (v.color_atoms?.length ?? 0) > 0)
      .map(v => {
        const combo = v.color_atoms.join('+');
        const isEdition = v.variant_type === 'edition';
        const displayName = isEdition
          ? (v.edition_display_name || v.variant_label || '')
          : (colorNameMap[combo] || '');
        const sources = variantSources(colorCands, v.variant_id);
        return toColorPill(
          combo,
          defaultColor,
          hexMap,
          displayName,
          sources,
          maxConfidence(sources),
          v.variant_id,
          colorPublished(combo, isEdition ? v.edition_slug : null),
        );
      });

    const editions: EditionBlock[] = pub.editions.map(slug => {
      const edMeta = editionDetailsMap[slug];
      const editionVariantId = variantByKey.get(`edition:${slug}`) ?? null;
      const editionSources = variantSources(editionCands, editionVariantId);
      return {
        slug,
        displayName: edMeta?.display_name || '',
        // pairedColors are atoms describing the edition's body — decorative.
        // Each atom links to its standalone color variant (if one exists) so
        // hover/click can show that color's evidence; published is a per-atom
        // check against publishedColorSet only (does NOT cascade from parent
        // edition — the test contract treats pairedColor presence and edition
        // presence as independent signals).
        pairedColors: (edMeta?.colors ?? []).map((name: string) => {
          const vid = variantByKey.get(`color:${name}`) ?? null;
          const sources = variantSources(colorCands, vid);
          return toColorPill(
            name,
            defaultColor,
            hexMap,
            colorNameMap[name] || '',
            sources,
            maxConfidence(sources),
            vid,
            colorPublished(name, null),
          );
        }),
        sources: editionSources,
        confidenceMax: maxConfidence(editionSources),
        variantId: editionVariantId,
        isPublished: editionPublished(slug),
      };
    });

    return {
      colors,
      editions,
      defaultColorHex: resolveHex(defaultColor, hexMap),
    };
  }

  return { colors: [], editions: [], defaultColorHex: '' };
}

export function deriveRunHistoryRows(
  result: ColorEditionFinderResult | null,
): RunHistoryRow[] {
  if (!result?.runs?.length) return [];

  const maxRunNumber = Math.max(...result.runs.map(r => r.run_number));

  return [...result.runs]
    .sort((a, b) => b.run_number - a.run_number)
    .map(run => {
      const isRejected = run.response?.status === 'rejected';
      const rejections = isRejected ? (run.response.rejections ?? []) : [];
      const rejectionSummary = rejections
        .map(r => {
          const detail = r.detail as Record<string, unknown>;
          const reason = detail?.reason ?? detail?.expected ?? r.reason_code;
          return `${r.reason_code}: ${String(reason)}`;
        })
        .join('; ');

      // WHY: Run 1 stores response as flat { colors, editions, discovery_log, ... }.
      // Run 2+ stores as { discovery: { colors, ..., discovery_log }, identity_check: ... }.
      // Resolve both shapes to extract siblings_excluded and discovery_log.
      const resp = run.response as unknown as Record<string, unknown>;
      const hasNestedResponse = resp?.discovery && typeof resp.discovery === 'object';
      const discoveryResp = (hasNestedResponse ? resp.discovery : resp) as Record<string, unknown>;
      const siblings = (discoveryResp?.siblings_excluded ?? []) as readonly string[];
      const dl = discoveryResp?.discovery_log as Record<string, readonly string[]> | undefined;
      const discoveryLog: RunDiscoveryLog = {
        confirmedCount: dl?.confirmed_from_known?.length ?? 0,
        addedNewCount: dl?.added_new?.length ?? 0,
        rejectedCount: dl?.rejected_from_known?.length ?? 0,
        urlsCheckedCount: dl?.urls_checked?.length ?? 0,
        queriesRunCount: dl?.queries_run?.length ?? 0,
        confirmedFromKnown: (dl?.confirmed_from_known ?? []) as readonly string[],
        addedNew: (dl?.added_new ?? []) as readonly string[],
        rejectedFromKnown: (dl?.rejected_from_known ?? []) as readonly string[],
        urlsChecked: (dl?.urls_checked ?? []) as readonly string[],
        queriesRun: (dl?.queries_run ?? []) as readonly string[],
      };

      // WHY: Run 1 stores prompt as { system, user }. Run 2+ stores as
      // { discovery: { system, user }, identity_check: { system, user } }.
      // Resolve both shapes into the flat systemPrompt/userMessage for display.
      const prompt = run.prompt as Record<string, unknown>;
      const hasNestedPrompt = prompt?.discovery && typeof prompt.discovery === 'object';
      const discoveryPrompt = hasNestedPrompt ? (prompt.discovery as Record<string, string>) : prompt;
      const systemPrompt = (discoveryPrompt?.system as string) ?? '';
      const userMessage = (discoveryPrompt?.user as string) ?? '';

      return {
        runNumber: run.run_number,
        ranAt: run.ran_at,
        model: run.model,
        fallbackUsed: run.fallback_used,
        effortLevel: run.effort_level ?? '',
        accessMode: run.access_mode ?? '',
        thinking: Boolean(run.thinking),
        webSearch: Boolean(run.web_search),
        colorCount: run.selected?.colors?.length ?? 0,
        editionCount: Object.keys(run.selected?.editions ?? {}).length,
        isLatest: run.run_number === maxRunNumber,
        validationStatus: isRejected ? 'rejected' as const : 'valid' as const,
        rejectionSummary,
        // WHY: PIF/RDF pattern — started_at + duration_ms ride inside the run's
        // response payload so they survive the shared runs-table schema, which
        // only persists ran_at. Top-level wins when present (runtime path); the
        // response fallback covers DB-projected runs (listRuns from SQL).
        startedAt: run.started_at ?? run.response?.started_at ?? '',
        durationMs: run.duration_ms ?? run.response?.duration_ms ?? null,
        selected: run.selected,
        systemPrompt,
        userMessage,
        responseJson: JSON.stringify(run.response, null, 2),
        siblingsExcluded: siblings,
        discoveryLog,
      };
    });
}
