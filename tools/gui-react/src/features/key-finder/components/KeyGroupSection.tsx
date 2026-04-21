/**
 * KeyGroupSection — collapsible group container with per-group actions.
 *
 * Header: chev + group name + stats + status badge + 3 actions (History live,
 * Loop group / Run group disabled Phase 5). Body: keys table via KeyRow.
 */

import { memo, useCallback } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import type { KeyGroup } from '../types.ts';
import { LIVE_MODES, DISABLED_REASONS } from '../types.ts';
import { KeyRow } from './KeyRow.tsx';

interface KeyGroupSectionProps {
  readonly group: KeyGroup;
  readonly storeKeyPrefix: string;
  readonly onRunKey: (fieldKey: string) => void;
  readonly onOpenKeyHistory: (fieldKey: string) => void;
  readonly onOpenKeyPrompt: (fieldKey: string) => void;
  readonly onOpenGroupHistory: (groupName: string) => void;
  readonly onRunGroup: (groupName: string) => void;
  readonly onLoopGroup: (groupName: string) => void;
}

function groupBadge(stats: KeyGroup['stats']): { label: string; cls: string } | null {
  if (stats.running > 0) return { label: 'ACTIVE', cls: 'sf-chip-info' };
  if (stats.total > 0 && stats.resolved === stats.total) return { label: 'DONE', cls: 'sf-chip-success' };
  if (stats.total > 0 && stats.resolved === 0) return { label: 'TODO', cls: 'sf-chip-warning' };
  return null;
}

export const KeyGroupSection = memo(function KeyGroupSection({
  group,
  storeKeyPrefix,
  onRunKey,
  onOpenKeyHistory,
  onOpenKeyPrompt,
  onOpenGroupHistory,
  onRunGroup,
  onLoopGroup,
}: KeyGroupSectionProps) {
  const [open, toggle] = usePersistedToggle(`${storeKeyPrefix}:grp:${group.name}`, true);
  const badge = groupBadge(group.stats);

  const handleHistory = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); onOpenGroupHistory(group.name); },
    [group.name, onOpenGroupHistory],
  );
  const handleRunGroup = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); onRunGroup(group.name); },
    [group.name, onRunGroup],
  );
  const handleLoopGroup = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); onLoopGroup(group.name); },
    [group.name, onLoopGroup],
  );

  return (
    <div className="border-b sf-border-soft">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2.5 px-5 py-2.5 sf-surface-soft hover:sf-surface-alt cursor-pointer select-none border-b sf-border-soft"
      >
        <span
          className="text-[10px] sf-text-muted shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        >
          ▶
        </span>
        <span className="text-[13.5px] font-bold sf-text-primary">{group.name}</span>
        <span className="text-[11.5px] sf-text-muted font-normal">
          · {group.stats.total} keys · {group.stats.resolved} resolved
          {group.stats.running > 0 ? ` · ${group.stats.running} running` : ''}
        </span>
        {badge && (
          <span className={`sf-chip ${badge.cls} ml-1`}>{badge.label}</span>
        )}
        <div className="flex-1" />
        <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
          <button
            onClick={handleHistory}
            className="px-2.5 py-1 text-[11.5px] font-semibold rounded sf-text-muted hover:sf-surface-alt"
          >
            History
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--sf-token-border, #dee2e6)' }} />
          <button
            disabled={!LIVE_MODES.groupLoop}
            title={LIVE_MODES.groupLoop ? '' : DISABLED_REASONS.groupLoop}
            onClick={handleLoopGroup}
            className="px-2.5 py-1 text-[11.5px] font-semibold rounded border sf-surface disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ∞ Loop group
          </button>
          <button
            disabled={!LIVE_MODES.groupRun}
            title={LIVE_MODES.groupRun ? '' : DISABLED_REASONS.groupRun}
            onClick={handleRunGroup}
            className="px-2.5 py-1 text-[11.5px] font-semibold rounded border sf-surface disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ▶ Run group
          </button>
        </span>
      </button>
      {open && (
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="sf-surface-soft">
              <th className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[22%]">Key</th>
              <th className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted">Axes</th>
              <th className="px-3 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[64px]" title="Attempt budget (Loop spend)">Budget</th>
              <th className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[14%]">Last model</th>
              <th className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[18%]">Value</th>
              <th className="px-3 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[56px]">Conf</th>
              <th className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[110px]">Status</th>
              <th className="px-3 py-1.5 text-right text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[260px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {group.keys.map((entry) => (
              <KeyRow
                key={entry.field_key}
                entry={entry}
                onRun={onRunKey}
                onOpenHistory={onOpenKeyHistory}
                onOpenPrompt={onOpenKeyPrompt}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
});
