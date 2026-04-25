import { useCallback, useMemo, type ReactNode } from 'react';
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
  dispatchKfPickedKeys,
} from './bulkDispatch.ts';
import { pickBottomQuartileSample, pickNextBatch } from './smartSelect.ts';
import { useSmartSelectHistory } from './useSmartSelectHistory.ts';
import {
  usePipelineController,
  PIPELINE_STAGES,
  type PipelineState,
} from './usePipelineController.ts';
import { useActiveModulesByProduct } from '../../features/operations/hooks/useFinderOperations.ts';
import { selectActiveProductsForType, formatActiveWarnMessage } from './commandConsoleActiveCheck.ts';
import { CommandConsoleModelStrip } from './CommandConsoleModelStrip.tsx';
import { CommandConsoleKeysDropdown } from './CommandConsoleKeysDropdown.tsx';
import './CommandConsole.css';

export interface CommandConsoleProps {
  readonly category: string;
  readonly allRows: readonly CatalogRow[];
}

const CONFIRM_THRESHOLD = 50;

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
  | { readonly label: string; readonly primary?: boolean; readonly onClick: () => void }
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
          const action = a as { label: string; primary?: boolean; onClick: () => void };
          return (
            <button
              key={action.label}
              type="button"
              className={`sf-cc-btn ${action.primary ? 'sf-cc-btn-primary' : 'sf-cc-btn-secondary'}`}
              disabled={disabled}
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
  cef_1: 'CEF\u2081',
  cef_2: 'CEF\u2082',
  pif_loop: 'PIF',
  pif_eval: 'Eval',
  rdf_run: 'RDF',
  sku_run: 'SKU',
  kf_loop: 'KF',
};

type SegmentState = 'idle' | 'pending' | 'active' | 'done' | 'error' | 'cancelled';

function computeSegmentState(
  stageIdx: number,
  pipelineStatus: PipelineState['status'],
  pipelineStageIdx: number,
): SegmentState {
  if (pipelineStatus === 'idle') return 'idle';
  if (stageIdx < pipelineStageIdx) return 'done';
  if (stageIdx === pipelineStageIdx) {
    if (pipelineStatus === 'running') return 'active';
    if (pipelineStatus === 'done') return 'done';
    if (pipelineStatus === 'cancelled') return 'cancelled';
    if (pipelineStatus === 'error') return 'error';
  }
  // beyond current stage
  if (pipelineStatus === 'done') return 'done'; // should not happen if index == total, but defensively
  return 'pending';
}

function PipelineStepper({ state }: { state: PipelineState }) {
  const totalOps = state.stageOpIds.size;
  const activeFrac = totalOps > 0 ? state.stageTerminalCount / totalOps : 0;
  return (
    <div className="sf-cc-stepper" role="group" aria-label="Pipeline stage progress">
      {PIPELINE_STAGES.map((stage, i) => {
        const segState = computeSegmentState(i, state.status, state.stageIndex);
        const fillPct =
          segState === 'done' ? 100 :
          segState === 'active' ? Math.max(4, Math.round(activeFrac * 100)) :
          segState === 'error' ? 100 :
          segState === 'cancelled' ? 100 :
          0;
        return (
          <div
            key={stage.id}
            className={`sf-cc-stepper-seg sf-cc-stepper-seg-${segState}`}
            title={segState === 'active'
              ? `${stage.label} \u2014 ${state.stageTerminalCount}/${totalOps} ops done`
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
    const totalOps = state.stageOpIds.size;
    return `${state.stageTerminalCount}/${totalOps}${failedCount > 0 ? ` \u00B7 ${failedCount} failed` : ''}`;
  }
  if (state.status === 'done') return failedCount > 0 ? `Complete \u00B7 ${failedCount} failed` : 'Complete';
  if (state.status === 'cancelled') return 'Cancelled';
  if (state.status === 'error') return 'Errored';
  return null;
}

// ── Main component ────────────────────────────────────────────────────
export function CommandConsole({ category, allRows }: CommandConsoleProps) {
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

  const SMART_SELECT_SIZE = 20;

  const handleSmartSelectLowest = useCallback(() => {
    const picks = pickBottomQuartileSample(allRows, SMART_SELECT_SIZE);
    if (picks.length === 0) return;
    setMany(category, picks);
  }, [allRows, setMany, category]);

  const handleSmartSelectNext = useCallback(() => {
    const current = history.getHistory();
    const { selected, updatedHistory } = pickNextBatch(allRows, SMART_SELECT_SIZE, current);
    if (selected.length === 0) {
      if (typeof window !== 'undefined') {
        window.alert('All low-coverage products have been selected in the last 24h. Clear history or wait for the window to roll.');
      }
      return;
    }
    setMany(category, selected);
    history.setHistory(updatedHistory);
  }, [allRows, setMany, category, history]);

  const pipeline = usePipelineController(category);
  const pipelineRunning = pipeline.state.status === 'running';
  const noneSelected = selectedSize === 0;
  const bulkDisabled = noneSelected || pipelineRunning;

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
    if (!confirmActiveDispatch('pif', 'PIF')) return;
    const count = selectedProducts.reduce((n, r) => n + r.pifVariants.length, 0);
    if (!confirmLargeBatch(count, selectedProducts.length)) return;
    dispatchPifLoop(category, selectedProducts, fire);
  }, [category, selectedProducts, fire, confirmActiveDispatch]);

  const handlePifEval = useCallback(() => {
    if (!confirmActiveDispatch('pif', 'PIF')) return;
    const estimate = selectedProducts.reduce((n, r) => n + r.pifVariants.length * 6, 0);
    if (!confirmLargeBatch(estimate, selectedProducts.length)) return;
    void dispatchPifEval(category, selectedProducts, fire);
  }, [category, selectedProducts, fire, confirmActiveDispatch]);

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
    const estimate = selectedProducts.length * 2 + variantOps * 9 + selectedProducts.length * 40;
    if (!confirmLargeBatch(estimate, selectedProducts.length)) return;
    void pipeline.start(selectedProducts);
  }, [pipelineRunning, selectedProducts, pipeline]);

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

      {/* Row 2 — per-finder chips with signature SVGs */}
      <div className="sf-cc-chips-row">
        <FinderChip
          moduleKey="cef" label="CEF" icon={<CefIcon />} disabled={bulkDisabled}
          actions={[{ label: 'Run', primary: true, onClick: handleCefRun }]}
        />
        <FinderChip
          moduleKey="pif" label="PIF" icon={<PifIcon />} disabled={bulkDisabled}
          actions={[
            { label: 'Loop', primary: true, onClick: handlePifLoop },
            { label: 'Eval', onClick: handlePifEval },
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
            title={`Run CEF\u00D72 \u2192 PIF loop \u2192 PIF eval \u2192 RDF \u2192 SKU \u2192 KF loop across ${selectedProducts.length} product(s).`}
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
    </aside>
  );
}
