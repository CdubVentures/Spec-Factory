import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CatalogRow } from '../../types/product.ts';
import { useReservedKeysQuery } from '../../features/key-finder/api/keyFinderQueries.ts';
import {
  useOverviewSelectionStore,
  useSelectionSize,
} from './overviewSelectionStore.ts';
import {
  useBulkFire,
  dispatchCefRun,
  dispatchPifDependencyRun,
  dispatchPifLoop,
  dispatchPifEval,
  dispatchRdfRun,
  dispatchRdfLoop,
  dispatchSkuRun,
  dispatchSkuLoop,
  dispatchKfAll,
  dispatchKfPickedKeys,
  dispatchCefDeleteAll,
  dispatchPifCarouselClearAll,
  dispatchPifDeleteAll,
  dispatchRdfDeleteAll,
  dispatchSkuDeleteAll,
  dispatchKfDeleteAll,
} from './bulkDispatch.ts';
import { pickBottomQuartileSample, pickNextBatch } from './smartSelect.ts';
import { useSmartSelectHistory } from './useSmartSelectHistory.ts';
import {
  usePipelineController,
  PIPELINE_STAGES,
  type PipelineState,
  type PipelineStageId,
} from './usePipelineController.ts';
import { useActiveModulesByProduct } from '../../features/operations/hooks/useFinderOperations.ts';
import { selectActiveProductsForType, formatActiveWarnMessage } from './commandConsoleActiveCheck.ts';
import { estimatePifEvalOperationCount } from './commandConsoleBatchEstimates.ts';
import { CommandConsoleModelStrip } from './CommandConsoleModelStrip.tsx';
import { CommandConsoleKeysDropdown } from './CommandConsoleKeysDropdown.tsx';
import { zeroCatalogPifCarouselProgress } from '../../features/product-image-finder/state/pifDeleteOptimism.ts';
import { invalidatePifCarouselClearAllQueries } from './pifCarouselClearInvalidation.ts';
import {
  useSmartSelectSize,
  SMART_SELECT_SIZE_MIN,
  SMART_SELECT_SIZE_MAX,
} from './useSmartSelectSize.ts';
import { RangeSlider } from '../../shared/ui/forms/RangeSlider.tsx';
import { PromptDrawerChevron, FinderDeleteConfirmModal } from '../../shared/ui/finder/index.ts';
import { ACTION_BUTTON_WIDTH } from '../../shared/ui/actionButton/index.ts';
import './CommandConsole.css';

type BulkDeleteFinder = 'cef' | 'pif' | 'rdf' | 'sku' | 'kf';

interface BulkDeleteCopy {
  readonly label: string;
  readonly title: string;
  readonly description: (productCount: number) => string;
}

const BULK_DELETE_COPY: Readonly<Record<BulkDeleteFinder, BulkDeleteCopy>> = {
  cef: {
    label: 'CEF',
    title: 'Permanently wipe ALL CEF data across selected products. Cascades into variants, PIF (images/runs/evals/carousel), and RDF/SKU per-variant entries.',
    description: (n) =>
      `This will permanently wipe everything for CEF across all ${n} selected product(s): every run and discovery history (URLs + queries), every CEF candidate, every published color/edition, every variant in the registry, plus every variant-scoped artifact downstream — PIF images/runs/evals/carousel and all RDF/SKU per-variant entries. Cannot be undone.`,
  },
  pif: {
    label: 'PIF',
    title: 'Permanently wipe ALL PIF data across selected products (runs, image files, evals, carousel slots).',
    description: (n) =>
      `This will permanently wipe everything for PIF across all ${n} selected product(s): every run and discovery history (URLs + queries), every image file on disk (master + originals), all eval records, and every carousel slot selection. CEF variants are preserved. Cannot be undone.`,
  },
  rdf: {
    label: 'RDF',
    title: 'Permanently wipe ALL RDF data across selected products (runs, candidates, published release_date).',
    description: (n) =>
      `This will permanently wipe everything for RDF across all ${n} selected product(s): every run and discovery history (URLs + queries), every RDF candidate, and every published release_date. Cannot be undone.`,
  },
  sku: {
    label: 'SKU',
    title: 'Permanently wipe ALL SKU data across selected products (runs, candidates, published sku).',
    description: (n) =>
      `This will permanently wipe everything for SKU across all ${n} selected product(s): every run and discovery history (URLs + queries), every SKU candidate, and every published sku. Cannot be undone.`,
  },
  kf: {
    label: 'KF',
    title: 'Permanently wipe ALL KF data across selected products (runs, per-key candidates, per-key published values).',
    description: (n) =>
      `This will permanently wipe everything for KF across all ${n} selected product(s): every run and discovery history (URLs + queries), every per-key candidate and evidence, and every per-key published value. Cannot be undone.`,
  },
};

export interface CommandConsoleProps {
  readonly category: string;
  readonly allRows: readonly CatalogRow[];
}

const CONFIRM_THRESHOLD = 50;
const PIF_CAROUSEL_CLEAR_TITLE = 'Clear current PIF carousel winners across selected products. Images, runs, discovery history, and eval history are preserved.';

function pifCarouselClearDescription(productCount: number): string {
  return `This will clear current PIF carousel winner flags and manual slot overrides for all variants across ${productCount} selected product(s). Images, runs, discovery history, and eval history are preserved.`;
}

function confirmLargeBatch(opCount: number, productCount: number): boolean {
  if (opCount <= CONFIRM_THRESHOLD) return true;
  if (typeof window === 'undefined') return true;
  return window.confirm(
    `About to dispatch ${opCount} operations across ${productCount} product(s). Continue?`,
  );
}

// ── Signature SVG icons — echo the cell visuals in compact form ────────
function CefIcon() {
  return (
    <svg viewBox="0 0 40 18" width="28" height="12" aria-hidden className="sf-cc-chip-icon">
      <polygon points="9,1 17,9 9,17 1,9" fill="currentColor" opacity="0.85" />
      <polygon points="31,1 39,9 31,17 23,9" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

function PifIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden className="sf-cc-chip-icon">
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.75" />
      <circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
    </svg>
  );
}

function DiamondIcon() {
  return (
    <svg viewBox="0 0 18 18" width="13" height="13" aria-hidden className="sf-cc-chip-icon">
      <polygon points="9,1 17,9 9,17 1,9" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function KfIcon() {
  return (
    <svg viewBox="0 0 44 10" width="32" height="8" aria-hidden className="sf-cc-chip-icon">
      {[4, 12, 20, 28, 36].map((cx, i) => (
        <circle key={cx} cx={cx} cy="5" r="3" fill="currentColor" opacity={1 - i * 0.12} />
      ))}
    </svg>
  );
}

function PlayGlyph() {
  return (
    <span className="sf-cc-btn-glyph" aria-hidden>
      <svg viewBox="0 0 10 10" width="9" height="9">
        <polygon points="1,1 9,5 1,9" fill="currentColor" />
      </svg>
    </span>
  );
}

function StopGlyph() {
  return (
    <span className="sf-cc-btn-glyph" aria-hidden>
      <svg viewBox="0 0 10 10" width="8" height="8">
        <rect x="1.5" y="1.5" width="7" height="7" fill="currentColor" />
      </svg>
    </span>
  );
}

// ── Finder chip (module icon + label + action buttons) ────────────────
// Two action shapes are supported:
//  - { label, primary?, onClick } — standard button (CEF / PIF / RDF / SKU and the KF Run-all/Loop-all).
//  - { kind: 'render', render } — escape hatch for chips that need a custom
//    control such as a popover trigger. Used by the KF chip's Keys ▼ dropdown
//    so we can mount it inline without forking FinderChip.
type FinderChipAction =
  | { readonly label: string; readonly primary?: boolean; readonly onClick: () => void; readonly disabled?: boolean; readonly title?: string }
  | { readonly kind: 'render'; readonly key: string; readonly render: (disabled: boolean) => ReactNode };
interface FinderChipProps {
  readonly moduleKey: 'cef' | 'pif' | 'rdf' | 'sku' | 'kf';
  readonly label: string;
  readonly icon: ReactNode;
  readonly actions: readonly FinderChipAction[];
  readonly disabled: boolean;
}

function FinderChip({ moduleKey, label, icon, actions, disabled }: FinderChipProps) {
  return (
    <span className={`sf-cc-chip sf-cc-chip-${moduleKey}`}>
      <span className="sf-cc-chip-head">
        {icon}
        <span className="sf-cc-chip-label">{label}</span>
      </span>
      <span className="sf-cc-chip-actions">
        {actions.map((a) => {
          if ('kind' in a && a.kind === 'render') {
            return <span key={a.key}>{a.render(disabled)}</span>;
          }
          const action = a as { label: string; primary?: boolean; onClick: () => void; disabled?: boolean; title?: string };
          return (
            <button
              key={action.label}
              type="button"
              className={`sf-cc-btn ${action.primary ? 'sf-cc-btn-primary' : 'sf-cc-btn-secondary'}`}
              disabled={disabled || action.disabled}
              title={action.title}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          );
        })}
      </span>
    </span>
  );
}

// ── Pipeline stepper — 7 segmented progress bars per stage ────────────
const STAGE_SHORT_LABELS: Readonly<Record<string, string>> = {
  cef_1: 'CEF1',
  cef_2: 'CEF2',
  kf_early: 'KF0',
  pif_dep: 'DP',
  pif_loop: 'PIF',
  pif_eval: 'Eval',
  rdf_run: 'RDF',
  sku_run: 'SKU',
  kf_context: 'KFc',
};

type SegmentState = 'idle' | 'pending' | 'active' | 'done' | 'error' | 'cancelled' | 'skipped';

function computeSegmentState(
  stageId: PipelineStageId,
  pipelineStatus: PipelineState['status'],
  state: PipelineState,
): SegmentState {
  if (pipelineStatus === 'idle') return 'idle';
  const runtime = state.stageProgress.get(stageId);
  if (!runtime) return pipelineStatus === 'done' ? 'done' : 'pending';
  if (runtime.status === 'running') return pipelineStatus === 'cancelled' ? 'cancelled' : 'active';
  if (runtime.status === 'done') return 'done';
  if (runtime.status === 'error') return 'error';
  if (runtime.status === 'skipped') return 'skipped';
  if (pipelineStatus === 'done') return 'done';
  if (pipelineStatus === 'error') return 'error';
  return 'pending';
}

function PipelineStepper({ state }: { state: PipelineState }) {
  return (
    <div className="sf-cc-stepper" role="group" aria-label="Pipeline stage progress">
      {PIPELINE_STAGES.map((stage, i) => {
        const runtime = state.stageProgress.get(stage.id);
        const totalOps = runtime?.opIds.size ?? 0;
        const terminalCount = runtime?.terminalCount ?? 0;
        const activeFrac = totalOps > 0 ? terminalCount / totalOps : 0;
        const segState = computeSegmentState(stage.id, state.status, state);
        const fillPct =
          segState === 'done' ? 100 :
          segState === 'active' ? Math.max(4, Math.round(activeFrac * 100)) :
          segState === 'error' ? 100 :
          segState === 'cancelled' ? 100 :
          segState === 'skipped' ? 100 :
          0;
        return (
          <div
            key={stage.id}
            className={`sf-cc-stepper-seg sf-cc-stepper-seg-${segState}`}
            title={segState === 'active'
              ? `${stage.label} \u2014 ${terminalCount}/${totalOps} ops done`
              : stage.label}
          >
            <div className="sf-cc-stepper-bar">
              <div className="sf-cc-stepper-bar-fill" style={{ width: `${fillPct}%` }} />
              <span className="sf-cc-stepper-label">{STAGE_SHORT_LABELS[stage.id] ?? stage.id}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function pipelineStatusText(state: PipelineState): string | null {
  if (state.status === 'idle') return null;
  const failedCount = state.failedProducts.size;
  if (state.status === 'running') {
    let totalOps = 0;
    let terminalCount = 0;
    for (const runtime of state.stageProgress.values()) {
      if (runtime.status !== 'running') continue;
      totalOps += runtime.opIds.size;
      terminalCount += runtime.terminalCount;
    }
    const activeText = totalOps > 0 ? `${terminalCount}/${totalOps}` : 'Running';
    return `${activeText}${failedCount > 0 ? ` \u00B7 ${failedCount} failed` : ''}`;
  }
  if (state.status === 'done') return failedCount > 0 ? `Complete \u00B7 ${failedCount} failed` : 'Complete';
  if (state.status === 'cancelled') return 'Cancelled';
  if (state.status === 'error') return 'Errored';
  return null;
}

// ── Main component ────────────────────────────────────────────────────
// WHY: Memoized so OverviewPage re-renders (filters, columns rebuild) don't
// cascade into the 600-line console subtree. Re-renders only when category
// or allRows reference changes (allRows = catalog query result, stable).
export const CommandConsole = memo(function CommandConsoleInner({ category, allRows }: CommandConsoleProps) {
  const queryClient = useQueryClient();
  const selectedIds = useOverviewSelectionStore((s) => s.byCategory[category]);
  const selectedSize = useSelectionSize(category);
  const clear = useOverviewSelectionStore((s) => s.clear);
  const setMany = useOverviewSelectionStore((s) => s.setMany);
  const history = useSmartSelectHistory(category);

  const selectedProducts = useMemo<readonly CatalogRow[]>(() => {
    if (!selectedIds || selectedIds.size === 0) return [];
    const byId = new Map(allRows.map((r) => [r.productId, r]));
    const out: CatalogRow[] = [];
    for (const id of selectedIds) {
      const row = byId.get(id);
      if (row) out.push(row);
    }
    return out;
  }, [allRows, selectedIds]);

  const fire = useBulkFire(category);
  const { data: reservedResp } = useReservedKeysQuery(category);
  const reservedSet = useMemo<ReadonlySet<string>>(
    () => new Set(reservedResp?.reserved ?? []),
    [reservedResp],
  );

  const { size: smartSelectSize, setSize: setSmartSelectSize } = useSmartSelectSize();

  const handleSmartSelectLowest = useCallback(() => {
    const picks = pickBottomQuartileSample(allRows, smartSelectSize);
    if (picks.length === 0) return;
    setMany(category, picks);
  }, [allRows, setMany, category, smartSelectSize]);

  const handleSmartSelectNext = useCallback(() => {
    const current = history.getHistory();
    const { selected, updatedHistory } = pickNextBatch(allRows, smartSelectSize, current);
    if (selected.length === 0) {
      if (typeof window !== 'undefined') {
        window.alert('All low-coverage products have been selected in the last 24h. Clear history or wait for the window to roll.');
      }
      return;
    }
    setMany(category, selected);
    history.setHistory(updatedHistory);
  }, [allRows, setMany, category, history, smartSelectSize]);

  const pipeline = usePipelineController(category);
  const pipelineRunning = pipeline.state.status === 'running';
  const noneSelected = selectedSize === 0;
  const bulkDisabled = noneSelected || pipelineRunning;
  const pifMissingDependencyProducts = useMemo(
    () => selectedProducts.filter((row) => (row.pifDependencyMissingKeys ?? []).length > 0),
    [selectedProducts],
  );
  const pifMissingDependencyKeys = useMemo(
    () => [...new Set(pifMissingDependencyProducts.flatMap((row) => row.pifDependencyMissingKeys ?? []))].sort(),
    [pifMissingDependencyProducts],
  );
  const pifDependencyLocked = pifMissingDependencyProducts.length > 0;
  const pifDependencyTitle = pifDependencyLocked
    ? `PIF locked for ${pifMissingDependencyProducts.length} selected product(s). Run Dep will run these key(s) solo: ${pifMissingDependencyKeys.join(', ')}.`
    : 'PIF dependency keys are resolved for the selected products.';

  // WHY: Pre-flight collision warn before each per-finder dispatch. Active
  // semantics match bulkDispatch.ts:129 (queued OR running). The dialog is
  // informational — Continue routes through existing dispatch contracts;
  // some helpers skip actives (CEF Run, all Loops), others fire over (RDF/SKU/KF Run).
  const activeModulesByProduct = useActiveModulesByProduct(category);
  const confirmActiveDispatch = useCallback((type: string, label: string): boolean => {
    const colliding = selectActiveProductsForType(type, selectedProducts, activeModulesByProduct);
    if (colliding.length === 0) return true;
    if (typeof window === 'undefined') return true;
    return window.confirm(formatActiveWarnMessage(label, colliding.length, selectedProducts.length));
  }, [selectedProducts, activeModulesByProduct]);

  const handleCefRun = useCallback(() => {
    if (!confirmActiveDispatch('cef', 'CEF')) return;
    const count = selectedProducts.length;
    if (!confirmLargeBatch(count, count)) return;
    dispatchCefRun(category, selectedProducts, fire);
  }, [category, selectedProducts, fire, confirmActiveDispatch]);

  const handlePifLoop = useCallback(() => {
    if (pifDependencyLocked) return;
    if (!confirmActiveDispatch('pif', 'PIF')) return;
    const count = selectedProducts.reduce((n, r) => n + r.pifVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchPifLoop(category, selectedProducts, fire);
  }, [category, selectedProducts, fire, confirmActiveDispatch, pifDependencyLocked]);

  const handlePifEval = useCallback(() => {
    if (pifDependencyLocked) return;
    if (!confirmActiveDispatch('pif', 'PIF')) return;
    const estimate = estimatePifEvalOperationCount(selectedProducts);
    if (!confirmLargeBatch(estimate, selectedProducts.length)) return;
    void dispatchPifEval(category, selectedProducts, fire);
  }, [category, selectedProducts, fire, confirmActiveDispatch, pifDependencyLocked]);

  const handlePifDependencyRun = useCallback(() => {
    if (pifMissingDependencyProducts.length === 0) return;
    if (!confirmActiveDispatch('kf', 'PIF dependencies')) return;
    const opCount = pifMissingDependencyProducts.reduce((n, row) => n + (row.pifDependencyMissingKeys ?? []).length, 0);
    if (!confirmLargeBatch(opCount, pifMissingDependencyProducts.length)) return;
    void dispatchPifDependencyRun(category, pifMissingDependencyProducts, fire);
  }, [category, pifMissingDependencyProducts, fire, confirmActiveDispatch]);

  const handleRdfRun = useCallback(() => {
    if (!confirmActiveDispatch('rdf', 'RDF')) return;
    const count = selectedProducts.reduce((n, r) => n + r.rdfVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchRdfRun(category, selectedProducts, fire);
  }, [category, selectedProducts, fire, confirmActiveDispatch]);

  const handleRdfLoop = useCallback(() => {
    if (!confirmActiveDispatch('rdf', 'RDF')) return;
    const count = selectedProducts.reduce((n, r) => n + r.rdfVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchRdfLoop(category, selectedProducts, fire);
  }, [category, selectedProducts, fire, confirmActiveDispatch]);

  const handleSkuRun = useCallback(() => {
    if (!confirmActiveDispatch('skf', 'SKU')) return;
    const count = selectedProducts.reduce((n, r) => n + r.skuVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchSkuRun(category, selectedProducts, fire);
  }, [category, selectedProducts, fire, confirmActiveDispatch]);

  const handleSkuLoop = useCallback(() => {
    if (!confirmActiveDispatch('skf', 'SKU')) return;
    const count = selectedProducts.reduce((n, r) => n + r.skuVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchSkuLoop(category, selectedProducts, fire);
  }, [category, selectedProducts, fire, confirmActiveDispatch]);

  const handleKfRunAll = useCallback(() => {
    if (!confirmActiveDispatch('kf', 'KF')) return;
    const estimate = selectedProducts.length * 40;
    if (!confirmLargeBatch(estimate, selectedProducts.length)) return;
    void dispatchKfAll(category, selectedProducts, reservedSet, 'run', fire);
  }, [category, selectedProducts, reservedSet, fire, confirmActiveDispatch]);

  const handleKfLoopAll = useCallback(() => {
    if (!confirmActiveDispatch('kf', 'KF')) return;
    const estimate = selectedProducts.length * 40;
    if (!confirmLargeBatch(estimate, selectedProducts.length)) return;
    void dispatchKfAll(category, selectedProducts, reservedSet, 'loop', fire);
  }, [category, selectedProducts, reservedSet, fire, confirmActiveDispatch]);

  // Per-key Run picked-keys dispatch from the Keys ▼ dropdown. Confirmation
  // policy (collision warn + large-batch confirm) lives here; the dropdown
  // only collects state and fires the callback.
  const handleKfRunPicked = useCallback((pickedKeys: ReadonlySet<string>) => {
    if (pickedKeys.size === 0 || selectedProducts.length === 0) return;
    if (!confirmActiveDispatch('kf', 'KF')) return;
    const opCount = pickedKeys.size * selectedProducts.length;
    if (!confirmLargeBatch(opCount, selectedProducts.length)) return;
    void dispatchKfPickedKeys(category, selectedProducts, reservedSet, pickedKeys, 'run', fire);
  }, [category, selectedProducts, reservedSet, fire, confirmActiveDispatch]);

  const handleStartPipeline = useCallback(() => {
    if (pipelineRunning || selectedProducts.length === 0) return;
    const variantOps = selectedProducts.reduce((n, r) => n + r.pifVariants.length, 0);
    const pifDepOps = selectedProducts.reduce((n, r) => n + (r.pifDependencyMissingKeys ?? []).length, 0);
    const estimate = selectedProducts.length * 2 + pifDepOps + variantOps * 9 + selectedProducts.length * 40;
    if (!confirmLargeBatch(estimate, selectedProducts.length)) return;
    void pipeline.start(selectedProducts);
  }, [pipelineRunning, selectedProducts, pipeline]);

  // ── Bulk drawer data actions across selected products ─────────────
  // Three confirmation gates before any DELETE fires:
  //   1. confirmActiveDispatch — informational warn if collisions exist
  //   2. confirmLargeBatch     — guard against accidental N>50 fan-outs
  //   3. FinderDeleteConfirmModal — final destructive confirm with the
  //      finder-specific blast radius spelled out
  const [bulkDeleteFinder, setBulkDeleteFinder] = useState<BulkDeleteFinder | null>(null);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [bulkPifCarouselClearOpen, setBulkPifCarouselClearOpen] = useState(false);
  const [bulkPifCarouselClearPending, setBulkPifCarouselClearPending] = useState(false);
  const bulkDrawerPending = bulkDeletePending || bulkPifCarouselClearPending;

  const requestBulkDelete = useCallback((finder: BulkDeleteFinder) => {
    if (selectedProducts.length === 0) return;
    const moduleType = finder === 'sku' ? 'skf' : finder;
    const moduleLabel = BULK_DELETE_COPY[finder].label;
    if (!confirmActiveDispatch(moduleType, moduleLabel)) return;
    if (!confirmLargeBatch(selectedProducts.length, selectedProducts.length)) return;
    setBulkDeleteFinder(finder);
  }, [selectedProducts, confirmActiveDispatch]);

  const confirmBulkDelete = useCallback(async () => {
    if (!bulkDeleteFinder) return;
    setBulkDeletePending(true);
    try {
      const dispatchers: Record<BulkDeleteFinder, () => Promise<unknown>> = {
        cef: () => dispatchCefDeleteAll(category, selectedProducts),
        pif: () => dispatchPifDeleteAll(category, selectedProducts),
        rdf: () => dispatchRdfDeleteAll(category, selectedProducts),
        sku: () => dispatchSkuDeleteAll(category, selectedProducts),
        kf: () => dispatchKfDeleteAll(category, selectedProducts),
      };
      await dispatchers[bulkDeleteFinder]();
    } finally {
      setBulkDeletePending(false);
      setBulkDeleteFinder(null);
    }
  }, [bulkDeleteFinder, category, selectedProducts]);

  const requestBulkPifCarouselClear = useCallback(() => {
    if (selectedProducts.length === 0) return;
    if (!confirmActiveDispatch('pif', 'PIF carousel clear')) return;
    if (!confirmLargeBatch(selectedProducts.length, selectedProducts.length)) return;
    setBulkPifCarouselClearOpen(true);
  }, [selectedProducts, confirmActiveDispatch]);

  const confirmBulkPifCarouselClear = useCallback(async () => {
    if (selectedProducts.length === 0) return;
    const catalogQueryKey = ['catalog', category] as const;
    const previousCatalog = queryClient.getQueryData<CatalogRow[]>(catalogQueryKey);

    setBulkPifCarouselClearPending(true);
    queryClient.setQueryData<CatalogRow[] | undefined>(
      catalogQueryKey,
      (current) => selectedProducts.reduce<CatalogRow[] | undefined>(
        (rows, row) => zeroCatalogPifCarouselProgress(rows, { productId: row.productId }),
        current,
      ),
    );

    try {
      const result = await dispatchPifCarouselClearAll(category, selectedProducts);
      if (result.failures > 0) {
        queryClient.setQueryData<CatalogRow[] | undefined>(catalogQueryKey, previousCatalog);
      }
    } finally {
      invalidatePifCarouselClearAllQueries({ queryClient, category, products: selectedProducts });
      setBulkPifCarouselClearPending(false);
      setBulkPifCarouselClearOpen(false);
    }
  }, [category, queryClient, selectedProducts]);

  const bulkDeleteCount = selectedProducts.length;
  const bulkDeleteCopy = bulkDeleteFinder ? BULK_DELETE_COPY[bulkDeleteFinder] : null;

  const statusText = pipelineStatusText(pipeline.state);

  return (
    <aside className="sf-cc-panel" aria-label="Command console">
      {/* Row 1 — selection + smart-select */}
      <div className="sf-cc-row-header">
        <span className="sf-cc-selection-group">
          <span className={`sf-cc-selection-badge${noneSelected ? ' is-empty' : ''}`}>
            <span className="sf-cc-selection-count">{selectedSize}</span>
            <span>selected</span>
          </span>
          <button
            type="button"
            className="sf-cc-btn sf-cc-btn-clear"
            onClick={() => clear(category)}
            disabled={noneSelected}
            title="Deselect every product in the current category."
          >
            Clear
          </button>
        </span>
        <span className="sf-cc-smart">
          <span className="sf-cc-eyebrow">Smart</span>
          <RangeSlider
            value={smartSelectSize}
            min={SMART_SELECT_SIZE_MIN}
            max={SMART_SELECT_SIZE_MAX}
            onChange={setSmartSelectSize}
            ariaLabel="Smart-select sample size"
            title={`Smart-select sample size (${SMART_SELECT_SIZE_MIN}\u2013${SMART_SELECT_SIZE_MAX}). Persists across sessions.`}
          />
          <button
            type="button"
            className="sf-cc-btn sf-cc-btn-secondary"
            onClick={handleSmartSelectLowest}
            disabled={allRows.length === 0}
            title={`Pick ${smartSelectSize} products at random from the bottom quartile by coverage.`}
          >
            {smartSelectSize} lowest
          </button>
          <button
            type="button"
            className="sf-cc-btn sf-cc-btn-secondary"
            onClick={handleSmartSelectNext}
            disabled={allRows.length === 0}
            title={`Pick ${smartSelectSize} more, excluding anything picked in the last 24 hours.`}
          >
            Next {smartSelectSize}
          </button>
        </span>
      </div>

      {/* Row 2 — per-finder chips with signature SVGs */}
      <div className="sf-cc-chips-row">
        <FinderChip
          moduleKey="cef" label="CEF" icon={<CefIcon />} disabled={bulkDisabled}
          actions={[{ label: 'Run', primary: true, onClick: handleCefRun }]}
        />
        <FinderChip
          moduleKey="pif" label="PIF" icon={<PifIcon />} disabled={bulkDisabled}
          actions={[
            {
              label: 'Run Dep',
              primary: true,
              onClick: handlePifDependencyRun,
              disabled: pifMissingDependencyProducts.length === 0,
              title: pifMissingDependencyProducts.length === 0
                ? 'No missing PIF dependency keys for the selected products.'
                : pifDependencyTitle,
            },
            { label: 'Loop', onClick: handlePifLoop, disabled: pifDependencyLocked, title: pifDependencyTitle },
            { label: 'Eval', onClick: handlePifEval, disabled: pifDependencyLocked, title: pifDependencyTitle },
          ]}
        />
        <FinderChip
          moduleKey="rdf" label="RDF" icon={<DiamondIcon />} disabled={bulkDisabled}
          actions={[
            { label: 'Run', primary: true, onClick: handleRdfRun },
            { label: 'Loop', onClick: handleRdfLoop },
          ]}
        />
        <FinderChip
          moduleKey="sku" label="SKU" icon={<DiamondIcon />} disabled={bulkDisabled}
          actions={[
            { label: 'Run', primary: true, onClick: handleSkuRun },
            { label: 'Loop', onClick: handleSkuLoop },
          ]}
        />
        <FinderChip
          moduleKey="kf" label="KF" icon={<KfIcon />} disabled={bulkDisabled}
          actions={[
            { label: 'Run all groups', primary: true, onClick: handleKfRunAll },
            { label: 'Loop all groups', onClick: handleKfLoopAll },
            {
              kind: 'render',
              key: 'keys-dropdown',
              render: (chipDisabled) => (
                <CommandConsoleKeysDropdown
                  category={category}
                  selectedProducts={selectedProducts}
                  disabled={chipDisabled}
                  onRunPicked={handleKfRunPicked}
                />
              ),
            },
          ]}
        />

        {/* Bulk data drawer: PIF carousel clear plus per-finder DELETE
            fan-outs across every selected product. Hidden chevron when
            nothing is selected so users can't accidentally arm it. */}
        <div className="sf-cc-chips-trailing">
          <PromptDrawerChevron
            storageKey={`overview:cc:bulk-delete-drawer:${category}`}
            openWidthClass="w-[24rem]"
            drawerHeight="row"
            ariaLabel="Bulk Delete-All actions across selected products"
            closedTitle={noneSelected
              ? 'Select products first to enable bulk Delete-All actions.'
              : `Show bulk Delete-All actions for ${selectedSize} selected product(s).`}
            openedTitle={`Hide bulk Delete-All actions for ${selectedSize} selected product(s).`}
            chevronClass="sf-delete-label"
            tertiaryTitle="Delete:"
            tertiaryLabelClass="sf-delete-label"
            tertiaryActions={[
              {
                id: 'bulk-del-cef',
                label: BULK_DELETE_COPY.cef.label,
                onClick: () => requestBulkDelete('cef'),
                disabled: noneSelected || bulkDrawerPending,
                intent: 'delete',
                width: ACTION_BUTTON_WIDTH.standardHeader,
                title: BULK_DELETE_COPY.cef.title,
              },
              {
                id: 'bulk-del-pif',
                label: BULK_DELETE_COPY.pif.label,
                onClick: () => requestBulkDelete('pif'),
                disabled: noneSelected || bulkDrawerPending,
                intent: 'delete',
                width: ACTION_BUTTON_WIDTH.standardHeader,
                title: BULK_DELETE_COPY.pif.title,
              },
              {
                id: 'bulk-clear-pif-carousel',
                label: 'Eval',
                onClick: requestBulkPifCarouselClear,
                disabled: noneSelected || bulkDrawerPending,
                intent: 'delete',
                width: ACTION_BUTTON_WIDTH.keyRow,
                title: PIF_CAROUSEL_CLEAR_TITLE,
              },
              {
                id: 'bulk-del-rdf',
                label: BULK_DELETE_COPY.rdf.label,
                onClick: () => requestBulkDelete('rdf'),
                disabled: noneSelected || bulkDrawerPending,
                intent: 'delete',
                width: ACTION_BUTTON_WIDTH.standardHeader,
                title: BULK_DELETE_COPY.rdf.title,
              },
              {
                id: 'bulk-del-sku',
                label: BULK_DELETE_COPY.sku.label,
                onClick: () => requestBulkDelete('sku'),
                disabled: noneSelected || bulkDrawerPending,
                intent: 'delete',
                width: ACTION_BUTTON_WIDTH.standardHeader,
                title: BULK_DELETE_COPY.sku.title,
              },
              {
                id: 'bulk-del-kf',
                label: BULK_DELETE_COPY.kf.label,
                onClick: () => requestBulkDelete('kf'),
                disabled: noneSelected || bulkDrawerPending,
                intent: 'delete',
                width: ACTION_BUTTON_WIDTH.standardHeader,
                title: BULK_DELETE_COPY.kf.title,
              },
            ]}
          />
        </div>
      </div>

      {/* Row 3 — model strip (read-only) ─────────────────────────────── */}
      <div className="sf-cc-models-row">
        <span className="sf-cc-eyebrow">Models</span>
        <div className="sf-cc-models-track" role="group" aria-label="Configured models per finder">
          <CommandConsoleModelStrip />
        </div>
      </div>

      {/* Row 4 — pipeline stepper + run/stop */}
      <div className="sf-cc-pipeline-row">
        <span className="sf-cc-eyebrow">Pipeline</span>
        <div className="sf-cc-pipeline-mid">
          <PipelineStepper state={pipeline.state} />
          {statusText && <span className="sf-cc-pipeline-status">{statusText}</span>}
        </div>
        <span className="sf-cc-pipeline-controls">
          <button
            type="button"
            className="sf-cc-btn sf-cc-btn-primary"
            onClick={handleStartPipeline}
            disabled={noneSelected || pipelineRunning}
            title={`Run dependency-driven pipeline across ${selectedProducts.length} product(s): CEF and independent KF start first; RDF/SKU run after CEF; PIF waits dependency keys; contextual KF runs last.`}
          >
            <PlayGlyph />Run
          </button>
          <button
            type="button"
            className="sf-cc-btn sf-cc-btn-danger"
            onClick={() => pipeline.stop()}
            disabled={!pipelineRunning}
            title="Cancel the pipeline and abort in-flight ops."
          >
            <StopGlyph />Stop
          </button>
        </span>
      </div>

      {/* Bulk Delete-All — final destructive confirm modal. Reuses the
          per-panel modal so the destructive UX is consistent everywhere. */}
      {bulkDeleteFinder && bulkDeleteCopy && (
        <FinderDeleteConfirmModal
          target={{ kind: 'all', count: bulkDeleteCount }}
          onConfirm={() => { void confirmBulkDelete(); }}
          onCancel={() => setBulkDeleteFinder(null)}
          isPending={bulkDeletePending}
          moduleLabel={bulkDeleteCopy.label}
          descriptionOverrides={{ all: bulkDeleteCopy.description(bulkDeleteCount) }}
        />
      )}
      {bulkPifCarouselClearOpen && (
        <FinderDeleteConfirmModal
          target={{ kind: 'carousel-clear-all', count: bulkDeleteCount }}
          onConfirm={() => { void confirmBulkPifCarouselClear(); }}
          onCancel={() => setBulkPifCarouselClearOpen(false)}
          isPending={bulkPifCarouselClearPending}
          moduleLabel="PIF"
          confirmLabel="Clear"
          pendingLabel="Clearing..."
          descriptionOverrides={{ 'carousel-clear-all': pifCarouselClearDescription(bulkDeleteCount) }}
        />
      )}
    </aside>
  );
});
