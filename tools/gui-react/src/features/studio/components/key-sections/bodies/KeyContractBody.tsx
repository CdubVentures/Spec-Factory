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

function contractControl(path: string): typeof FIELD_RULE_CONTRACT_CONTROLS[number] {
  const control = FIELD_RULE_CONTRACT_CONTROLS.find((entry) => entry.path === path);
  if (!control) throw new Error(`Missing contract control metadata for ${path}`);
  return control;
}

function dependencyControl(path: string): typeof FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS[number] {
  const control = FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS.find((entry) => entry.path === path);
  if (!control) throw new Error(`Missing contract dependency metadata for ${path}`);
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
const CONTRACT_TYPE_CONTROL = contractControl("contract.type");
const CONTRACT_SHAPE_CONTROL = contractControl("contract.shape");
const CONTRACT_UNIT_CONTROL = contractControl("contract.unit");
const CONTRACT_RANGE_MIN_CONTROL = contractControl("contract.range.min");
const CONTRACT_RANGE_MAX_CONTROL = contractControl("contract.range.max");
const CONTRACT_LIST_DEDUPE_CONTROL = contractControl("contract.list_rules.dedupe");
const CONTRACT_LIST_SORT_CONTROL = contractControl("contract.list_rules.sort");
const CONTRACT_LIST_ITEM_UNION_CONTROL = contractControl("contract.list_rules.item_union");
const CONTRACT_ROUNDING_DECIMALS_CONTROL = contractControl("contract.rounding.decimals");
const CONTRACT_ROUNDING_MODE_CONTROL = contractControl("contract.rounding.mode");

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
              <span className="font-semibold">Variant Dependent</span>
              <B p="variant_dependent" />
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
          aria-label={variantDependent ? "Per-variant (on)" : "Per-product (off)"}
          disabled={disabled}
          onClick={() => updateField(selectedKey, "variant_dependent", !variantDependent)}
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
              <span className="font-semibold">Product Image Dependent</span>
              <B p="product_image_dependent" />
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
          aria-label={productImageDependent ? "Product image dependent (on)" : "Product image dependent (off)"}
          disabled={disabled}
          onClick={() => updateField(selectedKey, "product_image_dependent", !productImageDependent)}
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
              <span>Data Type<Tip style={TIP_STYLE} text={STUDIO_TIPS.data_type} /></span>
              <B p="contract.type" />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, "contract.type", "string")}
              onChange={(e) => updateField(selectedKey, "contract.type", e.target.value)}
              disabled={disabled}
            >
              {VALID_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>Shape<Tip style={TIP_STYLE} text={STUDIO_TIPS.shape} /></span>
              <B p="contract.shape" />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, "contract.shape", "scalar")}
              onChange={(e) => updateField(selectedKey, "contract.shape", e.target.value)}
              disabled={disabled}
            >
              {VALID_SHAPES.map((v) => <option key={v} value={v}>{v}</option>)}
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
              <span>Unit<Tip style={TIP_STYLE} text={STUDIO_TIPS.contract_unit} /></span>
              <B p="contract.unit" />
            </div>
            <select
              className={selectCls}
              value={strN(currentRule, "contract.unit")}
              onChange={(e) => updateField(selectedKey, "contract.unit", e.target.value || null)}
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
              <span>Range Min<Tip style={TIP_STYLE} text={STUDIO_TIPS.contract_range} /></span>
              <B p="contract.range.min" />
            </div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              step={currentContractType === "integer" ? 1 : "any"}
              value={strN(currentRule, "contract.range.min")}
              onChange={(e) => updateField(selectedKey, "contract.range.min", parseContractRangeValue(e.target.value))}
              placeholder="Min"
              disabled={disabled || !numericAvailable}
            />
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>Range Max</span>
              <B p="contract.range.max" />
            </div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              step={currentContractType === "integer" ? 1 : "any"}
              value={strN(currentRule, "contract.range.max")}
              onChange={(e) => updateField(selectedKey, "contract.range.max", parseContractRangeValue(e.target.value))}
              placeholder="Max"
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
              <span>Dedupe<Tip style={TIP_STYLE} text={STUDIO_TIPS.list_rules_dedupe} /></span>
              <B p="contract.list_rules.dedupe" />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={boolN(currentRule, "contract.list_rules.dedupe", true) ? "yes" : "no"}
              onChange={(e) => updateField(selectedKey, "contract.list_rules.dedupe", e.target.value === "yes")}
              disabled={disabled || !listAvailable}
            >
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>Sort<Tip style={TIP_STYLE} text={STUDIO_TIPS.list_rules_sort} /></span>
              <B p="contract.list_rules.sort" />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, "contract.list_rules.sort", "none")}
              onChange={(e) => updateField(selectedKey, "contract.list_rules.sort", e.target.value)}
              disabled={disabled || !listAvailable}
            >
              <option value="none">none</option>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>Item Union<Tip style={TIP_STYLE} text={STUDIO_TIPS.list_rules_item_union} /></span>
              <B p="contract.list_rules.item_union" />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, "contract.list_rules.item_union")}
              onChange={(e) => updateField(selectedKey, "contract.list_rules.item_union", e.target.value || undefined)}
              disabled={disabled || !listAvailable}
            >
              <option value="">winner_only</option>
              <option value="set_union">set_union</option>
              <option value="ordered_union">ordered_union</option>
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
              <span>Rounding Decimals<Tip style={TIP_STYLE} text={STUDIO_TIPS.rounding_decimals} /></span>
              <B p="contract.rounding.decimals" />
            </div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              min={STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.min}
              max={STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.max}
              value={numN(currentRule, "contract.rounding.decimals", 0)}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "contract.rounding.decimals",
                  parseBoundedIntInput(
                    e.target.value,
                    STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.min,
                    STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.max,
                    STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.fallback,
                  ),
                )
              }
              disabled={disabled || !isFieldAvailable(currentRule, "contract.rounding.decimals")}
            />
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>Rounding Mode<Tip style={TIP_STYLE} text={STUDIO_TIPS.rounding_mode} /></span>
              <B p="contract.rounding.mode" />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, "contract.rounding.mode", "nearest")}
              onChange={(e) => updateField(selectedKey, "contract.rounding.mode", e.target.value)}
              disabled={isStudioContractFieldDeferredLocked("contract.rounding.mode")}
              title="Locked: applied at compile time"
            >
              <option value="nearest">nearest</option>
              <option value="floor">floor</option>
              <option value="ceil">ceil</option>
            </select>
          </div>
        </div>
      </SubSection>
    </>
  );
}
