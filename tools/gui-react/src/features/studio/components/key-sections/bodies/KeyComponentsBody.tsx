// WHY: Body for Components panel. Component DB select + read-only property
// list with variance label per subfield. Phase 1 retired the per-rule
// Match Settings knobs (the engine collapses to inline defaults). Property
// Keys remain as a read-only "Component Properties" view sourced from
// field_studio_map.component_sources — that stays until Phase 3 deletes the
// whole panel. Shared between Key Navigator and Workbench drawer.
import { FIELD_RULE_COMPONENT_TYPE_CONTROL } from "../../../../../../../../src/field-rules/fieldRuleSchema.js";
import type { KeySectionBaseProps } from "../keySectionContracts.ts";
import type { ComponentSource } from "../../../../../types/studio.ts";
import { Tip } from "../../../../../shared/ui/feedback/Tip.tsx";
import { strN } from "../../../state/nestedValueHelpers.ts";
import { deriveInputControl } from "../../../state/deriveInputControl.ts";
import {
  selectCls,
  labelCls,
  COMPONENT_TYPES,
  STUDIO_TIPS,
} from "../../studioConstants.ts";

const TIP_STYLE = { position: "relative" as const, left: "-3px", top: "-4px" };
const COMPONENT_ROOT_PATH = FIELD_RULE_COMPONENT_TYPE_CONTROL.path.split(".")[0];

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
  // Phase 2: derive componentType from `enum.source` (the lock contract).
  // The `<select>` writes still go through the `component` path during the
  // Phase-2 → Phase-3 transition so authored maps stay valid; Phase 3 deletes
  // this body entirely and `EditableComponentSource` becomes the only writer.
  const enumSourceForComponent = strN(currentRule, "enum.source");
  const componentType = enumSourceForComponent.startsWith("component_db.")
    ? enumSourceForComponent.slice("component_db.".length)
    : "";
  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className={`${labelCls} flex items-center`}>
            <span>
              {FIELD_RULE_COMPONENT_TYPE_CONTROL.label}
              <Tip style={TIP_STYLE} text={STUDIO_TIPS[FIELD_RULE_COMPONENT_TYPE_CONTROL.tooltipKey]} />
            </span>
            <B p={FIELD_RULE_COMPONENT_TYPE_CONTROL.path} />
          </div>
          <select
            className={`${selectCls} w-full`}
            value={componentType}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                updateField(selectedKey, COMPONENT_ROOT_PATH, null);
                updateField(selectedKey, FIELD_RULE_COMPONENT_TYPE_CONTROL.path, "");
              } else {
                updateField(selectedKey, COMPONENT_ROOT_PATH, {
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
            <div className="text-[11px] font-medium sf-text-subtle mb-1">Component Properties</div>
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
        );
      })() : null}
    </>
  );
}
