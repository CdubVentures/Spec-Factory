import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { Tip } from "../../../../shared/ui/feedback/Tip.tsx";
import { TierPicker } from "../../../../shared/ui/forms/TierPicker.tsx";
import { numN, boolN, strN, arrN } from "../../state/nestedValueHelpers.ts";
import { parseBoundedIntInput } from "../../state/numericInputHelpers.ts";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../../state/studioNumericKnobBounds.ts";
import {
  selectCls,
  inputCls,
  labelCls,
  STUDIO_TIPS,
} from "../studioConstants.ts";

export interface KeyEvidenceSectionProps extends KeySectionBaseProps {}

export function KeyEvidenceSection({
  selectedKey,
  currentRule,
  updateField,
  category,
  BadgeRenderer: B,
  disabled,
}: KeyEvidenceSectionProps) {
  return (
    <Section
      title="Evidence Requirements"
      persistKey={`studio:keyNavigator:section:evidence:${category}`}
      titleTooltip={STUDIO_TIPS.key_section_evidence}
      disabled={disabled}
    >
      <div className="grid grid-cols-3 gap-3 items-start">
        <div className="space-y-2">
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>
                Min Evidence Refs
                <Tip
                  style={{
                    position: "relative",
                    left: "-3px",
                    top: "-4px",
                  }}
                  text={STUDIO_TIPS.min_evidence_refs}
                />
              </span>
              <B p="evidence.min_evidence_refs" />
            </div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              min={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min}
              max={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max}
              value={numN(
                currentRule,
                "evidence.min_evidence_refs",
                numN(
                  currentRule,
                  "min_evidence_refs",
                  STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback,
                ),
              )}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "evidence.min_evidence_refs",
                  parseBoundedIntInput(
                    e.target.value,
                    STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min,
                    STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max,
                    STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs
                      .fallback,
                  ),
                )
              }
            />
          </div>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              Tier Preference
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.tier_preference}
              />
            </span>
            <B p="evidence.tier_preference" />
          </div>
          <TierPicker
            value={
              arrN(currentRule, "evidence.tier_preference").length > 0
                ? arrN(currentRule, "evidence.tier_preference")
                : ["tier1", "tier2", "tier3"]
            }
            onChange={(v) =>
              updateField(selectedKey, "evidence.tier_preference", v)
            }
          />
        </div>
      </div>
    </Section>
  );
}
