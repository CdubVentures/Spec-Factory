// ── SystemBadges: consumer badges per field ──────────────────────────
// WHY: All badges are informational — they show which runtime sub-consumers
// read each field rule property. No toggle, no gating. Hover for detail.
// Derived from the unified consumerBadgeRegistry.
//
// One chip per sub-consumer (LLM.KF, REV.GRID, REV.METADATA, etc.) — not
// collapsed per parent group, so authors can see exactly which stages
// consume the field.
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  type ParentGroup,
  PARENT_BADGE_CONFIGS,
  CONSUMER_DETAIL_MAP,
  KEY_NAVIGATION_PATHS,
} from './systemMapping.ts';

interface Props {
  fieldPath: string;
}

const badgeInline: Record<ParentGroup, React.CSSProperties> = {
  idx:  { background: '#cffafe', color: '#0e7490', border: '1px solid #a5f3fc' },
  eng:  { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' },
  rev:  { background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3' },
  flag: { background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' },
  seed: { background: '#ecfccb', color: '#4d7c0f', border: '1px solid #d9f99d' },
  comp: { background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe' },
  val:  { background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' },
  pub:  { background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' },
  llm:  { background: '#fae8ff', color: '#a21caf', border: '1px solid #f5d0fe' },
};

const badgeStyle: React.CSSProperties = {
  fontSize: '9px',
  lineHeight: '14px',
  padding: '0 5px',
  borderRadius: '3px',
  fontWeight: 700,
  letterSpacing: '0.02em',
  userSelect: 'none',
  whiteSpace: 'nowrap',
};

export function SystemBadges({ fieldPath }: Props) {
  const consumers = CONSUMER_DETAIL_MAP[fieldPath] || {};
  const consumerKeys = Object.keys(consumers);
  if (consumerKeys.length === 0) return null;

  const nav = KEY_NAVIGATION_PATHS[fieldPath];
  const keyNavLine = nav ? `Key Navigation › ${nav.section} › ${nav.key}` : '';

  return (
    <span className="inline-flex flex-wrap gap-0.5 ml-auto shrink-0 justify-end">
      {consumerKeys.map((consumerKey) => {
        const parent = consumerKey.split('.')[0] as ParentGroup;
        const cfg = PARENT_BADGE_CONFIGS[parent];
        if (!cfg) return null;

        const label = consumerKey.toUpperCase();
        const desc = consumers[consumerKey]?.desc || '';

        return (
          <Tooltip.Root key={consumerKey} delayDuration={200}>
            <Tooltip.Trigger asChild>
              <span
                style={{ ...badgeStyle, ...badgeInline[parent] }}
                className={cfg.cls}
              >
                {label}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="sf-tooltip-content z-50 max-w-md px-3 py-2 text-xs leading-snug rounded shadow-lg"
                sideOffset={5}
              >
                <div className="space-y-1.5">
                  <div className="font-semibold sf-text-primary">{cfg.title}</div>
                  {keyNavLine && (
                    <div className="text-[10px] sf-text-muted">{keyNavLine}</div>
                  )}
                  <div className="text-[11px] pt-1">
                    <span className="font-medium sf-text-primary">{consumerKey}</span>
                    <span className="sf-text-muted">: {desc}</span>
                  </div>
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
