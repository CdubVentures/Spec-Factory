// WHY: Body for Priority panel (required_level / availability / difficulty).
// Shared between Key Navigator and Workbench drawer.
import { FIELD_RULE_PRIORITY_CONTROLS } from "../../../../../../../../src/field-rules/fieldRuleSchema.js";
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import { Tip } from "../../../../../shared/ui/feedback/Tip.tsx";
import { strN } from "../../../state/nestedValueHelpers.ts";
import { selectCls, labelCls, STUDIO_TIPS } from "../../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };

export interface KeyPriorityBodyProps extends KeySectionBaseProps {}

export function KeyPriorityBody({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
  disabled,
}: KeyPriorityBodyProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {FIELD_RULE_PRIORITY_CONTROLS.map((control) => (
        <div key={control.path}>
          <div className={`${labelCls} flex items-center`}>
            <span>{control.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[control.tooltipKey]} /></span>
            <B p={control.path} />
          </div>
          <select
            className={`${selectCls} w-full`}
            value={strN(
              currentRule,
              control.path,
              strN(currentRule, control.legacyPath, control.fallback),
            )}
            onChange={(e) => updateField(selectedKey, control.path, e.target.value)}
            disabled={disabled}
          >
            {control.options.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
