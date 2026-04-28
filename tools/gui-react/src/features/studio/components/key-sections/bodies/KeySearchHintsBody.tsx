// WHY: Body for Search Hints & Aliases panel: aliases, search_hints.domain_hints,
// search_hints.content_types, search_hints.query_terms. Shared between Key Navigator
// and Workbench drawer.
import { FIELD_RULE_SEARCH_HINT_CONTROLS } from "../../../../../../../../src/field-rules/fieldRuleSchema.js";
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import { Tip } from "../../../../../shared/ui/feedback/Tip.tsx";
import { TagPicker } from "../../../../../shared/ui/forms/TagPicker.tsx";
import { arrN } from "../../../state/nestedValueHelpers.ts";
import {
  labelCls,
  DOMAIN_HINT_SUGGESTIONS,
  CONTENT_TYPE_SUGGESTIONS,
  STUDIO_TIPS,
} from "../../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };
const [
  ALIASES_CONTROL,
  DOMAIN_HINTS_CONTROL,
  CONTENT_TYPES_CONTROL,
  QUERY_TERMS_CONTROL,
] = FIELD_RULE_SEARCH_HINT_CONTROLS;

const SUGGESTIONS_BY_KEY: Record<string, string[]> = {
  domain_hints: DOMAIN_HINT_SUGGESTIONS,
  content_types: CONTENT_TYPE_SUGGESTIONS,
};

export interface KeySearchHintsBodyProps extends KeySectionBaseProps {}

export function KeySearchHintsBody({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
}: KeySearchHintsBodyProps) {
  const renderTagControl = (control: typeof FIELD_RULE_SEARCH_HINT_CONTROLS[number]) => (
    <div>
      <div className={`${labelCls} flex items-center`}>
        <span>{control.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[control.tooltipKey]} /></span>
        <B p={control.path} />
      </div>
      <TagPicker
        values={arrN(currentRule, control.path)}
        onChange={(v) => updateField(selectedKey, control.path, v)}
        suggestions={control.suggestionsKey ? SUGGESTIONS_BY_KEY[control.suggestionsKey] : undefined}
        placeholder={control.placeholder}
      />
    </div>
  );

  return (
    <>
      {renderTagControl(ALIASES_CONTROL)}
      <div className="grid grid-cols-2 gap-3">
        {renderTagControl(DOMAIN_HINTS_CONTROL)}
        {renderTagControl(CONTENT_TYPES_CONTROL)}
      </div>
      {renderTagControl(QUERY_TERMS_CONTROL)}
    </>
  );
}
