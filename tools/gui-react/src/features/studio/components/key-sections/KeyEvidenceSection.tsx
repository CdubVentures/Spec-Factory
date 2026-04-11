import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section, SubSection } from "../Section.tsx";
import { Tip } from "../../../../shared/ui/feedback/Tip.tsx";
import { TierPicker } from "../../../../shared/ui/forms/TierPicker.tsx";
import { numN, arrN, strN } from "../../state/nestedValueHelpers.ts";
import { parseBoundedIntInput } from "../../state/numericInputHelpers.ts";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../../state/studioNumericKnobBounds.ts";
import {
  inputCls,
  labelCls,
  STUDIO_TIPS,
} from "../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };

export interface KeyEvidenceSectionProps extends KeySectionBaseProps {}

export function KeyEvidenceSection({
  selectedKey,
  currentRule,
  updateField,
  category,
  BadgeRenderer: B,
  disabled,
}: KeyEvidenceSectionProps) {
  const minRefs = numN(
    currentRule,
    "evidence.min_evidence_refs",
    numN(currentRule, "min_evidence_refs", STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback),
  );
  const requiredLevel = strN(currentRule, "priority.required_level", strN(currentRule, "required_level"));
  const publishGated = requiredLevel === "identity" || requiredLevel === "required";

  return (
    <Section
      title="Evidence"
      persistKey={`studio:keyNavigator:section:evidence:${category}`}
      titleTooltip={STUDIO_TIPS.key_section_evidence}
      disabled={disabled}
    >
      {/* ── Requirements ──────────────────────────────────────── */}
      <SubSection label="Requirements">
        <div className="grid grid-cols-2 gap-3 items-start">
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>Min Evidence Refs<Tip style={TIP_STYLE} text={STUDIO_TIPS.min_evidence_refs} /></span>
              <B p="evidence.min_evidence_refs" />
            </div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              min={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min}
              max={STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max}
              value={minRefs}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "evidence.min_evidence_refs",
                  parseBoundedIntInput(
                    e.target.value,
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
      </SubSection>

      {/* ── Publish Gate (derived, read-only) ─────────────────── */}
      <SubSection label="Publish Gate">
        <div className="text-xs sf-bg-surface-soft rounded p-2 border sf-border-default space-y-1">
          {publishGated ? (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full sf-dot-danger flex-shrink-0" />
              <span>Publish gated — required_level is <strong>{requiredLevel}</strong></span>
            </div>
          ) : null}
          {minRefs > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full sf-dot-warning flex-shrink-0" />
              <span>Evidence required — at least {minRefs} source ref{minRefs > 1 ? "s" : ""} needed</span>
            </div>
          ) : null}
          {!publishGated && minRefs <= 0 ? (
            <div className="sf-text-subtle italic">No publish-blocking rules configured</div>
          ) : null}
        </div>
      </SubSection>
    </Section>
  );
}
