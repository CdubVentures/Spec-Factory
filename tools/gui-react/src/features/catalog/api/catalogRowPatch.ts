import {
  collectDataChangeDomains,
  DATA_CHANGE_EVENT_DOMAIN_FALLBACK,
  normalizeDataChangeToken,
  resolveDataChangeScopedCategories,
} from '../../data-change/index.js';
import type { DataChangeMessage } from '../../data-change/index.js';
import type { CatalogRow } from '../../../types/product.ts';
import { parseCatalogRow } from './catalogParsers.ts';

interface CatalogRowPatchEntities {
  readonly productIds?: readonly unknown[];
}

interface CatalogRowPatchMessage extends DataChangeMessage {
  readonly entities?: CatalogRowPatchEntities;
}

interface CatalogRowPatchTarget {
  readonly category: string;
  readonly productIds: readonly string[];
}

interface CatalogRowPatchApi {
  readonly parsedGet: (
    path: string,
    parse: (raw: unknown) => CatalogRow,
  ) => Promise<CatalogRow>;
}

interface CatalogRowPatchQueryClient {
  readonly getQueryData: (queryKey: readonly unknown[]) => unknown;
  readonly setQueryData: (
    queryKey: readonly unknown[],
    updater: unknown,
  ) => unknown;
  readonly invalidateQueries?: (options: { queryKey: readonly unknown[] }) => unknown;
}

interface CatalogRowPatchResult {
  readonly patched: boolean;
  readonly targets: readonly CatalogRowPatchTarget[];
  readonly failedCategories: readonly string[];
}

function normalizeEntityToken(value: unknown): string {
  return String(value || '').trim();
}

function dedupeTokens(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeEntityToken).filter(Boolean))];
}

function resolveCatalogPatchDomains(message: unknown): string[] {
  const msg = message && typeof message === 'object'
    ? message as { readonly domains?: unknown; readonly event?: unknown }
    : {};
  const explicitDomains = collectDataChangeDomains(msg.domains);
  if (explicitDomains.length > 0) return explicitDomains;

  const eventName = normalizeDataChangeToken(msg.event).toLowerCase();
  if (!eventName) return [];
  return collectDataChangeDomains(DATA_CHANGE_EVENT_DOMAIN_FALLBACK[eventName]);
}

function isCatalogAffectingMessage(message: unknown): boolean {
  return resolveCatalogPatchDomains(message).includes('catalog');
}

function resolveCatalogPatchEventName(message: unknown): string {
  const msg = message && typeof message === 'object'
    ? message as { readonly event?: unknown; readonly type?: unknown }
    : {};
  const explicitEvent = normalizeDataChangeToken(msg.event).toLowerCase();
  if (explicitEvent) return explicitEvent;
  const typeEvent = normalizeDataChangeToken(msg.type).toLowerCase();
  return typeEvent === 'data-change' ? '' : typeEvent;
}

function catalogCacheKeys(category: string): readonly (readonly unknown[])[] {
  return [
    ['catalog', category],
    ['catalog', category, 'indexing'],
  ];
}

function sortCatalogRows(rows: readonly CatalogRow[]): CatalogRow[] {
  return [...rows].sort((a, b) =>
    a.brand.localeCompare(b.brand)
    || a.base_model.localeCompare(b.base_model)
    || a.variant.localeCompare(b.variant));
}

function upsertCatalogRow(rows: readonly CatalogRow[], row: CatalogRow): CatalogRow[] {
  const index = rows.findIndex((existing) => existing.productId === row.productId);
  if (index < 0) return sortCatalogRows([...rows, row]);
  const next = [...rows];
  next[index] = row;
  return next;
}

function removeCatalogRow(rows: readonly CatalogRow[], productId: string): CatalogRow[] {
  return rows.filter((row) => row.productId !== productId);
}

function patchCatalogRowCaches({
  queryClient,
  category,
  updater,
}: {
  readonly queryClient: CatalogRowPatchQueryClient;
  readonly category: string;
  readonly updater: (rows: readonly CatalogRow[]) => CatalogRow[];
}): boolean {
  let didPatch = false;
  for (const queryKey of catalogCacheKeys(category)) {
    const current = queryClient.getQueryData(queryKey);
    if (!Array.isArray(current)) continue;
    queryClient.setQueryData(queryKey, updater(current as CatalogRow[]));
    didPatch = true;
  }
  return didPatch;
}

function invalidateCatalogRowCaches(queryClient: CatalogRowPatchQueryClient, category: string): void {
  if (typeof queryClient.invalidateQueries !== 'function') return;
  for (const queryKey of catalogCacheKeys(category)) {
    queryClient.invalidateQueries({ queryKey });
  }
}

function encodePathToken(value: string): string {
  return encodeURIComponent(value);
}

export function collectCatalogRowPatchTargets({
  message,
  fallbackCategory = '',
}: {
  readonly message?: CatalogRowPatchMessage | null;
  readonly fallbackCategory?: string;
} = {}): CatalogRowPatchTarget[] {
  if (!message || !isCatalogAffectingMessage(message)) return [];
  const productIds = dedupeTokens(message.entities?.productIds);
  if (productIds.length === 0) return [];

  const categories = resolveDataChangeScopedCategories(message, fallbackCategory);
  return categories.map((category) => ({
    category,
    productIds,
  }));
}

export function shouldSkipCatalogListInvalidation({
  queryKey,
  message,
  fallbackCategory = '',
}: {
  readonly queryKey: readonly unknown[];
  readonly message?: CatalogRowPatchMessage | null;
  readonly fallbackCategory?: string;
}): boolean {
  if (!Array.isArray(queryKey)) return false;
  const isCatalogListKey =
    queryKey.length >= 2
    && queryKey[0] === 'catalog'
    && typeof queryKey[1] === 'string'
    && (queryKey.length === 2 || (queryKey.length === 3 && queryKey[2] === 'indexing'));
  if (!isCatalogListKey) return false;

  const category = String(queryKey[1]);
  return collectCatalogRowPatchTargets({ message, fallbackCategory })
    .some((target) => target.category === category);
}

export async function patchCatalogRowsFromDataChange({
  api,
  queryClient,
  message,
  fallbackCategory = '',
}: {
  readonly api: CatalogRowPatchApi;
  readonly queryClient: CatalogRowPatchQueryClient;
  readonly message?: CatalogRowPatchMessage | null;
  readonly fallbackCategory?: string;
}): Promise<CatalogRowPatchResult> {
  const targets = collectCatalogRowPatchTargets({ message, fallbackCategory });
  if (targets.length === 0) {
    return { patched: false, targets, failedCategories: [] };
  }

  const failedCategories = new Set<string>();
  let patched = false;
  const isDelete = resolveCatalogPatchEventName(message) === 'catalog-product-delete';

  for (const target of targets) {
    for (const productId of target.productIds) {
      if (isDelete) {
        const didPatch = patchCatalogRowCaches({
          queryClient,
          category: target.category,
          updater: (rows) => removeCatalogRow(rows, productId),
        });
        patched = didPatch || patched;
        continue;
      }

      try {
        const row = await api.parsedGet(
          `/catalog/${encodePathToken(target.category)}/rows/${encodePathToken(productId)}`,
          parseCatalogRow,
        );
        const didPatch = patchCatalogRowCaches({
          queryClient,
          category: target.category,
          updater: (rows) => upsertCatalogRow(rows, row),
        });
        patched = didPatch || patched;
      } catch {
        failedCategories.add(target.category);
      }
    }
  }

  for (const category of failedCategories) {
    invalidateCatalogRowCaches(queryClient, category);
  }

  return {
    patched,
    targets,
    failedCategories: [...failedCategories],
  };
}
