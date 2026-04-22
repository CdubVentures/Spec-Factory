import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { Tip } from "../../../../shared/ui/feedback/Tip.tsx";
import { TagPicker } from "../../../../shared/ui/forms/TagPicker.tsx";
import { strN, arrN } from "../../state/nestedValueHelpers.ts";
import {
  selectCls,
  inputCls,
  labelCls,
  DOMAIN_HINT_SUGGESTIONS,
  CONTENT_TYPE_SUGGESTIONS,
  STUDIO_TIPS,
} from "../studioConstants.ts";

export interface KeyHintsSectionProps extends KeySectionBaseProps {
  // No extra props -- all derived from currentRule
}

export function KeyHintsSection({
  selectedKey,
  currentRule,
  updateField,
  category,
  BadgeRenderer: B,
  disabled,
}: KeyHintsSectionProps) {
  return (
    <>
      <Section
        title="Extraction Hints & Aliases"
        persistKey={`studio:keyNavigator:section:uiDisplay:${category}`}
        titleTooltip={STUDIO_TIPS.key_section_ui}
      >
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              Tooltip / Guidance
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.tooltip_guidance}
              />
            </span>
            <B p="ui.tooltip_md" />
          </div>
          <textarea
            className={`${inputCls} w-full`}
            rows={2}
            value={strN(currentRule, "ui.tooltip_md")}
            onChange={(e) =>
              updateField(selectedKey, "ui.tooltip_md", e.target.value)
            }
            placeholder="Define how this field should be interpreted..."
          />
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              Aliases
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.aliases}
              />
            </span>
            <B p="aliases" />
          </div>
          <TagPicker
            values={arrN(currentRule, "aliases")}
            onChange={(v) => updateField(selectedKey, "aliases", v)}
            placeholder="alternative names for this key"
          />
        </div>
      </Section>

      <Section
        title="Search Hints"
        persistKey={`studio:keyNavigator:section:searchHints:${category}`}
        titleTooltip={STUDIO_TIPS.key_section_search}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>
                Domain Hints
                <Tip
                  style={{
                    position: "relative",
                    left: "-3px",
                    top: "-4px",
                  }}
                  text={STUDIO_TIPS.domain_hints}
                />
              </span>
              <B p="search_hints.domain_hints" />
            </div>
            <TagPicker
              values={arrN(currentRule, "search_hints.domain_hints")}
              onChange={(v) =>
                updateField(selectedKey, "search_hints.domain_hints", v)
              }
              suggestions={DOMAIN_HINT_SUGGESTIONS}
              placeholder="manufacturer, rtings.com..."
            />
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>
                Content Types
                <Tip
                  style={{
                    position: "relative",
                    left: "-3px",
                    top: "-4px",
                  }}
                  text={STUDIO_TIPS.content_types}
                />
              </span>
              <B p="search_hints.content_types" />
            </div>
            <TagPicker
              values={arrN(
                currentRule,
                "search_hints.content_types",
              )}
              onChange={(v) =>
                updateField(
                  selectedKey,
                  "search_hints.content_types",
                  v,
                )
              }
              suggestions={CONTENT_TYPE_SUGGESTIONS}
              placeholder="spec_sheet, datasheet..."
            />
          </div>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              Query Terms
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.query_terms}
              />
            </span>
            <B p="search_hints.query_terms" />
          </div>
          <TagPicker
            values={arrN(currentRule, "search_hints.query_terms")}
            onChange={(v) =>
              updateField(selectedKey, "search_hints.query_terms", v)
            }
            placeholder="alternative search terms"
          />
        </div>
      </Section>
    </>
  );
}
