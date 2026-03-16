import * as Tooltip from "@radix-ui/react-tooltip";
import {
  getFieldSystems,
  SYSTEM_BADGE_CONFIGS,
  formatStaticConsumerTooltip,
  parseFormattedStaticConsumerTooltip,
} from "../workbench/systemMapping";

interface StaticBadgesProps {
  fieldPath: string;
}

export function StaticBadges({ fieldPath }: StaticBadgesProps) {
  const systems = getFieldSystems(fieldPath);
  if (systems.length === 0) return null;

  return (
    <span className="inline-flex gap-0.5 ml-0.5">
      {systems.map((system) => {
        const config = SYSTEM_BADGE_CONFIGS[system];
        const tipText = formatStaticConsumerTooltip(fieldPath, system);
        const parsedTip = parseFormattedStaticConsumerTooltip(tipText);

        return (
          <Tooltip.Root key={system} delayDuration={200}>
            <Tooltip.Trigger asChild>
              <span
                style={{
                  fontSize: "8px",
                  lineHeight: "12px",
                  padding: "0 3px",
                  borderRadius: "2px",
                  fontWeight: 600,
                }}
                className={config.cls}
              >
                {config.label}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 max-w-md px-3 py-2 text-xs leading-snug sf-text-primary bg-white border sf-border-default rounded shadow-lg sf-dk-fg-100 sf-dk-surface-900 dark:sf-border-default"
                sideOffset={5}
              >
                <div className="space-y-2">
                  <div className="font-semibold sf-text-primary">
                    {parsedTip.title}
                  </div>
                  <div className="text-[11px] sf-text-muted sf-dk-fg-200">
                    {parsedTip.summary || tipText}
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
