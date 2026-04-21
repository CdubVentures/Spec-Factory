/**
 * KeyHistoryDrawer — right slide-over showing run history at 3 scopes.
 *
 * scope='key'      — runs for one field_key + URL/query history + evidence refs
 * scope='group'    — all runs across every field_key in the group (with field_key column)
 * scope='product'  — all runs across every field_key on the product (with group · field_key label)
 *
 * Composes FinderRunHistoryRow for each run row. Backend: GET /:cat/:pid?scope=...
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { FinderRunHistoryRow } from '../../../shared/ui/finder/FinderRunHistoryRow.tsx';
import type { KeyHistoryRun, KeyHistoryScope } from '../types.ts';
import { LIVE_MODES, DISABLED_REASONS } from '../types.ts';
import { useKeyFinderHistoryQuery } from '../api/keyFinderQueries.ts';

interface KeyHistoryDrawerProps {
  readonly open: boolean;
  readonly category: string;
  readonly productId: string;
  readonly scope: KeyHistoryScope;
  readonly targetId: string;
  readonly onClose: () => void;
  readonly onRerunKey?: (fieldKey: string) => void;
}

function scopeLabel(scope: KeyHistoryScope): string {
  if (scope === 'key') return 'KEY';
  if (scope === 'group') return 'GROUP';
  return 'PRODUCT';
}

function scopeTitle(scope: KeyHistoryScope, targetId: string, productId: string): string {
  if (scope === 'key') return targetId || '—';
  if (scope === 'group') return targetId || '—';
  return productId;
}

function aggregateDiscoveryUrls(runs: readonly KeyHistoryRun[], fieldKey: string): string[] {
  const urls = new Set<string>();
  for (const run of runs) {
    const fk = run.response.primary_field_key;
    if (fieldKey && fk !== fieldKey) continue;
    const perKey = run.response.results?.[fk];
    const logs = perKey?.discovery_log?.urls_checked || [];
    for (const u of logs) urls.add(u);
  }
  return [...urls];
}

function aggregateDiscoveryQueries(runs: readonly KeyHistoryRun[], fieldKey: string): string[] {
  const qs = new Set<string>();
  for (const run of runs) {
    const fk = run.response.primary_field_key;
    if (fieldKey && fk !== fieldKey) continue;
    const perKey = run.response.results?.[fk];
    const logs = perKey?.discovery_log?.queries_run || [];
    for (const q of logs) qs.add(q);
  }
  return [...qs];
}

export const KeyHistoryDrawer = memo(function KeyHistoryDrawer({
  open,
  category,
  productId,
  scope,
  targetId,
  onClose,
  onRerunKey,
}: KeyHistoryDrawerProps) {
  const { data, isLoading } = useKeyFinderHistoryQuery({
    category,
    productId,
    scope,
    id: scope === 'product' ? undefined : targetId,
    enabled: open,
  });

  const [expandedRunNumber, setExpandedRunNumber] = useState<number | null>(null);
  const runs: readonly KeyHistoryRun[] = useMemo(
    () => (data?.runs ? [...data.runs].sort((a, b) => b.run_number - a.run_number) : []),
    [data?.runs],
  );

  const urlsChecked = useMemo(
    () => (scope === 'key' ? aggregateDiscoveryUrls(runs, targetId) : []),
    [runs, scope, targetId],
  );
  const queriesRun = useMemo(
    () => (scope === 'key' ? aggregateDiscoveryQueries(runs, targetId) : []),
    [runs, scope, targetId],
  );

  const latestEvidenceRefs = useMemo(() => {
    if (scope !== 'key') return [] as ReadonlyArray<unknown>;
    const latest = runs[0];
    if (!latest) return [];
    const perKey = latest.response.results?.[latest.response.primary_field_key];
    return perKey?.evidence_refs || [];
  }, [runs, scope]);

  const toggleRun = useCallback((runNumber: number) => {
    setExpandedRunNumber((cur) => (cur === runNumber ? null : runNumber));
  }, []);

  const handleRerun = useCallback(() => {
    if (scope === 'key' && targetId && onRerunKey) onRerunKey(targetId);
  }, [scope, targetId, onRerunKey]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ background: 'rgba(20,24,40,0.42)' }}
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 h-full w-[480px] max-w-[90vw] sf-surface shadow-2xl flex flex-col border-l sf-border"
        style={{ animation: 'slideIn .18s ease-out' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b sf-border-soft sf-surface-soft">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded text-white"
              style={{ background: scope === 'key' ? '#4263eb' : scope === 'group' ? '#0c8599' : '#7048e8' }}
            >
              {scopeLabel(scope)}
            </span>
            <strong className="text-[14px] font-mono sf-text-primary">
              {scopeTitle(scope, targetId, productId)}
            </strong>
            <button
              onClick={onClose}
              aria-label="Close"
              className="ml-auto px-2 py-0.5 text-[11.5px] sf-text-muted hover:sf-text-primary"
            >
              ✕
            </button>
          </div>
          {data && (
            <div className="text-[11.5px] sf-text-muted mt-1.5">
              {runs.length} {runs.length === 1 ? 'run' : 'runs'}
              {scope === 'group' && ` across group "${targetId}"`}
              {scope === 'product' && ` across this product`}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {isLoading && (
            <div className="sf-text-muted text-[13px] text-center py-6">Loading history…</div>
          )}
          {!isLoading && runs.length === 0 && (
            <div className="sf-text-muted text-[13px] text-center py-6">
              No runs yet at this scope.
            </div>
          )}
          {runs.length > 0 && (
            <section>
              <h5 className="text-[10.5px] font-bold uppercase tracking-wide sf-text-muted mb-2">Run history</h5>
              <div className="sf-surface-soft rounded border sf-border-soft">
                {runs.map((run) => {
                  const primaryFk = run.response.primary_field_key;
                  const perKey = run.response.results?.[primaryFk];
                  const valueStr = perKey?.value === undefined ? '—' : JSON.stringify(perKey.value);
                  return (
                    <FinderRunHistoryRow
                      key={run.run_number}
                      runNumber={run.run_number}
                      ranAt={run.ran_at}
                      model={run.model}
                      effortLevel={run.effort_level}
                      thinking={run.thinking}
                      webSearch={run.web_search}
                      expanded={expandedRunNumber === run.run_number}
                      onToggle={() => toggleRun(run.run_number)}
                      onDelete={() => { /* deletion wired in a follow-up */ }}
                      deleteDisabled
                      leftContent={
                        scope !== 'key'
                          ? <code className="text-[11px] text-[var(--sf-token-accent-strong)]">{primaryFk}</code>
                          : undefined
                      }
                      rightContent={
                        <span className="text-[11.5px] font-mono sf-text-primary max-w-[140px] truncate" title={valueStr}>
                          {valueStr}
                        </span>
                      }
                    >
                      {/* Expanded body — show the perKey details */}
                      {perKey && (
                        <div className="text-[12px] sf-text-muted space-y-2">
                          {perKey.unknown_reason && (
                            <div><strong>Unknown reason:</strong> {perKey.unknown_reason}</div>
                          )}
                          <div><strong>Confidence:</strong> {perKey.confidence}</div>
                          {Array.isArray(perKey.evidence_refs) && perKey.evidence_refs.length > 0 && (
                            <div>
                              <strong>Evidence ({perKey.evidence_refs.length}):</strong>
                              <ul className="mt-1 ml-4 list-disc">
                                {perKey.evidence_refs.slice(0, 5).map((e, i) => {
                                  const ev = e as { url?: string; tier?: string; confidence?: number };
                                  return (
                                    <li key={i} className="font-mono text-[11px] truncate">
                                      [{ev.tier || '?'}] {ev.url || '—'} · conf {ev.confidence ?? '—'}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </FinderRunHistoryRow>
                  );
                })}
              </div>
            </section>
          )}

          {scope === 'key' && (urlsChecked.length > 0 || queriesRun.length > 0) && (
            <section className="space-y-3">
              {urlsChecked.length > 0 && (
                <div className="sf-surface-soft rounded border sf-border-soft p-3">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide sf-text-muted mb-1.5">
                    URL history ({urlsChecked.length})
                  </div>
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                    {urlsChecked.slice(0, 20).map((u) => (
                      <li key={u} className="font-mono text-[11px] sf-text-muted truncate" title={u}>{u}</li>
                    ))}
                    {urlsChecked.length > 20 && (
                      <li className="font-mono text-[11px] sf-text-subtle italic">+ {urlsChecked.length - 20} more</li>
                    )}
                  </ul>
                </div>
              )}
              {queriesRun.length > 0 && (
                <div className="sf-surface-soft rounded border sf-border-soft p-3">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide sf-text-muted mb-1.5">
                    Query history ({queriesRun.length})
                  </div>
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                    {queriesRun.slice(0, 20).map((q) => (
                      <li key={q} className="font-mono text-[11px] sf-text-muted truncate" title={q}>"{q}"</li>
                    ))}
                    {queriesRun.length > 20 && (
                      <li className="font-mono text-[11px] sf-text-subtle italic">+ {queriesRun.length - 20} more</li>
                    )}
                  </ul>
                </div>
              )}
            </section>
          )}

          {scope === 'key' && latestEvidenceRefs.length > 0 && (
            <section className="sf-surface-soft rounded border sf-border-soft p-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wide sf-text-muted mb-1.5">
                Latest evidence ({latestEvidenceRefs.length})
              </div>
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {latestEvidenceRefs.slice(0, 10).map((ref, i) => {
                  const ev = ref as { url?: string; tier?: string; confidence?: number };
                  return (
                    <li key={i} className="font-mono text-[11px] sf-text-muted truncate" title={ev.url}>
                      [{ev.tier || '?'}] {ev.url || '—'} · conf {ev.confidence ?? '—'}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        {/* Footer — actions vary by scope */}
        <div className="px-5 py-3 border-t sf-border-soft sf-surface-soft flex items-center gap-2 justify-end flex-wrap">
          {scope === 'key' && (
            <>
              <button
                disabled={!LIVE_MODES.keyLoop}
                title={LIVE_MODES.keyLoop ? '' : DISABLED_REASONS.keyLoop}
                className="px-3 py-1 text-[11.5px] font-semibold rounded border disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ∞ Loop this key
              </button>
              <button
                onClick={handleRerun}
                className="px-3 py-1 text-[11.5px] font-semibold rounded sf-primary-button"
              >
                ▶ Re-run
              </button>
            </>
          )}
          {scope === 'group' && (
            <>
              <button
                disabled={!LIVE_MODES.groupLoop}
                title={LIVE_MODES.groupLoop ? '' : DISABLED_REASONS.groupLoop}
                className="px-3 py-1 text-[11.5px] font-semibold rounded border disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ∞ Loop group
              </button>
              <button
                disabled={!LIVE_MODES.groupRun}
                title={LIVE_MODES.groupRun ? '' : DISABLED_REASONS.groupRun}
                className="px-3 py-1 text-[11.5px] font-semibold rounded sf-primary-button disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ▶ Run group
              </button>
            </>
          )}
          {scope === 'product' && (
            <>
              <button
                disabled={!LIVE_MODES.productLoop}
                title={LIVE_MODES.productLoop ? '' : DISABLED_REASONS.productLoop}
                className="px-3 py-1 text-[11.5px] font-semibold rounded border disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ∞ Loop all groups
              </button>
              <button
                disabled={!LIVE_MODES.productRun}
                title={LIVE_MODES.productRun ? '' : DISABLED_REASONS.productRun}
                className="px-3 py-1 text-[11.5px] font-semibold rounded sf-primary-button disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ▶ Run all groups
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
});
