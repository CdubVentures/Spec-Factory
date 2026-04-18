import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { useOperationsStore, type Operation } from '../state/operationsStore.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { api } from '../../../api/client.ts';
import {
  MODULE_STYLES,
  MODULE_LABELS,
} from '../state/operationTypeRegistry.generated.ts';
import { OperationDetailModal } from './OperationDetailModal.tsx';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import type { LlmAccessMode } from '../../llm-config/types/llmProviderRegistryTypes.ts';
import { resolveEffortLabel } from '../../llm-config/state/resolveEffortLabel.ts';
import { parseBackendMs } from '../../../utils/dateTime.ts';

/* ── Sort: running (newest-first) → error → done ──────────────────── */

const STATUS_ORDER: Readonly<Record<string, number>> = { running: 0, error: 1, cancelled: 2, done: 3 };

function sortOperations(ops: ReadonlyMap<string, Operation>): Operation[] {
  return [...ops.values()].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 0;
    const sb = STATUS_ORDER[b.status] ?? 0;
    if (sa !== sb) return sa - sb;
    return b.startedAt.localeCompare(a.startedAt);
  });
}

/* ── Elapsed timer ─────────────────────────────────────────────────── */

function formatElapsed(startedAt: string, endedAt: string | null): string {
  const end = endedAt ? parseBackendMs(endedAt) : Date.now();
  const start = parseBackendMs(startedAt);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return '0:00';
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ── Stage pipeline renderer ───────────────────────────────────────── */

function StagePipeline({ stages, currentIndex, status }: {
  readonly stages: readonly string[];
  readonly currentIndex: number;
  readonly status: 'running' | 'done' | 'error' | 'cancelled';
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

/* ── Loop progress grid ──────────────────────────────────────────── */

function LoopProgressGrid({ lp }: { readonly lp: NonNullable<Operation['loopProgress']> }) {
  const variantPos = lp.variantTotal > 1 ? ` (${lp.variantIndex + 1}/${lp.variantTotal})` : '';
  const target = lp.mode === 'hero' ? 'hero' : (lp.focusView || '\u2013');

  // Merge views + hero into one grid
  const cells: Array<{ label: string; count: number; target: number; attempts: number; attemptBudget: number; done: boolean; fail: boolean; active: boolean }> = [];
  for (const v of lp.views) {
    cells.push({ label: v.view, count: v.count, target: v.target, attempts: v.attempts, attemptBudget: v.attemptBudget, done: v.satisfied, fail: v.exhausted, active: lp.mode === 'view' && lp.focusView === v.view });
  }
  if (lp.hero) {
    cells.push({ label: 'hero', count: lp.hero.count, target: lp.hero.target, attempts: lp.hero.attempts, attemptBudget: lp.hero.attemptBudget, done: lp.hero.satisfied, fail: lp.hero.exhausted, active: lp.mode === 'hero' });
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* Header row */}
      <span className="text-[9px] font-mono sf-text-subtle leading-[1.3]">
        {lp.variantLabel}{variantPos} {'\u00B7'} call {lp.callNumber} {'\u00B7'} {lp.mode}: {target} {'\u00B7'} ~{lp.estimatedRemaining} left
      </span>
      {/* View grid */}
      <span className="grid gap-x-1.5 gap-y-0" style={{ gridTemplateColumns: `repeat(${Math.min(cells.length, 3)}, 1fr)` }}>
        {cells.map((c) => {
          const icon = c.done ? '\u2713' : c.fail ? '\u2717' : c.active ? '\u25B8' : ' ';
          const cls = c.done
            ? 'sf-text-success'
            : c.fail
              ? 'text-[var(--sf-state-danger-fg)] opacity-50'
              : c.active
                ? 'text-[rgb(var(--sf-color-accent-strong-rgb))]'
                : 'sf-text-subtle opacity-60';
          return (
            <span key={c.label} className={`text-[8px] font-mono font-semibold leading-[1.6] ${cls}`}>
              {icon} {c.label} {c.count}/{c.target}
              <span className="opacity-50 font-normal"> ({c.attempts}/{c.attemptBudget})</span>
            </span>
          );
        })}
      </span>
    </div>
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

/* ── Single operation card ─────────────────────────────────────────── */

function OpCard({ op, onClick, onDismiss, onStop, confirming }: {
  readonly op: Operation;
  readonly onClick: () => void;
  readonly onDismiss: (e: React.MouseEvent) => void;
  readonly onStop: (e: React.MouseEvent) => void;
  readonly confirming: boolean;
}) {
  const streamText = useOperationsStore((s) => s.streamTexts.get(op.id) ?? '');
  const chipCls = MODULE_STYLES[op.type] ?? 'sf-chip-neutral';
  const baseLabel = MODULE_LABELS[op.type] ?? op.type.toUpperCase().slice(0, 3);
  const label = op.subType ? `${baseLabel}.${op.subType[0]?.toUpperCase() ?? ''}` : baseLabel;
  const isDone = op.status === 'done';
  const isError = op.status === 'error';
  const isCancelled = op.status === 'cancelled';

  return (
    <div
      className={`
        relative flex flex-col gap-1 p-1.5 rounded-sm cursor-pointer transition-colors group
        bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.5)]
        border border-[rgb(var(--sf-color-border-subtle-rgb)/0.3)]
        hover:bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.85)]
        hover:border-[rgb(var(--sf-color-border-subtle-rgb)/0.6)]
        ${isDone || isCancelled ? 'opacity-60' : ''}
        ${isError ? 'border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.04)]' : ''}
      `}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {/* Dismiss badge — only for terminal ops, top-right corner */}
      {op.status !== 'running' && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute -top-[5px] -right-[5px] w-[13px] h-[13px] flex items-center justify-center rounded-full text-[7px] font-bold leading-none sf-text-subtle bg-[rgb(var(--sf-color-surface-elevated-rgb))] border border-[rgb(var(--sf-color-border-subtle-rgb)/0.5)] opacity-0 group-hover:opacity-100 hover:text-[var(--sf-state-danger-fg)] hover:border-[var(--sf-state-danger-fg)] transition-all z-10"
          title="Dismiss"
        >
          &times;
        </button>
      )}

      {/* Row 1: module chip + product label + elapsed */}
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`inline-flex items-center px-1 text-[8px] font-bold font-mono uppercase tracking-[0.04em] rounded-[2px] border border-current leading-[1.5] shrink-0 ${chipCls}`}>
          {label}
        </span>
        <span className="text-[11px] font-medium sf-text-primary truncate min-w-0 flex-1 text-left">
          {op.productLabel}
        </span>
        <span className="flex flex-col items-end shrink-0">
          <span className={`text-[9px] font-mono ${
            op.status === 'running' ? 'text-[rgb(var(--sf-color-accent-strong-rgb))]'
            : op.status === 'error' ? 'text-[var(--sf-state-danger-fg)]'
            : op.status === 'cancelled' ? 'sf-text-subtle'
            : 'sf-text-success'
          }`}>
            {op.status === 'done' ? 'done' : op.status === 'error' ? 'failed' : op.status === 'cancelled' ? 'cancelled' : formatElapsed(op.startedAt, op.endedAt)}
          </span>
          {op.queueDelayMs != null && op.queueDelayMs > 0 && (
            <span className="text-[6px] font-mono sf-text-subtle leading-none">q {op.queueDelayMs >= 1000 ? `${(op.queueDelayMs / 1000).toFixed(1)}s` : `${op.queueDelayMs}ms`}</span>
          )}
        </span>
        {/* Inline stop button — always visible for running ops */}
        {op.status === 'running' && (
          <button
            type="button"
            onClick={onStop}
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

      {/* Loop progress grid (structured) or fallback progress text */}
      {op.loopProgress ? (
        <LoopProgressGrid lp={op.loopProgress} />
      ) : op.progressText ? (
        <span className="text-[9px] font-mono sf-text-subtle whitespace-pre-wrap leading-[1.4]">{op.progressText}</span>
      ) : null}

      {/* Model line + live stream preview */}
      {op.modelInfo && (
        <span className="flex items-center gap-1 text-[8px] sf-text-muted">
          Model:{' '}
          <span className="inline-flex items-center gap-0.5 font-mono font-bold sf-text-subtle">
            <ModelBadgeGroup
              accessMode={(op.modelInfo.accessMode || 'api') as LlmAccessMode}
              thinking={op.modelInfo.thinking}
              webSearch={op.modelInfo.webSearch}
            />
            {op.modelInfo.isFallback ? '\u26A0 ' : ''}{op.modelInfo.model}
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
}

/* ── Main tracker widget ───────────────────────────────────────────── */

export function OperationsTracker() {
  const operations = useOperationsStore((s) => s.operations);
  const [isOpen, toggleOpen] = usePersistedToggle('sidebar:ops-tracker', true);
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sorted = useMemo(() => sortOperations(operations), [operations]);
  const runningCount = useMemo(() => sorted.filter((o) => o.status === 'running').length, [sorted]);
  const selectedOp = useMemo(() => {
    if (!selectedOpId) return null;
    return operations.get(selectedOpId) ?? null;
  }, [operations, selectedOpId]);

  // WHY: Force re-render every second to update elapsed timers while ops are running.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (runningCount === 0) return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [runningCount]);

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
      api.post(`/operations/${op.id}/cancel`).catch(() => {});
    } else {
      // First click — show confirmation, auto-reset after 3s
      setConfirmCancelId(op.id);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmCancelId(null), 3000);
    }
  }, [confirmCancelId]);

  return (
    <div className={`flex flex-col ${isOpen ? 'flex-1' : 'flex-none'}`} style={{ minHeight: 0 }}>
      {/* Header */}
      <button
        type="button"
        onClick={toggleOpen}
        className="flex items-center gap-1.5 pb-1.5 cursor-pointer select-none group"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] sf-text-subtle flex-1 text-left">
          Active Operations
        </span>
        {sorted.length > 0 && (
          <span className={`
            inline-flex items-center justify-center min-w-[15px] h-[15px] px-1
            text-[9px] font-bold rounded-full leading-none
            ${runningCount > 0
              ? 'text-[rgb(var(--sf-color-text-inverse-rgb))] bg-[rgb(var(--sf-color-accent-rgb))]'
              : 'sf-text-muted bg-[rgb(var(--sf-color-border-default-rgb))]'}
          `}>
            {runningCount}
          </span>
        )}
        <span className="text-[9px] sf-text-subtle group-hover:sf-text-primary transition-colors">
          {isOpen ? '\u25B4' : '\u25BE'}
        </span>
      </button>

      {/* Card list or empty state */}
      {isOpen && (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden pt-0.5 pr-0.5" style={{ scrollbarWidth: 'thin' }}>
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center py-4 px-2">
              <span className="text-[10px] sf-text-subtle italic">No active operations</span>
            </div>
          ) : (
            sorted.map((op) => (
              <OpCard key={op.id} op={op} onClick={() => handleCardClick(op)} onDismiss={(e) => handleDismiss(e, op)} onStop={(e) => handleStop(e, op)} confirming={confirmCancelId === op.id} />
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
