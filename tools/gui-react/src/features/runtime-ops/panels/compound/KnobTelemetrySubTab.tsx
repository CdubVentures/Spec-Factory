import { useMemo } from 'react';
import { usePersistedNumber } from '../../../../stores/tabStore';
import { usePersistedToggle } from '../../../../stores/collapseStore';
import type { KnobSnapshotsResponse } from '../../types';

interface KnobTelemetrySubTabProps {
  data: KnobSnapshotsResponse | undefined;
  category: string;
}

export function KnobTelemetrySubTab({ data, category }: KnobTelemetrySubTabProps) {
  const snapshots = data?.snapshots ?? [];
  const [selectedIdx, setSelectedIdx] = usePersistedNumber(`runtimeOps:knobTelemetry:selectedIdx:${category}`, 0);
  const [showAll, toggleShowAll, setShowAll] = usePersistedToggle(`runtimeOps:knobTelemetry:showAll:${category}`, true);

  const snapshot = snapshots[selectedIdx] ?? null;

  const filteredEntries = useMemo(() => {
    if (!snapshot) return [];
    return showAll ? snapshot.entries : snapshot.entries.filter((e) => !e.match);
  }, [snapshot, showAll]);

  if (!data || snapshots.length === 0) {
    return <div className="p-6 text-center sf-text-muted">No knob snapshot data available</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="sf-text-caption sf-text-muted font-medium">Snapshot:</label>
        <select
          value={selectedIdx}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          className="sf-select sf-text-caption px-2 py-1 max-w-[20rem] truncate"
        >
          {snapshots.map((snap, idx) => (
            <option key={snap.ts} value={idx}>{snap.ts}</option>
          ))}
        </select>

        <label className="flex items-center gap-1 sf-text-caption sf-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={!showAll}
            onChange={(e) => setShowAll(!e.target.checked)}
            className="sf-checkbox"
          />
          Mismatches only
        </label>
      </div>

      {snapshot && (
        <>
          <div className="sf-text-caption sf-text-muted">
            {snapshot.mismatch_count} / {snapshot.total_knobs} mismatches
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b sf-border-soft">
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Knob</th>
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Config Value</th>
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Effective Value</th>
                  <th className="px-2 py-1.5 text-left sf-text-caption sf-text-muted uppercase tracking-wider font-semibold">Match</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.knob} className="border-b sf-border-soft">
                    <td className="px-2 py-1.5 font-mono sf-text-primary">{entry.knob}</td>
                    <td className="px-2 py-1.5 font-mono sf-text-subtle">{entry.config_value}</td>
                    <td className="px-2 py-1.5 font-mono sf-text-primary">{entry.effective_value}</td>
                    <td className="px-2 py-1.5">
                      {entry.match ? (
                        <span className="sf-text-primary font-bold">✓</span>
                      ) : (
                        <span className="sf-chip-danger px-2 py-0.5 text-xs font-bold rounded">MISMATCH</span>
                      )}
                    </td>
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
