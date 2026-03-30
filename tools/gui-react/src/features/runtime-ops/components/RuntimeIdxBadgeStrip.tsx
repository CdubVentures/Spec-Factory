import type { RuntimeIdxBadge } from '../types.ts';
import { TooltipBadge } from './PrefetchTooltip.tsx';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';

interface RuntimeIdxBadgeStripProps {
  badges?: RuntimeIdxBadge[];
}

function badgeClass(state: RuntimeIdxBadge['state']): string {
  return state === 'active'
    ? 'sf-chip-info'
    : 'sf-chip-neutral opacity-70';
}

export function RuntimeIdxBadgeStrip({ badges = [] }: RuntimeIdxBadgeStripProps) {
  const [isOpen, toggleOpen] = usePersistedToggle('runtimeOps:idxBadgeStrip:open', false);

  if (!Array.isArray(badges) || badges.length === 0) {
    return null;
  }

  const activeCount = badges.filter((b) => b.state === 'active').length;

  return (
    <div>
      {/* Collapsed header — always visible */}
      <div
        onClick={toggleOpen}
        className="flex items-center gap-2 cursor-pointer select-none py-1"
      >
        <span className="sf-text-caption sf-text-subtle font-medium">IDX Runtime</span>
        <span className="px-1.5 py-0 rounded sf-text-caption font-mono font-semibold sf-chip-neutral">
          {badges.length}
        </span>
        {activeCount > 0 && (
          <span className="px-1.5 py-0 rounded sf-text-caption font-mono font-semibold sf-chip-info">
            {activeCount} active
          </span>
        )}
        <span className={`sf-text-caption sf-text-dim transition-transform inline-block ${isOpen ? 'rotate-180' : ''}`}>
          {'\u25BC'}
        </span>
      </div>

      {/* Badge list — only when expanded */}
      {isOpen && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
          {badges.map((badge) => (
            <TooltipBadge
              key={badge.field_path}
              className={`px-2 py-0.5 rounded-full sf-text-caption font-medium font-mono ${badgeClass(badge.state)}`}
              tooltip={badge.tooltip}
            >
              {badge.label}
            </TooltipBadge>
          ))}
        </div>
      )}
    </div>
  );
}
