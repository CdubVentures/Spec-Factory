// WHY: Body for Search Hints & Aliases panel: aliases, search_hints.domain_hints,
// search_hints.content_types, search_hints.query_terms. Shared between Key Navigator
// and Workbench drawer.
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

export interface KeySearchHintsBodyProps extends KeySectionBaseProps {}

export function KeySearchHintsBody({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
}: KeySearchHintsBodyProps) {
  return (
    <>
      <div>
        <div className={`${labelCls} flex items-center`}>
          <span>Aliases<Tip style={TIP_STYLE} text={STUDIO_TIPS.aliases} /></span>
          <B p="aliases" />
        </div>
        <TagPicker
          values={arrN(currentRule, "aliases")}
          onChange={(v) => updateField(selectedKey, "aliases", v)}
          placeholder="source phrases and alternate field names"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>Domain Hints<Tip style={TIP_STYLE} text={STUDIO_TIPS.domain_hints} /></span>
            <B p="search_hints.domain_hints" />
          </div>
          <TagPicker
            values={arrN(currentRule, "search_hints.domain_hints")}
            onChange={(v) => updateField(selectedKey, "search_hints.domain_hints", v)}
            suggestions={DOMAIN_HINT_SUGGESTIONS}
            placeholder="manufacturer, rtings.com..."
          />
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>Content Types<Tip style={TIP_STYLE} text={STUDIO_TIPS.content_types} /></span>
            <B p="search_hints.content_types" />
          </div>
          <TagPicker
            values={arrN(currentRule, "search_hints.content_types")}
            onChange={(v) => updateField(selectedKey, "search_hints.content_types", v)}
            suggestions={CONTENT_TYPE_SUGGESTIONS}
            placeholder="spec_sheet, datasheet..."
          />
        </div>
      </div>
      <div>
        <div className={`${labelCls} flex items-center`}>
          <span>Query Terms<Tip style={TIP_STYLE} text={STUDIO_TIPS.query_terms} /></span>
          <B p="search_hints.query_terms" />
        </div>
        <TagPicker
          values={arrN(currentRule, "search_hints.query_terms")}
          onChange={(v) => updateField(selectedKey, "search_hints.query_terms", v)}
          placeholder="alternative search terms"
        />
      </div>
    </>
  );
}
