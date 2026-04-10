import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { useOperationsStore, type Operation } from '../state/operationsStore.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { useProductStore } from '../../../stores/productStore.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import type { LlmAccessMode } from '../../llm-config/types/llmProviderRegistryTypes.ts';

/* ── Module chip color map ─────────────────────────────────────────── */

const MODULE_STYLES: Readonly<Record<string, string>> = {
  cef: 'sf-chip-accent',
  'brand-resolver': 'sf-chip-info',
  'field-audit': 'sf-chip-warning',
  publisher: 'sf-chip-success',
};

const MODULE_LABELS: Readonly<Record<string, string>> = {
  cef: 'CEF',
  'brand-resolver': 'BR',
  'field-audit': 'FA',
  publisher: 'PUB',
};

/* ── Sort: running (newest-first) → error → done ──────────────────── */

const STATUS_ORDER: Readonly<Record<string, number>> = { running: 0, error: 1, done: 2 };

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
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ── Stage pipeline renderer ───────────────────────────────────────── */

function StagePipeline({ stages, currentIndex, status }: {
  readonly stages: readonly string[];
  readonly currentIndex: number;
  readonly status: 'running' | 'done' | 'error';
}) {
  return (
    <span className="flex items-center gap-0">
      {stages.map((name, i) => {
        let cls = 'px-[3px] rounded-[2px] text-[9px] font-semibold uppercase tracking-[0.02em] border border-transparent whitespace-nowrap';
        let label = name;

        if (status === 'done') {
          cls += ' sf-text-success';
          label = `${name} \u2713`;
        } else if (status === 'error' && i === currentIndex) {
          cls += ' text-[var(--sf-state-danger-fg)] bg-[var(--sf-state-danger-bg)] border-[var(--sf-state-danger-border)]';
          label = i === stages.length - 1 ? 'Rejected' : name;
        } else if (i < currentIndex) {
          cls += ' sf-text-success';
          label = `${name} \u2713`;
        } else if (i === currentIndex) {
          cls += ' text-[rgb(var(--sf-color-accent-strong-rgb))] bg-[rgb(var(--sf-color-accent-rgb)/0.14)] border-[rgb(var(--sf-color-accent-rgb)/0.25)] animate-pulse';
        } else {
          cls += ' opacity-35 sf-text-subtle';
        }

        return (
          <span key={name} className="flex items-center">
            {i > 0 && <span className="text-[7px] px-[2px] sf-text-subtle opacity-40">&rsaquo;</span>}
            <span className={cls}>{label}</span>
          </span>
        );
      })}
    </span>
  );
}

/* ── Streaming text panel ─────────────────────────────────────────── */

function StreamPanel({ text }: { readonly text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);

  return (
    <pre
      ref={ref}
      className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-sm p-1.5 text-[10px] font-mono sf-text-subtle bg-[rgb(var(--sf-color-surface-default-rgb)/0.6)] border border-[rgb(var(--sf-color-border-subtle-rgb)/0.2)]"
      style={{ scrollbarWidth: 'thin' }}
    >
      {text}
    </pre>
  );
}

/* ── Single operation card ─────────────────────────────────────────── */

function OpCard({ op, onClick }: { readonly op: Operation; readonly onClick: () => void }) {
  const chipCls = MODULE_STYLES[op.type] ?? 'sf-chip-neutral';
  const label = MODULE_LABELS[op.type] ?? op.type.toUpperCase().slice(0, 3);
  const isDone = op.status === 'done';
  const isError = op.status === 'error';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex flex-col gap-1 p-1.5 rounded-sm cursor-pointer transition-colors
        bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.5)]
        border border-[rgb(var(--sf-color-border-subtle-rgb)/0.3)]
        hover:bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.85)]
        hover:border-[rgb(var(--sf-color-border-subtle-rgb)/0.6)]
        ${isDone ? 'opacity-45' : ''}
        ${isError ? 'border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.04)]' : ''}
      `}
    >
      {/* Row 1: module chip + product label */}
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`inline-flex items-center px-1 text-[8px] font-bold font-mono uppercase tracking-[0.04em] rounded-[2px] border border-current leading-[1.5] shrink-0 ${chipCls}`}>
          {label}
        </span>
        <span className="text-[11px] font-medium sf-text-primary truncate min-w-0 flex-1 text-left">
          {op.productLabel}
        </span>
      </span>

      {/* Row 1.5: model info with capability badges */}
      {op.modelInfo && (
        <span className="flex items-center gap-1 min-w-0">
          <ModelBadgeGroup
            accessMode={(op.modelInfo.accessMode || 'api') as LlmAccessMode}
            thinking={op.modelInfo.thinking}
            webSearch={op.modelInfo.webSearch}
          />
          <span className={`text-[9px] font-mono truncate min-w-0 flex-1 text-left ${
            op.modelInfo.isFallback
              ? 'text-[var(--sf-state-warning-fg)]'
              : 'sf-text-subtle'
          }`}>
            {op.modelInfo.isFallback ? '\u26A0 ' : ''}{op.modelInfo.model}
          </span>
        </span>
      )}

      {/* Row 1.75: streaming LLM output */}
      {op.streamText && op.status === 'running' && (
        <StreamPanel text={op.streamText} />
      )}

      {/* Row 2: stage pipeline + elapsed */}
      <span className="flex items-center">
        <StagePipeline stages={op.stages} currentIndex={op.currentStageIndex} status={op.status} />
        <span className={`ml-auto text-[9px] font-mono shrink-0 ${
          op.status === 'running' ? 'text-[rgb(var(--sf-color-accent-strong-rgb))]'
          : op.status === 'error' ? 'text-[var(--sf-state-danger-fg)]'
          : 'sf-text-success'
        }`}>
          {op.status === 'done' ? 'done' : op.status === 'error' ? 'failed' : formatElapsed(op.startedAt, op.endedAt)}
        </span>
      </span>
    </button>
  );
}

/* ── Main tracker widget ───────────────────────────────────────────── */

export function OperationsTracker() {
  const operations = useOperationsStore((s) => s.operations);
  const setSelectedProduct = useProductStore((s) => s.setSelectedProduct);
  const [isOpen, toggleOpen] = usePersistedToggle('sidebar:ops-tracker', true);

  const sorted = useMemo(() => sortOperations(operations), [operations]);
  const runningCount = useMemo(() => sorted.filter((o) => o.status === 'running').length, [sorted]);

  // WHY: Force re-render every second to update elapsed timers while ops are running.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (runningCount === 0) return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [runningCount]);

  const handleCardClick = useCallback((op: Operation) => {
    setSelectedProduct(op.productId, '', '', '');
  }, [setSelectedProduct]);

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
        <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center py-4 px-2">
              <span className="text-[10px] sf-text-subtle italic">No active operations</span>
            </div>
          ) : (
            sorted.map((op) => (
              <OpCard key={op.id} op={op} onClick={() => handleCardClick(op)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
