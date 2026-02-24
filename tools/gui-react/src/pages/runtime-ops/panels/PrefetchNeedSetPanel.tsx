import { useState } from 'react';
import type { PrefetchNeedSetData, PrefetchNeedSetNeed } from '../types';
import { identityStatusBadgeClass, needsetReasonBadgeClass, pctString } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';

interface PrefetchNeedSetPanelProps {
  data: PrefetchNeedSetData;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 min-w-[8rem]">
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
    </div>
  );
}

function NeedDetailDrawer({ need, onClose }: { need: PrefetchNeedSetNeed; onClose: () => void }) {
  const score = typeof need.need_score === 'number' ? need.need_score : 0;
  return (
    <DrawerShell title={need.field} subtitle={`Required: ${need.required}`} onClose={onClose}>
      <DrawerSection title="Score Breakdown">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">Need Score</span>
            <span className="font-mono font-semibold">{score.toFixed(3)}</span>
          </div>
          <ScoreBar value={score} max={1} label={score.toFixed(2)} />
          <div className="grid grid-cols-2 gap-2 text-xs mt-2">
            <div className="text-gray-500 dark:text-gray-400">Confidence</div>
            <div className="font-mono">{typeof need.confidence === 'number' ? pctString(need.confidence) : '-'}</div>
            <div className="text-gray-500 dark:text-gray-400">Best Tier</div>
            <div className="font-mono">{need.best_tier ?? '-'}</div>
            <div className="text-gray-500 dark:text-gray-400">Evidence Refs</div>
            <div className="font-mono">{need.refs ?? '-'}</div>
          </div>
        </div>
      </DrawerSection>
    </DrawerShell>
  );
}

export function PrefetchNeedSetPanel({ data }: PrefetchNeedSetPanelProps) {
  const [selectedNeed, setSelectedNeed] = useState<PrefetchNeedSetNeed | null>(null);
  const identityStatus = data.identity_lock_state?.status || 'unknown';
  const identityConfidence = data.identity_lock_state?.confidence ?? 0;
  const reasonEntries = Object.entries(data.reason_counts || {});
  const requiredEntries = Object.entries(data.required_level_counts || {});
  const satisfied = data.total_fields - data.needset_size;
  const progressPct = data.total_fields > 0 ? (satisfied / data.total_fields) * 100 : 0;

  const hasConflict = reasonEntries.some(([r]) => r === 'conflict');
  const hasStale = reasonEntries.some(([r]) => r === 'stale_evidence');

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">NeedSet</h3>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${identityStatusBadgeClass(identityStatus)}`}>
          Identity: {identityStatus}
        </span>
      </div>

      {/* Hero Progress Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Field Coverage</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{satisfied} / {data.total_fields}</span>
        </div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{Math.round(progressPct)}% satisfied</div>
      </div>

      {/* Warnings */}
      {(hasConflict || hasStale) && (
        <div className="flex items-center gap-2 flex-wrap">
          {hasConflict && (
            <div className="px-3 py-1.5 rounded bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 text-xs text-orange-700 dark:text-orange-300">
              Identity conflicts detected - some fields have disagreeing sources
            </div>
          )}
          {hasStale && (
            <div className="px-3 py-1.5 rounded bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-xs text-yellow-700 dark:text-yellow-300">
              Stale evidence detected - some fields may need re-verification
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <StatCard label="Needs" value={data.needset_size} />
        <StatCard label="Total Fields" value={data.total_fields} />
        <StatCard label="Identity Confidence" value={pctString(identityConfidence)} />
      </div>

      {reasonEntries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">Reasons:</span>
          {reasonEntries.map(([reason, count]) => (
            <span key={reason} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${needsetReasonBadgeClass(reason)}`}>
              {reason}: {count}
            </span>
          ))}
        </div>
      )}

      {requiredEntries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">Levels:</span>
          {requiredEntries.map(([level, count]) => (
            <span key={level} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {level}: {count}
            </span>
          ))}
        </div>
      )}

      {data.needs.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2 font-medium">Field</th>
                <th className="text-left px-3 py-2 font-medium">Required</th>
                <th className="text-left px-3 py-2 font-medium w-32">Need Score</th>
                <th className="text-right px-3 py-2 font-medium">Confidence</th>
                <th className="text-right px-3 py-2 font-medium">Best Tier</th>
                <th className="text-right px-3 py-2 font-medium">Refs</th>
              </tr>
            </thead>
            <tbody>
              {data.needs.map((n) => (
                <tr
                  key={n.field}
                  className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
                  onClick={() => setSelectedNeed(n)}
                >
                  <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100">{n.field}</td>
                  <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{n.required}</td>
                  <td className="px-3 py-1.5">
                    <ScoreBar value={typeof n.need_score === 'number' ? n.need_score : 0} max={1} label={typeof n.need_score === 'number' ? n.need_score.toFixed(2) : '-'} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{typeof n.confidence === 'number' ? pctString(n.confidence) : '-'}</td>
                  <td className="px-3 py-1.5 text-right">{n.best_tier ?? '-'}</td>
                  <td className="px-3 py-1.5 text-right">{n.refs ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.needs.length === 0 && (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No needs data available. NeedSet will appear after the first computation.
        </div>
      )}

      {/* Need Detail Drawer */}
      {selectedNeed && (
        <NeedDetailDrawer need={selectedNeed} onClose={() => setSelectedNeed(null)} />
      )}

      {/* Round Diff */}
      {data.snapshots.length > 1 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium">
            What changed? ({data.snapshots.length} snapshots)
          </summary>
          <div className="mt-2 space-y-1">
            {data.snapshots.map((s, i) => {
              const prev = i > 0 ? data.snapshots[i - 1] : null;
              const delta = prev ? s.needset_size - prev.needset_size : 0;
              return (
                <div key={i} className="flex items-center gap-3 px-2 py-1 bg-gray-50 dark:bg-gray-800/50 rounded">
                  <span className="font-mono text-gray-500 dark:text-gray-400 text-[10px]">{s.ts}</span>
                  <span>needs: {s.needset_size}</span>
                  {prev && delta !== 0 && (
                    <span className={delta < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {delta > 0 ? '+' : ''}{delta}
                    </span>
                  )}
                  <span>identity: {s.identity_status}</span>
                  <span>conf: {pctString(s.identity_confidence)}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Debug Section */}
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          Debug: Raw NeedSet JSON
        </summary>
        <pre className="mt-2 text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto max-h-60 whitespace-pre-wrap text-gray-600 dark:text-gray-400">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
