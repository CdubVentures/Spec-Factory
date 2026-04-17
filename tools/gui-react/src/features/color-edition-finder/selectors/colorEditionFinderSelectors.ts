import type { ColorEditionFinderResult, ColorEditionFinderSelected, ColorRegistryEntry, CefCandidateEntry } from '../types.ts';

export interface ColorPill {
  readonly name: string;
  readonly displayName: string;
  readonly hex: string;
  readonly hexParts: readonly string[];
  readonly isDefault: boolean;
  readonly sourceCount: number;
  readonly variantId: string | null;
  readonly isPublished: boolean;
}

export interface EditionBlock {
  readonly slug: string;
  readonly displayName: string;
  readonly pairedColors: readonly ColorPill[];
  readonly sourceCount: number;
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

function toColorPill(name: string, defaultColor: string, hexMap: Map<string, string>, displayName = '', sourceCount = 0, variantId: string | null = null, isPublished = true): ColorPill {
  return { name, displayName, hex: resolveHex(name, hexMap), hexParts: resolveHexParts(name, hexMap), isDefault: name === defaultColor, sourceCount, variantId, isPublished };
}

/**
 * Count how many extraction events (source-centric rows) contain a given item.
 * WHY: Source-centric model — each row is one extraction event, so count = matching rows.
 */
function findItemSourceCount(candidates: readonly CefCandidateEntry[], item: string): number {
  let total = 0;
  for (const c of candidates) {
    let items: string[];
    try { items = typeof c.value === 'string' ? JSON.parse(c.value) : []; }
    catch { items = []; }
    if (!Array.isArray(items)) items = [c.value as string];
    if (items.some(v => String(v) === item)) total += 1;
  }
  return total;
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

    // WHY: An edition variant is also a color variant — its paired colors
    // form a combo (joined with '+') that surfaces on the Colors side.
    // Track contributing edition slugs per combo so P can cascade from
    // the edition's resolved state onto the combo pill.
    const editionsByCombo = new Map<string, string[]>();
    for (const slug of pub.editions) {
      const paired = editionDetailsMap[slug]?.colors ?? [];
      if (paired.length === 0) continue;
      const combo = paired.join('+');
      const existing = editionsByCombo.get(combo);
      if (existing) existing.push(slug);
      else editionsByCombo.set(combo, [slug]);
    }

    // WHY: When publishedSets is omitted, every rendered item is treated as
    // published (back-compat). When provided (from the publisher endpoint's
    // resolved arrays), isPublished is set by Set containment per item.
    const hasPublishedSets = publishedSets !== undefined;
    const publishedColorSet = hasPublishedSets ? new Set(publishedSets.colors) : null;
    const publishedEditionSet = hasPublishedSets ? new Set(publishedSets.editions) : null;
    const colorPublished = (name: string) => {
      if (!publishedColorSet && !publishedEditionSet) return true;
      if (publishedColorSet?.has(name)) return true;
      const contribs = editionsByCombo.get(name);
      if (contribs && publishedEditionSet) {
        return contribs.some(slug => publishedEditionSet.has(slug));
      }
      return false;
    };
    const editionPublished = (slug: string) => publishedEditionSet ? publishedEditionSet.has(slug) : true;

    // Union standalone colors with edition-derived combos (dedupe by name,
    // preserve standalone order then append new combos).
    const seenColorNames = new Set<string>(pub.colors);
    const allColorNames: string[] = [...pub.colors];
    for (const combo of editionsByCombo.keys()) {
      if (!seenColorNames.has(combo)) {
        allColorNames.push(combo);
        seenColorNames.add(combo);
      }
    }

    const colors = allColorNames.map(name =>
      toColorPill(name, defaultColor, hexMap, colorNameMap[name] || '', findItemSourceCount(colorCands, name), variantByKey.get(`color:${name}`) ?? null, colorPublished(name))
    );

    const editions: EditionBlock[] = pub.editions.map(slug => {
      const edMeta = editionDetailsMap[slug];
      return {
        slug,
        displayName: edMeta?.display_name || '',
        pairedColors: (edMeta?.colors ?? []).map((name: string) =>
          toColorPill(name, defaultColor, hexMap, colorNameMap[name] || '', findItemSourceCount(colorCands, name), variantByKey.get(`color:${name}`) ?? null, colorPublished(name))
        ),
        sourceCount: findItemSourceCount(editionCands, slug),
        variantId: variantByKey.get(`edition:${slug}`) ?? null,
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
        startedAt: run.started_at ?? '',
        durationMs: run.duration_ms ?? null,
        selected: run.selected,
        systemPrompt,
        userMessage,
        responseJson: JSON.stringify(run.response, null, 2),
        siblingsExcluded: siblings,
        discoveryLog,
      };
    });
}
