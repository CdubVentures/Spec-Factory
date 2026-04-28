// WHY: Body extracted from KeyEvidenceSection so the Workbench drawer's
// Evidence tab and the Key Navigator's Evidence section share one source.
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import { Tip } from "../../../../../shared/ui/feedback/Tip.tsx";
import { TierPicker } from "../../../../../shared/ui/forms/TierPicker.tsx";
import { NumberStepper } from "../../../../../shared/ui/forms/NumberStepper.tsx";
import { numN, arrN } from "../../../state/nestedValueHelpers.ts";
import { parseBoundedIntInput } from "../../../state/numericInputHelpers.ts";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../../../state/studioNumericKnobBounds.ts";
import { labelCls, STUDIO_TIPS } from "../../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };

export interface KeyEvidenceBodyProps extends KeySectionBaseProps {}

export function KeyEvidenceBody({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
}: KeyEvidenceBodyProps) {
  const minRefs = numN(
    currentRule,
    "evidence.min_evidence_refs",
    numN(currentRule, "min_evidence_refs", STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback),
  );

  return (
    <div className="grid grid-cols-2 gap-3 items-start">
      <div>
        <div className={`${labelCls} flex items-center`}>
          <span>Min Evidence Refs<Tip style={TIP_STYLE} text={STUDIO_TIPS.min_evidence_refs} /></span>
          <B p="evidence.min_evidence_refs" />
        </div>
        <NumberStepper
          className="w-full"
          min={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min}
          max={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max}
          value={String(minRefs)}
          ariaLabel="min evidence refs"
          onChange={(next) =>
            updateField(
              selectedKey,
              "evidence.min_evidence_refs",
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
          <span>Tier Preference<Tip style={TIP_STYLE} text={STUDIO_TIPS.tier_preference} /></span>
          <B p="evidence.tier_preference" />
        </div>
        <TierPicker
          value={
            arrN(currentRule, "evidence.tier_preference").length > 0
              ? arrN(currentRule, "evidence.tier_preference")
              : ["tier1", "tier2", "tier3"]
          }
          onChange={(v) => updateField(selectedKey, "evidence.tier_preference", v)}
        />
      </div>
    </div>
  );
}
