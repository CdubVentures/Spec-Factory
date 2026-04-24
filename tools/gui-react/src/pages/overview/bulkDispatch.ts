import { useCallback } from 'react';
import { api } from '../../api/client.ts';
import { useOperationsStore } from '../../features/operations/state/operationsStore.ts';
import type { CatalogRow } from '../../types/product.ts';
import type { PifVariantProgressGen, ScalarVariantProgressGen } from '../../types/product.generated.ts';

/**
 * Bulk fan-out primitives for the Overview command console. Each helper
 * dispatches one POST per (product × variant / key / view) combination,
 * spaced by {@link DEFAULT_STAGGER_MS} so we don't submit N hundred
 * requests in a single tick. The server-side concurrency table (see the
 * command-console plan §4.0) confirms none of the 5 finder modules serialize
 * runs across products, so the stagger is purely a courtesy to the network
 * layer — it is NOT required for correctness.
 */

interface AcceptedResponse { readonly ok: boolean; readonly operationId: string }

interface BulkFireParams {
  readonly type: string;
  readonly productId: string;
  readonly productLabel?: string;
  readonly url: string;
  readonly body: Record<string, unknown>;
  readonly subType?: string;
  readonly variantKey?: string;
  readonly fieldKey?: string;
  readonly onDispatched?: (operationId: string) => void;
}

let _tempSeq = 0;

function makeStub(id: string, p: BulkFireParams, category: string) {
  const now = new Date().toISOString();
  return {
    id,
    type: p.type,
    subType: p.subType ?? '',
    category,
    productId: p.productId,
    productLabel: p.productLabel || p.productId,
    variantKey: p.variantKey ?? '',
    fieldKey: p.fieldKey ?? '',
    stages: [] as readonly string[],
    currentStageIndex: 0,
    status: 'running' as const,
    startedAt: now,
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCalls: [] as readonly never[],
  };
}

/**
 * Bulk analog of {@link useFireAndForget}. Returns a stable function that can
 * be called many times in a row for different productIds — the hook-level
 * binding is only the category, not the (type, productId) pair.
 */
export function useBulkFire(category: string) {
  const upsert = useOperationsStore((s) => s.upsert);
  const remove = useOperationsStore((s) => s.remove);

  return useCallback(
    (p: BulkFireParams): void => {
      const tempId = `_pending_${++_tempSeq}`;
      upsert(makeStub(tempId, p, category));
      api.post<AcceptedResponse>(p.url, p.body)
        .then((data) => {
          remove(tempId);
          const alreadyDelivered = useOperationsStore.getState().operations.has(data.operationId);
          if (!alreadyDelivered) {
            upsert(makeStub(data.operationId, p, category));
          }
          try { p.onDispatched?.(data.operationId); } catch { /* caller bug must not break fire */ }
        })
        .catch(() => { remove(tempId); });
    },
    [upsert, remove, category],
  );
}

export type BulkFireFn = ReturnType<typeof useBulkFire>;

const DEFAULT_STAGGER_MS = 50;

function productLabel(row: CatalogRow): string {
  const brand = row.brand || '';
  const model = row.model || row.base_model || '';
  const combined = `${brand} ${model}`.trim();
  return combined || row.productId;
}

function stagger<T>(items: readonly T[], stepMs: number, handler: (item: T, index: number) => void): void {
  items.forEach((item, i) => {
    if (i === 0) handler(item, 0);
    else setTimeout(() => handler(item, i), i * stepMs);
  });
}

// ── CEF — per product ─────────────────────────────────────────────────────
export function dispatchCefRun(
  category: string,
  products: readonly CatalogRow[],
  fire: BulkFireFn,
  staggerMs: number = DEFAULT_STAGGER_MS,
): number {
  stagger(products, staggerMs, (row) => {
    fire({
      type: 'cef',
      productId: row.productId,
      productLabel: productLabel(row),
      url: `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}`,
      body: {},
    });
  });
  return products.length;
}

// ── PIF loop — per variant ────────────────────────────────────────────────
export function dispatchPifLoop(
  category: string,
  products: readonly CatalogRow[],
  fire: BulkFireFn,
  staggerMs: number = DEFAULT_STAGGER_MS,
): number {
  const tasks: Array<{ row: CatalogRow; variant: PifVariantProgressGen }> = [];
  for (const row of products) for (const v of row.pifVariants) tasks.push({ row, variant: v });
  stagger(tasks, staggerMs, ({ row, variant }) => {
    fire({
      type: 'pif',
      productId: row.productId,
      productLabel: productLabel(row),
      url: `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}/loop`,
      body: { variant_key: variant.variant_key, variant_id: variant.variant_id },
      subType: 'loop',
      variantKey: variant.variant_key,
    });
  });
  return tasks.length;
}

// ── PIF eval — per collected view + per variant hero ──────────────────────
interface PifImageRow { readonly variant_key: string; readonly view: string }
interface PifDataShape { readonly images?: readonly PifImageRow[] }

export async function dispatchPifEval(
  category: string,
  products: readonly CatalogRow[],
  fire: BulkFireFn,
  staggerMs: number = DEFAULT_STAGGER_MS,
): Promise<number> {
  const results = await Promise.all(products.map(async (row) => {
    try {
      const data = await api.get<PifDataShape>(
        `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}`,
      );
      const images = data?.images ?? [];
      const variantViews = new Map<string, Set<string>>();
      for (const img of images) {
        const vk = img?.variant_key || '';
        const v = img?.view || '';
        if (!v) continue;
        if (!variantViews.has(vk)) variantViews.set(vk, new Set());
        variantViews.get(vk)!.add(v);
      }
      const tasks: Array<{ variant: PifVariantProgressGen; kind: 'view' | 'hero'; view?: string }> = [];
      for (const variant of row.pifVariants) {
        const views = variantViews.get(variant.variant_key) ?? new Set<string>();
        for (const view of views) {
          if (view === 'hero') continue;
          tasks.push({ variant, kind: 'view', view });
        }
        if (views.has('hero')) tasks.push({ variant, kind: 'hero' });
      }
      return { row, tasks };
    } catch {
      return { row, tasks: [] as Array<{ variant: PifVariantProgressGen; kind: 'view' | 'hero'; view?: string }> };
    }
  }));

  const flat: Array<{ row: CatalogRow; variant: PifVariantProgressGen; kind: 'view' | 'hero'; view?: string }> = [];
  for (const { row, tasks } of results) for (const t of tasks) flat.push({ row, ...t });

  stagger(flat, staggerMs, ({ row, variant, kind, view }) => {
    const base = `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}`;
    const url = kind === 'view' ? `${base}/evaluate-view` : `${base}/evaluate-hero`;
    const body: Record<string, unknown> = { variant_key: variant.variant_key, variant_id: variant.variant_id };
    if (kind === 'view' && view) body.view = view;
    fire({
      type: 'pif',
      productId: row.productId,
      productLabel: productLabel(row),
      url,
      body,
      subType: 'evaluate',
      variantKey: variant.variant_key,
    });
  });
  return flat.length;
}

// ── RDF / SKU — per variant (run + loop share shape) ──────────────────────
interface ScalarDispatchConfig {
  readonly type: 'rdf' | 'skf';
  readonly baseUrl: (category: string, productId: string) => string;
  readonly mode: 'run' | 'loop';
}

function dispatchScalar(
  cfg: ScalarDispatchConfig,
  category: string,
  products: readonly CatalogRow[],
  variantAccessor: (row: CatalogRow) => readonly ScalarVariantProgressGen[],
  fire: BulkFireFn,
  staggerMs: number,
): number {
  const tasks: Array<{ row: CatalogRow; variant: ScalarVariantProgressGen }> = [];
  for (const row of products) for (const v of variantAccessor(row)) tasks.push({ row, variant: v });
  stagger(tasks, staggerMs, ({ row, variant }) => {
    const base = cfg.baseUrl(category, row.productId);
    fire({
      type: cfg.type,
      productId: row.productId,
      productLabel: productLabel(row),
      url: cfg.mode === 'run' ? base : `${base}/loop`,
      body: { variant_key: variant.variant_key, variant_id: variant.variant_id },
      subType: cfg.mode === 'loop' ? 'loop' : undefined,
      variantKey: variant.variant_key,
    });
  });
  return tasks.length;
}

const rdfBase = (c: string, p: string) =>
  `/release-date-finder/${encodeURIComponent(c)}/${encodeURIComponent(p)}`;
const skuBase = (c: string, p: string) =>
  `/sku-finder/${encodeURIComponent(c)}/${encodeURIComponent(p)}`;

export const dispatchRdfRun = (
  category: string, products: readonly CatalogRow[], fire: BulkFireFn, staggerMs = DEFAULT_STAGGER_MS,
) => dispatchScalar({ type: 'rdf', baseUrl: rdfBase, mode: 'run' }, category, products, (r) => r.rdfVariants, fire, staggerMs);

export const dispatchRdfLoop = (
  category: string, products: readonly CatalogRow[], fire: BulkFireFn, staggerMs = DEFAULT_STAGGER_MS,
) => dispatchScalar({ type: 'rdf', baseUrl: rdfBase, mode: 'loop' }, category, products, (r) => r.rdfVariants, fire, staggerMs);

export const dispatchSkuRun = (
  category: string, products: readonly CatalogRow[], fire: BulkFireFn, staggerMs = DEFAULT_STAGGER_MS,
) => dispatchScalar({ type: 'skf', baseUrl: skuBase, mode: 'run' }, category, products, (r) => r.skuVariants, fire, staggerMs);

export const dispatchSkuLoop = (
  category: string, products: readonly CatalogRow[], fire: BulkFireFn, staggerMs = DEFAULT_STAGGER_MS,
) => dispatchScalar({ type: 'skf', baseUrl: skuBase, mode: 'loop' }, category, products, (r) => r.skuVariants, fire, staggerMs);

// ── KF — per non-reserved key per product ─────────────────────────────────
interface KeyFinderSummaryLike { readonly field_key: string }

export async function dispatchKfAll(
  category: string,
  products: readonly CatalogRow[],
  reservedKeys: ReadonlySet<string>,
  mode: 'run' | 'loop',
  fire: BulkFireFn,
  staggerMs: number = DEFAULT_STAGGER_MS,
): Promise<number> {
  const results = await Promise.all(products.map(async (row) => {
    try {
      const summary = await api.get<readonly KeyFinderSummaryLike[]>(
        `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}/summary`,
      );
      const fieldKeys = summary.map((r) => r.field_key).filter((k) => k && !reservedKeys.has(k));
      return { row, fieldKeys };
    } catch {
      return { row, fieldKeys: [] as string[] };
    }
  }));

  const flat: Array<{ row: CatalogRow; fieldKey: string }> = [];
  for (const { row, fieldKeys } of results) for (const k of fieldKeys) flat.push({ row, fieldKey: k });

  stagger(flat, staggerMs, ({ row, fieldKey }) => {
    fire({
      type: 'kf',
      productId: row.productId,
      productLabel: productLabel(row),
      url: `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}`,
      body: { field_key: fieldKey, mode },
      subType: mode === 'loop' ? 'loop' : undefined,
      fieldKey,
    });
  });
  return flat.length;
}
