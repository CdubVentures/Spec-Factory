import { useState } from 'react';
import type { PrefetchSearchProfileData, PrefetchSearchProfileQueryRow, SearchPlanPass } from '../types';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';

interface PrefetchSearchProfilePanelProps {
  data: PrefetchSearchProfileData;
  searchPlans?: SearchPlanPass[];
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 min-w-[8rem]">
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
    </div>
  );
}

function Chip({ label, className }: { label: string; className?: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${className || 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'}`}>
      {label}
    </span>
  );
}

function QueryDetailDrawer({ row, onClose }: { row: PrefetchSearchProfileQueryRow; onClose: () => void }) {
  return (
    <DrawerShell title="Query Detail" subtitle={row.query} onClose={onClose}>
      <DrawerSection title="Query">
        <div className="font-mono text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 rounded p-2">{row.query}</div>
      </DrawerSection>
      {(row.target_fields?.length ?? 0) > 0 && (
        <DrawerSection title="Target Fields">
          <div className="flex flex-wrap gap-1">
            {row.target_fields?.map((f) => (
              <Chip key={f} label={f} className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" />
            ))}
          </div>
        </DrawerSection>
      )}
      <DrawerSection title="Results">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {row.result_count !== undefined ? `${row.result_count} results` : 'No result data'}
          {row.providers?.length ? ` from ${row.providers.join(', ')}` : ''}
        </div>
      </DrawerSection>
    </DrawerShell>
  );
}

export function PrefetchSearchProfilePanel({ data, searchPlans }: PrefetchSearchProfilePanelProps) {
  const [selectedQuery, setSelectedQuery] = useState<PrefetchSearchProfileQueryRow | null>(null);
  const guardTotal = typeof data.query_guard?.total === 'number' ? data.query_guard.total : null;
  const guardGuarded = typeof data.query_guard?.guarded === 'number' ? data.query_guard.guarded : null;

  const allTargetFields = [...new Set(data.query_rows.flatMap((r) => r.target_fields || []))];
  const uncoveredFields = allTargetFields.length > 0
    ? allTargetFields.filter((f) => !data.query_rows.some((r) => r.target_fields?.includes(f) && (r.result_count ?? 0) > 0))
    : [];

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Search Profile</h3>
        {data.provider && <Chip label={data.provider} />}
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
          data.llm_query_planning
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
        }`}>
          LLM Planner: {data.llm_query_planning ? 'ON' : 'OFF'}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <StatCard label="Queries" value={data.query_count} />
        {guardTotal !== null && <StatCard label="Query Guard" value={`${guardGuarded ?? 0}/${guardTotal}`} />}
        {allTargetFields.length > 0 && <StatCard label="Target Fields" value={allTargetFields.length} />}
      </div>

      {data.identity_aliases.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">Aliases:</span>
          {data.identity_aliases.map((a) => <Chip key={a} label={a} />)}
        </div>
      )}

      {data.variant_guard_terms.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">Guard terms:</span>
          {data.variant_guard_terms.map((t) => (
            <Chip key={t} label={t} className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200" />
          ))}
        </div>
      )}

      {/* Coverage mini-matrix */}
      {uncoveredFields.length > 0 && (
        <div className="px-3 py-2 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-xs">
          <span className="font-medium text-yellow-700 dark:text-yellow-300">Uncovered fields: </span>
          {uncoveredFields.map((f) => (
            <span key={f} className="inline-block px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 text-[10px] mr-1 mb-0.5">{f}</span>
          ))}
        </div>
      )}

      {data.query_rows.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2 font-medium">Query</th>
                <th className="text-left px-3 py-2 font-medium">Strategy</th>
                <th className="text-left px-3 py-2 font-medium">Target Fields</th>
                <th className="text-right px-3 py-2 font-medium">Results</th>
                <th className="text-left px-3 py-2 font-medium">Providers</th>
              </tr>
            </thead>
            <tbody>
              {data.query_rows.map((r, i) => {
                const isLlm = searchPlans && searchPlans.length > 0 && searchPlans.some((p) => p.queries_generated.includes(r.query));
                return (
                  <tr
                    key={i}
                    className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
                    onClick={() => setSelectedQuery(r)}
                  >
                    <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100 max-w-[20rem] truncate">{r.query}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        isLlm
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {isLlm ? 'LLM' : 'Det.'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">
                      {r.target_fields?.join(', ') || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.result_count ?? '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{r.providers?.join(', ') || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.query_rows.length === 0 && (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No search profile data available. Profile will appear after query planning.
        </div>
      )}

      {selectedQuery && (
        <QueryDetailDrawer row={selectedQuery} onClose={() => setSelectedQuery(null)} />
      )}

      {/* Debug Section */}
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          Debug: Raw SearchProfile JSON
        </summary>
        <pre className="mt-2 text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto max-h-60 whitespace-pre-wrap text-gray-600 dark:text-gray-400">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
