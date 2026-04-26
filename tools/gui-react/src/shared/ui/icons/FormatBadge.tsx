// WHY: Reusable format badge with inline SVG icons for file types.
// Used by extraction panels to display artifact formats (JPEG, PNG, WebM).

import type { ReactNode } from 'react';

const IMAGE_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" />
    <path d="M1.5 12l3-3.5 2.5 2.5 2.5-3.5L14.5 12" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const VIDEO_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M6.5 6v4l3.5-2-3.5-2z" fill="currentColor" />
  </svg>
);

// WHY: Each format gets a categorical chart-palette color (themable per theme).
// JPEG/PNG/WebP/WebM each get a distinct slot from --sf-token-chart-*.
const FORMAT_META: Record<string, { icon: ReactNode; color: string }> = {
  jpeg: { icon: IMAGE_ICON, color: 'text-[var(--sf-token-chart-4)]' },
  jpg:  { icon: IMAGE_ICON, color: 'text-[var(--sf-token-chart-4)]' },
  png:  { icon: IMAGE_ICON, color: 'text-[var(--sf-token-chart-2)]' },
  webp: { icon: IMAGE_ICON, color: 'text-[var(--sf-token-chart-3)]' },
  webm: { icon: VIDEO_ICON, color: 'text-[var(--sf-token-chart-7)]' },
};

interface FormatBadgeProps {
  format: string;
}

export function FormatBadge({ format }: FormatBadgeProps) {
  const key = format.toLowerCase();
  const meta = FORMAT_META[key] ?? { icon: IMAGE_ICON, color: 'sf-text-accent' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md sf-surface-elevated border sf-border-soft ${meta.color}`}>
      {meta.icon}
      <span className="text-[10px] font-bold font-mono uppercase tracking-[0.06em]">
        {format.toUpperCase()}
      </span>
    </span>
  );
}
