import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { usePersistedTab } from '../../../../stores/tabStore';
import type { PlanDiffResponse, PlanDiffWinner } from '../../types';

interface PlanDiffSubTabProps {
  runs: Array<{ run_id: string; category: string; started_at: string; status: string }>;
  category: string;
}

function winnerChipClass(winner: PlanDiffWinner): string {
  switch (winner) {
    case 'run1':
      return 'sf-chip-info';
    case 'run2':
      return 'sf-chip-accent';
    case 'tie':
      return 'sf-chip-neutral';
    case 'neither':
      return 'sf-chip-danger';
  }
}

export function PlanDiffSubTab({ runs, category }: PlanDiffSubTabProps) {
  const sortedRuns = useMemo(
    () => [...runs].filter((r) => r.category === category || category === 'all'),
    [runs, category],
  );

  const runIds = useMemo(
    () => sortedRuns.map((r) => r.run_id),
    [sortedRuns],
  );

  const [run1Id, setRun1Id] = usePersistedTab(`runtimeOps:planDiff:run1:${category}`, sortedRuns[1]?.run_id ?? '', { validValues: runIds });
  const [run2Id, setRun2Id] = usePersistedTab(`runtimeOps:planDiff:run2:${category}`, sortedRuns[0]?.run_id ?? '', { validValues: runIds });

  const canFetch = Boolean(run1Id && run2Id && run1Id !== run2Id);

  const { data } = useQuery<PlanDiffResponse>({
    queryKey: ['compound', 'plan-diff', run1Id, run2Id],
    queryFn: () => api.get<PlanDiffResponse>(`/indexlab/analytics/plan-diff?run1=${run1Id}&run2=${run2Id}`),
    enabled: canFetch,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="sf-text-caption sf-text-muted font-medium">Run 1:</label>
        <select
          value={run1Id}
          onChange={(e) => setRun1Id(e.target.value)}
          className="sf-select sf-text-caption px-2 py-1 max-w-[14rem] truncate"
        >
          <option value="">Select run...</option>
          {sortedRuns.map((r) => (
            <option key={r.run_id} value={r.run_id}>{r.run_id}</option>
          ))}
        </select>
        <label className="sf-text-caption sf-text-muted font-medium">Run 2:</label>
        <select
          value={run2Id}
          onChange={(e) => setRun2Id(e.target.value)}
          className="sf-select sf-text-caption px-2 py-1 max-w-[14rem] truncate"
        >
          <option value="">Select run...</option>
          {sortedRuns.map((r) => (
            <option key={r.run_id} value={r.run_id}>{r.run_id}</option>
          ))}
        </select>
      </div>

      {!canFetch && (
        <div className="p-6 text-center sf-text-muted">Select two different runs to compare</div>
      )}

      {data && (
        <>
          <div className="flex gap-3 flex-wrap">
            <div className="sf-surface-elevated p-2 rounded text-center">
              <div className="text-lg font-bold font-mono sf-text-primary">{data.run1_wins}</div>
              <div className="sf-text-caption sf-text-muted uppercase tracking-wider">Run 1 Wins</div>
            </div>
            <div className="sf-surface-elevated p-2 rounded text-center">
              <div className="text-lg font-bold font-mono sf-text-primary">{data.run2_wins}</div>
              <div className="sf-text-caption sf-text-muted uppercase tracking-wider">Run 2 Wins</div>
            </div>
            <div className="sf-surface-elevated p-2 rounded text-center">
              <div className="text-lg font-bold font-mono sf-text-primary">{data.ties}</div>
              <div className="sf-text-caption sf-text-muted uppercase tracking-wider">Ties</div>
            </div>
            <div className="sf-surface-elevated p-2 rounded text-center">
              <div className="text-lg font-bold font-mono sf-text-primary">{data.neither}</div>
              <div className="sf-text-caption sf-text-muted uppercase tracking-wider">Neither</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b sf-border-soft">
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Field</th>
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Run 1 Host</th>
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Run 1 Tier</th>
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Run 2 Host</th>
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Run 2 Tier</th>
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Winner</th>
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.fields.map((row) => (
                  <tr key={row.field} className="border-b sf-border-soft">
                    <td className="px-2 py-1.5 font-semibold sf-text-primary">{row.field}</td>
                    <td className="px-2 py-1.5 font-mono sf-text-subtle">{row.run1.host ?? '—'}</td>
                    <td className="px-2 py-1.5 font-mono sf-text-subtle">{row.run1.tier ?? '—'}</td>
                    <td className="px-2 py-1.5 font-mono sf-text-subtle">{row.run2.host ?? '—'}</td>
                    <td className="px-2 py-1.5 font-mono sf-text-subtle">{row.run2.tier ?? '—'}</td>
                    <td className="px-2 py-1.5">
                      <span className={`${winnerChipClass(row.winner)} px-2 py-0.5 text-xs font-bold rounded uppercase`}>
                        {row.winner}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 sf-text-muted max-w-xs truncate">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
