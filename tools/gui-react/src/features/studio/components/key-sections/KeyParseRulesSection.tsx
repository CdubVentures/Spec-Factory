import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { Tip } from "../../../../shared/ui/feedback/Tip.tsx";
import { ComboSelect } from "../../../../shared/ui/forms/ComboSelect.tsx";
import { TagPicker } from "../../../../shared/ui/forms/TagPicker.tsx";
import { strN, boolN, arrN } from "../../state/nestedValueHelpers.ts";
import { PARSE_TEMPLATES, isUnitBearingTemplate } from "../../state/parseTemplateRegistry.ts";
import {
  selectCls,
  labelCls,
  UNITS,
  UNIT_ACCEPTS_SUGGESTIONS,
  STUDIO_TIPS,
} from "../studioConstants.ts";

export interface KeyParseRulesSectionProps extends KeySectionBaseProps {}

export function KeyParseRulesSection({
  selectedKey,
  currentRule,
  updateField,
  category,
  BadgeRenderer: B,
  disabled,
}: KeyParseRulesSectionProps) {
  return (
    <Section
      title="Parse Rules"
      persistKey={`studio:keyNavigator:section:parse:${category}`}
      titleTooltip={STUDIO_TIPS.key_section_parse}
      disabled={disabled}
    >
      {(() => {
        const pt = strN(
          currentRule,
          "parse.template",
          strN(currentRule, "parse_template"),
        );
        const showUnits = isUnitBearingTemplate(pt);
        return (
          <>
            <div
              className={showUnits ? "grid grid-cols-4 gap-3" : ""}
            >
              <div>
                <div className={`${labelCls} flex items-center`}>
                  <span>
                    Parse Template
                    <Tip
                      style={{
                        position: "relative",
                        left: "-3px",
                        top: "-4px",
                      }}
                      text={STUDIO_TIPS.parse_template}
                    />
                  </span>
                  <B p="parse.template" />
                </div>
                <select
                  className={`${selectCls} w-full`}
                  value={pt}
                  onChange={(e) =>
                    updateField(
                      selectedKey,
                      "parse.template",
                      e.target.value,
                    )
                  }
                >
                  {PARSE_TEMPLATES.map((t) => (
                    <option key={t} value={t}>{t || 'none'}</option>
                  ))}
                </select>
              </div>
              {showUnits ? (
                <>
                  <div>
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Parse Unit
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.parse_unit}
                        />
                      </span>
                      <B p="parse.unit" />
                    </div>
                    <ComboSelect
                      value={strN(currentRule, "parse.unit")}
                      onChange={(v) =>
                        updateField(selectedKey, "parse.unit", v)
                      }
                      options={UNITS}
                      placeholder="e.g. g"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className={`${labelCls} flex items-center`}>
                      <span>
                        Unit Accepts
                        <Tip
                          style={{
                            position: "relative",
                            left: "-3px",
                            top: "-4px",
                          }}
                          text={STUDIO_TIPS.unit_accepts}
                        />
                      </span>
                      <B p="parse.unit_accepts" />
                    </div>
                    <TagPicker
                      values={arrN(currentRule, "parse.unit_accepts")}
                      onChange={(v) =>
                        updateField(
                          selectedKey,
                          "parse.unit_accepts",
                          v,
                        )
                      }
                      suggestions={UNIT_ACCEPTS_SUGGESTIONS}
                      placeholder="g, grams..."
                    />
                  </div>
                </>
              ) : null}
            </div>
            {showUnits ? (
              <div className="flex gap-6 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={boolN(
                      currentRule,
                      "parse.allow_unitless",
                    )}
                    onChange={(e) =>
                      updateField(
                        selectedKey,
                        "parse.allow_unitless",
                        e.target.checked,
                      )
                    }
                    className="rounded sf-border-soft"
                  />
                  <span className="text-xs sf-text-muted flex items-center gap-1">
                    Allow unitless
                    <Tip
                      style={{
                        position: "relative",
                        left: "-3px",
                        top: "-4px",
                      }}
                      text={STUDIO_TIPS.allow_unitless}
                    />
                    <B p="parse.allow_unitless" />
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={boolN(currentRule, "parse.allow_ranges")}
                    onChange={(e) =>
                      updateField(
                        selectedKey,
                        "parse.allow_ranges",
                        e.target.checked,
                      )
                    }
                    className="rounded sf-border-soft"
                  />
                  <span className="text-xs sf-text-muted flex items-center gap-1">
                    Allow ranges
                    <Tip
                      style={{
                        position: "relative",
                        left: "-3px",
                        top: "-4px",
                      }}
                      text={STUDIO_TIPS.allow_ranges}
                    />
                    <B p="parse.allow_ranges" />
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={boolN(
                      currentRule,
                      "parse.strict_unit_required",
                    )}
                    onChange={(e) =>
                      updateField(
                        selectedKey,
                        "parse.strict_unit_required",
                        e.target.checked,
                      )
                    }
                    className="rounded sf-border-soft"
                  />
                  <span className="text-xs sf-text-muted flex items-center gap-1">
                    Strict unit required
                    <Tip
                      style={{
                        position: "relative",
                        left: "-3px",
                        top: "-4px",
                      }}
                      text={STUDIO_TIPS.strict_unit_required}
                    />
                    <B p="parse.strict_unit_required" />
                  </span>
                </label>
              </div>
            ) : null}
            {!showUnits && pt ? (
              <div className="text-xs sf-text-subtle italic mt-1">
                Unit settings hidden ÃƒÂ¢Ã¢â€šÂ¬"{" "}
                {pt === "boolean_yes_no_unk"
                  ? "boolean"
                  : pt === "component_reference"
                    ? "component reference"
                    : pt.replace(/_/g, " ")}{" "}
                template does not use units.
              </div>
            ) : null}
          </>
        );
      })()}
    </Section>
  );
}
