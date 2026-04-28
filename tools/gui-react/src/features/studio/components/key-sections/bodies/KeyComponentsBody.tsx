// WHY: Body for Components panel. Component DB select + Match Settings
// (Name Matching + Property Matching with derived property-key list).
// Shared between Key Navigator and Workbench drawer.
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import type { ComponentSource } from "../../../../../types/studio.ts";
import { Tip } from "../../../../../shared/ui/feedback/Tip.tsx";
import { strN, numN } from "../../../state/nestedValueHelpers.ts";
import { deriveInputControl } from "../../../state/deriveInputControl.ts";
import { parseBoundedFloatInput } from "../../../state/numericInputHelpers.ts";
import {
  STUDIO_COMPONENT_MATCH_DEFAULTS,
  STUDIO_NUMERIC_KNOB_BOUNDS,
} from "../../../state/studioNumericKnobBounds.ts";
import {
  selectCls,
  labelCls,
  COMPONENT_TYPES,
  STUDIO_TIPS,
} from "../../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };

export interface KeyComponentsBodyProps extends KeySectionBaseProps {
  componentSources: ComponentSource[];
  knownValues: Record<string, string[]>;
  editedRules: Record<string, Record<string, unknown>>;
}

export function KeyComponentsBody({
  selectedKey,
  currentRule,
  updateField,
  BadgeRenderer: B,
  componentSources,
  knownValues,
  editedRules,
  disabled,
}: KeyComponentsBodyProps) {
  const componentType = strN(currentRule, "component.type");
  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>Component DB<Tip style={TIP_STYLE} text={STUDIO_TIPS.component_db} /></span>
            <B p="component.type" />
          </div>
          <select
            className={`${selectCls} w-full`}
            value={componentType}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                updateField(selectedKey, "component", null);
                updateField(selectedKey, "component.type", "");
              } else {
                updateField(selectedKey, "component", {
                  type: v,
                  source: `component_db.${v}`,
                  allow_new_components: true,
                  require_identity_evidence: true,
                });
              }
            }}
          >
            <option value="">(none)</option>
            {COMPONENT_TYPES.map((ct) => (
              <option key={ct} value={ct}>{ct}</option>
            ))}
          </select>
        </div>
        {componentType ? (
          <div className="col-span-3 flex items-end">
            <div className="flex items-center gap-3 text-xs">
              <span className="sf-text-subtle">
                Enum: <span className="font-mono">{strN(currentRule, "enum.source")}</span>
                {" | "}Input:{" "}
                <span className="font-mono">
                  {deriveInputControl({
                    type: strN(currentRule, "contract.type") || null,
                    shape: strN(currentRule, "contract.shape") || null,
                    enumSource: strN(currentRule, "enum.source") || null,
                    enumPolicy: strN(currentRule, "enum.policy") || null,
                    componentSource: strN(currentRule, "component.source") || null,
                  })}
                </span>
              </span>
            </div>
          </div>
        ) : null}
      </div>
      {componentType ? (() => {
        const compSource = componentSources.find(
          (s) => (s.component_type || s.type) === componentType,
        );
        const NUMERIC_ONLY_POLICIES = ["upper_bound", "lower_bound", "range"];
        const derivedProps = (compSource?.roles?.properties || []).filter((p) => p.field_key);
        return (
          <div className="mt-3 border-t sf-border-default pt-3">
            <div className="text-xs font-semibold sf-text-muted mb-2">Match Settings</div>
            <div className="text-[11px] font-medium sf-text-subtle mb-1">Name Matching</div>
            <div className="grid grid-cols-2 gap-3">
              <MatchKnob
                label="Fuzzy Threshold"
                tip={STUDIO_TIPS.comp_match_fuzzy_threshold}
                badgePath="component.match.fuzzy_threshold"
                value={numN(currentRule, "component.match.fuzzy_threshold", STUDIO_COMPONENT_MATCH_DEFAULTS.fuzzyThreshold)}
                fallback={STUDIO_COMPONENT_MATCH_DEFAULTS.fuzzyThreshold}
                onCommit={(n) => updateField(selectedKey, "component.match.fuzzy_threshold", n)}
                B={B}
                disabled={disabled}
              />
              <MatchKnob
                label="Name Weight"
                tip={STUDIO_TIPS.comp_match_name_weight}
                badgePath="component.match.name_weight"
                value={numN(currentRule, "component.match.name_weight", STUDIO_COMPONENT_MATCH_DEFAULTS.nameWeight)}
                fallback={STUDIO_COMPONENT_MATCH_DEFAULTS.nameWeight}
                onCommit={(n) => updateField(selectedKey, "component.match.name_weight", n)}
                B={B}
                disabled={disabled}
              />
              <MatchKnob
                label="Auto-Accept Score"
                tip={STUDIO_TIPS.comp_match_auto_accept_score}
                badgePath="component.match.auto_accept_score"
                value={numN(currentRule, "component.match.auto_accept_score", STUDIO_COMPONENT_MATCH_DEFAULTS.autoAcceptScore)}
                fallback={STUDIO_COMPONENT_MATCH_DEFAULTS.autoAcceptScore}
                onCommit={(n) => updateField(selectedKey, "component.match.auto_accept_score", n)}
                B={B}
                disabled={disabled}
              />
              <MatchKnob
                label="Flag Review Score"
                tip={STUDIO_TIPS.comp_match_flag_review_score}
                badgePath="component.match.flag_review_score"
                value={numN(currentRule, "component.match.flag_review_score", STUDIO_COMPONENT_MATCH_DEFAULTS.flagReviewScore)}
                fallback={STUDIO_COMPONENT_MATCH_DEFAULTS.flagReviewScore}
                onCommit={(n) => updateField(selectedKey, "component.match.flag_review_score", n)}
                B={B}
                disabled={disabled}
              />
            </div>
            <div className="text-[11px] font-medium sf-text-subtle mb-1 mt-3">Property Matching</div>
            <div className="grid grid-cols-2 gap-3">
              <MatchKnob
                label="Property Weight"
                tip={STUDIO_TIPS.comp_match_property_weight}
                badgePath="component.match.property_weight"
                value={numN(currentRule, "component.match.property_weight", STUDIO_COMPONENT_MATCH_DEFAULTS.propertyWeight)}
                fallback={STUDIO_COMPONENT_MATCH_DEFAULTS.propertyWeight}
                onCommit={(n) => updateField(selectedKey, "component.match.property_weight", n)}
                B={B}
                disabled={disabled}
              />
              <div className="col-span-2">
                <div className={`${labelCls} flex items-center`}>
                  <span>Property Keys<Tip style={TIP_STYLE} text={STUDIO_TIPS.comp_match_property_keys} /></span>
                  <B p="component.match.property_keys" />
                </div>
                <div className="space-y-1.5">
                  {derivedProps.map((p) => {
                    const raw = p.variance_policy || "authoritative";
                    const fieldRule = editedRules[p.field_key || ""] as Record<string, unknown> | undefined;
                    const contractType = fieldRule ? strN(fieldRule, "contract.type") : "";
                    const enumSrc = fieldRule ? strN(fieldRule, "enum.source") : "";
                    const isBool = contractType === "boolean";
                    const hasEnum = !!enumSrc;
                    const isComponentDb = hasEnum && enumSrc.startsWith("component_db");
                    const isExtEnum = hasEnum && !isComponentDb;
                    const isLocked = contractType !== "number" || isBool || hasEnum;
                    const vp = isLocked && NUMERIC_ONLY_POLICIES.includes(raw) ? "authoritative" : raw;
                    const fieldValues = knownValues[p.field_key || ""] || [];
                    const lockReason = isBool
                      ? "Boolean field \u2014 variance locked to authoritative"
                      : isComponentDb
                        ? `enum.db (${enumSrc.replace(/^component_db\./, "")}) \u2014 variance locked to authoritative`
                        : isExtEnum
                          ? `Enum (${enumSrc.replace(/^(known_values|data_lists)\./, "")}) \u2014 variance locked to authoritative`
                          : contractType !== "number" && fieldValues.length > 0
                            ? `Manual values (${fieldValues.length}) \u2014 variance locked to authoritative`
                            : isLocked
                              ? "String property \u2014 variance locked to authoritative"
                              : "";
                    return (
                      <div key={p.field_key} className="flex items-start gap-2 px-2 py-1 rounded sf-callout sf-callout-info">
                        <span className="text-[11px] font-medium sf-status-text-info shrink-0">{p.field_key}</span>
                        <span
                          className={`text-[9px] px-1 rounded shrink-0 ${vp === "override_allowed" ? "sf-chip-teal-strong" : isLocked ? "sf-bg-surface-soft-strong sf-text-subtle sf-dk-surface-700 dark:sf-text-muted" : "sf-chip-info-soft"}`}
                          title={lockReason || (vp === "override_allowed" ? "Products can override this value without triggering review" : `Variance policy: ${vp}`)}
                        >
                          {vp === "override_allowed" ? "override" : vp}
                        </span>
                        {isBool ? (
                          <span className="text-[9px] px-1 rounded sf-chip-warning-soft shrink-0">boolean: yes / no</span>
                        ) : null}
                        {isComponentDb ? (
                          <span className="text-[9px] px-1 rounded sf-review-ai-pending-badge shrink-0 truncate max-w-[140px]" title={enumSrc}>
                            enum.db: {enumSrc.replace(/^component_db\./, "")}
                          </span>
                        ) : null}
                        {isExtEnum ? (
                          <span className="text-[9px] px-1 rounded sf-review-ai-pending-badge shrink-0 truncate max-w-[140px]" title={enumSrc}>
                            enum: {enumSrc.replace(/^(known_values|data_lists)\./, "")}
                          </span>
                        ) : null}
                        {!isBool && !hasEnum && isLocked && fieldValues.length > 0 && fieldValues.length <= 8 ? (
                          <div className="flex flex-wrap gap-0.5">
                            <span className="text-[9px] sf-text-subtle mr-0.5">manual:</span>
                            {fieldValues.map((v) => (
                              <span key={v} className="text-[9px] px-1 rounded sf-bg-surface-soft-strong sf-text-muted sf-dk-surface-700 dark:sf-text-subtle">
                                {v}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {!isBool && !hasEnum && isLocked && fieldValues.length > 8 ? (
                          <span className="text-[9px] sf-text-subtle" title={fieldValues.join(", ")}>
                            manual: {fieldValues.length} values
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                  {derivedProps.length === 0 ? (
                    <span className="text-xs sf-text-subtle italic">No properties mapped — add in Mapping Studio</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}
    </>
  );
}

interface MatchKnobProps {
  label: string;
  tip: string;
  badgePath: string;
  value: number;
  fallback: number;
  onCommit: (n: number) => void;
  B: KeyComponentsBodyProps["BadgeRenderer"];
  disabled?: boolean;
}

function MatchKnob({ label, tip, badgePath, value, fallback, onCommit, B, disabled }: MatchKnobProps) {
  return (
    <div>
      <div className={`${labelCls} flex items-center`}>
        <span>{label}<Tip style={TIP_STYLE} text={tip} /></span>
        <B p={badgePath} />
      </div>
      <input
        type="number"
        min={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min}
        max={STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max}
        step={0.05}
        className={`${selectCls} w-full`}
        value={value}
        onChange={(e) =>
          onCommit(
            parseBoundedFloatInput(
              e.target.value,
              STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.min,
              STUDIO_NUMERIC_KNOB_BOUNDS.componentMatch.max,
              fallback,
            ),
          )
        }
        disabled={disabled}
      />
    </div>
  );
}
