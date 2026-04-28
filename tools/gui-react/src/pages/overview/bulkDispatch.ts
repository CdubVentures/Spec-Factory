import { useCallback } from 'react';
import { api } from '../../api/client.ts';
import { useOperationsStore } from '../../features/operations/state/operationsStore.ts';
import { markOptimisticOperationFailed } from '../../features/operations/state/optimisticOperationFailure.ts';
import {
  awaitOperationTerminal as defaultAwaitOperationTerminal,
  awaitPassengersRegistered as defaultAwaitPassengersRegistered,
  type PassengersRegisteredOutcome,
  type TerminalStatus,
} from '../../features/operations/hooks/useFinderOperations.ts';
import { parseAxisOrder, sortKeysByPriority } from '../../features/key-finder/state/keyFinderGroupedRows.ts';
import { isKeyRunBlocked } from '../../features/key-finder/state/componentKeyRunGuards.ts';
import type { CatalogRow } from '../../types/product.ts';
import type { PifVariantProgressGen, ScalarVariantProgressGen } from '../../types/product.generated.ts';
import { classifyPipelineKfBucket, type PipelineKfBucket } from './pipelinePlan.ts';

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

export interface BulkFireParams {
  readonly type: string;
  readonly productId: string;
  readonly productLabel?: string;
  readonly url: string;
  readonly body: Record<string, unknown>;
  readonly subType?: string;
  readonly variantKey?: string;
  readonly fieldKey?: string;
  readonly onDispatched?: (operationId: string) => void;
  /** Internal: temp operation id inserted before staggered bulk POSTs begin. */
  readonly optimisticId?: string;
  /** Internal: true when the caller already inserted the optimistic operation. */
  readonly optimisticPreinserted?: boolean;
}

export interface BulkDispatchOptions {
  readonly staggerMs?: number;
  readonly signal?: AbortSignal;
  readonly onOperationId?: (operationId: string) => void;
}

export interface KfBulkDispatchOptions extends BulkDispatchOptions {
  readonly awaitPassengersRegistered?: (operationId: string) => Promise<PassengersRegisteredOutcome | unknown>;
  readonly awaitOperationTerminal?: (operationId: string) => Promise<TerminalStatus>;
}

export interface BulkDispatchResult {
  readonly scheduled: number;
  readonly operationIds: readonly string[];
  readonly failures: number;
  readonly skipped: number;
}

let _tempSeq = 0;

function makeStub(id: string, p: BulkFireParams, category: string, queuedAt?: string) {
  const now = queuedAt ?? new Date().toISOString();
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
    ...(queuedAt ? { queuedAt } : {}),
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
    async (p: BulkFireParams): Promise<string> => {
      const tempId = p.optimisticId ?? `_pending_${++_tempSeq}`;
      const alreadyPreinserted = Boolean(p.optimisticId && p.optimisticPreinserted);
      let optimisticStub = useOperationsStore.getState().operations.get(tempId) ?? null;
      if (!alreadyPreinserted) {
        optimisticStub = makeStub(tempId, p, category, new Date().toISOString());
        upsert(optimisticStub);
      }
      try {
        const data = await api.post<AcceptedResponse>(p.url, p.body);
        remove(tempId);
        const alreadyDelivered = useOperationsStore.getState().operations.has(data.operationId);
        if (!alreadyDelivered) {
          upsert(makeStub(data.operationId, p, category));
        }
        try { p.onDispatched?.(data.operationId); } catch { /* caller bug must not break fire */ }
        return data.operationId;
      } catch (err) {
        const failedStub = optimisticStub ?? useOperationsStore.getState().operations.get(tempId);
        if (failedStub && activeStatus(failedStub.status)) {
          upsert(markOptimisticOperationFailed(failedStub, err));
        }
        throw err;
      }
    },
    [upsert, remove, category],
  );
}

export type BulkFireFn = (params: BulkFireParams) => Promise<string>;

const DEFAULT_STAGGER_MS = 50;

function preinsertOptimisticBulkFireParams(
  category: string,
  params: readonly BulkFireParams[],
): readonly BulkFireParams[] {
  const upsert = useOperationsStore.getState().upsert;
  return params.map((param) => {
    const queuedAt = new Date().toISOString();
    const optimisticId = `_pending_${++_tempSeq}`;
    upsert(makeStub(optimisticId, param, category, queuedAt));
    return {
      ...param,
      optimisticId,
      optimisticPreinserted: true,
    };
  });
}

function removeOptimisticBulkFireParam(param: BulkFireParams): void {
  if (!param.optimisticId) return;
  const operationsStore = useOperationsStore.getState();
  const operation = operationsStore.operations.get(param.optimisticId);
  if (!operation || !activeStatus(operation.status)) return;
  operationsStore.remove(param.optimisticId);
}

function failOptimisticBulkFireParam(param: BulkFireParams, error: unknown): void {
  if (!param.optimisticId) return;
  const operationsStore = useOperationsStore.getState();
  const operation = operationsStore.operations.get(param.optimisticId);
  if (!operation || !activeStatus(operation.status)) return;
  operationsStore.upsert(markOptimisticOperationFailed(operation, error));
}

function productLabel(row: CatalogRow): string {
  const brand = row.brand || '';
  const model = row.model || row.base_model || '';
  const combined = `${brand} ${model}`.trim();
  return combined || row.productId;
}

type DispatchOptionsInput = BulkDispatchOptions | number;

function resolveOptions(input: DispatchOptionsInput | undefined): Required<Pick<BulkDispatchOptions, 'staggerMs'>> & BulkDispatchOptions {
  if (typeof input === 'number') return { staggerMs: input };
  return { staggerMs: input?.staggerMs ?? DEFAULT_STAGGER_MS, signal: input?.signal, onOperationId: input?.onOperationId };
}

function activeStatus(status: string): boolean {
  return status === 'queued' || status === 'running';
}

function isModuleActive(type: string, productId: string): boolean {
  for (const op of useOperationsStore.getState().operations.values()) {
    if (op.type === type && op.productId === productId && activeStatus(op.status)) return true;
  }
  return false;
}

function isVariantActive(type: string, productId: string, subType: string, variantKey: string): boolean {
  for (const op of useOperationsStore.getState().operations.values()) {
    if (
      op.type === type &&
      op.productId === productId &&
      op.subType === subType &&
      op.variantKey === variantKey &&
      activeStatus(op.status)
    ) {
      return true;
    }
  }
  return false;
}

function isKfLoopActive(productId: string): boolean {
  for (const op of useOperationsStore.getState().operations.values()) {
    if (op.type === 'kf' && op.productId === productId && op.subType === 'loop' && activeStatus(op.status)) {
      return true;
    }
  }
  return false;
}

function isKfFieldActive(productId: string, fieldKey: string): boolean {
  for (const op of useOperationsStore.getState().operations.values()) {
    if (
      op.type === 'kf' &&
      op.productId === productId &&
      op.fieldKey === fieldKey &&
      activeStatus(op.status)
    ) {
      return true;
    }
  }
  return false;
}

function waitForTurn(delayMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  if (delayMs <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(false);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function dispatchTasks<T>(
  items: readonly T[],
  options: BulkDispatchOptions,
  handler: (item: T, index: number) => Promise<string>,
): Promise<BulkDispatchResult> {
  const staggerMs = options.staggerMs ?? DEFAULT_STAGGER_MS;
  const outcomes = await Promise.all(items.map(async (item, index) => {
    const shouldFire = await waitForTurn(index * staggerMs, options.signal);
    if (!shouldFire) return { id: null as string | null, failed: false, skipped: true };
    try {
      const id = await handler(item, index);
      options.onOperationId?.(id);
      return { id, failed: false, skipped: false };
    } catch {
      return { id: null as string | null, failed: true, skipped: false };
    }
  }));

  return {
    scheduled: items.length,
    operationIds: outcomes.map((outcome) => outcome.id).filter((id): id is string => Boolean(id)),
    failures: outcomes.filter((outcome) => outcome.failed).length,
    skipped: outcomes.filter((outcome) => outcome.skipped).length,
  };
}

async function dispatchBulkFireParams(
  category: string,
  params: readonly BulkFireParams[],
  fire: BulkFireFn,
  options: BulkDispatchOptions,
): Promise<BulkDispatchResult> {
  const prepared = preinsertOptimisticBulkFireParams(category, params);
  try {
    return await dispatchTasks(prepared, options, async (param) => {
      try {
        return await fire(param);
      } catch (error) {
        failOptimisticBulkFireParam(param, error);
        throw error;
      } finally {
        removeOptimisticBulkFireParam(param);
      }
    });
  } finally {
    prepared.forEach(removeOptimisticBulkFireParam);
  }
}

// ── CEF — per product ─────────────────────────────────────────────────────
export function dispatchCefRun(
  category: string,
  products: readonly CatalogRow[],
  fire: BulkFireFn,
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  const options = resolveOptions(optionsInput);
  const runnable = products.filter((row) => !isModuleActive('cef', row.productId));
  return dispatchBulkFireParams(
    category,
    runnable.map((row) => ({
      type: 'cef',
      productId: row.productId,
      productLabel: productLabel(row),
      url: `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}`,
      body: {},
    })),
    fire,
    options,
  );
}

// ── PIF loop — per variant ────────────────────────────────────────────────
export function dispatchPifLoop(
  category: string,
  products: readonly CatalogRow[],
  fire: BulkFireFn,
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  const options = resolveOptions(optionsInput);
  const tasks: Array<{ row: CatalogRow; variant: PifVariantProgressGen }> = [];
  for (const row of products) {
    for (const v of row.pifVariants) {
      if (!isVariantActive('pif', row.productId, 'loop', v.variant_key)) tasks.push({ row, variant: v });
    }
  }
  return dispatchBulkFireParams(
    category,
    tasks.map(({ row, variant }) => ({
      type: 'pif',
      productId: row.productId,
      productLabel: productLabel(row),
      url: `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}/loop`,
      body: { variant_key: variant.variant_key, variant_id: variant.variant_id },
      subType: 'loop',
      variantKey: variant.variant_key,
    })),
    fire,
    options,
  );
}

// ── PIF eval — per collected view + per variant hero ──────────────────────
export function dispatchPifDependencyRun(
  category: string,
  products: readonly CatalogRow[],
  fire: BulkFireFn,
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  const options = resolveOptions(optionsInput);
  const tasks: Array<{ row: CatalogRow; fieldKey: string }> = [];
  for (const row of products) {
    const missing = row.pifDependencyMissingKeys ?? [];
    for (const fieldKey of missing) {
      if (!fieldKey || isKfFieldActive(row.productId, fieldKey)) continue;
      tasks.push({ row, fieldKey });
    }
  }
  return dispatchBulkFireParams(
    category,
    tasks.map(({ row, fieldKey }) => ({
      type: 'kf',
      productId: row.productId,
      productLabel: productLabel(row),
      url: `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}`,
      body: { field_key: fieldKey, mode: 'run', force_solo: true, reason: 'pif_dependency' },
      fieldKey,
    })),
    fire,
    options,
  );
}

interface PifImageRow { readonly variant_key: string; readonly view: string }
interface PifDataShape { readonly images?: readonly PifImageRow[] }

export async function dispatchPifEval(
  category: string,
  products: readonly CatalogRow[],
  fire: BulkFireFn,
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  const options = resolveOptions(optionsInput);
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
      const tasks: PifVariantProgressGen[] = [];
      for (const variant of row.pifVariants) {
        if (isVariantActive('pif', row.productId, 'evaluate', variant.variant_key)) continue;
        const views = variantViews.get(variant.variant_key) ?? new Set<string>();
        if (views.size > 0) tasks.push(variant);
      }
      return { row, tasks };
    } catch {
      return { row, tasks: [] as PifVariantProgressGen[] };
    }
  }));

  const flat: Array<{ row: CatalogRow; variant: PifVariantProgressGen }> = [];
  for (const { row, tasks } of results) for (const variant of tasks) flat.push({ row, variant });

  return dispatchBulkFireParams(category, flat.map(({ row, variant }) => {
    const base = `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}`;
    return {
      type: 'pif',
      productId: row.productId,
      productLabel: productLabel(row),
      url: `${base}/evaluate-carousel`,
      body: { variant_key: variant.variant_key, variant_id: variant.variant_id },
      subType: 'evaluate',
      variantKey: variant.variant_key,
    };
  }), fire, options);
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
  options: BulkDispatchOptions,
): Promise<BulkDispatchResult> {
  const tasks: Array<{ row: CatalogRow; variant: ScalarVariantProgressGen }> = [];
  for (const row of products) {
    for (const v of variantAccessor(row)) {
      if (cfg.mode === 'loop' && isVariantActive(cfg.type, row.productId, 'loop', v.variant_key)) continue;
      tasks.push({ row, variant: v });
    }
  }
  return dispatchBulkFireParams(category, tasks.map(({ row, variant }) => {
    const base = cfg.baseUrl(category, row.productId);
    return {
      type: cfg.type,
      productId: row.productId,
      productLabel: productLabel(row),
      url: cfg.mode === 'run' ? base : `${base}/loop`,
      body: { variant_key: variant.variant_key, variant_id: variant.variant_id },
      subType: cfg.mode === 'loop' ? 'loop' : undefined,
      variantKey: variant.variant_key,
    };
  }), fire, options);
}

const rdfBase = (c: string, p: string) =>
  `/release-date-finder/${encodeURIComponent(c)}/${encodeURIComponent(p)}`;
const skuBase = (c: string, p: string) =>
  `/sku-finder/${encodeURIComponent(c)}/${encodeURIComponent(p)}`;

export const dispatchRdfRun = (
  category: string, products: readonly CatalogRow[], fire: BulkFireFn, optionsInput?: DispatchOptionsInput,
) => dispatchScalar({ type: 'rdf', baseUrl: rdfBase, mode: 'run' }, category, products, (r) => r.rdfVariants, fire, resolveOptions(optionsInput));

export const dispatchRdfLoop = (
  category: string, products: readonly CatalogRow[], fire: BulkFireFn, optionsInput?: DispatchOptionsInput,
) => dispatchScalar({ type: 'rdf', baseUrl: rdfBase, mode: 'loop' }, category, products, (r) => r.rdfVariants, fire, resolveOptions(optionsInput));

export const dispatchSkuRun = (
  category: string, products: readonly CatalogRow[], fire: BulkFireFn, optionsInput?: DispatchOptionsInput,
) => dispatchScalar({ type: 'skf', baseUrl: skuBase, mode: 'run' }, category, products, (r) => r.skuVariants, fire, resolveOptions(optionsInput));

export const dispatchSkuLoop = (
  category: string, products: readonly CatalogRow[], fire: BulkFireFn, optionsInput?: DispatchOptionsInput,
) => dispatchScalar({ type: 'skf', baseUrl: skuBase, mode: 'loop' }, category, products, (r) => r.skuVariants, fire, resolveOptions(optionsInput));

// ── KF — per non-reserved key per product ─────────────────────────────────
interface KeyFinderSummaryLike {
  readonly field_key: string;
  readonly difficulty?: string;
  readonly required_level?: string;
  readonly availability?: string;
  readonly variant_dependent?: boolean;
  readonly product_image_dependent?: boolean;
  readonly uses_variant_inventory?: boolean;
  readonly uses_pif_priority_images?: boolean;
  readonly last_status?: string | null;
  readonly published?: boolean;
  readonly run_blocked_reason?: string;
  readonly component_run_kind?: string;
  readonly component_dependency_satisfied?: boolean;
}

interface KeyFinderBundlingConfigLike {
  readonly sortAxisOrder?: string;
}

interface KfProductPlan {
  readonly row: CatalogRow;
  readonly keys: readonly string[];
  readonly summary: readonly KeyFinderSummaryLike[];
}

function kfSummaryUrl(category: string, productId: string): string {
  return `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/summary`;
}

function kfBundlingConfigUrl(category: string, productId: string): string {
  return `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/bundling-config`;
}

function isKfResolved(summary: readonly KeyFinderSummaryLike[], fieldKey: string): boolean {
  const row = summary.find((entry) => entry.field_key === fieldKey);
  return Boolean(row && (row.last_status === 'resolved' || row.published));
}

async function fetchKfSummary(category: string, productId: string): Promise<readonly KeyFinderSummaryLike[]> {
  return api.get<readonly KeyFinderSummaryLike[]>(kfSummaryUrl(category, productId));
}

/**
 * Shared KF key eligibility + axis-order sort. Used by `buildKfProductPlan`
 * (all-keys dispatch) and `buildKfPickedProductPlan` (per-key dispatch from
 * the Command Console Keys ▼ dropdown). Keeping one filter-and-sort path
 * prevents drift between the two dispatchers.
 */
function filterAndSortKfKeys(
  summary: readonly KeyFinderSummaryLike[],
  axisOrder: readonly string[],
  reservedKeys: ReadonlySet<string>,
  mode: 'run' | 'loop',
  pickedFilter?: ReadonlySet<string>,
  pipelineBucket?: Extract<PipelineKfBucket, 'early' | 'contextual'>,
): readonly string[] {
  const eligible = summary.filter((entry) => {
    if (!entry.field_key) return false;
    if (reservedKeys.has(entry.field_key)) return false;
    if (entry.variant_dependent === true) return false;
    if (isKeyRunBlocked(entry)) return false;
    if (pipelineBucket && classifyPipelineKfBucket(entry, reservedKeys) !== pipelineBucket) return false;
    if (mode === 'loop' && (entry.last_status === 'resolved' || entry.published)) return false;
    if (pickedFilter && !pickedFilter.has(entry.field_key)) return false;
    return true;
  });
  const sortable = eligible.map((entry) => ({
    ...entry,
    difficulty: entry.difficulty ?? '',
    required_level: entry.required_level ?? '',
    availability: entry.availability ?? '',
  }));
  return sortKeysByPriority(sortable, axisOrder).map((entry) => entry.field_key);
}

async function fetchKfPlanInputs(
  category: string,
  productId: string,
): Promise<{ summary: readonly KeyFinderSummaryLike[]; axisOrder: readonly string[] }> {
  const [summary, bundlingConfig] = await Promise.all([
    fetchKfSummary(category, productId),
    api.get<KeyFinderBundlingConfigLike>(kfBundlingConfigUrl(category, productId)).catch(() => ({ sortAxisOrder: '' })),
  ]);
  return { summary, axisOrder: parseAxisOrder(bundlingConfig?.sortAxisOrder ?? '') };
}

async function buildKfProductPlan(
  category: string,
  row: CatalogRow,
  reservedKeys: ReadonlySet<string>,
  mode: 'run' | 'loop',
  pipelineBucket?: Extract<PipelineKfBucket, 'early' | 'contextual'>,
): Promise<KfProductPlan> {
  const { summary, axisOrder } = await fetchKfPlanInputs(category, row.productId);
  return {
    row,
    summary,
    keys: filterAndSortKfKeys(summary, axisOrder, reservedKeys, mode, undefined, pipelineBucket),
  };
}

async function buildKfPickedProductPlan(
  category: string,
  row: CatalogRow,
  reservedKeys: ReadonlySet<string>,
  mode: 'run' | 'loop',
  pickedKeys: ReadonlySet<string>,
): Promise<KfProductPlan> {
  const { summary, axisOrder } = await fetchKfPlanInputs(category, row.productId);
  return {
    row,
    summary,
    keys: filterAndSortKfKeys(summary, axisOrder, reservedKeys, mode, pickedKeys),
  };
}

function kfBulkFireParams(category: string, plan: KfProductPlan, mode: 'run' | 'loop'): readonly BulkFireParams[] {
  return plan.keys.map((fieldKey) => ({
    type: 'kf',
    productId: plan.row.productId,
    productLabel: productLabel(plan.row),
    url: `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(plan.row.productId)}`,
    body: { field_key: fieldKey, mode },
    subType: mode === 'loop' ? 'loop' : undefined,
    fieldKey,
  }));
}

async function runKfProductChain({
  category,
  plan,
  mode,
  fire,
  options,
}: {
  readonly category: string;
  readonly plan: KfProductPlan;
  readonly mode: 'run' | 'loop';
  readonly fire: BulkFireFn;
  readonly options: Required<Pick<KfBulkDispatchOptions, 'awaitPassengersRegistered' | 'awaitOperationTerminal'>> & BulkDispatchOptions;
}): Promise<BulkDispatchResult> {
  const operationIds: string[] = [];
  let failures = 0;
  let skipped = 0;
  let latestSummary = plan.summary;
  const prepared = preinsertOptimisticBulkFireParams(category, kfBulkFireParams(category, plan, mode));

  try {
    for (const params of prepared) {
      const fieldKey = params.fieldKey ?? '';
      if (options.signal?.aborted) {
        skipped += 1;
        removeOptimisticBulkFireParam(params);
        continue;
      }
      if (mode === 'loop' && isKfResolved(latestSummary, fieldKey)) {
        skipped += 1;
        removeOptimisticBulkFireParam(params);
        continue;
      }
      try {
        const operationId = await fire(params);
        removeOptimisticBulkFireParam(params);
        operationIds.push(operationId);
        options.onOperationId?.(operationId);

        if (mode === 'run') {
          await options.awaitPassengersRegistered(operationId);
        } else {
          const status = await options.awaitOperationTerminal(operationId);
          if (status === 'cancelled') break;
          latestSummary = await fetchKfSummary(category, plan.row.productId).catch(() => latestSummary);
        }
      } catch (error) {
        failures += 1;
        failOptimisticBulkFireParam(params, error);
        removeOptimisticBulkFireParam(params);
      }
    }
  } finally {
    prepared.forEach(removeOptimisticBulkFireParam);
  }

  return {
    scheduled: prepared.length,
    operationIds,
    failures,
    skipped,
  };
}

export async function dispatchKfAll(
  category: string,
  products: readonly CatalogRow[],
  reservedKeys: ReadonlySet<string>,
  mode: 'run' | 'loop',
  fire: BulkFireFn,
  optionsInput: KfBulkDispatchOptions | number = {},
): Promise<BulkDispatchResult> {
  const resolvedInput = typeof optionsInput === 'number' ? { staggerMs: optionsInput } : optionsInput;
  const options = {
    ...resolveOptions(resolvedInput),
    awaitPassengersRegistered: resolvedInput.awaitPassengersRegistered ?? defaultAwaitPassengersRegistered,
    awaitOperationTerminal: resolvedInput.awaitOperationTerminal ?? defaultAwaitOperationTerminal,
  };

  const eligibleProducts = mode === 'loop'
    ? products.filter((row) => !isKfLoopActive(row.productId))
    : products;

  const plans = await Promise.all(eligibleProducts.map(async (row) => {
    try {
      return await buildKfProductPlan(category, row, reservedKeys, mode);
    } catch {
      return { row, summary: [], keys: [] };
    }
  }));

  const results = await Promise.all(plans.map((plan) =>
    runKfProductChain({ category, plan, mode, fire, options }),
  ));

  return {
    scheduled: results.reduce((sum, result) => sum + result.scheduled, 0),
    operationIds: results.flatMap((result) => result.operationIds),
    failures: results.reduce((sum, result) => sum + result.failures, 0),
    skipped: results.reduce((sum, result) => sum + result.skipped, 0),
  };
}

export async function dispatchKfPipelineBucket(
  category: string,
  products: readonly CatalogRow[],
  reservedKeys: ReadonlySet<string>,
  bucket: Extract<PipelineKfBucket, 'early' | 'contextual'>,
  fire: BulkFireFn,
  optionsInput: KfBulkDispatchOptions | number = {},
): Promise<BulkDispatchResult> {
  const resolvedInput = typeof optionsInput === 'number' ? { staggerMs: optionsInput } : optionsInput;
  const options = {
    ...resolveOptions(resolvedInput),
    awaitPassengersRegistered: resolvedInput.awaitPassengersRegistered ?? defaultAwaitPassengersRegistered,
    awaitOperationTerminal: resolvedInput.awaitOperationTerminal ?? defaultAwaitOperationTerminal,
  };

  const eligibleProducts = products.filter((row) => !isKfLoopActive(row.productId));
  const plans = await Promise.all(eligibleProducts.map(async (row) => {
    try {
      return await buildKfProductPlan(category, row, reservedKeys, 'loop', bucket);
    } catch {
      return { row, summary: [], keys: [] };
    }
  }));

  const results = await Promise.all(plans.map((plan) =>
    runKfProductChain({ category, plan, mode: 'loop', fire, options }),
  ));

  return {
    scheduled: results.reduce((sum, result) => sum + result.scheduled, 0),
    operationIds: results.flatMap((result) => result.operationIds),
    failures: results.reduce((sum, result) => sum + result.failures, 0),
    skipped: results.reduce((sum, result) => sum + result.skipped, 0),
  };
}

// ── Bulk Delete-All across selected products ───────────────────────────
// Each helper fans out DELETE /:finder-prefix/:cat/:pid to every selected
// product. The server's `onAfterDeleteAll` cascade hook (shipped earlier)
// handles the per-finder full wipe — these helpers just orchestrate the
// fan-out: stagger between calls, swallow per-product errors so one
// 500 doesn't abort the rest, and return the same BulkDispatchResult
// shape the run/loop dispatchers use.

interface FinderDeleteRoute {
  readonly type: 'cef' | 'pif' | 'rdf' | 'skf' | 'kf';
  readonly prefix: string;
}

const CEF_DELETE: FinderDeleteRoute = { type: 'cef', prefix: 'color-edition-finder' };
const PIF_DELETE: FinderDeleteRoute = { type: 'pif', prefix: 'product-image-finder' };
const RDF_DELETE: FinderDeleteRoute = { type: 'rdf', prefix: 'release-date-finder' };
const SKU_DELETE: FinderDeleteRoute = { type: 'skf', prefix: 'sku-finder' };
const KF_DELETE: FinderDeleteRoute = { type: 'kf', prefix: 'key-finder' };

interface SyncMutationResponse {
  readonly ok: boolean;
}

export function dispatchPifCarouselClearAll(
  category: string,
  products: readonly CatalogRow[],
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  const options = resolveOptions(optionsInput);
  return dispatchTasks(products, options, async (row) => {
    const url = `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}/carousel-winners/clear-all`;
    await api.post<SyncMutationResponse>(url);
    return '';
  });
}

function dispatchFinderDeleteAll(
  route: FinderDeleteRoute,
  category: string,
  products: readonly CatalogRow[],
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  const options = resolveOptions(optionsInput);
  return dispatchTasks(products, options, async (row) => {
    const url = `/${route.prefix}/${encodeURIComponent(category)}/${encodeURIComponent(row.productId)}`;
    await api.del(url);
    // No operationId — these are sync server-side deletes that don't
    // register in the operations tracker. Return empty string so the
    // generic dispatchTasks shape stays consistent (operationIds list
    // for delete fan-outs is always empty).
    return '';
  });
}

export function dispatchCefDeleteAll(
  category: string,
  products: readonly CatalogRow[],
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  return dispatchFinderDeleteAll(CEF_DELETE, category, products, optionsInput);
}

export function dispatchPifDeleteAll(
  category: string,
  products: readonly CatalogRow[],
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  return dispatchFinderDeleteAll(PIF_DELETE, category, products, optionsInput);
}

export function dispatchRdfDeleteAll(
  category: string,
  products: readonly CatalogRow[],
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  return dispatchFinderDeleteAll(RDF_DELETE, category, products, optionsInput);
}

export function dispatchSkuDeleteAll(
  category: string,
  products: readonly CatalogRow[],
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  return dispatchFinderDeleteAll(SKU_DELETE, category, products, optionsInput);
}

export function dispatchKfDeleteAll(
  category: string,
  products: readonly CatalogRow[],
  optionsInput?: DispatchOptionsInput,
): Promise<BulkDispatchResult> {
  return dispatchFinderDeleteAll(KF_DELETE, category, products, optionsInput);
}

/**
 * Per-key Run / Loop fan-out across selected products. Mirrors `dispatchKfAll`
 * but takes a curated `pickedKeys` set and intersects it with the standard
 * eligibility filter (reserved + variant_dependent + mode-specific resolved
 * skip). Used by the Command Console Keys ▼ dropdown so we can call one or
 * a handful of specific keys across N selected products during prompt
 * refinement, rather than fanning out every key per product.
 *
 * Short-circuits before any per-product fetch when `pickedKeys` is empty.
 */
export async function dispatchKfPickedKeys(
  category: string,
  products: readonly CatalogRow[],
  reservedKeys: ReadonlySet<string>,
  pickedKeys: ReadonlySet<string>,
  mode: 'run' | 'loop',
  fire: BulkFireFn,
  optionsInput: KfBulkDispatchOptions | number = {},
): Promise<BulkDispatchResult> {
  if (pickedKeys.size === 0 || products.length === 0) {
    return { scheduled: 0, operationIds: [], failures: 0, skipped: 0 };
  }

  const resolvedInput = typeof optionsInput === 'number' ? { staggerMs: optionsInput } : optionsInput;
  const options = {
    ...resolveOptions(resolvedInput),
    awaitPassengersRegistered: resolvedInput.awaitPassengersRegistered ?? defaultAwaitPassengersRegistered,
    awaitOperationTerminal: resolvedInput.awaitOperationTerminal ?? defaultAwaitOperationTerminal,
  };

  const eligibleProducts = mode === 'loop'
    ? products.filter((row) => !isKfLoopActive(row.productId))
    : products;

  const plans = await Promise.all(eligibleProducts.map(async (row) => {
    try {
      return await buildKfPickedProductPlan(category, row, reservedKeys, mode, pickedKeys);
    } catch {
      return { row, summary: [], keys: [] };
    }
  }));

  const results = await Promise.all(plans.map((plan) =>
    runKfProductChain({ category, plan, mode, fire, options }),
  ));

  return {
    scheduled: results.reduce((sum, result) => sum + result.scheduled, 0),
    operationIds: results.flatMap((result) => result.operationIds),
    failures: results.reduce((sum, result) => sum + result.failures, 0),
    skipped: results.reduce((sum, result) => sum + result.skipped, 0),
  };
}
