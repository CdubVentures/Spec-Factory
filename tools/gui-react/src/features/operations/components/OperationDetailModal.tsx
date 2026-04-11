import { useEffect, useState, useRef } from 'react';
import type { Operation } from '../state/operationsStore.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import type { LlmAccessMode } from '../../llm-config/types/llmProviderRegistryTypes.ts';
import {
  MODULE_STYLES as FINDER_STYLES,
  MODULE_LABELS as FINDER_LABELS,
} from '../state/finderModuleRegistry.generated.ts';

/* ── Module chip map (mirrors OperationsTracker) ─────────────── */

const MODULE_STYLES: Readonly<Record<string, string>> = {
  ...FINDER_STYLES,
  'brand-resolver': 'sf-chip-info',
  'field-audit': 'sf-chip-warning',
  publisher: 'sf-chip-success',
  pipeline: 'sf-chip-info',
};

const MODULE_LABELS: Readonly<Record<string, string>> = {
  ...FINDER_LABELS,
  'brand-resolver': 'BR',
  'field-audit': 'FA',
  publisher: 'PUB',
  pipeline: 'PL',
};

/* ── Helpers ─────────────────────────────────────────────────── */

function formatElapsed(startedAt: string, endedAt: string | null): string {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ── Stage pipeline (expanded) ───────────────────────────────── */

function DetailStagePipeline({ stages, currentIndex, status }: {
  readonly stages: readonly string[];
  readonly currentIndex: number;
  readonly status: 'running' | 'done' | 'error';
}) {
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {stages.map((name, i) => {
        let cls = 'px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.02em] border border-transparent whitespace-nowrap transition-all';
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
            {i > 0 && <span className="text-[10px] px-0.5 sf-text-subtle opacity-40">&rsaquo;</span>}
            <span className={cls}>{label}</span>
          </span>
        );
      })}
    </div>
  );
}

/* ── Modal ───────────────────────────────────────────────────── */

interface Props {
  readonly op: Operation;
  readonly onClose: () => void;
}

export function OperationDetailModal({ op, onClose }: Props) {
  /* ── Dismiss handlers ─────────────────────────────────────── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /* ── Elapsed timer tick ───────────────────────────────────── */
  const [, setTick] = useState(0);
  useEffect(() => {
    if (op.status !== 'running') return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [op.status]);

  /* ── Auto-scroll stream ───────────────────────────────────── */
  const streamRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [op.streamText]);

  /* ── Derived ──────────────────────────────────────────────── */
  const chipCls = MODULE_STYLES[op.type] ?? 'sf-chip-neutral';
  const chipLabel = MODULE_LABELS[op.type] ?? op.type.toUpperCase().slice(0, 3);
  const isRunning = op.status === 'running';
  const isDone = op.status === 'done';
  const isError = op.status === 'error';

  const statusCls = isRunning
    ? 'text-[rgb(var(--sf-color-accent-strong-rgb))] bg-[rgb(var(--sf-color-accent-rgb)/0.12)]'
    : isError
      ? 'text-[var(--sf-state-danger-fg)] bg-[var(--sf-state-danger-bg)]'
      : 'sf-text-success bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.5)]';

  const statusText = isRunning
    ? formatElapsed(op.startedAt, null)
    : isDone
      ? 'Completed'
      : 'Failed';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sf-surface-elevated rounded border sf-border-soft shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[rgb(var(--sf-color-border-subtle-rgb)/0.3)]">
          <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold font-mono uppercase tracking-[0.04em] rounded-sm border border-current leading-[1.5] shrink-0 ${chipCls}`}>
            {chipLabel}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold sf-text-primary truncate">{op.productLabel}</div>
            <div className="text-[11px] sf-text-subtle">{op.category}</div>
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-bold font-mono ${statusCls}`}>
            {isRunning && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
            )}
            {statusText}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded-sm sf-text-subtle hover:sf-text-primary hover:bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.8)] transition-colors text-sm"
            title="Close (Esc)"
          >
            &times;
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: 'thin' }}>

          {/* Stage pipeline */}
          <section>
            <div className="text-[10px] font-semibold sf-text-subtle uppercase tracking-[0.06em] mb-2">
              Stages
            </div>
            <DetailStagePipeline
              stages={op.stages}
              currentIndex={op.currentStageIndex}
              status={op.status}
            />
          </section>

          {/* Model info */}
          {op.modelInfo && (
            <section>
              <div className="text-[10px] font-semibold sf-text-subtle uppercase tracking-[0.06em] mb-2">
                Model
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <ModelBadgeGroup
                  accessMode={(op.modelInfo.accessMode || 'api') as LlmAccessMode}
                  thinking={op.modelInfo.thinking}
                  webSearch={op.modelInfo.webSearch}
                />
                <span className={`text-[11px] font-mono truncate ${
                  op.modelInfo.isFallback
                    ? 'text-[var(--sf-state-warning-fg)]'
                    : 'sf-text-subtle'
                }`}>
                  {op.modelInfo.isFallback ? '\u26A0 ' : ''}{op.modelInfo.model}
                </span>
                {op.modelInfo.provider && (
                  <span className="text-[10px] sf-text-subtle opacity-60">
                    via {op.modelInfo.provider}
                  </span>
                )}
              </div>
            </section>
          )}

          {/* Error banner */}
          {isError && op.error && (
            <section className="rounded-sm border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.06)] px-3 py-2">
              <div className="text-[10px] font-semibold text-[var(--sf-state-danger-fg)] uppercase tracking-[0.06em] mb-1">
                Error
              </div>
              <div className="text-xs text-[var(--sf-state-danger-fg)]">{op.error}</div>
            </section>
          )}

          {/* Live output stream */}
          <section className="flex flex-col min-h-0">
            <div className="text-[10px] font-semibold sf-text-subtle uppercase tracking-[0.06em] mb-2">
              {isRunning ? 'Live Output' : 'Output'}
            </div>
            <pre
              ref={streamRef}
              className="min-h-[80px] max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-sm p-3 text-[11px] leading-relaxed font-mono sf-text-subtle bg-[rgb(var(--sf-color-surface-default-rgb)/0.6)] border border-[rgb(var(--sf-color-border-subtle-rgb)/0.2)]"
              style={{ scrollbarWidth: 'thin' }}
            >
              {op.streamText || (
                isRunning
                  ? 'Waiting for output\u2026'
                  : isDone
                    ? 'Operation completed successfully.'
                    : ''
              )}
            </pre>
          </section>

          {/* Timestamps */}
          <section className="text-[10px] sf-text-subtle flex items-center gap-4 pt-1 border-t border-[rgb(var(--sf-color-border-subtle-rgb)/0.15)]">
            <span>Started {new Date(op.startedAt).toLocaleTimeString()}</span>
            {op.endedAt && (
              <span>Ended {new Date(op.endedAt).toLocaleTimeString()}</span>
            )}
            {op.endedAt && (
              <span>Duration {formatElapsed(op.startedAt, op.endedAt)}</span>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
