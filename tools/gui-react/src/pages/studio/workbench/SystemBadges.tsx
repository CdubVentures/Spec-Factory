// ── SystemBadges: clickable consumer toggle badges per field ─────────
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  type DownstreamSystem,
  SYSTEM_BADGE_CONFIGS,
  getFieldSystems,
  isConsumerEnabled,
  formatConsumerTooltip,
  parseFormattedConsumerTooltip,
} from './systemMapping';

interface Props {
  fieldPath: string;
  rule: Record<string, unknown>;
  onToggle: (fieldPath: string, system: DownstreamSystem, enabled: boolean) => void;
}

const enabledInline: Record<DownstreamSystem, React.CSSProperties> = {
  indexlab: { background: '#cffafe', color: '#0e7490', border: '1px solid #a5f3fc' },
  seed:    { background: '#ecfccb', color: '#4d7c0f', border: '1px solid #d9f99d' },
  review:  { background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3' },
};

const disabledInline: React.CSSProperties = {
  background: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb',
  textDecoration: 'line-through',
};

export function SystemBadges({ fieldPath, rule, onToggle }: Props) {
  const systems = getFieldSystems(fieldPath);
  if (systems.length === 0) return null;

  return (
    <span className="inline-flex gap-0.5 ml-auto shrink-0">
      {systems.map((sys) => {
        const cfg = SYSTEM_BADGE_CONFIGS[sys];
        const enabled = isConsumerEnabled(rule, fieldPath, sys);
        const tipText = formatConsumerTooltip(fieldPath, sys, enabled);
        const parsedTip = parseFormattedConsumerTooltip(tipText);
        return (
          <Tooltip.Root key={sys} delayDuration={200}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(fieldPath, sys, !enabled); }}
                style={{
                  fontSize: '9px',
                  lineHeight: '14px',
                  padding: '0 4px',
                  borderRadius: '3px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                  ...(enabled ? enabledInline[sys] : disabledInline),
                }}
                className={`${enabled ? cfg.cls : cfg.clsDim}`}
              >
                {cfg.label}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 max-w-md px-3 py-2 text-xs leading-snug text-gray-900 bg-white border border-gray-200 rounded shadow-lg dark:text-gray-100 dark:bg-gray-900 dark:border-gray-700"
                sideOffset={5}
              >
                <div className="space-y-2">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{parsedTip.title}</div>
                  <div className="text-[11px] text-gray-600 dark:text-gray-300">
                    <span className="font-semibold">Status:</span> {parsedTip.status || (enabled ? 'Enabled' : 'Disabled')}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">When enabled</div>
                    <div className="text-[11px] text-gray-700 dark:text-gray-200">{parsedTip.whenEnabled}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">When disabled</div>
                    <div className="text-[11px] text-gray-700 dark:text-gray-200">{parsedTip.whenDisabled}</div>
                  </div>
                  <div className="pt-1 text-[11px] text-sky-700 dark:text-sky-300 font-medium">
                    {parsedTip.action || `Click to ${enabled ? 'disable' : 'enable'}`}
                  </div>
                </div>
                <Tooltip.Arrow className="fill-white dark:fill-gray-900" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
    </span>
  );
}
