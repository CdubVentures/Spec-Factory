// WHY: Body for Priority panel (required_level / availability / difficulty).
// Shared between Key Navigator and Workbench drawer.
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import { Tip } from "../../../../../shared/ui/feedback/Tip.tsx";
import { strN } from "../../../state/nestedValueHelpers.ts";
import { selectCls, labelCls, STUDIO_TIPS } from "../../studioConstants.ts";
import {
  REQUIRED_LEVEL_OPTIONS,
  AVAILABILITY_OPTIONS,
  DIFFICULTY_OPTIONS,
} from "../../../../../registries/fieldRuleTaxonomy.ts";

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
      <div>
        <div className={`${labelCls} flex items-center`}>
          <span>Required Level<Tip style={TIP_STYLE} text={STUDIO_TIPS.required_level} /></span>
          <B p="priority.required_level" />
        </div>
        <select
          className={`${selectCls} w-full`}
          value={strN(
            currentRule,
            "priority.required_level",
            strN(currentRule, "required_level", "non_mandatory"),
          )}
          onChange={(e) => updateField(selectedKey, "priority.required_level", e.target.value)}
          disabled={disabled}
        >
          {REQUIRED_LEVEL_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <div className={`${labelCls} flex items-center`}>
          <span>Availability<Tip style={TIP_STYLE} text={STUDIO_TIPS.availability} /></span>
          <B p="priority.availability" />
        </div>
        <select
          className={`${selectCls} w-full`}
          value={strN(
            currentRule,
            "priority.availability",
            strN(currentRule, "availability", "sometimes"),
          )}
          onChange={(e) => updateField(selectedKey, "priority.availability", e.target.value)}
          disabled={disabled}
        >
          {AVAILABILITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <div className={`${labelCls} flex items-center`}>
          <span>Difficulty<Tip style={TIP_STYLE} text={STUDIO_TIPS.difficulty} /></span>
          <B p="priority.difficulty" />
        </div>
        <select
          className={`${selectCls} w-full`}
          value={strN(
            currentRule,
            "priority.difficulty",
            strN(currentRule, "difficulty", "easy"),
          )}
          onChange={(e) => updateField(selectedKey, "priority.difficulty", e.target.value)}
          disabled={disabled}
        >
          {DIFFICULTY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    </div>
  );
}
