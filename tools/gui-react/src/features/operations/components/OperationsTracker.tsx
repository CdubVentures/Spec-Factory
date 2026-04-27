import { useEffect, useMemo, useCallback, useState, useRef, memo } from 'react';
import { useOperationsStore, type Operation } from '../state/operationsStore.ts';
import { LoopProgressRouter } from './LoopProgressRouter.tsx';
import { variantHexPartsForOp } from '../state/opVariantSwatch.ts';
import { useOpVariantAtomsMap } from '../state/useOpVariantAtomsMap.ts';
import { sortOperations, readSortMode, writeSortMode, SORT_MODES, type OpSortMode } from '../state/opSort.ts';
import { createOperationPreviewStreamSelector } from '../state/operationStreamPreview.ts';
import { selectActiveLlmCallSummaries } from '../state/operationCallSummaries.ts';
import {
  formatOperationStatusText,
  isOperationElapsedTimerActive,
} from '../state/operationElapsedStatus.ts';
import {
  cancelActiveOperations,
  formatStopAllActiveOperationsMessage,
} from '../state/operationBulkCancel.ts';
import {
  selectActiveOperationCount,
  selectOperationById,
  resolveOperationIndexLabLinkIdentity,
  selectVisibleOperationsMap,
} from '../state/operationsTrackerSelectors.ts';
import { ColorSwatch, useFinderColorHexMap } from '../../../shared/ui/finder';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { usePersistedNullableTab } from '../../../stores/tabStore.ts';
import { api } from '../../../api/client.ts';
import {
  MODULE_STYLES,
  MODULE_LABELS,
} from '../state/operationTypeRegistry.generated.ts';
import { IndexLabLink } from '../../../pages/overview/IndexLabLink.tsx';
import { resolveModuleTabId } from '../../../pages/overview/activeBadgeModuleTabMap.ts';
import { OperationDetailModal } from './OperationDetailModal.tsx';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import type { LlmAccessMode } from '../../llm-config/types/llmProviderRegistryTypes.ts';
import { resolveEffortLabel } from '../../llm-config/state/resolveEffortLabel.ts';


/* ── Stage pipeline renderer ───────────────────────────────────────── */

function StagePipeline({ stages, currentIndex, status }: {
  readonly stages: readonly string[];
  readonly currentIndex: number;
  readonly status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
}) {
  return (
    <span className="grid grid-cols-4 gap-x-1 gap-y-0.5 w-full">
      {stages.map((name, i) => {
        let cls = 'text-[9px] font-semibold uppercase tracking-[0.02em] truncate';

        if (status === 'done') {
          cls += ' sf-text-success';
        } else if (status === 'cancelled' && i === currentIndex) {
          cls += ' sf-text-subtle opacity-60';
        } else if (status === 'error' && i === currentIndex) {
          cls += ' text-[var(--sf-state-danger-fg)]';
        } else if (i < currentIndex) {
          cls += ' sf-text-success';
        } else if (i === currentIndex) {
          cls += ' text-[rgb(var(--sf-color-accent-strong-rgb))] animate-pulse';
        } else {
          cls += ' opacity-35 sf-text-subtle';
        }

        const icon = (status === 'done' || i < currentIndex)
          ? '\u2713 '
          : (status === 'cancelled' && i === currentIndex)
            ? '\u25A0 '
            : (status === 'error' && i === currentIndex)
              ? '\u2717 '
              : (i === currentIndex)
                ? '\u25B8 '
                : '  ';

        return (
          <span key={name} className={cls}>
            {icon}{name}
          </span>
        );
      })}
    </span>
  );
}

/* ── Stream text helpers ──────────────────────────────────────────── */

function stripThinkingTags(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const openIdx = cleaned.lastIndexOf('<think>');
  if (openIdx >= 0 && cleaned.indexOf('</think>', openIdx) === -1) {
    cleaned = cleaned.slice(0, openIdx);
  }
  return cleaned.trim();
}

/** True if stream has <think> content but no answer text yet. */
function isOnlyThinking(text: string): boolean {
  if (!text.includes('<think>')) return false;
  return stripThinkingTags(text).length === 0;
}

/* ── Streaming text panel ─────────────────────────────────────────── */

function StreamPanel({ text }: { readonly text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const cleaned = useMemo(() => stripThinkingTags(text), [text]);
  const thinking = useMemo(() => isOnlyThinking(text), [text]);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [cleaned, thinking]);

  if (!cleaned && !thinking) return null;

  return (
    <pre
      ref={ref}
      className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-sm p-1.5 text-[10px] font-mono sf-text-subtle bg-[rgb(var(--sf-color-surface-default-rgb)/0.6)] border border-[rgb(var(--sf-color-border-subtle-rgb)/0.2)]"
      style={{ scrollbarWidth: 'thin' }}
    >
      {cleaned || <span className="italic opacity-50 animate-pulse">Reasoning...</span>}
    </pre>
  );
}

const OperationElapsedStatus = memo(function OperationElapsedStatusInner({
  status,
  startedAt,
  endedAt,
}: {
  readonly status: Operation['status'];
  readonly startedAt: string;
  readonly endedAt: string | null;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isOperationElapsedTimerActive(status)) return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [startedAt, status]);

  return (
    <span className={`text-[9px] font-mono ${
      status === 'running' ? 'text-[rgb(var(--sf-color-accent-strong-rgb))]'
      : status === 'error' ? 'text-[var(--sf-state-danger-fg)]'
      : status === 'cancelled' ? 'sf-text-subtle'
      : 'sf-text-success'
    }`}>
      {formatOperationStatusText({ status, startedAt, endedAt })}
    </span>
  );
});

/* ── Single operation card ─────────────────────────────────────────── */

// WHY: Memoized so a WS upsert that clones the operations Map only re-renders
// the OpCard whose op actually changed. Parent passes stable handler refs
// (useCallback) and binds `op` inside the card so memo's shallow equality
// catches unchanged-prop renders.
const OpCard = memo(function OpCardInner({ op, onClick, onDismiss, onStop, confirming }: {
  readonly op: Operation;
  readonly onClick: (op: Operation) => void;
  readonly onDismiss: (e: React.MouseEvent, op: Operation) => void;
  readonly onStop: (e: React.MouseEvent, op: Operation) => void;
  readonly confirming: boolean;
}) {
  const streamPreviewSelector = useMemo(
    () => createOperationPreviewStreamSelector(op.id),
    [op.id],
  );
  const streamText = useOperationsStore(streamPreviewSelector);
  const colorHexMap = useFinderColorHexMap();
  const variantAtomsMap = useOpVariantAtomsMap(op);
  const variantHexParts = variantHexPartsForOp(op, colorHexMap, variantAtomsMap);
  const chipCls = MODULE_STYLES[op.type] ?? 'sf-chip-neutral';
  const baseLabel = MODULE_LABELS[op.type] ?? op.type.toUpperCase().slice(0, 3);
  const label = op.subType ? `${baseLabel}.${op.subType[0]?.toUpperCase() ?? ''}` : baseLabel;
  const moduleTabId = resolveModuleTabId(op.type);
  const linkIdentity = useMemo(
    () => resolveOperationIndexLabLinkIdentity(op),
    [op],
  );
  const isDone = op.status === 'done';
  const isError = op.status === 'error';
  const isCancelled = op.status === 'cancelled';
  const activeCalls = selectActiveLlmCallSummaries(op);

  return (
    <div
      className={`
        relative flex flex-col gap-1 p-1.5 rounded-sm cursor-pointer transition-colors group
        bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.5)]
        border border-[rgb(var(--sf-color-border-subtle-rgb)/0.3)]
        hover:bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.85)]
        hover:border-[rgb(var(--sf-color-border-subtle-rgb)/0.6)]
        ${isDone || isCancelled ? 'opacity-60' : ''}
        ${isError ? 'border-[var(--sf-token-state-error-border)] bg-[var(--sf-token-state-error-bg)]' : ''}
      `}
      onClick={() => onClick(op)}
      role="button"
      tabIndex={0}
    >
      {/* Dismiss badge — only for terminal ops, top-right corner */}
      {op.status !== 'running' && op.status !== 'queued' && (
        <button
          type="button"
          onClick={(e) => onDismiss(e, op)}
          className="absolute -top-[6px] -right-[6px] w-[15px] h-[15px] flex items-center justify-center rounded-full text-[8px] font-bold leading-none sf-text-subtle bg-[rgb(var(--sf-color-surface-elevated-rgb))] border border-[rgb(var(--sf-color-border-subtle-rgb)/0.5)] opacity-0 group-hover:opacity-100 hover:text-[var(--sf-state-danger-fg)] hover:border-[var(--sf-state-danger-fg)] transition-all z-10"
          title="Dismiss"
        >
          &times;
        </button>
      )}

      {/* Row 1: module chip + variant swatch (PIF/RDF) OR field_key chip (KF) + product label + elapsed */}
      <span className="flex items-center gap-1.5 min-w-0">
        {(() => {
          const chip = (
            <span className={`inline-flex items-center px-1 text-[8px] font-bold font-mono uppercase tracking-[0.04em] rounded-[2px] border border-current leading-[1.5] shrink-0 ${chipCls}`}>
              {label}
            </span>
          );
          // WHY: For the 5 finder modules, the chip becomes a deep-link into
          // the Indexing Lab (same destination the Overview column popovers
          // use). IndexLabLink stops propagation so the parent card's
          // onClick (which opens the OperationDetailModal) does not fire.
          // The active operation summary carries the brand/model context
          // required for variant-aware Indexing Lab selection.
          if (!moduleTabId) return chip;
          return (
            <IndexLabLink
              category={op.category}
              productId={linkIdentity.productId}
              brand={linkIdentity.brand}
              baseModel={linkIdentity.baseModel}
              tabId={moduleTabId}
              title={`Open ${label} in Indexing Lab`}
              className="sf-ops-index-link shrink-0"
            >
              {chip}
            </IndexLabLink>
          );
        })()}
        {variantHexParts.length > 0 && (
          <span title={op.variantKey} className="shrink-0 flex items-center">
            <ColorSwatch hexParts={variantHexParts} />
          </span>
        )}
        {op.fieldKey && (
          <span
            title={`field_key: ${op.fieldKey}`}
            className="shrink-0 inline-flex items-center px-1 text-[9px] font-mono rounded-[2px] border leading-[1.5] text-[rgb(var(--sf-color-accent-strong-rgb))] border-[rgb(var(--sf-color-accent-strong-rgb)/0.4)] bg-[rgb(var(--sf-color-accent-strong-rgb)/0.08)] max-w-[140px] truncate"
          >
            {op.fieldKey}
          </span>
        )}
        <span className="text-[11px] font-medium sf-text-primary truncate min-w-0 flex-1 text-left">
          {op.productLabel}
        </span>
        <span className="flex flex-col items-end shrink-0">
          <OperationElapsedStatus
            status={op.status}
            startedAt={op.startedAt}
            endedAt={op.endedAt}
          />
          {op.queueDelayMs != null && op.queueDelayMs > 0 && (
            <span className="text-[6px] font-mono sf-text-subtle leading-none">q {op.queueDelayMs >= 1000 ? `${(op.queueDelayMs / 1000).toFixed(1)}s` : `${op.queueDelayMs}ms`}</span>
          )}
        </span>
        {/* Inline stop button — always visible for running ops */}
        {(op.status === 'running' || op.status === 'queued') && (
          <button
            type="button"
            onClick={(e) => onStop(e, op)}
            className={`flex items-center justify-center rounded-[3px] text-[8px] font-bold leading-none shrink-0 border transition-all ${
              confirming
                ? 'h-[16px] px-1.5 text-[var(--sf-state-danger-fg)] border-[var(--sf-state-danger-fg)] bg-[var(--sf-state-danger-bg)]'
                : 'w-[16px] h-[16px] sf-text-subtle border-[rgb(var(--sf-color-border-subtle-rgb)/0.5)] hover:text-[var(--sf-state-danger-fg)] hover:border-[var(--sf-state-danger-fg)]'
            }`}
            title={confirming ? 'Click again to confirm' : 'Stop operation'}
          >
            {confirming ? 'Stop?' : '\u25A0'}
          </button>
        )}
      </span>

      {/* Row 2–3: stage pipeline grid */}
      <StagePipeline stages={op.stages} currentIndex={op.currentStageIndex} status={op.status} />

      {/* Structured loop progress — LoopProgressRouter shape-detects PIF's
          carousel grid vs. the canonical pill shape (keyFinderLoop + RDF/SKU).
          Falls back to free-form progressText when neither shape is present. */}
      {op.loopProgress ? (
        <LoopProgressRouter lp={op.loopProgress} />
      ) : op.progressText ? (
        <span className="text-[9px] font-mono sf-text-subtle whitespace-pre-wrap leading-[1.4]">{op.progressText}</span>
      ) : null}

      {activeCalls.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {activeCalls.map((call) => (
            <span
              key={call.callId || call.callIndex}
              className="inline-flex items-center px-1 text-[8px] font-bold font-mono uppercase rounded-[2px] border border-current leading-[1.5] text-[rgb(var(--sf-color-accent-strong-rgb))]"
            >
              {call.lane || call.mode || `call ${call.callIndex + 1}`}
            </span>
          ))}
        </span>
      )}

      {/* Model line + live stream preview */}
      {op.modelInfo && (
        <span className="flex items-center gap-1 text-[8px] sf-text-muted">
          Model:{' '}
          <span className="inline-flex items-center gap-0.5 font-mono font-bold sf-text-subtle">
            <ModelBadgeGroup
              accessMode={(op.modelInfo.accessMode || 'api') as LlmAccessMode}
              thinking={op.modelInfo.thinking}
              webSearch={op.modelInfo.webSearch}
              isFallback={op.modelInfo.isFallback}
            />
            {op.modelInfo.model}
            {(() => {
              const e = resolveEffortLabel({ model: op.modelInfo.model, effortLevel: op.modelInfo.effortLevel, thinking: op.modelInfo.thinking });
              return e ? <span className="sf-text-muted font-normal">{e}</span> : null;
            })()}
          </span>
        </span>
      )}
      {op.status === 'running' && streamText && (
        <StreamPanel text={streamText} />
      )}
    </div>
  );
});

/* ── Main tracker widget ───────────────────────────────────────────── */

export function OperationsTracker() {
  const [isOpen, toggleOpen] = usePersistedToggle('sidebar:ops-tracker', true);
  const [selectedOpId, setSelectedOpId] = usePersistedNullableTab<string>(
    'sidebar:ops-tracker:selectedOp',
    null,
  );
  const operations = useOperationsStore(
    useCallback(
      (s) => selectVisibleOperationsMap(s.operations, isOpen),
      [isOpen],
    ),
  );
  const activeCount = useOperationsStore((s) => selectActiveOperationCount(s.operations));
  const selectedOp = useOperationsStore(
    useCallback(
      (s) => selectOperationById(s.operations, selectedOpId),
      [selectedOpId],
    ),
  );
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isStoppingAll, setIsStoppingAll] = useState(false);
  const [sortMode, setSortMode] = useState<OpSortMode>(readSortMode);

  const handleSortModeChange = useCallback((mode: OpSortMode) => {
    setSortMode(mode);
    writeSortMode(mode);
  }, []);

  const sorted = useMemo(
    () => (isOpen ? sortOperations(operations, sortMode) : []),
    [isOpen, operations, sortMode],
  );

  // Clear confirm timer on unmount
  useEffect(() => () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); }, []);

  const handleCardClick = useCallback((op: Operation) => {
    setSelectedOpId(op.id);
  }, []);

  const remove = useOperationsStore((s) => s.remove);
  const handleDismiss = useCallback((e: React.MouseEvent, op: Operation) => {
    e.stopPropagation();
    remove(op.id);
    if (selectedOpId === op.id) setSelectedOpId(null);
    api.del(`/operations/${op.id}`).catch(() => {});
  }, [remove, selectedOpId]);

  const handleStop = useCallback((e: React.MouseEvent, op: Operation) => {
    e.stopPropagation();
    if (confirmCancelId === op.id) {
      // Second click — confirmed, fire cancel
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmCancelId(null);
      api.post(`/operations/${encodeURIComponent(op.id)}/cancel`).catch(() => {});
    } else {
      // First click — show confirmation, auto-reset after 3s
      setConfirmCancelId(op.id);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmCancelId(null), 3000);
    }
  }, [confirmCancelId]);

  const handleStopAll = useCallback(() => {
    if (activeCount === 0 || isStoppingAll) return;
    if (typeof window !== 'undefined' && !window.confirm(formatStopAllActiveOperationsMessage(activeCount))) return;

    setIsStoppingAll(true);
    const currentSorted = sortOperations(useOperationsStore.getState().operations, sortMode);
    void cancelActiveOperations(currentSorted, (operationId) =>
      api.post(`/operations/${encodeURIComponent(operationId)}/cancel`, {}),
    ).finally(() => setIsStoppingAll(false));
  }, [activeCount, isStoppingAll, sortMode]);

  return (
    <div className={`flex flex-col ${isOpen ? 'flex-1' : 'flex-none'}`} style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center gap-1.5 pb-1.5">
        <button
          type="button"
          onClick={toggleOpen}
          className="flex items-center gap-1.5 cursor-pointer select-none group min-w-0 flex-1"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] sf-text-subtle flex-1 text-left truncate">
            Active Operations
          </span>
          {activeCount > 0 && (
            <span className="
              inline-flex items-center justify-center min-w-[15px] h-[15px] px-1
              text-[9px] font-bold rounded-full leading-none
              text-[rgb(var(--sf-color-text-inverse-rgb))] bg-[rgb(var(--sf-color-accent-rgb))]
            ">
              {activeCount}
            </span>
          )}
          <span className="text-[9px] sf-text-subtle group-hover:sf-text-primary transition-colors">
            {isOpen ? '\u25B4' : '\u25BE'}
          </span>
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={handleStopAll}
            disabled={isStoppingAll}
            className="shrink-0 inline-flex items-center justify-center h-[18px] px-1.5 rounded-[3px] text-[8px] font-bold uppercase tracking-[0.04em] border transition-all text-[var(--sf-state-danger-fg)] border-[var(--sf-state-danger-fg)] bg-[var(--sf-state-danger-bg)] disabled:opacity-50 disabled:cursor-not-allowed"
            title={`Stop ${activeCount} queued or running operation(s)`}
          >
            {isStoppingAll ? 'Stopping' : 'Stop all'}
          </button>
        )}
      </div>

      {/* Sort selector (only when expanded and at least 1 op) */}
      {isOpen && sorted.length > 0 && (
        <div className="flex items-center gap-0.5 pb-1 mb-0.5 border-b border-[rgb(var(--sf-color-border-subtle-rgb)/0.25)]">
          {SORT_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => handleSortModeChange(m.value)}
              title={m.title}
              className={`
                flex-1 text-[9px] font-mono font-semibold uppercase tracking-[0.04em] px-1 py-0.5 rounded-[2px] border transition-colors
                ${sortMode === m.value
                  ? 'sf-text-primary border-[rgb(var(--sf-color-accent-strong-rgb)/0.6)] bg-[rgb(var(--sf-color-accent-strong-rgb)/0.10)]'
                  : 'sf-text-subtle border-[rgb(var(--sf-color-border-subtle-rgb)/0.3)] hover:sf-text-primary hover:border-[rgb(var(--sf-color-border-subtle-rgb)/0.6)]'}
              `}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Card list or empty state */}
      {isOpen && (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden pt-2 pr-2" style={{ scrollbarWidth: 'thin' }}>
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center py-4 px-2">
              <span className="text-[10px] sf-text-subtle italic">No active operations</span>
            </div>
          ) : (
            sorted.map((op) => (
              <OpCard
                key={op.id}
                op={op}
                onClick={handleCardClick}
                onDismiss={handleDismiss}
                onStop={handleStop}
                confirming={confirmCancelId === op.id}
              />
            ))
          )}
        </div>
      )}

      {/* Detail modal */}
      {selectedOp && (
        <OperationDetailModal
          op={selectedOp}
          onClose={() => setSelectedOpId(null)}
        />
      )}
    </div>
  );
}
