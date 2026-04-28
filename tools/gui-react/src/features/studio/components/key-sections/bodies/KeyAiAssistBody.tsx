// WHY: Body for Ai Assist panel: variant_inventory_usage toggle, pif_priority_images
// toggle, and Extraction Guidance (reasoning_note) with auto-derived placeholder.
// Shared between Key Navigator and Workbench drawer.
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import { Tip } from "../../../../../shared/ui/feedback/Tip.tsx";
import { AiAssistToggleSubsection } from "../AiAssistToggleSubsection.tsx";
import { strN, numN } from "../../../state/nestedValueHelpers.ts";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../../../state/studioNumericKnobBounds.ts";
import { inputCls, labelCls, STUDIO_TIPS } from "../../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };

export interface KeyAiAssistBodyProps extends KeySectionBaseProps {}

export function KeyAiAssistBody({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
  disabled,
}: KeyAiAssistBodyProps) {
  const reqLvl = strN(
    currentRule,
    "priority.required_level",
    strN(currentRule, "required_level", "non_mandatory"),
  );
  const diff = strN(
    currentRule,
    "priority.difficulty",
    strN(currentRule, "difficulty", "easy"),
  );

  return (
    <>
      <AiAssistToggleSubsection
        selectedKey={selectedKey}
        currentRule={currentRule}
        updateField={updateField}
        BadgeRenderer={B}
        path="ai_assist.variant_inventory_usage"
        label="Variant Inventory Context"
        ariaLabel="Use variant inventory context"
        tooltipKey="variant_inventory_usage"
        disabled={disabled}
      />
      <AiAssistToggleSubsection
        selectedKey={selectedKey}
        currentRule={currentRule}
        updateField={updateField}
        BadgeRenderer={B}
        path="ai_assist.pif_priority_images"
        label="PIF Priority Images"
        ariaLabel="Use PIF priority images"
        tooltipKey="pif_priority_images"
        disabled={disabled}
      />
      <ExtractionGuidanceSubsection
        selectedKey={selectedKey}
        currentRule={currentRule}
        updateField={updateField}
        BadgeRenderer={B}
        reqLvl={reqLvl}
        diff={diff}
        disabled={disabled}
      />
    </>
  );
}

interface ExtractionGuidanceSubsectionProps {
  selectedKey: string;
  currentRule: Record<string, unknown>;
  updateField: (key: string, path: string, value: unknown) => void;
  BadgeRenderer: KeyAiAssistBodyProps["BadgeRenderer"];
  reqLvl: string;
  diff: string;
  disabled?: boolean;
}

function ExtractionGuidanceSubsection({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
  reqLvl,
  diff,
  disabled,
}: ExtractionGuidanceSubsectionProps) {
  const explicitNote = strN(currentRule, "ai_assist.reasoning_note");
  const type = strN(
    currentRule,
    "contract.data_type",
    strN(currentRule, "data_type", "string"),
  );
  const shape = strN(
    currentRule,
    "contract.shape",
    strN(currentRule, "shape", "scalar"),
  );
  const unit = strN(currentRule, "contract.unit", strN(currentRule, "unit"));
  const contractType2 = strN(
    currentRule,
    "contract.type",
    strN(currentRule, "data_type", "string"),
  );
  const enumPolicy = contractType2 === "boolean" ? "closed" : strN(
    currentRule,
    "enum.policy",
    strN(currentRule, "enum_policy", "open"),
  );
  const enumSource = contractType2 === "boolean" ? "yes_no" : strN(
    currentRule,
    "enum.source",
    strN(currentRule, "enum_source"),
  );
  const minRefs = numN(
    currentRule,
    "evidence.min_evidence_refs",
    numN(
      currentRule,
      "min_evidence_refs",
      STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback,
    ),
  );
  const componentType = strN(
    currentRule,
    "component.type",
    strN(currentRule, "component_type"),
  );

  const guidanceParts: string[] = [];

  if (componentType) {
    const cType = componentType || enumSource.replace("component_db.", "");
    guidanceParts.push(
      `Component reference (${cType}). Match to known component names and aliases in the database. If not listed, provide the full name exactly as stated in the source.`,
    );
  }

  if (type === "boolean" || contractType2 === "boolean") {
    guidanceParts.push(
      "Boolean field \u2014 determine yes or no from explicit evidence. If the feature is not mentioned, it likely means no, but confirm before assuming.",
    );
  } else if ((type === "number" || type === "integer") && unit) {
    guidanceParts.push(
      `Numeric field \u2014 extract the exact value in ${unit}. Convert from other units if needed. If a range is given, extract the primary/default value.`,
    );
  } else if (type === "url") {
    guidanceParts.push(
      "URL field \u2014 extract the full, valid URL. Prefer manufacturer or official sources.",
    );
  } else if (type === "date" || (selectedKey || "").includes("date")) {
    guidanceParts.push(
      "Date field \u2014 extract the actual date. Prefer official announcement or first-availability dates from manufacturer sources.",
    );
  } else if (type === "string" && !componentType) {
    guidanceParts.push(
      "Text field \u2014 extract the exact value as stated in the source. Do not paraphrase or abbreviate.",
    );
  }

  if (shape === "list") {
    guidanceParts.push(
      "Multiple values \u2014 extract all distinct values found across sources.",
    );
  }

  if (enumPolicy === "closed" && enumSource) {
    guidanceParts.push(
      `Closed enum \u2014 value must match one of the known options from ${enumSource}.`,
    );
  } else if (enumPolicy === "open_prefer_known" && enumSource) {
    guidanceParts.push(
      `Prefer known values from ${enumSource}, but accept new values if backed by clear evidence.`,
    );
  }

  if (diff === "hard") {
    guidanceParts.push(
      "Often inconsistent across sources \u2014 check manufacturer spec sheets and PDFs first.",
    );
  } else if (diff === "very_hard") {
    guidanceParts.push(
      "Lab-measured or multi-source synthesis \u2014 only accept from independent test labs or triangulated evidence.",
    );
  }

  if (minRefs >= 2) {
    guidanceParts.push(`Requires ${minRefs}+ independent source references.`);
  }

  if (reqLvl === "mandatory") {
    guidanceParts.push(
      "High-priority \u2014 publication blocked if unknown. Cross-reference multiple sources to confirm.",
    );
  }

  if (guidanceParts.length === 0) {
    guidanceParts.push("Extract from the most authoritative available source.");
  }

  const autoNote = guidanceParts.join(" ");
  const hasExplicit = explicitNote.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className={`${labelCls.replace(" mb-1", "")} flex items-center`}>
          <span>
            Extraction Guidance (sent to LLM)
            <Tip style={TIP_STYLE} text={STUDIO_TIPS.ai_reasoning_note} />
          </span>
          <B p="ai_assist.reasoning_note" />
        </span>
        {!hasExplicit && (
          <span className="text-[9px] px-1.5 py-0.5 rounded sf-bg-surface-soft-strong sf-text-subtle sf-dk-surface-700 dark:sf-text-muted italic font-medium">
            Auto
          </span>
        )}
      </div>
      <textarea
        className={`${inputCls} w-full`}
        rows={3}
        value={explicitNote}
        onChange={(e) =>
          updateField(selectedKey, "ai_assist.reasoning_note", e.target.value)
        }
        placeholder={`Auto: ${autoNote}`}
        disabled={disabled}
      />
      {hasExplicit && (
        <button
          className="text-[10px] sf-link-accent hover:opacity-80 mt-1"
          onClick={() => updateField(selectedKey, "ai_assist.reasoning_note", "")}
          disabled={disabled}
        >
          Clear &amp; revert to auto-generated guidance
        </button>
      )}
    </div>
  );
}
