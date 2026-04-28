// WHY: Body for Contract panel: variant_dependent + product_image_dependent toggles,
// Type & Shape, Unit & Range, List Rules, Precision sub-sections. Shared between
// Key Navigator and Workbench drawer.
import {
  FIELD_RULE_CONTRACT_CONTROLS,
  FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS,
} from "../../../../../../../../src/field-rules/fieldRuleSchema.js";
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import { SubSection } from "../../Section.tsx";
import { Tip } from "../../../../../shared/ui/feedback/Tip.tsx";
import { useUnitRegistryQuery } from "../../../../../pages/unit-registry/unitRegistryQueries.ts";
import { strN, numN, boolN } from "../../../state/nestedValueHelpers.ts";
import {
  parseIntegerInput,
  parseBoundedIntInput,
} from "../../../state/numericInputHelpers.ts";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../../../state/studioNumericKnobBounds.ts";
import { isStudioContractFieldDeferredLocked } from "../../../state/studioBehaviorContracts.ts";
import { isFieldAvailable } from "../../../state/fieldCascadeRegistry.ts";
import {
  selectCls,
  inputCls,
  labelCls,
  STUDIO_TIPS,
} from "../../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };

function contractControl(controlId: string): typeof FIELD_RULE_CONTRACT_CONTROLS[number] {
  const control = FIELD_RULE_CONTRACT_CONTROLS.find((entry) => entry.controlId === controlId);
  if (!control) throw new Error(`Missing contract control metadata for ${controlId}`);
  return control;
}

function dependencyControl(controlId: string): typeof FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS[number] {
  const control = FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS.find((entry) => entry.controlId === controlId);
  if (!control) throw new Error(`Missing contract dependency metadata for ${controlId}`);
  return control;
}

function optionLabel(
  control: typeof FIELD_RULE_CONTRACT_CONTROLS[number],
  option: string,
  index: number,
): string {
  return control.optionLabels?.[index] ?? option;
}

const VARIANT_DEPENDENT_CONTROL = dependencyControl("variant_dependent");
const PRODUCT_IMAGE_DEPENDENT_CONTROL = dependencyControl("product_image_dependent");
const CONTRACT_TYPE_CONTROL = contractControl("contract_type");
const CONTRACT_SHAPE_CONTROL = contractControl("contract_shape");
const CONTRACT_UNIT_CONTROL = contractControl("contract_unit");
const CONTRACT_RANGE_MIN_CONTROL = contractControl("contract_range_min");
const CONTRACT_RANGE_MAX_CONTROL = contractControl("contract_range_max");
const CONTRACT_LIST_DEDUPE_CONTROL = contractControl("contract_list_dedupe");
const CONTRACT_LIST_SORT_CONTROL = contractControl("contract_list_sort");
const CONTRACT_LIST_ITEM_UNION_CONTROL = contractControl("contract_list_item_union");
const CONTRACT_ROUNDING_DECIMALS_CONTROL = contractControl("contract_rounding_decimals");
const CONTRACT_ROUNDING_MODE_CONTROL = contractControl("contract_rounding_mode");

export interface KeyContractBodyProps extends KeySectionBaseProps {}

export function KeyContractBody({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
  disabled,
}: KeyContractBodyProps) {
  const { data: unitRegistryData } = useUnitRegistryQuery();
  const registryUnits = (unitRegistryData?.units ?? []).map((u) => u.canonical);
  const currentContractType = currentRule
    ? strN(currentRule, CONTRACT_TYPE_CONTROL.path, String(CONTRACT_TYPE_CONTROL.fallback))
    : String(CONTRACT_TYPE_CONTROL.fallback);

  const numericAvailable = isFieldAvailable(currentRule, CONTRACT_UNIT_CONTROL.path);
  const listAvailable = isFieldAvailable(currentRule, CONTRACT_LIST_DEDUPE_CONTROL.path);

  function parseContractRangeValue(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (currentContractType === "integer") {
      return parseIntegerInput(trimmed) ?? undefined;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  const variantDependent = boolN(currentRule, VARIANT_DEPENDENT_CONTROL.path, false);
  const productImageDependent = boolN(currentRule, PRODUCT_IMAGE_DEPENDENT_CONTROL.path, false);

  return (
    <>
      {/* Variant Dependent */}
      <div
        className={`flex items-center justify-between gap-3 px-3 py-2 mb-3 rounded-md sf-surface-panel border sf-border-soft ${variantDependent ? "sf-switch-on" : ""}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`w-3.5 h-3.5 shrink-0 ${variantDependent ? "" : "sf-text-subtle"}`}
            aria-hidden="true"
          >
            <circle cx="4" cy="4" r="1.5" />
            <circle cx="12" cy="4" r="1.5" />
            <circle cx="8" cy="12" r="1.5" />
            <path d="M4 4h8M4 4l4 8M12 4l-4 8" />
          </svg>
          <div className="flex flex-col min-w-0">
            <div className={`${labelCls} flex items-center m-0`}>
              <span className="font-semibold">{VARIANT_DEPENDENT_CONTROL.label}</span>
              <B p={VARIANT_DEPENDENT_CONTROL.path} />
            </div>
            <span className="sf-text-nano sf-text-subtle leading-tight">
              {variantDependent
                ? "One value per variant (colors, editions, release_date, …)"
                : "One value per product (weight, dpi, connection, …)"}
            </span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={variantDependent}
          aria-label={variantDependent ? VARIANT_DEPENDENT_CONTROL.trueAriaLabel : VARIANT_DEPENDENT_CONTROL.falseAriaLabel}
          disabled={disabled}
          onClick={() => updateField(selectedKey, VARIANT_DEPENDENT_CONTROL.path, !variantDependent)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full sf-switch-track transition focus:outline-none focus:ring-2 focus:ring-accent/25 ${variantDependent ? "sf-switch-track-on" : ""} disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full sf-switch-thumb transition-transform ${variantDependent ? "translate-x-4" : "translate-x-0.5"}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Product Image Dependent */}
      <div
        className={`flex items-center justify-between gap-3 px-3 py-2 mb-3 rounded-md sf-surface-panel border sf-border-soft ${productImageDependent ? "sf-switch-on" : ""}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`w-3.5 h-3.5 shrink-0 ${productImageDependent ? "" : "sf-text-subtle"}`}
            aria-hidden="true"
          >
            <rect x="2.5" y="3" width="11" height="8" rx="1.5" />
            <circle cx="5" cy="5.5" r="1" />
            <path d="M3.5 10l3-3 2 2 1.5-1.5 2.5 2.5" />
            <path d="M5 13h6" />
          </svg>
          <div className="flex flex-col min-w-0">
            <div className={`${labelCls} flex items-center m-0`}>
              <span className="font-semibold">{PRODUCT_IMAGE_DEPENDENT_CONTROL.label}</span>
              <B p={PRODUCT_IMAGE_DEPENDENT_CONTROL.path} />
            </div>
            <span className="sf-text-nano sf-text-subtle leading-tight">
              {productImageDependent
                ? "Resolved value is injected into PIF search and eval identity context"
                : "PIF image prompts ignore this field value"}
            </span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={productImageDependent}
          aria-label={productImageDependent ? PRODUCT_IMAGE_DEPENDENT_CONTROL.trueAriaLabel : PRODUCT_IMAGE_DEPENDENT_CONTROL.falseAriaLabel}
          disabled={disabled}
          onClick={() => updateField(selectedKey, PRODUCT_IMAGE_DEPENDENT_CONTROL.path, !productImageDependent)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full sf-switch-track transition focus:outline-none focus:ring-2 focus:ring-accent/25 ${productImageDependent ? "sf-switch-track-on" : ""} disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full sf-switch-thumb transition-transform ${productImageDependent ? "translate-x-4" : "translate-x-0.5"}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <SubSection label="Type & Shape">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>{CONTRACT_TYPE_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[CONTRACT_TYPE_CONTROL.tooltipKey || ""]} /></span>
              <B p={CONTRACT_TYPE_CONTROL.path} />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, CONTRACT_TYPE_CONTROL.path, String(CONTRACT_TYPE_CONTROL.fallback))}
              onChange={(e) => updateField(selectedKey, CONTRACT_TYPE_CONTROL.path, e.target.value)}
              disabled={disabled}
            >
              {(CONTRACT_TYPE_CONTROL.options || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>{CONTRACT_SHAPE_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[CONTRACT_SHAPE_CONTROL.tooltipKey || ""]} /></span>
              <B p={CONTRACT_SHAPE_CONTROL.path} />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, CONTRACT_SHAPE_CONTROL.path, String(CONTRACT_SHAPE_CONTROL.fallback))}
              onChange={(e) => updateField(selectedKey, CONTRACT_SHAPE_CONTROL.path, e.target.value)}
              disabled={disabled}
            >
              {(CONTRACT_SHAPE_CONTROL.options || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </SubSection>

      <SubSection
        label="Unit & Range"
        disabled={!numericAvailable}
        disabledHint="Available for numeric contracts."
      >
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>{CONTRACT_UNIT_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[CONTRACT_UNIT_CONTROL.tooltipKey || ""]} /></span>
              <B p={CONTRACT_UNIT_CONTROL.path} />
            </div>
            <select
              className={selectCls}
              value={strN(currentRule, CONTRACT_UNIT_CONTROL.path)}
              onChange={(e) => updateField(selectedKey, CONTRACT_UNIT_CONTROL.path, e.target.value || null)}
              disabled={disabled || !numericAvailable}
            >
              <option value="">-- none --</option>
              {registryUnits.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>{CONTRACT_RANGE_MIN_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[CONTRACT_RANGE_MIN_CONTROL.tooltipKey || ""]} /></span>
              <B p={CONTRACT_RANGE_MIN_CONTROL.path} />
            </div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              step={currentContractType === "integer" ? 1 : "any"}
              value={strN(currentRule, CONTRACT_RANGE_MIN_CONTROL.path)}
              onChange={(e) => updateField(selectedKey, CONTRACT_RANGE_MIN_CONTROL.path, parseContractRangeValue(e.target.value))}
              placeholder={CONTRACT_RANGE_MIN_CONTROL.placeholder}
              disabled={disabled || !numericAvailable}
            />
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>{CONTRACT_RANGE_MAX_CONTROL.label}</span>
              <B p={CONTRACT_RANGE_MAX_CONTROL.path} />
            </div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              step={currentContractType === "integer" ? 1 : "any"}
              value={strN(currentRule, CONTRACT_RANGE_MAX_CONTROL.path)}
              onChange={(e) => updateField(selectedKey, CONTRACT_RANGE_MAX_CONTROL.path, parseContractRangeValue(e.target.value))}
              placeholder={CONTRACT_RANGE_MAX_CONTROL.placeholder}
              disabled={disabled || !numericAvailable}
            />
          </div>
        </div>
      </SubSection>

      <SubSection
        label="List Rules"
        disabled={!listAvailable}
        disabledHint="Available when contract shape is list."
      >
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>{CONTRACT_LIST_DEDUPE_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[CONTRACT_LIST_DEDUPE_CONTROL.tooltipKey || ""]} /></span>
              <B p={CONTRACT_LIST_DEDUPE_CONTROL.path} />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={boolN(currentRule, CONTRACT_LIST_DEDUPE_CONTROL.path, Boolean(CONTRACT_LIST_DEDUPE_CONTROL.fallback)) ? "yes" : "no"}
              onChange={(e) => updateField(selectedKey, CONTRACT_LIST_DEDUPE_CONTROL.path, e.target.value === "yes")}
              disabled={disabled || !listAvailable}
            >
              {(CONTRACT_LIST_DEDUPE_CONTROL.options || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>{CONTRACT_LIST_SORT_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[CONTRACT_LIST_SORT_CONTROL.tooltipKey || ""]} /></span>
              <B p={CONTRACT_LIST_SORT_CONTROL.path} />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, CONTRACT_LIST_SORT_CONTROL.path, String(CONTRACT_LIST_SORT_CONTROL.fallback))}
              onChange={(e) => updateField(selectedKey, CONTRACT_LIST_SORT_CONTROL.path, e.target.value)}
              disabled={disabled || !listAvailable}
            >
              {(CONTRACT_LIST_SORT_CONTROL.options || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>{CONTRACT_LIST_ITEM_UNION_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[CONTRACT_LIST_ITEM_UNION_CONTROL.tooltipKey || ""]} /></span>
              <B p={CONTRACT_LIST_ITEM_UNION_CONTROL.path} />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, CONTRACT_LIST_ITEM_UNION_CONTROL.path, String(CONTRACT_LIST_ITEM_UNION_CONTROL.fallback))}
              onChange={(e) => updateField(selectedKey, CONTRACT_LIST_ITEM_UNION_CONTROL.path, e.target.value || undefined)}
              disabled={disabled || !listAvailable}
            >
              {(CONTRACT_LIST_ITEM_UNION_CONTROL.options || []).map((v, index) => (
                <option key={v || "winner_only"} value={v}>
                  {optionLabel(CONTRACT_LIST_ITEM_UNION_CONTROL, v, index)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SubSection>

      <SubSection
        label="Precision"
        disabled={!numericAvailable}
        disabledHint="Available for numeric contracts."
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>{CONTRACT_ROUNDING_DECIMALS_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[CONTRACT_ROUNDING_DECIMALS_CONTROL.tooltipKey || ""]} /></span>
              <B p={CONTRACT_ROUNDING_DECIMALS_CONTROL.path} />
            </div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              min={STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.min}
              max={STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.max}
              value={numN(currentRule, CONTRACT_ROUNDING_DECIMALS_CONTROL.path, Number(CONTRACT_ROUNDING_DECIMALS_CONTROL.fallback))}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  CONTRACT_ROUNDING_DECIMALS_CONTROL.path,
                  parseBoundedIntInput(
                    e.target.value,
                    STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.min,
                    STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.max,
                    STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.fallback,
                  ),
                )
              }
              disabled={disabled || !isFieldAvailable(currentRule, CONTRACT_ROUNDING_DECIMALS_CONTROL.path)}
            />
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>{CONTRACT_ROUNDING_MODE_CONTROL.label}<Tip style={TIP_STYLE} text={STUDIO_TIPS[CONTRACT_ROUNDING_MODE_CONTROL.tooltipKey || ""]} /></span>
              <B p={CONTRACT_ROUNDING_MODE_CONTROL.path} />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, CONTRACT_ROUNDING_MODE_CONTROL.path, String(CONTRACT_ROUNDING_MODE_CONTROL.fallback))}
              onChange={(e) => updateField(selectedKey, CONTRACT_ROUNDING_MODE_CONTROL.path, e.target.value)}
              disabled={isStudioContractFieldDeferredLocked(CONTRACT_ROUNDING_MODE_CONTROL.path)}
              title="Locked: applied at compile time"
            >
              {(CONTRACT_ROUNDING_MODE_CONTROL.options || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </SubSection>
    </>
  );
}
