import type { SortingState } from '@tanstack/react-table';
import type { CatalogRow } from '../../types/product.ts';
import type { KeyTierProgressGen } from '../../types/product.generated.ts';
import { FINDER_PANELS } from '../../features/indexing/state/finderPanelRegistry.generated.ts';
import { getScoreCard } from './scoreCard.ts';

const OVERVIEW_SORT_STORAGE_KEY_PREFIX = 'sf:overview:sort:';
const OVERVIEW_SORT_STORAGE_VERSION = 2;

const OVERVIEW_PREFIX_SORTABLE_COLUMN_IDS = [
  'brand',
  'base_model',
  'variant',
] as const;

const OVERVIEW_SUFFIX_SORTABLE_COLUMN_IDS = [
  'scoreCard',
  'coverage',
  'confidence',
  'fieldsFilled',
  'live',
  'lastRun',
] as const;

type OverviewFinderSortKind = 'runCount' | 'variants' | 'key';

interface OverviewFinderSortColumn {
  readonly id: string;
  readonly catalogKey: string;
  readonly kind: OverviewFinderSortKind;
}

function buildOverviewFinderSortColumns(): readonly OverviewFinderSortColumn[] {
  return FINDER_PANELS.flatMap((panel): OverviewFinderSortColumn[] => {
    if (panel.moduleClass === 'variantGenerator') {
      return [{ id: `${panel.catalogKey}RunCount`, catalogKey: panel.catalogKey, kind: 'runCount' }];
    }
    if (panel.moduleClass === 'variantArtifactProducer' || panel.moduleClass === 'variantFieldProducer') {
      return [{ id: `${panel.catalogKey}Variants`, catalogKey: panel.catalogKey, kind: 'variants' }];
    }
    if (panel.moduleClass === 'productFieldProducer') {
      return [{ id: 'key', catalogKey: panel.catalogKey, kind: 'key' }];
    }
    return [];
  });
}

const OVERVIEW_FINDER_SORT_COLUMNS = buildOverviewFinderSortColumns();
const OVERVIEW_FINDER_SORT_COLUMN_BY_ID = new Map(
  OVERVIEW_FINDER_SORT_COLUMNS.map((column) => [column.id, column]),
);
const OVERVIEW_LAST_RUN_FIELD_IDS = FINDER_PANELS.map((panel) => `${panel.catalogKey}LastRunAt`);

export const OVERVIEW_SORTABLE_COLUMN_IDS = [
  ...OVERVIEW_PREFIX_SORTABLE_COLUMN_IDS,
  ...OVERVIEW_FINDER_SORT_COLUMNS.map((column) => column.id),
  ...OVERVIEW_SUFFIX_SORTABLE_COLUMN_IDS,
] as readonly string[];

export type OverviewSortableColumnId = typeof OVERVIEW_SORTABLE_COLUMN_IDS[number];

const FIRST_SORT_DESC: Readonly<Record<string, boolean>> = Object.freeze(
  Object.fromEntries(OVERVIEW_SORTABLE_COLUMN_IDS.map((columnId) => [
    columnId,
    !OVERVIEW_PREFIX_SORTABLE_COLUMN_IDS.includes(columnId as typeof OVERVIEW_PREFIX_SORTABLE_COLUMN_IDS[number]),
  ])),
);

function isOverviewSortableColumnId(columnId: string): boolean {
  return OVERVIEW_SORTABLE_COLUMN_IDS.includes(columnId);
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseOverviewSorting(
  value: unknown,
  { allowLive = true }: { readonly allowLive?: boolean } = {},
): SortingState {
  if (!Array.isArray(value)) return [];
  return value.reduce<SortingState>((acc, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return acc;
    const id = (entry as { id?: unknown }).id;
    const desc = (entry as { desc?: unknown }).desc;
    if (typeof id !== 'string' || !isOverviewSortableColumnId(id)) return acc;
    if (id === 'live' && !allowLive) return acc;
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
    const version = Number((base as { version?: unknown }).version);
    return parseOverviewSorting((base as { sorting?: unknown }).sorting, {
      allowLive: version >= OVERVIEW_SORT_STORAGE_VERSION,
    });
  } catch {
    return [];
  }
}

export function buildOverviewSortStorageKey(category: string): string {
  const token = String(category || '').trim() || 'default';
  return `${OVERVIEW_SORT_STORAGE_KEY_PREFIX}${token}`;
}

export function readOverviewSortSessionState(category: string): SortingState {
  const storage = getSessionStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(buildOverviewSortStorageKey(category));
    if (!raw) return [];
    return parseOverviewSortSessionState(raw);
  } catch {
    return [];
  }
}

export function writeOverviewSortSessionState(category: string, sorting: SortingState): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(
      buildOverviewSortStorageKey(category),
      JSON.stringify({
        version: OVERVIEW_SORT_STORAGE_VERSION,
        sorting: parseOverviewSorting(sorting),
      }),
    );
  } catch {
    return;
  }
}

export function overviewSortingUsesLive(sorting: SortingState): boolean {
  return parseOverviewSorting(sorting).some((entry) => entry.id === 'live');
}

export function getOverviewColumnFirstSortDesc(columnId: string): boolean {
  return isOverviewSortableColumnId(columnId) ? FIRST_SORT_DESC[columnId] ?? false : false;
}

export function toggleOverviewSortStack(current: SortingState, columnId: string): SortingState {
  if (!isOverviewSortableColumnId(columnId)) return current;

  const existing = current.find((entry) => entry.id === columnId);
  const rest = current.filter((entry) => entry.id !== columnId);
  const firstDesc = FIRST_SORT_DESC[columnId] ?? false;

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
  columnId: string,
  runningByProduct: ReadonlyMap<string, readonly string[]>,
): number {
  const finderResult = compareOverviewFinderColumn(a, b, columnId);
  if (finderResult !== null) return finderResult;

  switch (columnId) {
    case 'brand': return compareText(a.brand, b.brand);
    case 'base_model': return compareText(a.base_model, b.base_model);
    case 'variant': return compareText(a.variant, b.variant);
    case 'scoreCard': return compareNumber(getScoreCard(a).score, getScoreCard(b).score);
    case 'coverage': return compareNumber(a.coverage, b.coverage);
    case 'confidence': return compareNumber(a.confidence, b.confidence);
    case 'fieldsFilled': return compareNumber(a.fieldsFilled, b.fieldsFilled);
    case 'live': return compareLive(a.productId, b.productId, runningByProduct);
    case 'lastRun': return compareNumber(getOverviewLastRunMs(a), getOverviewLastRunMs(b));
    default: return 0;
  }
}

function compareOverviewFinderColumn(a: CatalogRow, b: CatalogRow, columnId: string): number | null {
  const column = OVERVIEW_FINDER_SORT_COLUMN_BY_ID.get(columnId);
  if (!column) return null;
  if (column.kind === 'key') return compareKeyTiers(a.keyTierProgress, b.keyTierProgress);
  if (column.kind === 'runCount') {
    return compareNumber(
      readCatalogNumber(a, `${column.catalogKey}RunCount`),
      readCatalogNumber(b, `${column.catalogKey}RunCount`),
    );
  }
  return compareNumber(
    readCatalogArrayLength(a, `${column.catalogKey}Variants`),
    readCatalogArrayLength(b, `${column.catalogKey}Variants`),
  );
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
    0,
    ...OVERVIEW_LAST_RUN_FIELD_IDS.map((fieldId) => parseDateMs(readCatalogString(row, fieldId))),
  );
}

function readCatalogValue(row: CatalogRow, key: string): unknown {
  const record = row as unknown as Record<string, unknown>;
  return record[key];
}

function readCatalogArrayLength(row: CatalogRow, key: string): number {
  const value = readCatalogValue(row, key);
  return Array.isArray(value) ? value.length : 0;
}

function readCatalogNumber(row: CatalogRow, key: string): number {
  const value = readCatalogValue(row, key);
  return typeof value === 'number' ? value : 0;
}

function readCatalogString(row: CatalogRow, key: string): string {
  const value = readCatalogValue(row, key);
  return typeof value === 'string' ? value : '';
}
