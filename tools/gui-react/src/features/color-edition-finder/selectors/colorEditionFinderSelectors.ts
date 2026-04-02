import type { ColorEditionFinderResult, ColorRegistryEntry } from '../types.ts';

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

export interface ColorTableRow {
  readonly name: string;
  readonly hex: string;
  readonly isDefault: boolean;
  readonly isNew: boolean;
  readonly foundRun: number;
  readonly foundAt: string;
  readonly model: string;
}

export interface EditionTableRow {
  readonly slug: string;
  readonly foundRun: number;
  readonly foundAt: string;
  readonly model: string;
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

  // Count new colors: colors that don't appear in color_details with found_run === run_count
  // Simplification: "new colors" is 0 unless the run response explicitly tracked it
  // For now, derive from the number of new_colors returned (not stored in result — always 0 in display)
  const newColors = 0;

  const cooldown = deriveCooldownState(result);
  const cooldownLabel = cooldown.onCooldown
    ? `${cooldown.daysRemaining}d`
    : runCount > 0 ? 'Ready' : '--';

  return [
    { label: 'Colors', value: String(colors), tone: 'accent' },
    { label: 'Editions', value: String(editions), tone: 'purple' },
    { label: 'New Colors', value: String(newColors), tone: 'warning' },
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

export function deriveColorTableRows(
  result: ColorEditionFinderResult | null,
  colorRegistry: ColorRegistryEntry[],
): ColorTableRow[] {
  if (!result) return [];

  const hexMap = new Map(colorRegistry.map(c => [c.name, c.hex]));

  return result.colors.map((name, idx) => {
    const detail = result.color_details[name];
    // For multi-color (e.g. "black+red"), derive hex from first atom
    const firstAtom = name.split('+')[0] || name;
    const hex = hexMap.get(firstAtom) || hexMap.get(name) || '';
    const isDefault = idx === 0 && name === result.default_color;

    return {
      name,
      hex,
      isDefault,
      isNew: false, // Would need tracking in result to know
      foundRun: detail?.found_run ?? 0,
      foundAt: detail?.found_at?.split('T')[0] ?? '',
      model: detail?.model ?? '',
    };
  });
}

export function deriveEditionTableRows(result: ColorEditionFinderResult | null): EditionTableRow[] {
  if (!result) return [];

  return result.editions.map(slug => {
    const detail = result.edition_details[slug];
    return {
      slug,
      foundRun: detail?.found_run ?? 0,
      foundAt: detail?.found_at?.split('T')[0] ?? '',
      model: detail?.model ?? '',
    };
  });
}

export function deriveFinderStatusChip(result: ColorEditionFinderResult | null): StatusChip {
  if (!result) return { label: 'Not Run', tone: 'neutral' };
  return { label: `Run ${result.run_count}`, tone: 'success' };
}
