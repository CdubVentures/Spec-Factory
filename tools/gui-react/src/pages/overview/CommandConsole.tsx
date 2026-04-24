import { useCallback, useMemo } from 'react';
import type { CatalogRow } from '../../types/product.ts';
import { useReservedKeysQuery } from '../../features/key-finder/api/keyFinderQueries.ts';
import {
  useOverviewSelectionStore,
  useSelectionSize,
} from './overviewSelectionStore.ts';
import {
  useBulkFire,
  dispatchCefRun,
  dispatchPifLoop,
  dispatchPifEval,
  dispatchRdfRun,
  dispatchRdfLoop,
  dispatchSkuRun,
  dispatchSkuLoop,
  dispatchKfAll,
} from './bulkDispatch.ts';
import { pickBottomQuartileSample, pickNextBatch } from './smartSelect.ts';
import { useSmartSelectHistory } from './useSmartSelectHistory.ts';
import {
  usePipelineController,
  PIPELINE_STAGES,
  type PipelineState,
} from './usePipelineController.ts';
import './CommandConsole.css';

export interface CommandConsoleProps {
  readonly category: string;
  /** The catalog rows currently visible after filter/sort (used by smart-select in Phase 2). */
  readonly allRows: readonly CatalogRow[];
}

const CONFIRM_THRESHOLD = 50;

function PipelineInlineStatus({
  state,
  selectedCount,
}: { state: PipelineState; selectedCount: number }) {
  if (state.status === 'idle') {
    return (
      <span className="sf-cc-pipeline-idle-hint">
        CEF{'\u00D7'}2 {'\u2192'} PIF loop {'\u2192'} PIF eval {'\u2192'} RDF {'\u2192'} SKU {'\u2192'} KF
      </span>
    );
  }
  const stage = PIPELINE_STAGES[state.stageIndex];
  const stageLabel = stage?.label ?? '';
  const totalOps = state.stageOpIds.size;
  const fraction = totalOps > 0 ? state.stageTerminalCount / totalOps : 0;
  const pct = Math.round(fraction * 100);
  const failedCount = state.failedProducts.size;
  if (state.status === 'running') {
    return (
      <>
        <span className="sf-cc-pipeline-status">
          <strong>{state.stageIndex + 1}/{PIPELINE_STAGES.length}</strong> {stageLabel}
          {' '}{'\u00B7'}{' '}{state.stageTerminalCount}/{totalOps}
          {failedCount > 0 ? ` · ${failedCount} failed` : ''}
        </span>
        <span className="sf-cc-progress-track" aria-hidden>
          <span className="sf-cc-progress-fill" style={{ width: `${pct}%` }} />
        </span>
      </>
    );
  }
  const statusText = state.status === 'done' ? 'Complete'
    : state.status === 'cancelled' ? 'Cancelled'
    : 'Errored';
  return (
    <span className="sf-cc-pipeline-status">
      {statusText} {'\u00B7'} {selectedCount} product(s)
      {failedCount > 0 ? ` · ${failedCount} failed` : ''}
    </span>
  );
}

function confirmLargeBatch(opCount: number, productCount: number): boolean {
  if (opCount <= CONFIRM_THRESHOLD) return true;
  if (typeof window === 'undefined') return true;
  return window.confirm(
    `About to dispatch ${opCount} operations across ${productCount} product(s). Continue?`,
  );
}

export function CommandConsole({ category, allRows }: CommandConsoleProps) {
  const selectedIds = useOverviewSelectionStore((s) => s.byCategory[category]);
  const selectedSize = useSelectionSize(category);
  const clear = useOverviewSelectionStore((s) => s.clear);
  const setMany = useOverviewSelectionStore((s) => s.setMany);
  const history = useSmartSelectHistory(category);

  const SMART_SELECT_SIZE = 20;

  const handleSmartSelectLowest = useCallback(() => {
    const picks = pickBottomQuartileSample(allRows, SMART_SELECT_SIZE);
    if (picks.length === 0) return;
    setMany(category, picks);
  }, [allRows, setMany, category]);

  const handleSmartSelectNext = useCallback(() => {
    const current = history.getHistory();
    const { selected, updatedHistory } = pickNextBatch(
      allRows,
      SMART_SELECT_SIZE,
      current,
    );
    if (selected.length === 0) {
      if (typeof window !== 'undefined') {
        window.alert('All low-coverage products have been selected in the last 24h. Clear history or wait for the window to roll.');
      }
      return;
    }
    setMany(category, selected);
    history.setHistory(updatedHistory);
  }, [allRows, setMany, category, history]);

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

  const disabled = selectedSize === 0;

  const handleCefRun = useCallback(() => {
    const count = selectedProducts.length;
    if (!confirmLargeBatch(count, count)) return;
    dispatchCefRun(category, selectedProducts, fire);
  }, [category, selectedProducts, fire]);

  const handlePifLoop = useCallback(() => {
    const count = selectedProducts.reduce((n, r) => n + r.pifVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchPifLoop(category, selectedProducts, fire);
  }, [category, selectedProducts, fire]);

  const handlePifEval = useCallback(() => {
    // We don't know exact view count until we fetch PIF data per product; confirm
    // based on a conservative upper bound (5 views per variant + 1 hero).
    const estimate = selectedProducts.reduce((n, r) => n + r.pifVariants.length * 6, 0);
    if (!confirmLargeBatch(estimate, selectedProducts.length)) return;
    void dispatchPifEval(category, selectedProducts, fire);
  }, [category, selectedProducts, fire]);

  const handleRdfRun = useCallback(() => {
    const count = selectedProducts.reduce((n, r) => n + r.rdfVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchRdfRun(category, selectedProducts, fire);
  }, [category, selectedProducts, fire]);

  const handleRdfLoop = useCallback(() => {
    const count = selectedProducts.reduce((n, r) => n + r.rdfVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchRdfLoop(category, selectedProducts, fire);
  }, [category, selectedProducts, fire]);

  const handleSkuRun = useCallback(() => {
    const count = selectedProducts.reduce((n, r) => n + r.skuVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchSkuRun(category, selectedProducts, fire);
  }, [category, selectedProducts, fire]);

  const handleSkuLoop = useCallback(() => {
    const count = selectedProducts.reduce((n, r) => n + r.skuVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchSkuLoop(category, selectedProducts, fire);
  }, [category, selectedProducts, fire]);

  const handleKfRunAll = useCallback(() => {
    // Upper bound estimate: assume 40 non-reserved keys per product (conservative).
    const estimate = selectedProducts.length * 40;
    if (!confirmLargeBatch(estimate, selectedProducts.length)) return;
    void dispatchKfAll(category, selectedProducts, reservedSet, 'run', fire);
  }, [category, selectedProducts, reservedSet, fire]);

  const handleKfLoopAll = useCallback(() => {
    const estimate = selectedProducts.length * 40;
    if (!confirmLargeBatch(estimate, selectedProducts.length)) return;
    void dispatchKfAll(category, selectedProducts, reservedSet, 'loop', fire);
  }, [category, selectedProducts, reservedSet, fire]);

  const pipeline = usePipelineController(category);
  const pipelineRunning = pipeline.state.status === 'running';
  const bulkDisabled = disabled || pipelineRunning;

  const handleStartPipeline = useCallback(() => {
    if (pipelineRunning) return;
    if (selectedProducts.length === 0) return;
    // Upper bound: (2 CEF + 1 PIF loop + ~6 PIF eval + 1 RDF + 1 SKU) per variant + 40 KF per product.
    const variantOps = selectedProducts.reduce((n, r) => n + r.pifVariants.length, 0);
    const estimate = selectedProducts.length * 2 + variantOps * 9 + selectedProducts.length * 40;
    if (!confirmLargeBatch(estimate, selectedProducts.length)) return;
    void pipeline.start(selectedProducts);
  }, [pipelineRunning, selectedProducts, pipeline]);

  return (
    <aside className="sf-cc-panel" aria-label="Command console">
      <div className="sf-cc-top-row">
        <span className="sf-cc-selection">
          <span className={selectedSize === 0 ? 'sf-cc-selection-count-zero' : ''}>
            {selectedSize} selected
          </span>
          <button
            type="button"
            className="sf-cc-btn-ghost"
            disabled={disabled}
            onClick={() => clear(category)}
          >
            Clear
          </button>
        </span>
        <span className="sf-cc-smart">
          <span className="sf-cc-group-label">Smart</span>
          <button
            type="button"
            className="sf-cc-btn sf-cc-btn-secondary"
            onClick={handleSmartSelectLowest}
            disabled={allRows.length === 0}
            title="Pick 20 products at random from the bottom quartile by coverage."
          >
            20 lowest
          </button>
          <button
            type="button"
            className="sf-cc-btn sf-cc-btn-secondary"
            onClick={handleSmartSelectNext}
            disabled={allRows.length === 0}
            title="Pick 20 more, excluding anything picked in the last 24 hours."
          >
            Next 20
          </button>
        </span>
      </div>

      <div className="sf-cc-bulk-row">
        <span className="sf-cc-bulk-group">
          <span className="sf-cc-bulk-group-label">CEF</span>
          <button type="button" className="sf-cc-btn sf-cc-btn-primary" disabled={bulkDisabled} onClick={handleCefRun}>Run</button>
        </span>
        <span className="sf-cc-bulk-group">
          <span className="sf-cc-bulk-group-label">PIF</span>
          <button type="button" className="sf-cc-btn sf-cc-btn-primary" disabled={bulkDisabled} onClick={handlePifLoop}>Loop</button>
          <button type="button" className="sf-cc-btn sf-cc-btn-secondary" disabled={bulkDisabled} onClick={handlePifEval}>Eval</button>
        </span>
        <span className="sf-cc-bulk-group">
          <span className="sf-cc-bulk-group-label">RDF</span>
          <button type="button" className="sf-cc-btn sf-cc-btn-primary" disabled={bulkDisabled} onClick={handleRdfRun}>Run</button>
          <button type="button" className="sf-cc-btn sf-cc-btn-secondary" disabled={bulkDisabled} onClick={handleRdfLoop}>Loop</button>
        </span>
        <span className="sf-cc-bulk-group">
          <span className="sf-cc-bulk-group-label">SKU</span>
          <button type="button" className="sf-cc-btn sf-cc-btn-primary" disabled={bulkDisabled} onClick={handleSkuRun}>Run</button>
          <button type="button" className="sf-cc-btn sf-cc-btn-secondary" disabled={bulkDisabled} onClick={handleSkuLoop}>Loop</button>
        </span>
        <span className="sf-cc-bulk-group">
          <span className="sf-cc-bulk-group-label">KF</span>
          <button type="button" className="sf-cc-btn sf-cc-btn-primary" disabled={bulkDisabled} onClick={handleKfRunAll}>Run all</button>
          <button type="button" className="sf-cc-btn sf-cc-btn-secondary" disabled={bulkDisabled} onClick={handleKfLoopAll}>Loop all</button>
        </span>
      </div>

      <div className="sf-cc-pipeline-row">
        <span className="sf-cc-group-label">Pipeline</span>
        <span className="sf-cc-pipeline-controls">
          <button
            type="button"
            className="sf-cc-btn sf-cc-btn-primary"
            onClick={handleStartPipeline}
            disabled={disabled || pipelineRunning}
            title={`Run CEF \u00D72 \u2192 PIF loop \u2192 PIF eval \u2192 RDF \u2192 SKU \u2192 KF loop across ${selectedProducts.length} product(s).`}
          >
            {'\u25B6'} Run Full
          </button>
          <button
            type="button"
            className="sf-cc-btn sf-cc-btn-danger"
            onClick={() => pipeline.stop()}
            disabled={!pipelineRunning}
          >
            {'\u25A0'} Stop
          </button>
        </span>
        <PipelineInlineStatus state={pipeline.state} selectedCount={selectedProducts.length} />
      </div>
    </aside>
  );
}
