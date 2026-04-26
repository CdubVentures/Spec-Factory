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

// WHY: Each consumer's bg/fg/border resolves through theme tokens so any
// theme can re-skin the badge palette without editing this file.
const badgeInline: Record<ParentGroup, React.CSSProperties> = {
  idx:  { background: 'var(--sf-token-consumer-idx-bg)',  color: 'var(--sf-token-consumer-idx-fg)',  border: '1px solid var(--sf-token-consumer-idx-border)'  },
  eng:  { background: 'var(--sf-token-consumer-eng-bg)',  color: 'var(--sf-token-consumer-eng-fg)',  border: '1px solid var(--sf-token-consumer-eng-border)'  },
  rev:  { background: 'var(--sf-token-consumer-rev-bg)',  color: 'var(--sf-token-consumer-rev-fg)',  border: '1px solid var(--sf-token-consumer-rev-border)'  },
  flag: { background: 'var(--sf-token-consumer-flag-bg)', color: 'var(--sf-token-consumer-flag-fg)', border: '1px solid var(--sf-token-consumer-flag-border)' },
  seed: { background: 'var(--sf-token-consumer-seed-bg)', color: 'var(--sf-token-consumer-seed-fg)', border: '1px solid var(--sf-token-consumer-seed-border)' },
  comp: { background: 'var(--sf-token-consumer-comp-bg)', color: 'var(--sf-token-consumer-comp-fg)', border: '1px solid var(--sf-token-consumer-comp-border)' },
  val:  { background: 'var(--sf-token-consumer-val-bg)',  color: 'var(--sf-token-consumer-val-fg)',  border: '1px solid var(--sf-token-consumer-val-border)'  },
  pub:  { background: 'var(--sf-token-consumer-pub-bg)',  color: 'var(--sf-token-consumer-pub-fg)',  border: '1px solid var(--sf-token-consumer-pub-border)'  },
  llm:  { background: 'var(--sf-token-consumer-llm-bg)',  color: 'var(--sf-token-consumer-llm-fg)',  border: '1px solid var(--sf-token-consumer-llm-border)'  },
};

const badgeStyle: React.CSSProperties = {
  fontSize: 'var(--sf-token-font-size-nano)',
  lineHeight: '14px',
  padding: '0 5px',
  borderRadius: 'var(--sf-token-radius-xs)',
  fontWeight: 700,
  letterSpacing: 'var(--sf-token-letter-spacing-wide)',
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
