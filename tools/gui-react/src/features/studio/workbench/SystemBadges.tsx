// ── SystemBadges: consumer badges per field ──────────────────────────
// WHY: All badges are informational — they show which runtime systems
// consume each field rule property. No toggle, no gating. Hover for
// sub-consumer detail. Derived from the unified consumerBadgeRegistry.
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  type ParentGroup,
  PARENT_BADGE_CONFIGS,
  getFieldParentGroups,
  formatBadgeTooltip,
} from './systemMapping.ts';

interface Props {
  fieldPath: string;
}

const badgeInline: Record<ParentGroup, React.CSSProperties> = {
  idx:  { background: '#cffafe', color: '#0e7490', border: '1px solid #a5f3fc' },
  eng:  { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' },
  rev:  { background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3' },
  seed: { background: '#ecfccb', color: '#4d7c0f', border: '1px solid #d9f99d' },
  comp: { background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe' },
  val:  { background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' },
  pub:  { background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' },
};

const badgeStyle: React.CSSProperties = {
  fontSize: '9px',
  lineHeight: '14px',
  padding: '0 4px',
  borderRadius: '3px',
  fontWeight: 600,
  userSelect: 'none',
};

export function SystemBadges({ fieldPath }: Props) {
  const parents = getFieldParentGroups(fieldPath);
  if (parents.length === 0) return null;

  return (
    <span className="inline-flex gap-0.5 ml-auto shrink-0">
      {parents.map((parent) => {
        const cfg = PARENT_BADGE_CONFIGS[parent];
        if (!cfg) return null;

        const tipText = formatBadgeTooltip(fieldPath, parent);
        const lines = tipText.split('\n');
        const title = lines[0] || cfg.title;
        const detail = lines.slice(1).filter((l) => l.trim().length > 0);

        return (
          <Tooltip.Root key={parent} delayDuration={200}>
            <Tooltip.Trigger asChild>
              <span
                style={{ ...badgeStyle, ...badgeInline[parent] }}
                className={cfg.cls}
              >
                {cfg.label}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 max-w-md px-3 py-2 text-xs leading-snug sf-text-primary bg-white border sf-border-default rounded shadow-lg sf-dk-fg-100 sf-dk-surface-900 dark:sf-border-default"
                sideOffset={5}
              >
                <div className="space-y-1.5">
                  <div className="font-semibold sf-text-primary">{title}</div>
                  {detail.map((line, i) => {
                    const colonIdx = line.indexOf(':');
                    if (colonIdx > 0 && (line.startsWith('idx.') || line.startsWith('eng.') || line.startsWith('rev.') || line.startsWith('seed.') || line.startsWith('comp.') || line.startsWith('val.') || line.startsWith('pub.'))) {
                      const key = line.slice(0, colonIdx);
                      const desc = line.slice(colonIdx + 1).trim();
                      return (
                        <div key={i} className="text-[11px]">
                          <span className="font-medium sf-text-primary">{key}</span>
                          <span className="sf-text-muted"> {desc}</span>
                        </div>
                      );
                    }
                    return <div key={i} className="text-[11px] sf-text-muted">{line}</div>;
                  })}
                </div>
                <Tooltip.Arrow className="sf-tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
    </span>
  );
}
