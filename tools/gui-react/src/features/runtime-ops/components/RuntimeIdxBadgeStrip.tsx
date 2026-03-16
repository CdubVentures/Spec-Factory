import type { RuntimeIdxBadge } from '../types';
import { TooltipBadge } from './PrefetchTooltip';

interface RuntimeIdxBadgeStripProps {
  badges?: RuntimeIdxBadge[];
}

function badgeClass(state: RuntimeIdxBadge['state']): string {
  return state === 'active'
    ? 'sf-chip-info'
    : 'sf-chip-neutral opacity-70';
}

export function RuntimeIdxBadgeStrip({ badges = [] }: RuntimeIdxBadgeStripProps) {
  if (!Array.isArray(badges) || badges.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="sf-text-caption sf-text-subtle font-medium">IDX Runtime</span>
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
  );
}
