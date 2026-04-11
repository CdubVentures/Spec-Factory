import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section, SubSection } from "../Section.tsx";
import { Tip } from "../../../../shared/ui/feedback/Tip.tsx";
import { ComboSelect } from "../../../../shared/ui/forms/ComboSelect.tsx";
import { useUnitRegistryQuery } from "../../../../pages/unit-registry/unitRegistryQueries.ts";
import { strN, numN, boolN } from "../../state/nestedValueHelpers.ts";
import {
  parseIntegerInput,
  parseBoundedIntInput,
} from "../../state/numericInputHelpers.ts";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../../state/studioNumericKnobBounds.ts";
import { isStudioContractFieldDeferredLocked } from "../../state/studioBehaviorContracts.ts";
import { isFieldAvailable } from "../../state/fieldCascadeRegistry.ts";
import {
  selectCls,
  inputCls,
  labelCls,
  STUDIO_TIPS,
} from "../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };

export interface KeyContractSectionProps extends KeySectionBaseProps {}

export function KeyContractSection({
  selectedKey,
  currentRule,
  updateField,
  category,
  BadgeRenderer: B,
  disabled,
}: KeyContractSectionProps) {
  const { data: unitRegistryData } = useUnitRegistryQuery();
  const registryUnits = (unitRegistryData?.units ?? []).map(u => u.canonical);
  const currentContractType = currentRule
    ? strN(currentRule, "contract.type", "string")
    : "string";

  const numericAvailable = isFieldAvailable(currentRule, "contract.unit");
  const listAvailable = isFieldAvailable(currentRule, "contract.list_rules.dedupe");

  function parseContractRangeValue(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (currentContractType === "integer") {
      return parseIntegerInput(trimmed) ?? undefined;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return (
    <Section
      title="Contract"
      persistKey={`studio:keyNavigator:section:contract:${category}`}
      titleTooltip={STUDIO_TIPS.key_section_contract}
      disabled={disabled}
    >
      {/* ── Type & Shape ──────────────────────────────────────── */}
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
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="integer">integer</option>
              <option value="boolean">boolean</option>
              <option value="date">date</option>
              <option value="url">url</option>
              <option value="range">range</option>
              <option value="mixed_number_range">mixed_number_range</option>
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
            >
              <option value="scalar">scalar</option>
              <option value="list">list</option>
            </select>
          </div>
        </div>
      </SubSection>

      {/* ── Unit & Range ──────────────────────────────────────── */}
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
              disabled={!numericAvailable}
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
              disabled={!numericAvailable}
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
              disabled={!numericAvailable}
            />
          </div>
        </div>
      </SubSection>

      {/* ── List Rules ────────────────────────────────────────── */}
      <SubSection
        label="List Rules"
        disabled={!listAvailable}
        disabledHint="Available when contract shape is list."
      >
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>Dedupe<Tip style={TIP_STYLE} text={STUDIO_TIPS.list_rules_dedupe} /></span>
            </div>
            <select
              className={`${selectCls} w-full`}
              value={boolN(currentRule, "contract.list_rules.dedupe", true) ? "yes" : "no"}
              onChange={(e) => updateField(selectedKey, "contract.list_rules.dedupe", e.target.value === "yes")}
              disabled={!listAvailable}
            >
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>Sort<Tip style={TIP_STYLE} text={STUDIO_TIPS.list_rules_sort} /></span>
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, "contract.list_rules.sort", "none")}
              onChange={(e) => updateField(selectedKey, "contract.list_rules.sort", e.target.value)}
              disabled={!listAvailable}
            >
              <option value="none">none</option>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </div>
          <div>
            <div className={`${labelCls} flex items-center`}>
              <span>Item Union<Tip style={TIP_STYLE} text={STUDIO_TIPS.list_rules_item_union} /></span>
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, "contract.list_rules.item_union")}
              onChange={(e) => updateField(selectedKey, "contract.list_rules.item_union", e.target.value || undefined)}
              disabled={!listAvailable}
            >
              <option value="">winner_only</option>
              <option value="set_union">set_union</option>
              <option value="ordered_union">ordered_union</option>
            </select>
          </div>
        </div>
      </SubSection>

      {/* ── Precision ─────────────────────────────────────────── */}
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
              disabled={!isFieldAvailable(currentRule, "contract.rounding.decimals")}
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
    </Section>
  );
}
