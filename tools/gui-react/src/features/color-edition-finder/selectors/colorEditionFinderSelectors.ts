import type { ColorEditionFinderResult, ColorEditionFinderSelected, ColorRegistryEntry } from '../types.ts';

export interface ColorPill {
  readonly name: string;
  readonly displayName: string;
  readonly hex: string;
  readonly hexParts: readonly string[];
  readonly isDefault: boolean;
}

export interface EditionBlock {
  readonly slug: string;
  readonly displayName: string;
  readonly pairedColors: readonly ColorPill[];
}

export interface SelectedStateDisplay {
  readonly colors: readonly ColorPill[];
  readonly editions: readonly EditionBlock[];
  readonly ssotRunNumber: number;
  readonly defaultColorHex: string;
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
  const colors = result?.colors?.length ?? 0;
  const editions = result?.editions?.length ?? 0;
  const runCount = result?.run_count ?? 0;

  const cooldown = deriveCooldownState(result);
  const cooldownLabel = cooldown.onCooldown
    ? `${cooldown.daysRemaining}d`
    : runCount > 0 ? 'Ready' : '--';

  return [
    { label: 'Colors', value: String(colors), tone: 'accent' },
    { label: 'Editions', value: String(editions), tone: 'purple' },
    { label: 'Default Color', value: result?.default_color || '--', tone: 'teal' },
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

function toColorPill(name: string, defaultColor: string, hexMap: Map<string, string>, displayName = ''): ColorPill {
  return { name, displayName, hex: resolveHex(name, hexMap), hexParts: resolveHexParts(name, hexMap), isDefault: name === defaultColor };
}

export function deriveSelectedStateDisplay(
  result: ColorEditionFinderResult | null,
  colorRegistry: ColorRegistryEntry[],
): SelectedStateDisplay {
  if (!result?.selected) {
    return { colors: [], editions: [], ssotRunNumber: 0, defaultColorHex: '' };
  }

  const hexMap = new Map(colorRegistry.map(c => [c.name, c.hex]));
  const sel = result.selected;
  const colorNamesMap = sel.color_names ?? {};

  const colors = sel.colors.map(name => toColorPill(name, sel.default_color, hexMap, colorNamesMap[name] || ''));

  const editions = Object.entries(sel.editions).map(([slug, ed]) => ({
    slug,
    displayName: ed.display_name || '',
    pairedColors: ed.colors.map(name => toColorPill(name, sel.default_color, hexMap, colorNamesMap[name] || '')),
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
      };
    });
}
