// WHY: Body extracted from KeyEvidenceSection so the Workbench drawer's
// Evidence tab and the Key Navigator's Evidence section share one source.
import { FIELD_RULE_EVIDENCE_CONTROLS } from "../../../../../../../../src/field-rules/fieldRuleSchema.js";
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import { Tip } from "../../../../../shared/ui/feedback/Tip.tsx";
import { TierPicker } from "../../../../../shared/ui/forms/TierPicker.tsx";
import { NumberStepper } from "../../../../../shared/ui/forms/NumberStepper.tsx";
import { numN, arrN } from "../../../state/nestedValueHelpers.ts";
import { parseBoundedIntInput } from "../../../state/numericInputHelpers.ts";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../../../state/studioNumericKnobBounds.ts";
import { labelCls, STUDIO_TIPS } from "../../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };
const MIN_REFS_CONTROL = FIELD_RULE_EVIDENCE_CONTROLS[0];
const TIER_PREFERENCE_CONTROL = FIELD_RULE_EVIDENCE_CONTROLS[1];

export interface KeyEvidenceBodyProps extends KeySectionBaseProps {}

export function KeyEvidenceBody({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
}: KeyEvidenceBodyProps) {
  const minRefs = numN(
    currentRule,
    MIN_REFS_CONTROL.path,
    numN(currentRule, MIN_REFS_CONTROL.legacyPath || "", STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback),
  );

  return (
    <div className="grid grid-cols-2 gap-3 items-start">
      <div>
        <div className={`${labelCls} flex items-center`}>
          <span>{MIN_REFS_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[MIN_REFS_CONTROL.tooltipKey]} /></span>
          <B p={MIN_REFS_CONTROL.path} />
        </div>
        <NumberStepper
          className="w-full"
          min={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min}
          max={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max}
          value={String(minRefs)}
          ariaLabel={MIN_REFS_CONTROL.ariaLabel || ""}
          onChange={(next) =>
            updateField(
              selectedKey,
              MIN_REFS_CONTROL.path,
              parseBoundedIntInput(
                next,
                STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min,
                STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max,
                STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback,
              ),
            )
          }
        />
      </div>
      <div>
        <div className={`${labelCls} flex items-center`}>
          <span>{TIER_PREFERENCE_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[TIER_PREFERENCE_CONTROL.tooltipKey]} /></span>
          <B p={TIER_PREFERENCE_CONTROL.path} />
        </div>
        <TierPicker
          value={
            arrN(currentRule, TIER_PREFERENCE_CONTROL.path).length > 0
              ? arrN(currentRule, TIER_PREFERENCE_CONTROL.path)
              : [...(TIER_PREFERENCE_CONTROL.defaultValue || [])]
          }
          onChange={(v) => updateField(selectedKey, TIER_PREFERENCE_CONTROL.path, v)}
        />
      </div>
    </div>
  );
}
