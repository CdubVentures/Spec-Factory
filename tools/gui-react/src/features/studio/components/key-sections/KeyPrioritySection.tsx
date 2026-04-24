import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { Tip } from "../../../../shared/ui/feedback/Tip.tsx";
import { getN, strN, numN } from "../../state/nestedValueHelpers.ts";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../../state/studioNumericKnobBounds.ts";
import {
  selectCls,
  inputCls,
  labelCls,
  STUDIO_TIPS,
} from "../studioConstants.ts";
import {
  REQUIRED_LEVEL_OPTIONS,
  AVAILABILITY_OPTIONS,
  DIFFICULTY_OPTIONS,
} from "../../../../registries/fieldRuleTaxonomy.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };

function readVariantInventoryEnabled(currentRule: Record<string, unknown>): boolean {
  const enabled = getN(currentRule, "ai_assist.variant_inventory_usage.enabled");
  if (typeof enabled === "boolean") return enabled;
  return strN(currentRule, "ai_assist.variant_inventory_usage.mode", "default") !== "off";
}

export interface KeyPrioritySectionProps extends KeySectionBaseProps {}

export function KeyPrioritySection({
  selectedKey,
  currentRule,
  updateField,
  category,
  BadgeRenderer: B,
  disabled,
}: KeyPrioritySectionProps) {
  return (
    <>
      <Section
        title="Priority"
        persistKey={`studio:keyNavigator:section:priority:${category}`}
        titleTooltip={STUDIO_TIPS.key_section_priority}
        disabled={disabled}
      >
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>
                Required Level
                <Tip style={TIP_STYLE} text={STUDIO_TIPS.required_level} />
              </span>
              <B p="priority.required_level" />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(
                currentRule,
                "priority.required_level",
                strN(currentRule, "required_level", "non_mandatory"),
              )}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "priority.required_level",
                  e.target.value,
                )
              }
            >
              {REQUIRED_LEVEL_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>
                Availability
                <Tip style={TIP_STYLE} text={STUDIO_TIPS.availability} />
              </span>
              <B p="priority.availability" />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(
                currentRule,
                "priority.availability",
                strN(currentRule, "availability", "sometimes"),
              )}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "priority.availability",
                  e.target.value,
                )
              }
            >
              {AVAILABILITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>
                Difficulty
                <Tip style={TIP_STYLE} text={STUDIO_TIPS.difficulty} />
              </span>
              <B p="priority.difficulty" />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(
                currentRule,
                "priority.difficulty",
                strN(currentRule, "difficulty", "easy"),
              )}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "priority.difficulty",
                  e.target.value,
                )
              }
            >
              {DIFFICULTY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </Section>

      <Section
        title="Ai Assist"
        persistKey={`studio:keyNavigator:section:aiAssist:${category}`}
        titleTooltip={STUDIO_TIPS.key_section_ai_assist}
        defaultOpen
        disabled={disabled}
      >
        <VariantInventoryUsageSubsection
          selectedKey={selectedKey}
          currentRule={currentRule}
          updateField={updateField}
          BadgeRenderer={B}
        />
        <ExtractionGuidanceSubsection
          selectedKey={selectedKey}
          currentRule={currentRule}
          updateField={updateField}
          BadgeRenderer={B}
          reqLvl={strN(currentRule, "priority.required_level", strN(currentRule, "required_level", "non_mandatory"))}
          diff={strN(currentRule, "priority.difficulty", strN(currentRule, "difficulty", "easy"))}
        />
      </Section>
    </>
  );
}
/* ------------------------------------------------------------------ */
/*  Extraction Guidance sub-section (kept private to this file)        */
/* ------------------------------------------------------------------ */

interface ExtractionGuidanceSubsectionProps {
  selectedKey: string;
  currentRule: Record<string, unknown>;
  updateField: (key: string, path: string, value: unknown) => void;
  BadgeRenderer: KeyPrioritySectionProps["BadgeRenderer"];
  reqLvl: string;
  diff: string;
}

function ExtractionGuidanceSubsection({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
  reqLvl,
  diff,
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
  const unit = strN(
    currentRule,
    "contract.unit",
    strN(currentRule, "unit"),
  );
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

  // Component reference
  if (componentType) {
    const cType =
      componentType || enumSource.replace("component_db.", "");
    guidanceParts.push(
      `Component reference (${cType}). Match to known component names and aliases in the database. If not listed, provide the full name exactly as stated in the source.`,
    );
  }

  // Data type guidance
  if (type === "boolean" || contractType2 === "boolean") {
    guidanceParts.push(
      "Boolean field \u2014 determine yes or no from explicit evidence. If the feature is not mentioned, it likely means no, but confirm before assuming.",
    );
  } else if (
    (type === "number" || type === "integer") &&
    unit
  ) {
    guidanceParts.push(
      `Numeric field \u2014 extract the exact value in ${unit}. Convert from other units if needed. If a range is given, extract the primary/default value.`,
    );
  } else if (type === "url") {
    guidanceParts.push(
      "URL field \u2014 extract the full, valid URL. Prefer manufacturer or official sources.",
    );
  } else if (
    type === "date" ||
    (selectedKey || "").includes("date")
  ) {
    guidanceParts.push(
      "Date field \u2014 extract the actual date. Prefer official announcement or first-availability dates from manufacturer sources.",
    );
  } else if (
    type === "string" &&
    !componentType
  ) {
    guidanceParts.push(
      "Text field \u2014 extract the exact value as stated in the source. Do not paraphrase or abbreviate.",
    );
  }

  // List shape
  if (shape === "list") {
    guidanceParts.push(
      "Multiple values \u2014 extract all distinct values found across sources.",
    );
  }

  // Enum constraint
  if (enumPolicy === "closed" && enumSource) {
    guidanceParts.push(
      `Closed enum \u2014 value must match one of the known options from ${enumSource}.`,
    );
  } else if (enumPolicy === "open_prefer_known" && enumSource) {
    guidanceParts.push(
      `Prefer known values from ${enumSource}, but accept new values if backed by clear evidence.`,
    );
  }

  // Difficulty
  if (diff === "hard") {
    guidanceParts.push(
      "Often inconsistent across sources \u2014 check manufacturer spec sheets and PDFs first.",
    );
  } else if (diff === "very_hard") {
    guidanceParts.push(
      "Lab-measured or multi-source synthesis \u2014 only accept from independent test labs or triangulated evidence.",
    );
  }

  // Evidence
  if (minRefs >= 2) {
    guidanceParts.push(
      `Requires ${minRefs}+ independent source references.`,
    );
  }

  // Mandatory
  if (reqLvl === "mandatory") {
    guidanceParts.push(
      "High-priority \u2014 publication blocked if unknown. Cross-reference multiple sources to confirm.",
    );
  }

  // Baseline fallback
  if (guidanceParts.length === 0) {
    guidanceParts.push(
      "Extract from the most authoritative available source.",
    );
  }

  const autoNote = guidanceParts.join(" ");
  const hasExplicit = explicitNote.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`${labelCls.replace(" mb-1", "")} flex items-center`}
        >
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
          updateField(
            selectedKey,
            "ai_assist.reasoning_note",
            e.target.value,
          )
        }
        placeholder={`Auto: ${autoNote}`}
      />
      {hasExplicit && (
        <button
          className="text-[10px] sf-link-accent hover:opacity-80 mt-1"
          onClick={() =>
            updateField(
              selectedKey,
              "ai_assist.reasoning_note",
              "",
            )
          }
        >
          Clear &amp; revert to auto-generated guidance
        </button>
      )}
    </div>
  );
}

interface VariantInventoryUsageSubsectionProps {
  selectedKey: string;
  currentRule: Record<string, unknown>;
  updateField: (key: string, path: string, value: unknown) => void;
  BadgeRenderer: KeyPrioritySectionProps["BadgeRenderer"];
}

function VariantInventoryUsageSubsection({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
}: VariantInventoryUsageSubsectionProps) {
  const inventoryEnabled = readVariantInventoryEnabled(currentRule);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <label className="flex items-center gap-2 text-xs sf-text-default cursor-pointer select-none">
          <input
            type="checkbox"
            aria-label="Use variant inventory context"
            checked={inventoryEnabled}
            onChange={(e) =>
              updateField(
                selectedKey,
                "ai_assist.variant_inventory_usage",
                { enabled: e.target.checked },
              )
            }
            className="rounded sf-border-soft"
          />
          <span className="font-medium">Variant Inventory Context</span>
          <Tip style={TIP_STYLE} text={STUDIO_TIPS.variant_inventory_usage} />
        </label>
        <B p="ai_assist.variant_inventory_usage" />
      </div>
    </div>
  );
}
