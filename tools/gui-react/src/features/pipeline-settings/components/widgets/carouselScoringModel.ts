export const CAROUSEL_CANONICAL_VIEWS = [
  { key: 'top', label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'front', label: 'Front' },
  { key: 'rear', label: 'Rear' },
  { key: 'sangle', label: 'S-Angle' },
  { key: 'angle', label: 'Angle' },
] as const;

export type CarouselViewKey = typeof CAROUSEL_CANONICAL_VIEWS[number]['key'];
export type CarouselColumn = 'scored' | 'optional';

export interface CarouselScoringStateInput {
  readonly scoredValue: string;
  readonly optionalValue: string;
  readonly extraTargetValue: string;
  readonly viewBudgetValue: string;
  readonly category: string;
}

export interface CarouselScoringState {
  readonly scoredViews: readonly CarouselViewKey[];
  readonly optionalViews: readonly CarouselViewKey[];
  readonly extraTarget: number;
  readonly usesViewBudget: boolean;
}

export interface CarouselViewToggleInput {
  readonly state: CarouselScoringState;
  readonly view: CarouselViewKey;
  readonly column: CarouselColumn;
}

export const DEFAULT_CAROUSEL_EXTRA_TARGET = 3;

const CATEGORY_VIEW_BUDGET_DEFAULTS: Readonly<Record<string, readonly CarouselViewKey[]>> = {
  mouse: ['top', 'left', 'sangle', 'angle', 'front', 'bottom'],
  keyboard: ['top', 'left', 'sangle', 'angle'],
  monitor: ['front', 'sangle', 'angle', 'rear', 'left'],
  mousepad: ['top', 'angle'],
};

const GENERIC_VIEW_BUDGET_DEFAULT: readonly CarouselViewKey[] = ['top', 'left', 'angle'];

const CANONICAL_KEYS: ReadonlySet<string> = new Set(CAROUSEL_CANONICAL_VIEWS.map((view) => view.key));

export function parseCarouselViewList(value: string): CarouselViewKey[] {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return uniqueCanonicalViews(parsed);
  } catch {
    return [];
  }
}

export function resolveViewBudgetForCarousel(value: string, category: string): CarouselViewKey[] {
  const parsed = parseCarouselViewList(value);
  if (parsed.length > 0) return parsed;
  return [...(CATEGORY_VIEW_BUDGET_DEFAULTS[category] ?? GENERIC_VIEW_BUDGET_DEFAULT)];
}

export function parseCarouselExtraTarget(value: string): number {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CAROUSEL_EXTRA_TARGET;
  return clampExtraTarget(parsed);
}

export function clampExtraTarget(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CAROUSEL_EXTRA_TARGET;
  return Math.max(0, Math.min(20, Math.round(value)));
}

export function resolveCarouselScoringState(input: CarouselScoringStateInput): CarouselScoringState {
  const explicitScored = parseCarouselViewList(input.scoredValue);
  const scoredViews = explicitScored.length > 0
    ? explicitScored
    : resolveViewBudgetForCarousel(input.viewBudgetValue, input.category);
  const scoredSet = new Set(scoredViews);
  const optionalViews = parseCarouselViewList(input.optionalValue)
    .filter((view) => !scoredSet.has(view));

  return {
    scoredViews,
    optionalViews,
    extraTarget: parseCarouselExtraTarget(input.extraTargetValue),
    usesViewBudget: explicitScored.length === 0,
  };
}

export function buildCarouselViewTogglePayload(input: CarouselViewToggleInput): Record<string, string> {
  const scored = new Set(input.state.scoredViews);
  const optional = new Set(input.state.optionalViews);

  if (input.column === 'scored') {
    if (scored.has(input.view)) {
      if (scored.size > 1) scored.delete(input.view);
    } else if (optional.has(input.view)) {
      return {
        carouselScoredViews: stringifyOrderedViews(scored),
        carouselOptionalViews: stringifyOrderedViews(optional),
      };
    } else {
      scored.add(input.view);
    }
  } else if (optional.has(input.view)) {
    optional.delete(input.view);
  } else {
    optional.add(input.view);
    scored.delete(input.view);
  }

  return {
    carouselScoredViews: stringifyOrderedViews(scored),
    carouselOptionalViews: stringifyOrderedViews(optional),
  };
}

export function buildCarouselExtraTargetPayload(value: string): Record<string, string> {
  return {
    carouselExtraTarget: String(parseCarouselExtraTarget(value)),
  };
}

function uniqueCanonicalViews(values: readonly unknown[]): CarouselViewKey[] {
  const seen = new Set<string>();
  const result: CarouselViewKey[] = [];
  for (const raw of values) {
    const key = String(raw ?? '').trim();
    if (!CANONICAL_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(key as CarouselViewKey);
  }
  return result;
}

function stringifyOrderedViews(values: ReadonlySet<CarouselViewKey>): string {
  const ordered = CAROUSEL_CANONICAL_VIEWS
    .map((view) => view.key)
    .filter((key) => values.has(key));
  return JSON.stringify(ordered);
}
