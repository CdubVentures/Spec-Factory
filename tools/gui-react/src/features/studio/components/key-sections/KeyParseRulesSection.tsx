import type { KeySectionBaseProps } from "./keySectionContracts";
import { Section } from "../Section";
import { Tip } from "../../../../shared/ui/feedback/Tip";
import { ComboSelect } from "../../../../shared/ui/forms/ComboSelect";
import { TagPicker } from "../../../../shared/ui/forms/TagPicker";
import { strN, boolN, arrN } from "../../state/nestedValueHelpers";
import {
  selectCls,
  labelCls,
  UNITS,
  UNIT_ACCEPTS_SUGGESTIONS,
  STUDIO_TIPS,
} from "../studioConstants";

export interface KeyParseRulesSectionProps extends KeySectionBaseProps {}

export function KeyParseRulesSection({
  selectedKey,
  currentRule,
  updateField,
  category,
  BadgeRenderer: B,
}: KeyParseRulesSectionProps) {
  return (
    <Section
      title="Parse Rules"
      persistKey={`studio:keyNavigator:section:parse:${category}`}
      titleTooltip={STUDIO_TIPS.key_section_parse}
    >
      {(() => {
        const pt = strN(
          currentRule,
          "parse.template",
          strN(currentRule, "parse_template"),
        );
        const showUnits =
          pt === "number_with_unit" ||
          pt === "list_of_numbers_with_unit" ||
          pt === "list_numbers_or_ranges_with_unit";
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
                  <option value="">none</option>
                  <option value="text_field">text_field</option>
                  <option value="number_with_unit">
                    number_with_unit
                  </option>
                  <option value="boolean_yes_no_unk">
                    boolean_yes_no_unk
                  </option>
                  <option value="component_reference">
                    component_reference
                  </option>
                  <option value="date_field">date_field</option>
                  <option value="url_field">url_field</option>
                  <option value="list_of_numbers_with_unit">
                    list_of_numbers_with_unit
                  </option>
                  <option value="list_numbers_or_ranges_with_unit">
                    list_numbers_or_ranges_with_unit
                  </option>
                  <option value="list_of_tokens_delimited">
                    list_of_tokens_delimited
                  </option>
                  <option value="token_list">token_list</option>
                  <option value="text_block">text_block</option>
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
