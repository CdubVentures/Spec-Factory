import { useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import type { PrefetchNeedSetData, PrefetchNeedSetNeed } from '../types';
import { identityStatusBadgeClass, identityStatusTooltip, needsetReasonBadgeClass, pctString, tierLabel } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';
import { StatCard } from '../components/StatCard';
import { ProgressRing } from '../components/ProgressRing';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';
import { Tip } from '../../../components/common/Tip';

interface PrefetchNeedSetPanelProps {
  data: PrefetchNeedSetData;
  persistScope: string;
}

function fieldKey(n: PrefetchNeedSetNeed): string {
  return n.field_key ?? n.field ?? '';
}

function requiredLevel(n: PrefetchNeedSetNeed): string {
  return n.required_level ?? n.required ?? '';
}

function identityStateBadgeClass(state: string): string {
  switch (state) {
    case 'locked':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'provisional':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'conflict':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'unlocked':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  }
}

function requiredLevelBadgeClass(level: string): string {
  switch (level) {
    case 'required':
    case 'must':
      return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200';
    case 'recommended':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200';
    case 'optional':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  }
}



function NeedDetailDrawer({ need, onClose }: { need: PrefetchNeedSetNeed; onClose: () => void }) {
  const score = typeof need.need_score === 'number' ? need.need_score : 0;
  const conf = typeof need.confidence === 'number' ? need.confidence : 0;
  const effConf = typeof need.effective_confidence === 'number' ? need.effective_confidence : conf;
  const reasons = need.reasons ?? [];
  const payload = need.reason_payload ?? { why_missing: null, why_low_conf: null, why_blocked: null };
  const blockedBy = need.blocked_by ?? [];
  const tierPref = need.tier_preference ?? [];

  return (
    <DrawerShell
      title={fieldKey(need)}
      subtitle={`Required: ${requiredLevel(need)} | Status: ${need.status ?? '-'}`}
      maxHeight="none"
      className="max-h-none"
      scrollContent={false}
      onClose={onClose}
    >
      <DrawerSection title="Score Breakdown">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">Need Score</span>
            <span className="font-mono font-semibold">{score.toFixed(1)}</span>
          </div>
          <ScoreBar value={score} max={100} label={score.toFixed(0)} />

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mt-3">
            <div className="text-gray-500 dark:text-gray-400">Required Weight</div>
            <div className="font-mono">{need.required_weight ?? '-'}</div>

            <div className="text-gray-500 dark:text-gray-400">Confidence</div>
            <div className="font-mono">{pctString(conf)}</div>

            <div className="text-gray-500 dark:text-gray-400">Effective Confidence</div>
            <div className="font-mono">{pctString(effConf)}</div>

            <div className="text-gray-500 dark:text-gray-400">Pass Target</div>
            <div className="font-mono">{typeof need.pass_target === 'number' ? pctString(need.pass_target) : '-'}</div>

            <div className="text-gray-500 dark:text-gray-400">Meets Target</div>
            <div>
              {need.meets_pass_target
                ? <span className="text-green-600 dark:text-green-400 font-medium">Yes</span>
                : <span className="text-red-600 dark:text-red-400 font-medium">No</span>}
            </div>

            <div className="text-gray-500 dark:text-gray-400">Identity State</div>
            <div>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${identityStateBadgeClass(need.identity_state ?? '')}`}>
                {need.identity_state ?? '-'}
              </span>
            </div>

            <div className="text-gray-500 dark:text-gray-400">Best Identity Match</div>
            <div className="font-mono">{typeof need.best_identity_match === 'number' ? pctString(need.best_identity_match) : '-'}</div>

            <div className="text-gray-500 dark:text-gray-400">Best Tier Seen</div>
            <div className="font-mono">{need.best_tier_seen != null ? tierLabel(need.best_tier_seen) : '-'}</div>

            <div className="text-gray-500 dark:text-gray-400">Current Value</div>
            <div className="font-mono truncate">{need.value || '-'}</div>

            {need.quarantined && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Quarantined</div>
                <div><span className="text-orange-600 dark:text-orange-400 font-medium">Yes</span></div>
              </>
            )}

            {need.conflict && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Conflict</div>
                <div><span className="text-red-600 dark:text-red-400 font-medium">Yes</span></div>
              </>
            )}
          </div>
        </div>
      </DrawerSection>

      {reasons.length > 0 && (
        <DrawerSection title="Reasons">
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r, i) => (
              <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${needsetReasonBadgeClass(r)}`}>
                {r}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-1 text-xs mt-2">
            {payload.why_missing && (
              <div className="text-gray-600 dark:text-gray-400"><span className="font-medium text-gray-500">Missing:</span> {payload.why_missing}</div>
            )}
            {payload.why_low_conf && (
              <div className="text-gray-600 dark:text-gray-400"><span className="font-medium text-gray-500">Low confidence:</span> {payload.why_low_conf}</div>
            )}
            {payload.why_blocked && (
              <div className="text-gray-600 dark:text-gray-400"><span className="font-medium text-gray-500">Blocked:</span> {payload.why_blocked}</div>
            )}
          </div>
        </DrawerSection>
      )}

      <DrawerSection title="What Would Satisfy This Need?">
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400">Min References:</span>
            <span className="font-mono font-semibold">{need.min_refs ?? '-'}</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-500 dark:text-gray-400">Current:</span>
            <span className="font-mono font-semibold">{need.refs_found ?? 0}</span>
          </div>

          {tierPref.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400 shrink-0">Tier Preferences:</span>
              <div className="flex gap-1">
                {tierPref.map((t) => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[10px] font-medium">
                    T{t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {blockedBy.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-gray-500 dark:text-gray-400 shrink-0">Blocked By:</span>
              <div className="flex flex-wrap gap-1">
                {blockedBy.map((b) => (
                  <span key={b} className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 text-[10px] font-medium font-mono">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </DrawerSection>
    </DrawerShell>
  );
}

export function PrefetchNeedSetPanel({ data, persistScope }: PrefetchNeedSetPanelProps) {
  const needKeys = useMemo(
    () => (data.needs ?? []).map((need) => fieldKey(need)),
    [data.needs],
  );
  const [selectedNeedKey, setSelectedNeedKey] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:needset:selectedNeed:${persistScope}`,
    null,
    { validValues: needKeys },
  );
  const selectedNeed = useMemo(
    () => (data.needs ?? []).find((need) => fieldKey(need) === selectedNeedKey) ?? null,
    [data.needs, selectedNeedKey],
  );
  const identityStatus = data.identity_lock_state?.status || 'unlocked';
  const identityConfidence = data.identity_lock_state?.confidence ?? 0;
  const reasonEntries = Object.entries(data.reason_counts || {});
  const requiredEntries = Object.entries(data.required_level_counts || {});
  const satisfied = data.total_fields - data.needset_size;

  const hasConflict = reasonEntries.some(([r]) => r === 'conflict');
  const hasStale = reasonEntries.some(([r]) => r === 'stale_evidence');

  const sortedNeeds = [...(data.needs || [])].sort((a, b) => (b.need_score ?? 0) - (a.need_score ?? 0));
  const top5 = sortedNeeds.slice(0, 5);

  if (!data.needs || (data.needs.length === 0 && data.total_fields === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center flex-1">
        <div className="text-3xl text-gray-300 dark:text-gray-600">?</div>
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">No NeedSet Generated</div>
        <div className="text-xs text-gray-400 dark:text-gray-500 max-w-xs">
          The NeedSet will appear after the first computation round. Make sure the product has a valid category with defined fields.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          NeedSet
          <Tip text="The NeedSet ranks every spec field by how urgently it needs more evidence. Fields with missing values, low confidence, or tier deficits score highest." />
        </h3>
        <Tooltip.Root delayDuration={200}>
          <Tooltip.Trigger asChild>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium cursor-help ${identityStatusBadgeClass(identityStatus)}`}>
              Identity: {identityStatus}
            </span>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="z-50 max-w-xs px-3 py-2 text-xs leading-snug whitespace-pre-line text-gray-900 bg-white border border-gray-200 rounded shadow-lg dark:text-gray-100 dark:bg-gray-900 dark:border-gray-700"
              sideOffset={6}
              side="bottom"
            >
              {identityStatusTooltip(identityStatus)}
              <Tooltip.Arrow className="fill-white dark:fill-gray-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>

      {/* B) Hero Card — Progress Ring + Top 5 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-start gap-5">
          <ProgressRing numerator={satisfied} denominator={data.total_fields} variant="fraction" size={80} strokeWidth={8} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Field Coverage — {satisfied} satisfied, {data.needset_size} remaining
            </div>
            {top5.length > 0 && (
              <div className="space-y-1.5 mt-2">
                <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Top Unsatisfied Needs</div>
                {top5.map((n) => (
                  <div
                    key={fieldKey(n)}
                    className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded px-1 py-0.5 -mx-1"
                    onClick={() => setSelectedNeedKey(fieldKey(n))}
                  >
                    <span className="text-xs font-mono text-gray-800 dark:text-gray-200 truncate min-w-0 flex-shrink">{fieldKey(n)}</span>
                    <div className="flex-1 min-w-[60px] max-w-[120px]">
                      <ScoreBar value={n.need_score ?? 0} max={100} />
                    </div>
                    <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 shrink-0 w-8 text-right">{Math.round(n.need_score ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {(hasConflict || hasStale) && (
        <div className="flex items-center gap-2 flex-wrap">
          {hasConflict && (
            <div className="px-3 py-1.5 rounded bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 text-xs text-orange-700 dark:text-orange-300">
              Identity conflicts detected — some fields have disagreeing sources
            </div>
          )}
          {hasStale && (
            <div className="px-3 py-1.5 rounded bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-xs text-yellow-700 dark:text-yellow-300">
              Stale evidence detected — some fields may need re-verification
            </div>
          )}
        </div>
      )}

      {/* Stats Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatCard label="Needs" value={data.needset_size} />
        <StatCard label="Total Fields" value={data.total_fields} />
        <StatCard label="Identity Conf" value={pctString(identityConfidence)} />
      </div>

      {/* Reason + Level Badges */}
      {reasonEntries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Reasons:</span>
          {reasonEntries.map(([reason, count]) => (
            <span key={reason} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${needsetReasonBadgeClass(reason)}`}>
              {reason}: {count}
            </span>
          ))}
        </div>
      )}

      {requiredEntries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Levels:</span>
          {requiredEntries.map(([level, count]) => (
            <span key={level} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {level}: {count}
            </span>
          ))}
        </div>
      )}

      {/* C) Needs Table */}
      {sortedNeeds.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden min-w-0">
          <div className={`overflow-x-auto overflow-y-auto ${selectedNeed ? 'max-h-[50vh]' : 'max-h-none'}`}>
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[20%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                  <th className="text-left px-3 py-2 font-medium">Field</th>
                  <th className="text-left px-2 py-2 font-medium">Level</th>
                  <th className="text-left px-2 py-2 font-medium">Need Score</th>
                  <th className="text-left px-2 py-2 font-medium">Identity</th>
                  <th className="text-right px-2 py-2 font-medium">Conf</th>
                  <th className="text-left px-2 py-2 font-medium">Reasons</th>
                  <th className="text-right px-3 py-2 font-medium">Refs</th>
                </tr>
              </thead>
              <tbody>
                {sortedNeeds.map((n) => {
                  const fk = fieldKey(n);
                  const score = typeof n.need_score === 'number' ? n.need_score : 0;
                  const conf = typeof n.confidence === 'number' ? n.confidence : 0;
                  const reasons = n.reasons ?? [];
                  return (
                    <tr
                      key={fk}
                      className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
                      onClick={() => setSelectedNeedKey(fk)}
                    >
                      <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100 truncate">{fk}</td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${requiredLevelBadgeClass(requiredLevel(n))}`}>
                          {requiredLevel(n)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <ScoreBar value={score} max={100} label={score.toFixed(0)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${identityStateBadgeClass(n.identity_state ?? '')}`}>
                          {n.identity_state ?? '-'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{pctString(conf)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-0.5">
                          {reasons.slice(0, 3).map((r, i) => (
                            <span key={i} className={`px-1 py-0 rounded text-[9px] font-medium ${needsetReasonBadgeClass(r)}`}>
                              {r}
                            </span>
                          ))}
                          {reasons.length > 3 && (
                            <span className="px-1 py-0 rounded text-[9px] text-gray-400">+{reasons.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{n.refs_found ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sortedNeeds.length === 0 && data.total_fields > 0 && (
        <div className="text-sm text-center py-8 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
          <div className="text-emerald-700 dark:text-emerald-300 font-medium">All fields satisfied</div>
          <div className="text-xs text-emerald-500 dark:text-emerald-400 mt-1">
            {data.total_fields} fields have met their confidence and evidence thresholds.
          </div>
        </div>
      )}

      {/* D) Need Detail Drawer */}
      {selectedNeed && (
        <NeedDetailDrawer need={selectedNeed} onClose={() => setSelectedNeedKey(null)} />
      )}

      {/* E) Round Diff */}
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
                <div key={i} className="flex items-center gap-3 px-2 py-1.5 bg-gray-50 dark:bg-gray-800/50 rounded text-xs">
                  <span className="font-mono text-gray-500 dark:text-gray-400 text-[10px] shrink-0">{s.ts}</span>
                  <span className="shrink-0">needs: <span className="font-semibold">{s.needset_size}</span></span>
                  {prev && delta !== 0 && (
                    <span className={`font-semibold shrink-0 ${delta < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {delta > 0 ? '+' : ''}{delta}
                    </span>
                  )}
                  <span className="shrink-0">identity: {s.identity_status}</span>
                  <span className="shrink-0">conf: {pctString(s.identity_confidence)}</span>
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
        <pre className="mt-2 text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto overflow-y-auto max-h-60 whitespace-pre-wrap break-all text-gray-600 dark:text-gray-400">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
