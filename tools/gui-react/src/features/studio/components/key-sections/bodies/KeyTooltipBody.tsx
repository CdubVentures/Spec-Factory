// WHY: Body for Tooltip / Guidance panel: ui.tooltip_md textarea + preview block.
// Shared between Key Navigator and Workbench drawer.
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import { Tip } from "../../../../../shared/ui/feedback/Tip.tsx";
import { strN } from "../../../state/nestedValueHelpers.ts";
import { inputCls, labelCls, STUDIO_TIPS } from "../../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };

const TEXT_GRAY_400 = "sf-text-subtle";
const PREVIEW_LABEL_CLASS = `text-[10px] ${TEXT_GRAY_400} mb-1 font-medium`;
const INFO_SURFACE_CLASS = "sf-surface-card rounded p-2 border sf-border-default";

export interface KeyTooltipBodyProps extends KeySectionBaseProps {}

export function KeyTooltipBody({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
}: KeyTooltipBodyProps) {
  const tooltipMd = strN(currentRule, "ui.tooltip_md");
  return (
    <div>
      <div className={`${labelCls} flex items-center`}>
        <span>Display Tooltip<Tip style={TIP_STYLE} text={STUDIO_TIPS.tooltip_guidance} /></span>
        <B p="ui.tooltip_md" />
      </div>
      <textarea
        className={`${inputCls} w-full`}
        rows={3}
        value={tooltipMd}
        onChange={(e) => updateField(selectedKey, "ui.tooltip_md", e.target.value)}
        placeholder="Describe how this field should be interpreted..."
      />
      {tooltipMd ? (
        <div className={`mt-2 text-xs ${INFO_SURFACE_CLASS}`}>
          <div className={PREVIEW_LABEL_CLASS}>Preview:</div>
          <div className="sf-text-muted whitespace-pre-wrap">{tooltipMd}</div>
        </div>
      ) : null}
    </div>
  );
}
