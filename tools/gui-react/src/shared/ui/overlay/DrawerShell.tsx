import { useState, type ReactNode } from 'react';
import { trafficColor, trafficTextColor, sourceBadgeClass, SOURCE_BADGE_FALLBACK } from '../../../utils/colors.ts';
import { pct } from '../../../utils/formatting.ts';
import { pullFormatDateTime } from '../../../utils/dateTime.ts';
import { ActionTooltip } from '../feedback/ActionTooltip.tsx';

interface DrawerShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  width?: number;
  maxHeight?: number | string;
  className?: string;
  scrollContent?: boolean;
  bodyRef?: React.RefObject<HTMLDivElement>;
  children: ReactNode;
}

interface Badge {
  label: string;
  className: string;
}

interface DrawerSectionProps {
  title?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function DrawerShell({ title, subtitle, onClose, width, maxHeight, className, scrollContent = true, bodyRef, children }: DrawerShellProps) {
  const style = width || maxHeight !== undefined
    ? {
      ...(width ? { width } : {}),
      ...(maxHeight !== undefined ? { maxHeight } : {}),
    }
    : undefined;

  return (
    <div
      className={`sf-surface-panel sf-primitive-panel sf-drawer-shell max-h-[calc(100vh-280px)] min-w-0 shrink-0 flex flex-col overflow-hidden ${className || ''}`}
      style={style}
    >
      <div className="sf-drawer-header px-4 py-2 flex justify-between items-center shrink-0">
        <div>
          <h3 className="sf-drawer-title font-semibold text-sm">{title}</h3>
          {subtitle && <p className="sf-drawer-subtitle">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="sf-drawer-close text-lg leading-none">&times;</button>
      </div>
      <div ref={bodyRef} className={scrollContent ? 'sf-drawer-body p-4 space-y-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden' : 'sf-drawer-body p-4 space-y-4'}>
        {children}
      </div>
    </div>
  );
}

export function DrawerSection({ title, meta, children, className, bodyClassName }: DrawerSectionProps) {
  return (
    <section className={className}>
      {(title || meta) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title ? <p className="sf-drawer-section-label text-xs font-medium">{title}</p> : <span />}
          {meta}
        </div>
      )}
      <div className={bodyClassName || 'space-y-2'}>{children}</div>
    </section>
  );
}

export function DrawerCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`sf-drawer-card border p-2 space-y-1.5 ${className || ''}`}>
      {children}
    </div>
  );
}

export function DrawerActionStack({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`sf-drawer-action-stack pt-3 space-y-2 ${className || ''}`}>
      {children}
    </div>
  );
}

const valueSourceBadge = sourceBadgeClass;

interface DrawerValueRowProps {
  color: string;
  value: string;
  confidence: number;
  source?: string;
  sourceTimestamp?: string | null;
  showConfidence?: boolean;
}

export function DrawerValueRow({ color, value, confidence, source, sourceTimestamp, showConfidence = true }: DrawerValueRowProps) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-3 h-3 rounded-full ${trafficColor(color)}`} />
        <span className={`font-mono text-sm font-semibold ${trafficTextColor(color)}`}>
          {value}
        </span>
        {source && (
          <span className={`sf-text-nano px-1.5 py-0.5 rounded font-medium ${valueSourceBadge[source] || SOURCE_BADGE_FALLBACK}`}>
            {source}
          </span>
        )}
        {showConfidence && (
          <span className="sf-drawer-meta text-xs ml-auto">
            {pct(confidence)}
          </span>
        )}
      </div>
      {sourceTimestamp && (
        <div className="sf-text-nano sf-drawer-meta pl-5">
          set {pullFormatDateTime(sourceTimestamp)}
        </div>
      )}
    </div>
  );
}

export function DrawerBadges({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((badge, index) => (
        <span key={`${badge.label}-${index}`} className={`sf-text-caption px-2 py-0.5 rounded ${badge.className}`}>
          {badge.label}
        </span>
      ))}
    </div>
  );
}

const drawerSourceBadgeClass = sourceBadgeClass;

export function DrawerSourceRow({ source, url }: { source?: string; url?: string }) {
  if (!source && !url) return null;
  return (
    <div className="sf-text-caption flex items-center gap-2">
      {source && (
        <span className={`px-1.5 py-0.5 rounded font-medium ${drawerSourceBadgeClass[source] || SOURCE_BADGE_FALLBACK}`}>
          {source}
        </span>
      )}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="text-accent hover:underline truncate">
          {url}
        </a>
      )}
    </div>
  );
}

interface DrawerManualOverrideProps {
  onApply: (value: string) => void;
  isPending: boolean;
  placeholder?: string;
  label?: string;
}

export function DrawerManualOverride({
  onApply,
  isPending,
  placeholder = 'Enter new value...',
  label = 'Manual Override',
}: DrawerManualOverrideProps) {
  const [value, setValue] = useState('');

  function apply() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onApply(trimmed);
    setValue('');
  }

  return (
    <DrawerActionStack>
      <p className="sf-drawer-section-label text-xs font-medium">{label}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="sf-input sf-primitive-input sf-drawer-input flex-1"
          placeholder={placeholder}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              apply();
            }
          }}
        />
        <ActionTooltip text="Apply this override to the current value.">
          <button
            onClick={apply}
            disabled={!value.trim() || isPending}
            className="sf-drawer-apply-button px-3 py-1 text-sm disabled:opacity-50"
          >
            Apply
          </button>
        </ActionTooltip>
      </div>
    </DrawerActionStack>
  );
}
