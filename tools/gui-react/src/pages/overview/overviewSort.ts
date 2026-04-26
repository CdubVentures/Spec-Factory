import type { SortingState } from '@tanstack/react-table';
import type { CatalogRow } from '../../types/product.ts';
import type { KeyTierProgressGen } from '../../types/product.generated.ts';
import { computeScoreCard } from './scoreCard.ts';

const OVERVIEW_SORT_STORAGE_KEY_PREFIX = 'sf:overview:sort:';

export const OVERVIEW_SORTABLE_COLUMN_IDS = [
  'brand',
  'base_model',
  'variant',
  'cefRunCount',
  'pifVariants',
  'rdfVariants',
  'skuVariants',
  'key',
  'scoreCard',
  'coverage',
  'confidence',
  'fieldsFilled',
  'live',
  'lastRun',
] as const;

export type OverviewSortableColumnId = typeof OVERVIEW_SORTABLE_COLUMN_IDS[number];

const FIRST_SORT_DESC: Readonly<Record<OverviewSortableColumnId, boolean>> = {
  brand: false,
  base_model: false,
  variant: false,
  cefRunCount: true,
  pifVariants: true,
  rdfVariants: true,
  skuVariants: true,
  key: true,
  scoreCard: true,
  coverage: true,
  confidence: true,
  fieldsFilled: true,
  live: true,
  lastRun: true,
};

function isOverviewSortableColumnId(columnId: string): columnId is OverviewSortableColumnId {
  return OVERVIEW_SORTABLE_COLUMN_IDS.includes(columnId as OverviewSortableColumnId);
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseOverviewSorting(value: unknown): SortingState {
  if (!Array.isArray(value)) return [];
  return value.reduce<SortingState>((acc, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return acc;
    const id = (entry as { id?: unknown }).id;
    const desc = (entry as { desc?: unknown }).desc;
    if (typeof id !== 'string' || !isOverviewSortableColumnId(id)) return acc;
    if (typeof desc !== 'boolean') return acc;
    acc.push({ id, desc });
    return acc;
  }, []);
}

function parseOverviewSortSessionState(raw: string | null): SortingState {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const wrapped = (parsed as { state?: unknown }).state;
    const base = wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)
      ? wrapped
      : parsed;
    return parseOverviewSorting((base as { sorting?: unknown }).sorting);
  } catch {
    return [];
  }
}

export function buildOverviewSortStorageKey(category: string): string {
  const token = String(category || '').trim() || 'default';
  return `${OVERVIEW_SORT_STORAGE_KEY_PREFIX}${token}`;
}

export function readOverviewSortSessionState(category: string): SortingState {
  const key = buildOverviewSortStorageKey(category);
  const local = getLocalStorage();
  if (local) {
    try {
      const raw = local.getItem(key);
      if (raw) return parseOverviewSortSessionState(raw);
    } catch {
      return [];
    }
  }

  const session = getSessionStorage();
  if (!session) return [];
  try {
    const legacy = session.getItem(key);
    if (!legacy) return [];
    local?.setItem(key, legacy);
    session.removeItem(key);
    return parseOverviewSortSessionState(legacy);
  } catch {
    return [];
  }
}

export function writeOverviewSortSessionState(category: string, sorting: SortingState): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(
      buildOverviewSortStorageKey(category),
      JSON.stringify({ sorting: parseOverviewSorting(sorting) }),
    );
  } catch {
    return;
  }
}

export function getOverviewColumnFirstSortDesc(columnId: string): boolean {
  return isOverviewSortableColumnId(columnId) ? FIRST_SORT_DESC[columnId] : false;
}

export function toggleOverviewSortStack(current: SortingState, columnId: string): SortingState {
  if (!isOverviewSortableColumnId(columnId)) return current;

  const existing = current.find((entry) => entry.id === columnId);
  const rest = current.filter((entry) => entry.id !== columnId);
  const firstDesc = FIRST_SORT_DESC[columnId];

  if (!existing) return [{ id: columnId, desc: firstDesc }, ...rest];
  if (existing.desc === firstDesc) return [{ id: columnId, desc: !firstDesc }, ...rest];
  return rest;
}

export function sortOverviewRows(
  rows: readonly CatalogRow[],
  sorting: SortingState,
  runningByProduct: ReadonlyMap<string, readonly string[]>,
): CatalogRow[] {
  if (sorting.length === 0) return [...rows];

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const result = compareOverviewRows(a.row, b.row, sorting, runningByProduct);
      return result || a.index - b.index;
    })
    .map(({ row }) => row);
}

function compareOverviewRows(
  a: CatalogRow,
  b: CatalogRow,
  sorting: SortingState,
  runningByProduct: ReadonlyMap<string, readonly string[]>,
): number {
  for (const entry of sorting) {
    if (!isOverviewSortableColumnId(entry.id)) continue;
    const result = compareOverviewColumn(a, b, entry.id, runningByProduct);
    if (result !== 0) return entry.desc ? -result : result;
  }
  return 0;
}

function compareOverviewColumn(
  a: CatalogRow,
  b: CatalogRow,
  columnId: OverviewSortableColumnId,
  runningByProduct: ReadonlyMap<string, readonly string[]>,
): number {
  switch (columnId) {
    case 'brand': return compareText(a.brand, b.brand);
    case 'base_model': return compareText(a.base_model, b.base_model);
    case 'variant': return compareText(a.variant, b.variant);
    case 'cefRunCount': return compareNumber(a.cefRunCount, b.cefRunCount);
    case 'pifVariants': return compareNumber(a.pifVariants.length, b.pifVariants.length);
    case 'rdfVariants': return compareNumber(a.rdfVariants.length, b.rdfVariants.length);
    case 'skuVariants': return compareNumber(a.skuVariants.length, b.skuVariants.length);
    case 'key': return compareKeyTiers(a.keyTierProgress, b.keyTierProgress);
    case 'scoreCard': return compareNumber(computeScoreCard(a).score, computeScoreCard(b).score);
    case 'coverage': return compareNumber(a.coverage, b.coverage);
    case 'confidence': return compareNumber(a.confidence, b.confidence);
    case 'fieldsFilled': return compareNumber(a.fieldsFilled, b.fieldsFilled);
    case 'live': return compareLive(a.productId, b.productId, runningByProduct);
    case 'lastRun': return compareNumber(getOverviewLastRunMs(a), getOverviewLastRunMs(b));
  }
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function compareNumber(a: number, b: number): number {
  const safeA = Number.isFinite(a) ? a : 0;
  const safeB = Number.isFinite(b) ? b : 0;
  return safeA - safeB;
}

function compareKeyTiers(
  a: readonly KeyTierProgressGen[],
  b: readonly KeyTierProgressGen[],
): number {
  const resolvedA = a.reduce((sum, tier) => sum + tier.resolved, 0);
  const resolvedB = b.reduce((sum, tier) => sum + tier.resolved, 0);
  return compareNumber(resolvedA, resolvedB);
}

function compareLive(
  productIdA: string,
  productIdB: string,
  runningByProduct: ReadonlyMap<string, readonly string[]>,
): number {
  const modulesA = runningByProduct.get(productIdA) ?? [];
  const modulesB = runningByProduct.get(productIdB) ?? [];

  return (
    compareNumber(modulesA.length, modulesB.length) ||
    compareText(modulesA.join(','), modulesB.join(','))
  );
}

function parseDateMs(value: string): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

export function getOverviewLastRunMs(row: CatalogRow): number {
  return Math.max(
    parseDateMs(row.cefLastRunAt),
    parseDateMs(row.pifLastRunAt),
    parseDateMs(row.rdfLastRunAt),
    parseDateMs(row.skuLastRunAt),
    parseDateMs(row.kfLastRunAt),
  );
}
