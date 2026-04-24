import type { ComponentType } from "react";
import { Tip } from "../../../../shared/ui/feedback/Tip.tsx";
import { readAiAssistToggleEnabled } from "../../state/studioPriority.ts";
import { STUDIO_TIPS } from "../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };

export interface AiAssistToggleSubsectionProps {
  selectedKey: string;
  currentRule: Record<string, unknown>;
  updateField: (key: string, path: string, value: unknown) => void;
  BadgeRenderer: ComponentType<{ p: string }>;
  path: "ai_assist.variant_inventory_usage" | "ai_assist.pif_priority_images";
  label: string;
  ariaLabel: string;
  tooltipKey: keyof typeof STUDIO_TIPS;
  disabled?: boolean;
}

export function AiAssistToggleSubsection({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
  path,
  label,
  ariaLabel,
  tooltipKey,
  disabled = false,
}: AiAssistToggleSubsectionProps) {
  const enabled = readAiAssistToggleEnabled(currentRule, path);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <label className="flex items-center gap-2 text-xs sf-text-default cursor-pointer select-none">
          <input
            type="checkbox"
            aria-label={ariaLabel}
            checked={enabled}
            disabled={disabled}
            onChange={(e) =>
              updateField(selectedKey, path, { enabled: e.target.checked })
            }
            className="rounded sf-border-soft"
          />
          <span className="font-medium">{label}</span>
          <Tip style={TIP_STYLE} text={STUDIO_TIPS[tooltipKey]} />
        </label>
        <B p={path} />
      </div>
    </div>
  );
}
