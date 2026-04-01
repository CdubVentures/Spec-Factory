import type { KeySectionBaseProps } from "./keySectionContracts.ts";
import { Section } from "../Section.tsx";
import { Tip } from "../../../../shared/ui/feedback/Tip.tsx";
import { ComboSelect } from "../../../../shared/ui/forms/ComboSelect.tsx";
import { strN, numN, boolN } from "../../state/nestedValueHelpers.ts";
import {
  parseIntegerInput,
  parseBoundedIntInput,
} from "../../state/numericInputHelpers.ts";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../../state/studioNumericKnobBounds.ts";
import { isStudioContractFieldDeferredLocked } from "../../state/studioBehaviorContracts.ts";
import {
  selectCls,
  inputCls,
  labelCls,
  UNITS,
  UNKNOWN_TOKENS,
  STUDIO_TIPS,
} from "../studioConstants.ts";

export interface KeyContractSectionProps extends KeySectionBaseProps {}

export function KeyContractSection({
  selectedKey,
  currentRule,
  updateField,
  category,
  BadgeRenderer: B,
  disabled,
}: KeyContractSectionProps) {
  const currentContractType = currentRule
    ? strN(currentRule, "contract.type", "string")
    : "string";
  const currentContractShape = currentRule
    ? strN(currentRule, "contract.shape", "scalar")
    : "scalar";
  const isNumericContract =
    currentContractType === "number" || currentContractType === "integer";
  const isListContract = currentContractShape === "list";

  function parseContractRangeValue(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (currentContractType === "integer") {
      return parseIntegerInput(trimmed) ?? undefined;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function parseListRuleCount(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = parseIntegerInput(trimmed);
    if (parsed === null) return undefined;
    return Math.max(0, parsed);
  }

  return (
    <Section
      title="Contract (Type, Shape, Unit)"
      persistKey={`studio:keyNavigator:section:contract:${category}`}
      titleTooltip={STUDIO_TIPS.key_section_contract}
      disabled={disabled}
    >
      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              Data Type
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.data_type}
              />
            </span>
            <B p="contract.type" />
          </div>
          <select
            className={`${selectCls} w-full`}
            value={strN(currentRule, "contract.type", "string")}
            onChange={(e) =>
              updateField(
                selectedKey,
                "contract.type",
                e.target.value,
              )
            }
          >
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="integer">integer</option>
            <option value="boolean">boolean</option>
            <option value="date">date</option>
            <option value="url">url</option>
            <option value="enum">enum</option>
          </select>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              Shape
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.shape}
              />
            </span>
            <B p="contract.shape" />
          </div>
          <select
            className={`${selectCls} w-full`}
            value={strN(currentRule, "contract.shape", "scalar")}
            onChange={(e) =>
              updateField(
                selectedKey,
                "contract.shape",
                e.target.value,
              )
            }
          >
            <option value="scalar">scalar</option>
            <option value="list">list</option>
            <option value="structured">structured</option>
            <option value="key_value">key_value</option>
          </select>
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              Unit
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.contract_unit}
              />
            </span>
            <B p="contract.unit" />
          </div>
          <ComboSelect
            value={strN(currentRule, "contract.unit")}
            onChange={(v) =>
              updateField(selectedKey, "contract.unit", v || null)
            }
            options={UNITS}
            placeholder="e.g. g, mm, Hz"
          />
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              Unknown Token
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.unknown_token}
              />
            </span>
            <B p="contract.unknown_token" />
          </div>
          <ComboSelect
            value={strN(currentRule, "contract.unknown_token", "unk")}
            onChange={(v) =>
              updateField(selectedKey, "contract.unknown_token", v)
            }
            options={UNKNOWN_TOKENS}
            placeholder="unk"
            disabled={isStudioContractFieldDeferredLocked("contract.unknown_token")}
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className={`${labelCls} flex items-center`}>
          <span>
            Range
            <Tip
              style={{
                position: "relative",
                left: "-3px",
                top: "-4px",
              }}
              text={STUDIO_TIPS.contract_range}
            />
          </span>
          <B p="contract.range" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            className={`${inputCls} w-full`}
            type="number"
            step={currentContractType === "integer" ? 1 : "any"}
            value={strN(currentRule, "contract.range.min")}
            onChange={(e) =>
              updateField(
                selectedKey,
                "contract.range.min",
                parseContractRangeValue(e.target.value),
              )
            }
            placeholder="Min"
            disabled={!isNumericContract}
          />
          <input
            className={`${inputCls} w-full`}
            type="number"
            step={currentContractType === "integer" ? 1 : "any"}
            value={strN(currentRule, "contract.range.max")}
            onChange={(e) =>
              updateField(
                selectedKey,
                "contract.range.max",
                parseContractRangeValue(e.target.value),
              )
            }
            placeholder="Max"
            disabled={!isNumericContract}
          />
        </div>
        {!isNumericContract ? (
          <div className="text-xs sf-text-subtle italic">
            Available for number and integer contracts.
          </div>
        ) : null}
      </div>
      <div className="space-y-2">
        <div className={`${labelCls} flex items-center`}>
          <span>
            List Rules
            <Tip
              style={{
                position: "relative",
                left: "-3px",
                top: "-4px",
              }}
              text={STUDIO_TIPS.list_rules}
            />
          </span>
          <B p="contract.list_rules" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={boolN(
                currentRule,
                "contract.list_rules.dedupe",
                true,
              )}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "contract.list_rules.dedupe",
                  e.target.checked,
                )
              }
              className="rounded sf-border-soft"
              disabled={!isListContract}
            />
            <span className="text-xs sf-text-muted">
              Dedupe
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.list_rules_dedupe}
              />
            </span>
          </label>
          <div>
            <div className={labelCls}>
              Sort
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.list_rules_sort}
              />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, "contract.list_rules.sort", "none")}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "contract.list_rules.sort",
                  e.target.value,
                )
              }
              disabled={!isListContract}
            >
              <option value="none">none</option>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </div>
          <div>
            <div className={labelCls}>
              Min Items
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.list_rules_min_items}
              />
            </div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              min={0}
              step={1}
              value={strN(currentRule, "contract.list_rules.min_items")}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "contract.list_rules.min_items",
                  parseListRuleCount(e.target.value),
                )
              }
              placeholder="0"
              disabled={!isListContract}
            />
          </div>
          <div>
            <div className={labelCls}>
              Max Items
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.list_rules_max_items}
              />
            </div>
            <input
              className={`${inputCls} w-full`}
              type="number"
              min={0}
              step={1}
              value={strN(currentRule, "contract.list_rules.max_items")}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "contract.list_rules.max_items",
                  parseListRuleCount(e.target.value),
                )
              }
              placeholder="100"
              disabled={!isListContract}
            />
          </div>
          <div className="col-span-2">
            <div className={labelCls}>
              Item Union
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.list_rules_item_union}
              />
            </div>
            <select
              className={`${selectCls} w-full`}
              value={strN(currentRule, "contract.list_rules.item_union")}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "contract.list_rules.item_union",
                  e.target.value || undefined,
                )
              }
              disabled={!isListContract}
            >
              <option value="">winner_only</option>
              <option value="set_union">set_union</option>
              <option value="ordered_union">ordered_union</option>
            </select>
          </div>
        </div>
        {!isListContract ? (
          <div className="text-xs sf-text-subtle italic">
            Available when contract shape is list.
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              Rounding Decimals
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.rounding_decimals}
              />
            </span>
            <B p="contract.rounding.decimals" />
          </div>
          <input
            className={`${inputCls} w-full`}
            type="number"
            min={
              STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.min
            }
            max={
              STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals.max
            }
            value={numN(currentRule, "contract.rounding.decimals", 0)}
            onChange={(e) =>
              updateField(
                selectedKey,
                "contract.rounding.decimals",
                parseBoundedIntInput(
                  e.target.value,
                  STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals
                    .min,
                  STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals
                    .max,
                  STUDIO_NUMERIC_KNOB_BOUNDS.contractRoundingDecimals
                    .fallback,
                ),
              )
            }
          />
        </div>
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              Rounding Mode
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.rounding_mode}
              />
            </span>
            <B p="contract.rounding.mode" />
          </div>
          <select
            className={`${selectCls} w-full`}
            value={strN(
              currentRule,
              "contract.rounding.mode",
              "nearest",
            )}
            onChange={(e) =>
              updateField(
                selectedKey,
                "contract.rounding.mode",
                e.target.value,
              )
            }
            disabled={isStudioContractFieldDeferredLocked("contract.rounding.mode")}
          >
            <option value="nearest">nearest</option>
            <option value="floor">floor</option>
            <option value="ceil">ceil</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={boolN(
                currentRule,
                "contract.unknown_reason_required",
                true,
              )}
              onChange={(e) =>
                updateField(
                  selectedKey,
                  "contract.unknown_reason_required",
                  e.target.checked,
                )
              }
              className="rounded sf-border-soft"
              disabled={isStudioContractFieldDeferredLocked("contract.unknown_reason_required")}
            />
            <span className="text-xs sf-text-muted">
              Require unknown reason
              <Tip
                style={{
                  position: "relative",
                  left: "-3px",
                  top: "-4px",
                }}
                text={STUDIO_TIPS.require_unknown_reason}
              />
            </span>
          </label>
        </div>
      </div>
    </Section>
  );
}
