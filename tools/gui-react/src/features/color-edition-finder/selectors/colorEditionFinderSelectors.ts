import type { ColorEditionFinderResult, ColorEditionFinderSelected, ColorRegistryEntry, CefCandidateEntry } from '../types.ts';

export interface ColorPill {
  readonly name: string;
  readonly displayName: string;
  readonly hex: string;
  readonly hexParts: readonly string[];
  readonly isDefault: boolean;
  readonly sourceCount: number;
}

export interface EditionBlock {
  readonly slug: string;
  readonly displayName: string;
  readonly pairedColors: readonly ColorPill[];
  readonly sourceCount: number;
}

export interface SelectedStateDisplay {
  readonly colors: readonly ColorPill[];
  readonly editions: readonly EditionBlock[];
  readonly ssotRunNumber: number;
  readonly defaultColorHex: string;
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
  readonly colorCount: number;
  readonly editionCount: number;
  readonly isLatest: boolean;
  readonly validationStatus: 'valid' | 'rejected';
  readonly rejectionSummary: string;
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

export interface CooldownState {
  readonly onCooldown: boolean;
  readonly daysRemaining: number;
  readonly progressPct: number;
  readonly label: string;
  readonly eligibleDate: string;
}

export interface StatusChip {
  readonly label: string;
  readonly tone: string;
}

const COOLDOWN_DAYS = 30;

export function deriveFinderKpiCards(result: ColorEditionFinderResult | null): KpiCard[] {
  // Prefer published truth from field_candidates; fall back to summary table
  const colors = result?.published?.colors?.length ?? result?.colors?.length ?? 0;
  const editions = result?.published?.editions?.length ?? result?.editions?.length ?? 0;
  const defaultColor = result?.published?.default_color || result?.default_color || '--';
  const runCount = result?.run_count ?? 0;

  const cooldown = deriveCooldownState(result);
  const cooldownLabel = cooldown.onCooldown
    ? `${cooldown.daysRemaining}d`
    : runCount > 0 ? 'Ready' : '--';

  return [
    { label: 'Colors', value: String(colors), tone: 'accent' },
    { label: 'Editions', value: String(editions), tone: 'purple' },
    { label: 'Default Color', value: defaultColor, tone: 'teal' },
    { label: 'Runs', value: String(runCount), tone: 'success' },
    { label: 'Cooldown', value: cooldownLabel, tone: 'info' },
  ];
}

export function deriveCooldownState(result: ColorEditionFinderResult | null): CooldownState {
  if (!result || !result.cooldown_until) {
    return { onCooldown: false, daysRemaining: 0, progressPct: 100, label: '', eligibleDate: '' };
  }

  const now = Date.now();
  const cooldownEnd = new Date(result.cooldown_until).getTime();

  if (Number.isNaN(cooldownEnd) || cooldownEnd <= now) {
    return { onCooldown: false, daysRemaining: 0, progressPct: 100, label: 'Ready', eligibleDate: '' };
  }

  const msRemaining = cooldownEnd - now;
  const daysRemaining = Math.ceil(msRemaining / 86400000);
  const totalMs = COOLDOWN_DAYS * 86400000;
  const elapsed = totalMs - msRemaining;
  const progressPct = Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
  const eligibleDate = result.cooldown_until.split('T')[0] || '';

  return {
    onCooldown: true,
    daysRemaining,
    progressPct,
    label: `${daysRemaining}d remaining`,
    eligibleDate,
  };
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

function toColorPill(name: string, defaultColor: string, hexMap: Map<string, string>, displayName = '', sourceCount = 0): ColorPill {
  return { name, displayName, hex: resolveHex(name, hexMap), hexParts: resolveHexParts(name, hexMap), isDefault: name === defaultColor, sourceCount };
}

/**
 * Find the candidate entry whose array value contains a given item.
 * Returns the source_count from the best-matching candidate, or 0.
 */
function findItemSourceCount(candidates: readonly CefCandidateEntry[], item: string): number {
  let total = 0;
  for (const c of candidates) {
    let items: string[];
    try { items = typeof c.value === 'string' ? JSON.parse(c.value) : []; }
    catch { items = []; }
    if (!Array.isArray(items)) items = [c.value as string];
    if (items.some(v => String(v) === item)) total += c.source_count;
  }
  return total;
}

export function deriveSelectedStateDisplay(
  result: ColorEditionFinderResult | null,
  colorRegistry: ColorRegistryEntry[],
): SelectedStateDisplay {
  const hexMap = new Map(colorRegistry.map(c => [c.name, c.hex]));

  // Prefer published truth from field_candidates; fall back to selected
  const pub = result?.published;
  const cands = result?.candidates;

  if (pub && pub.colors.length > 0) {
    // Build display name map from candidate metadata
    const colorNameMap: Record<string, string> = {};
    for (const c of cands?.colors ?? []) {
      const meta = c.metadata as Record<string, unknown>;
      const names = meta?.color_names as Record<string, string> | undefined;
      if (names) Object.assign(colorNameMap, names);
    }

    const defaultColor = pub.default_color || pub.colors[0] || '';
    const colorCands = cands?.colors ?? [];
    const editionCands = cands?.editions ?? [];

    const colors = pub.colors.map(name =>
      toColorPill(name, defaultColor, hexMap, colorNameMap[name] || '', findItemSourceCount(colorCands, name))
    );

    // Build edition blocks from candidate metadata
    const editions: EditionBlock[] = pub.editions.map(slug => {
      const edCand = editionCands.find(c => {
        let items: string[];
        try { items = typeof c.value === 'string' ? JSON.parse(c.value) : []; }
        catch { items = []; }
        if (!Array.isArray(items)) items = [c.value as string];
        return items.includes(slug);
      });
      const meta = (edCand?.metadata ?? {}) as Record<string, unknown>;
      const edDetails = meta?.edition_details as Record<string, { display_name?: string; colors?: string[] }> | undefined;
      const edMeta = edDetails?.[slug];
      return {
        slug,
        displayName: (edMeta?.display_name as string) || '',
        pairedColors: (edMeta?.colors ?? []).map((name: string) =>
          toColorPill(name, defaultColor, hexMap, colorNameMap[name] || '', findItemSourceCount(colorCands, name))
        ),
        sourceCount: findItemSourceCount(editionCands, slug),
      };
    });

    return {
      colors,
      editions,
      ssotRunNumber: result?.run_count ?? 0,
      defaultColorHex: resolveHex(defaultColor, hexMap),
    };
  }

  // Fallback: use deprecated selected (backward compat)
  if (!result?.selected) {
    return { colors: [], editions: [], ssotRunNumber: 0, defaultColorHex: '' };
  }

  const sel = result.selected;
  const colorNamesMap = sel.color_names ?? {};

  const colors = sel.colors.map(name => toColorPill(name, sel.default_color, hexMap, colorNamesMap[name] || '', 0));

  const editions = Object.entries(sel.editions).map(([slug, ed]) => ({
    slug,
    displayName: ed.display_name || '',
    pairedColors: ed.colors.map(name => toColorPill(name, sel.default_color, hexMap, colorNamesMap[name] || '', 0)),
    sourceCount: 0,
  }));

  return {
    colors,
    editions,
    ssotRunNumber: result.run_count,
    defaultColorHex: resolveHex(sel.default_color, hexMap),
  };
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

      const siblings = run.response?.siblings_excluded ?? [];
      const dl = run.response?.discovery_log;
      const discoveryLog: RunDiscoveryLog = {
        confirmedCount: dl?.confirmed_from_known?.length ?? 0,
        addedNewCount: dl?.added_new?.length ?? 0,
        rejectedCount: dl?.rejected_from_known?.length ?? 0,
        urlsCheckedCount: dl?.urls_checked?.length ?? 0,
        queriesRunCount: dl?.queries_run?.length ?? 0,
        confirmedFromKnown: dl?.confirmed_from_known ?? [],
        addedNew: dl?.added_new ?? [],
        rejectedFromKnown: dl?.rejected_from_known ?? [],
        urlsChecked: dl?.urls_checked ?? [],
        queriesRun: dl?.queries_run ?? [],
      };

      return {
        runNumber: run.run_number,
        ranAt: run.ran_at,
        model: run.model,
        fallbackUsed: run.fallback_used,
        colorCount: run.selected?.colors?.length ?? 0,
        editionCount: Object.keys(run.selected?.editions ?? {}).length,
        isLatest: run.run_number === maxRunNumber,
        validationStatus: isRejected ? 'rejected' as const : 'valid' as const,
        rejectionSummary,
        selected: run.selected,
        systemPrompt: run.prompt?.system ?? '',
        userMessage: run.prompt?.user ?? '',
        responseJson: JSON.stringify(run.response, null, 2),
        siblingsExcluded: siblings,
        discoveryLog,
      };
    });
}
