import { useEffect, useMemo, useState, useRef } from 'react';
import { useOperationsStore } from '../state/operationsStore.ts';
import type { Operation, LlmCallRecord } from '../state/operationsStore.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import type { LlmAccessMode } from '../../llm-config/types/llmProviderRegistryTypes.ts';
import { extractEffortFromModelName } from '../../llm-config/state/llmEffortFromModelName.ts';
import { resolveEffortLabel } from '../../llm-config/state/resolveEffortLabel.ts';
import { useFormatTime, parseBackendMs } from '../../../utils/dateTime.ts';
import {
  MODULE_STYLES,
  MODULE_LABELS,
} from '../state/operationTypeRegistry.generated.ts';

/* ── Helpers ─────────────────────────────────────────────────── */

/** Split stream text into segments: { type: 'think' | 'text', text } */
function parseStreamSegments(raw: string): Array<{ type: 'think' | 'text'; text: string }> {
  const segments: Array<{ type: 'think' | 'text'; text: string }> = [];
  let remaining = raw;
  const re = /<think>([\s\S]*?)<\/think>/gi;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  while ((match = re.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      const before = remaining.slice(lastIndex, match.index).trim();
      if (before) segments.push({ type: 'text', text: before });
    }
    if (match[1].trim()) segments.push({ type: 'think', text: match[1].trim() });
    lastIndex = re.lastIndex;
  }
  const tail = remaining.slice(lastIndex);
  // Check for trailing incomplete <think> (still streaming)
  const openIdx = tail.lastIndexOf('<think>');
  if (openIdx >= 0) {
    const before = tail.slice(0, openIdx).trim();
    if (before) segments.push({ type: 'text', text: before });
    const thinkContent = tail.slice(openIdx + 7).trim();
    if (thinkContent) segments.push({ type: 'think', text: thinkContent });
  } else {
    const trimmed = tail.trim();
    if (trimmed) segments.push({ type: 'text', text: trimmed });
  }
  return segments;
}

/** True if stream has any non-empty content (thinking or answer). */
function hasStreamContent(raw: string): boolean {
  return raw.replace(/<\/?think>/gi, '').trim().length > 0;
}

function formatElapsed(startedAt: string, endedAt: string | null): string {
  const end = endedAt ? parseBackendMs(endedAt) : Date.now();
  const start = parseBackendMs(startedAt);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return '0:00';
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ── Stage pipeline (expanded) ───────────────────────────────── */

function DetailStagePipeline({ stages, currentIndex, status }: {
  readonly stages: readonly string[];
  readonly currentIndex: number;
  readonly status: 'running' | 'done' | 'error' | 'cancelled';
}) {
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {stages.map((name, i) => {
        let cls = 'px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.02em] border border-transparent whitespace-nowrap transition-all';
        let label = name;

        if (status === 'done') {
          cls += ' sf-text-success';
          label = `${name} \u2713`;
        } else if (status === 'cancelled' && i === currentIndex) {
          cls += ' sf-text-subtle opacity-60';
          label = `${name} \u25A0`;
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

/* ── Collapsible pre block ─────────────────────────────────── */

function CollapsiblePre({ label, text }: { readonly label: string; readonly text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] font-semibold sf-text-subtle uppercase tracking-[0.04em] cursor-pointer select-none hover:opacity-80"
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block', fontSize: '8px' }}>
          {'\u25B6'}
        </span>
        {label}
        <span className="font-normal normal-case tracking-normal sf-text-muted">
          ({text.length > 1000 ? `${Math.round(text.length / 1000)}k chars` : `${text.length} chars`})
        </span>
      </button>
      {open && (
        <pre
          className="mt-1 max-h-[30vh] overflow-y-auto whitespace-pre-wrap rounded-sm p-2 text-[10px] leading-relaxed font-mono sf-text-subtle bg-[rgb(var(--sf-color-surface-default-rgb)/0.6)] border border-[rgb(var(--sf-color-border-subtle-rgb)/0.2)]"
          style={{ scrollbarWidth: 'thin' }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}

/* ── Discovery log renderer ────────────────────────────────── */

function DiscoveryLogSection({ log }: { readonly log: Record<string, unknown> }) {
  const entries = Object.entries(log).filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.length > 0;
    return v != null;
  });
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold sf-text-subtle uppercase tracking-[0.04em] mb-1">Discovery Log</div>
      <div className="space-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="text-[10px] font-mono sf-text-subtle">
            <span className="sf-text-muted">{key}:</span>{' '}
            {Array.isArray(value) ? (
              <span>{value.length} items{value.length <= 8 ? ` — ${value.join(', ')}` : ''}</span>
            ) : (
              <span>{String(value)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Single LLM call row ───────────────────────────────────── */

function LlmCallRow({ call }: { readonly call: LlmCallRecord }) {
  const [expanded, setExpanded] = useState(false);
  const formatTime = useFormatTime();
  const isPending = call.response === null || call.response === undefined;
  const responseStr = isPending ? '' : (typeof call.response === 'string' ? call.response : JSON.stringify(call.response, null, 2));
  const discoveryLog = (!isPending && call.response && typeof call.response === 'object' && 'discovery_log' in call.response)
    ? (call.response as Record<string, unknown>).discovery_log as Record<string, unknown> | null
    : null;
  const time = call.timestamp ? formatTime(call.timestamp) : '';

  return (
    <div className="rounded-sm border border-[rgb(var(--sf-color-border-subtle-rgb)/0.2)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 cursor-pointer select-none hover:opacity-80 bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.5)]"
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block', fontSize: '8px' }} className="sf-text-muted shrink-0">
          {'\u25B6'}
        </span>
        <span className="text-[11px] font-mono font-bold text-[var(--sf-token-accent-strong)]">
          {call.label || call.mode || `Call #${call.callIndex + 1}`}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <ModelBadgeGroup
            accessMode={(call.accessMode || 'api') as LlmAccessMode}
            thinking={call.thinking}
            webSearch={call.webSearch}
            isFallback={call.isFallback}
          />
        </span>
        {call.model && (
          <span className="text-[9px] font-mono sf-text-muted">
            {call.model}
            {(() => {
              // WHY: Prefer per-call effortLevel (captured at call time); fall back to name-suffix extraction for legacy records.
              const e = call.effortLevel
                ? resolveEffortLabel({ model: call.model, effortLevel: call.effortLevel, thinking: call.thinking })
                : extractEffortFromModelName(call.model);
              return e ? <span className="sf-text-subtle font-normal"> {e}</span> : null;
            })()}
          </span>
        )}
        {call.variant && (
          <span className="text-[9px] font-mono sf-text-subtle">{call.variant}</span>
        )}
        {call.mode && (
          <span className="inline-flex items-center px-1 text-[8px] font-bold font-mono uppercase rounded-[2px] border border-current leading-[1.5] sf-chip-info">
            {call.mode}
          </span>
        )}
        <span className="flex-1" />
        {call.usage && (
          <span className="text-[9px] font-mono sf-text-subtle whitespace-nowrap">
            {call.usage.prompt_tokens.toLocaleString()} in / {call.usage.completion_tokens.toLocaleString()} out
            {call.usage.cost_usd > 0 && <span className="ml-1 sf-text-muted">${call.usage.cost_usd.toFixed(4)}</span>}
            {call.usage.estimated_usage && <span className="ml-0.5 opacity-50">(est)</span>}
          </span>
        )}
        {isPending && (
          <span className="text-[8px] font-bold uppercase tracking-wide text-[rgb(var(--sf-color-accent-strong-rgb))] animate-pulse">
            Awaiting response...
          </span>
        )}
        {time && <span className="text-[9px] font-mono sf-text-muted">{time}</span>}
      </button>
      {expanded && (
        <div className="px-2.5 py-2 space-y-2 border-t border-[rgb(var(--sf-color-border-subtle-rgb)/0.15)]">
          <CollapsiblePre label="System Prompt" text={call.prompt.system} />
          <CollapsiblePre label="User Message" text={call.prompt.user} />
          {isPending
            ? <div className="text-[10px] sf-text-subtle italic">Response pending...</div>
            : <CollapsiblePre label="LLM Response" text={responseStr} />
          }
          {discoveryLog && <DiscoveryLogSection log={discoveryLog} />}
        </div>
      )}
    </div>
  );
}

/* ── LLM Calls section ─────────────────────────────────────── */

function LlmCallsSection({ calls }: { readonly calls: ReadonlyArray<LlmCallRecord> }) {
  const totals = useMemo(() => {
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;
    let counted = 0;
    for (const c of calls) {
      if (!c.usage) continue;
      promptTokens += c.usage.prompt_tokens;
      completionTokens += c.usage.completion_tokens;
      costUsd += c.usage.cost_usd;
      counted++;
    }
    return counted > 0 ? { promptTokens, completionTokens, costUsd } : null;
  }, [calls]);

  return (
    <section>
      <div className="text-[10px] font-semibold sf-text-subtle uppercase tracking-[0.06em] mb-2">
        LLM Calls ({calls.length})
        {totals && (
          <span className="font-mono font-normal ml-2 tracking-normal normal-case">
            · {totals.promptTokens.toLocaleString()} in · {totals.completionTokens.toLocaleString()} out
            {totals.costUsd > 0 && <span> · ${totals.costUsd.toFixed(4)}</span>}
          </span>
        )}
      </div>
      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {calls.map((call) => (
          <LlmCallRow key={call.callIndex} call={call} />
        ))}
      </div>
    </section>
  );
}

/* ── Modal ───────────────────────────────────────────────────── */

interface Props {
  readonly op: Operation;
  readonly onClose: () => void;
}

export function OperationDetailModal({ op, onClose }: Props) {
  const formatTime = useFormatTime();
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
  const streamRef = useRef<HTMLDivElement>(null);
  const streamText = useOperationsStore((s) => s.streamTexts.get(op.id) ?? '');
  const streamSegments = useMemo(() => parseStreamSegments(streamText), [streamText]);
  const hasContent = useMemo(() => hasStreamContent(streamText), [streamText]);
  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streamSegments]);

  /* ── Derived ──────────────────────────────────────────────── */
  const chipCls = MODULE_STYLES[op.type] ?? 'sf-chip-neutral';
  const baseLabel = MODULE_LABELS[op.type] ?? op.type.toUpperCase().slice(0, 3);
  const chipLabel = op.subType ? `${baseLabel}.${op.subType[0]?.toUpperCase() ?? ''}` : baseLabel;
  const isRunning = op.status === 'running';
  const isDone = op.status === 'done';
  const isError = op.status === 'error';
  const isCancelled = op.status === 'cancelled';

  const statusCls = isRunning
    ? 'text-[rgb(var(--sf-color-accent-strong-rgb))] bg-[rgb(var(--sf-color-accent-rgb)/0.12)]'
    : isError
      ? 'text-[var(--sf-state-danger-fg)] bg-[var(--sf-state-danger-bg)]'
      : isCancelled
        ? 'sf-text-subtle bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.5)]'
        : 'sf-text-success bg-[rgb(var(--sf-color-surface-elevated-rgb)/0.5)]';

  const statusText = isRunning
    ? formatElapsed(op.startedAt, null)
    : isDone
      ? 'Completed'
      : isCancelled
        ? 'Cancelled'
        : 'Failed';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sf-surface-elevated rounded border sf-border-soft shadow-2xl w-full max-w-[52rem] max-h-[100vh] flex flex-col mx-4">

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

          {/* Progress text */}
          {op.progressText && (
            <section>
              <div className="text-[10px] font-semibold sf-text-subtle uppercase tracking-[0.06em] mb-1">
                Progress
              </div>
              <div className="text-[11px] sf-text-primary font-mono">{op.progressText}</div>
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
            <div className="flex items-center gap-3 text-[10px] sf-text-muted mb-2">
              <span className="font-semibold sf-text-subtle uppercase tracking-[0.06em]">
                {isRunning ? 'Live Output' : 'Output'}
              </span>
              {op.modelInfo && (
                <>
                  <span>&middot;</span>
                  <span className="inline-flex items-center gap-1">
                    Model:{' '}
                    <span className="inline-flex items-center gap-1 font-mono font-bold sf-text-subtle">
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
                </>
              )}
            </div>
            <div
              ref={streamRef}
              className="min-h-[80px] max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-sm p-3 text-[11px] leading-relaxed font-mono sf-text-primary bg-[rgb(var(--sf-color-surface-default-rgb)/0.6)] border border-[rgb(var(--sf-color-border-subtle-rgb)/0.2)]"
              style={{ scrollbarWidth: 'thin' }}
            >
              {hasContent ? (
                streamSegments.map((seg, i) =>
                  seg.type === 'think' ? (
                    <span key={i} className="opacity-40 italic">{seg.text}</span>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )
              ) : (
                isRunning
                  ? 'Waiting for output\u2026'
                  : isDone
                    ? 'Operation completed successfully.'
                    : ''
              )}
            </div>
          </section>

          {/* LLM Calls */}
          {op.llmCalls.length > 0 && (
            <LlmCallsSection calls={op.llmCalls} />
          )}

          {/* Timestamps */}
          <section className="text-[10px] sf-text-subtle flex items-center gap-4 pt-1 border-t border-[rgb(var(--sf-color-border-subtle-rgb)/0.15)]">
            <span>Started {formatTime(op.startedAt)}</span>
            {op.endedAt && (
              <span>Ended {formatTime(op.endedAt)}</span>
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
