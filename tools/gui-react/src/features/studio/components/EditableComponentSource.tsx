import { useState, useMemo, useEffect } from "react";
import { usePersistedToggle } from "../../../stores/collapseStore.ts";
import { Tip } from "../../../shared/ui/feedback/Tip.tsx";
import { TagPicker } from "../../../shared/ui/forms/TagPicker.tsx";
import { StaticBadges } from "./StaticBadges.tsx";
import {
  normalizeAiAssistConfig,
  normalizePriorityProfile,
} from "../state/studioPriority.ts";
import {
  VARIANCE_POLICIES,
  migrateProperty,
  type PropertyMapping,
} from "../state/studioComponentSources.ts";
import { displayLabel } from "../state/studioDisplayLabel.ts";
import {
  selectCls,
  inputCls,
  labelCls,
  STUDIO_TIPS,
} from "./studioConstants.ts";
import type {
  FieldRule,
  ComponentSource,
  PriorityProfile,
  AiAssistConfig,
} from "../../../types/studio.ts";
import { btnDanger } from "./studioSharedTypes.ts";
import type { RoleId } from "./studioSharedTypes.ts";

export interface EditableComponentSourceProps {
  index: number;
  source: ComponentSource;
  onUpdate: (updates: Partial<ComponentSource>) => void;
  onRemove: () => void;
  rules: Record<string, FieldRule>;
  fieldOrder: string[];
  knownValues: Record<string, string[]>;
  // WHY: keys already locked by another component_sources[] row — excluded
  // from this row's strict Component Type select so two rows can't lock the
  // same field. Self stays selectable when editing an existing row.
  lockedComponentKeys?: string[];
  // WHY: parent (MappingStudioTab) translates this into store updateField
  // calls that auto-link the matching field rule (`enum.source = component_db.<new>`)
  // and unlock the OLD key (`enum.source = ''`) so Phase 3's lock contract holds.
  onComponentTypeChange?: (oldType: string, newType: string) => void;
  // WHY: parent gates its global Save button when any expanded row is
  // form-invalid (e.g. mode=sheet + empty sheet name). Prevents 400s from the
  // compile pipeline.
  onValidityChange?: (invalid: boolean) => void;
}

export function EditableComponentSource({
  index,
  source,
  onUpdate,
  onRemove,
  rules,
  fieldOrder,
  knownValues,
  lockedComponentKeys = [],
  onComponentTypeChange,
  onValidityChange,
}: EditableComponentSourceProps) {
  const roles = source.roles || {
    maker: "",
    aliases: [],
    links: [],
    properties: [],
  };
  const sourcePriority = normalizePriorityProfile(source.priority);
  const sourceAiAssist = normalizeAiAssistConfig(source.ai_assist);
  const [activeRoles, setActiveRoles] = useState<Set<RoleId>>(() => {
    const set = new Set<RoleId>();
    if (roles.maker) set.add("maker");
    if (Array.isArray(roles.aliases) && roles.aliases.length > 0)
      set.add("aliases");
    if (Array.isArray(roles.links) && roles.links.length > 0) set.add("links");
    if (Array.isArray(roles.properties) && roles.properties.length > 0)
      set.add("properties");
    return set;
  });

  const [propertyRows, setPropertyRows] = useState<PropertyMapping[]>(() => {
    if (!Array.isArray(roles.properties)) return [];
    return (roles.properties as unknown as typeof roles.properties).map((p) =>
      migrateProperty(p, rules),
    );
  });
  const [pendingFieldKey, setPendingFieldKey] = useState("");
  const csKey = source.component_type || source.type || `idx-${index}`;
  const [showAiSections, toggleCsAiSections] = usePersistedToggle(
    `studio:compSource:${csKey}:ai`,
    false,
  );
  const [showTrackedRoles, toggleTrackedRoles] = usePersistedToggle(
    `studio:compSource:${csKey}:roles`,
    false,
  );
  const [showAttributes, toggleAttributes] = usePersistedToggle(
    `studio:compSource:${csKey}:attrs`,
    false,
  );

  // Phase 3: strict Component Type select. Options come from available
  // field keys, excluding rows already locked by another component_sources[]
  // entry. Self stays selectable when editing an existing row.
  const compType = source.component_type || source.type || "";
  const availableComponentTypeOptions = useMemo(() => {
    const lockedSet = new Set(lockedComponentKeys.filter((k) => k && k !== compType));
    return fieldOrder.filter((key) => !key.startsWith("__grp::") && !lockedSet.has(key));
  }, [fieldOrder, lockedComponentKeys, compType]);

  // Phase 3: sheet-required gate. Default mode='sheet' + sheet=''; fire
  // onValidityChange so MappingStudioTab can disable Save while invalid.
  const sourceMeta = source as Record<string, unknown>;
  const mode = String(sourceMeta.mode ?? "sheet");
  const sheet = String(sourceMeta.sheet ?? "");
  const sheetMissing = mode === "sheet" && sheet.trim().length === 0;
  useEffect(() => {
    onValidityChange?.(sheetMissing);
  }, [sheetMissing, onValidityChange]);

  // Group field keys by ui.group for the field key picker
  const fieldKeyGroups = useMemo(() => {
    const groups: Record<
      string,
      { key: string; label: string; type: string }[]
    > = {};
    const usedKeys = new Set(propertyRows.map((r) => r.field_key));
    for (const key of fieldOrder) {
      if (key.startsWith("__grp::") || usedKeys.has(key)) continue;
      const rule = rules[key] || {};
      const ui = rule.ui || {};
      const contract = rule.contract || {};
      const group = String(ui.group || rule.group || "other");
      if (!groups[group]) groups[group] = [];
      groups[group].push({
        key,
        label: displayLabel(key, rule as Record<string, unknown>),
        type: String(contract.type || "string"),
      });
    }
    return groups;
  }, [fieldOrder, rules, propertyRows]);

  // Get inherited info from field rules for a field key
  function getInheritedInfo(fieldKey: string): {
    type: string;
    unit: string;
    evidenceRefs: number;
    constraints: string[];
    enumPolicy: string;
    enumSource: string;
    isBool: boolean;
    fieldValues: string[];
  } {
    const rule = rules[fieldKey] || {};
    const contract = rule.contract || {};
    const parse = (rule as Record<string, unknown>).parse as
      | Record<string, unknown>
      | undefined;
    const evidence = (rule as Record<string, unknown>).evidence as
      | Record<string, unknown>
      | undefined;
    const ruleAny = rule as Record<string, unknown>;
    const constraints = Array.isArray(ruleAny.constraints)
      ? ruleAny.constraints.map(String)
      : [];
    const contractAny = contract as Record<string, unknown>;
    const enumObj = ruleAny.enum as Record<string, unknown> | undefined;
    const enumPolicy = String(
      enumObj?.policy ||
        contractAny.enum_policy ||
        contractAny.list_policy ||
        "",
    );
    const enumSource = String(
      enumObj?.source ||
        contractAny.enum_source ||
        contractAny.list_source ||
        contractAny.data_list ||
        "",
    );
    const contractType = String(contract.type || "string");
    const isBool = contractType === "boolean";
    const fieldValues = knownValues[fieldKey] || [];
    return {
      type: contractType,
      unit: String(contract.unit || ""),
      evidenceRefs: Number(
        evidence?.min_refs || evidence?.min_evidence_refs || 0,
      ),
      constraints,
      enumPolicy,
      enumSource,
      isBool,
      fieldValues,
    };
  }

  function updateRoles(updates: Partial<typeof roles>) {
    onUpdate({ roles: { ...roles, ...updates } });
  }

  function updatePriority(updates: Partial<PriorityProfile>) {
    onUpdate({ priority: { ...sourcePriority, ...updates } });
  }
  function updateAiAssist(updates: Partial<AiAssistConfig>) {
    onUpdate({ ai_assist: { ...sourceAiAssist, ...updates } });
  }

  function removePropertyRow(pidx: number) {
    const next = propertyRows.filter((_, i) => i !== pidx);
    setPropertyRows(next);
    updateRoles({ properties: next as unknown as typeof roles.properties });
  }

  function updatePropertyField(
    pidx: number,
    updates: Partial<PropertyMapping>,
  ) {
    const next = propertyRows.map((row, i) =>
      i === pidx ? { ...row, ...updates } : row,
    );
    setPropertyRows(next);
    updateRoles({ properties: next as unknown as typeof roles.properties });
  }

  function selectFieldKey(pidx: number, fieldKey: string) {
    updatePropertyField(pidx, { field_key: fieldKey });
  }

  function addPropertyFromFieldKey(fieldKey: string) {
    if (propertyRows.some((r) => r.field_key === fieldKey)) return;
    const newRow: PropertyMapping = {
      field_key: fieldKey,
      variance_policy: "authoritative",
      tolerance: null,
    };
    const next = [...propertyRows, newRow];
    setPropertyRows(next);
    updateRoles({ properties: next as unknown as typeof roles.properties });
  }

  const [expanded, , setExpanded] = usePersistedToggle(
    `studio:compSource:${compType || `idx-${index}`}:expanded`,
    false,
  );
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const sourceTitle = compType ? displayLabel(compType) : `Source ${index + 1}`;
  const trackedRoleCount = ["maker", "aliases", "links"].filter((role) =>
    activeRoles.has(role as RoleId),
  ).length;
  const componentSummary = [
    `${propertyRows.length} attribute${propertyRows.length !== 1 ? "s" : ""}`,
    `${trackedRoleCount} tracked role${trackedRoleCount !== 1 ? "s" : ""}`,
  ];

  if (!expanded) {
    return (
      <div className="border sf-border-default rounded sf-bg-surface-soft sf-dk-surface-750">
        <div className="w-full flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              setConfirmingRemove(false);
            }}
            className="relative flex-1 min-w-0 py-2 text-sm font-semibold text-left sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
          >
            <span className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
              +
            </span>
            <span className="w-full text-left px-6 truncate">
              {sourceTitle}
            </span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-2">
              {componentSummary.length > 0 ? (
                <span className="text-xs sf-text-muted">
                  {componentSummary.slice(0, 2).join(" | ")}
                </span>
              ) : null}
            </span>
          </button>
          <div className="flex items-center gap-2">
            {confirmingRemove ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="sf-icon-button px-2 py-1 text-[11px] rounded border sf-border-soft sf-text-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingRemove(false);
                    onRemove();
                  }}
                  className={`${btnDanger} !px-2 !py-1 text-[11px]`}
                >
                  Confirm remove
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                className="px-2 py-1 text-[11px] rounded sf-danger-action-soft"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border sf-border-default rounded p-4 sf-bg-surface-soft sf-dk-surface-750">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setConfirmingRemove(false);
          }}
          className="relative flex-1 min-w-0 py-2 text-sm font-semibold text-left sf-text-muted sf-dk-fg-100 hover:sf-text-primary sf-dk-hover-fg-white"
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
            -
          </span>
          <span className="w-full text-left px-6 truncate">{sourceTitle}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-2">
            {componentSummary.length > 0 ? (
              <span className="text-xs sf-text-muted">
                {componentSummary.slice(0, 2).join(" | ")}
              </span>
            ) : null}
          </span>
        </button>
        <div className="flex items-center gap-2 pt-0.5">
          {confirmingRemove ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                className="sf-icon-button px-2 py-1 text-[11px] rounded border sf-border-soft sf-text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingRemove(false);
                  onRemove();
                }}
                className={`${btnDanger} !px-2 !py-1 text-[11px]`}
              >
                Confirm remove
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="px-2 py-1 text-[11px] rounded sf-danger-action-soft"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Basic fields */}
      <div className="mb-3">
        <div className={labelCls}>
          Component Type
          <Tip
            style={{ position: "relative", left: "-3px", top: "-4px" }}
            text={STUDIO_TIPS.component_type}
          />
        </div>
        <select
          className={`${selectCls} w-full`}
          value={compType}
          onChange={(e) => {
            const v = e.target.value;
            if (v === compType) return;
            onUpdate({ component_type: v, type: v });
            onComponentTypeChange?.(compType, v);
          }}
        >
          <option value="">(select a key)</option>
          {availableComponentTypeOptions.map((key) => (
            <option key={key} value={key}>
              {displayLabel(key, rules[key] as Record<string, unknown> | undefined)} ({key})
            </option>
          ))}
        </select>
      </div>

      {/* Sheet config — required when mode=sheet (default). Inline gate
          prevents the compile-pipeline 400 (sheet is required when mode=sheet). */}
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div>
          <div className={labelCls}>Mode</div>
          <select
            className={`${selectCls} w-full`}
            value={mode}
            onChange={(e) => onUpdate({ mode: e.target.value })}
          >
            <option value="sheet">sheet</option>
            <option value="scratch">scratch</option>
          </select>
        </div>
        <div className="col-span-2">
          <div className={labelCls}>Sheet name</div>
          <input
            className={`${inputCls} w-full ${sheetMissing ? "sf-border-danger" : ""}`}
            value={sheet}
            onChange={(e) => onUpdate({ sheet: e.target.value })}
            placeholder="e.g. Sensors"
            disabled={mode !== "sheet"}
          />
        </div>
      </div>
      {sheetMissing ? (
        <div className="mb-3 px-3 py-2 rounded sf-callout sf-callout-danger text-[11px]">
          Sheet name is required when mode=sheet &mdash; enter a sheet name to enable save.
        </div>
      ) : null}

      {/* Component-level full review priority */}
      <button
        type="button"
        onClick={() => toggleCsAiSections()}
        className="w-full flex items-center gap-2 mb-2"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
          {showAiSections ? "-" : "+"}
        </span>
        <span className="text-xs font-semibold sf-text-muted">
          AI Review Priority
        </span>
      </button>
      {showAiSections ? (
        <div className="border sf-border-default rounded p-3 mb-4 sf-bg-surface-soft sf-dk-surface-900a20">
          <div className="text-xs font-semibold sf-text-muted mb-2">
            AI Review Priority
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className={labelCls}>
                Required Level
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.required_level}
                />
              </div>
              <select
                className={`${selectCls} w-full`}
                value={sourcePriority.required_level}
                onChange={(e) =>
                  updatePriority({ required_level: e.target.value as PriorityProfile['required_level'] })
                }
              >
                <option value="mandatory">mandatory</option>
                <option value="non_mandatory">non_mandatory</option>
              </select>
            </div>
            <div>
              <div className={labelCls}>
                Availability
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.availability}
                />
              </div>
              <select
                className={`${selectCls} w-full`}
                value={sourcePriority.availability}
                onChange={(e) =>
                  updatePriority({ availability: e.target.value as PriorityProfile['availability'] })
                }
              >
                <option value="always">always</option>
                <option value="sometimes">sometimes</option>
                <option value="rare">rare</option>
              </select>
            </div>
            <div>
              <div className={labelCls}>
                Difficulty
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.difficulty}
                />
              </div>
              <select
                className={`${selectCls} w-full`}
                value={sourcePriority.difficulty}
                onChange={(e) => updatePriority({ difficulty: e.target.value as PriorityProfile['difficulty'] })}
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
                <option value="very_hard">very_hard</option>
              </select>
            </div>
          </div>
        </div>
      ) : null}

      {/* Extraction Guidance */}
      {(() => {
            const explicitNote = sourceAiAssist.reasoning_note || "";
            const autoNote = [
              `Full component table review for "${compType || "component"}".`,
              `Required level ${sourcePriority.required_level}, difficulty ${sourcePriority.difficulty}.`,
              "Resolve conflicts across sources and keep output normalized for component identity + properties.",
            ].join(" ");
            const hasExplicit = explicitNote.length > 0;

            return (
              <div className="border sf-border-default rounded p-3 mb-4 sf-bg-surface-soft sf-dk-surface-900a20">
                <div className="flex items-center gap-2 mb-1">
                  <span className={labelCls.replace(" mb-1", "")}>
                    Extraction Guidance (sent to LLM)
                    <Tip
                      style={{
                        position: "relative",
                        left: "-3px",
                        top: "-4px",
                      }}
                      text={STUDIO_TIPS.ai_reasoning_note}
                    />
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
                    updateAiAssist({ reasoning_note: e.target.value })
                  }
                  placeholder={`Auto: ${autoNote}`}
                />
                {hasExplicit && (
                  <button
                    className="text-[10px] sf-link-accent hover:opacity-80 mt-1"
                    onClick={() => updateAiAssist({ reasoning_note: "" })}
                  >
                    Clear &amp; revert to auto-generated guidance
                  </button>
                )}
              </div>
            );
          })()}

      {/* Tracked Roles */}
      <div className="border-t sf-border-default pt-3">
        <button
          type="button"
          onClick={() => toggleTrackedRoles()}
          className="w-full flex items-center justify-between gap-2 mb-2"
        >
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
              {showTrackedRoles ? "-" : "+"}
            </span>
            <span className="text-xs font-semibold sf-text-muted">
              Tracked Roles
            </span>
          </span>
          <span className="text-[10px] sf-text-subtle">
            {trackedRoleCount} tracked roles
          </span>
        </button>
        {showTrackedRoles ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "name" as const, label: "Name", alwaysOn: true },
                  {
                    id: "maker" as const,
                    label: "Maker (Brand)",
                    alwaysOn: false,
                  },
                  { id: "aliases" as const, label: "Aliases", alwaysOn: false },
                  {
                    id: "links" as const,
                    label: "Links (URLs)",
                    alwaysOn: false,
                  },
                ] as const
              ).map((role) => {
                const isOn =
                  role.alwaysOn ||
                  (role.id === "maker"
                    ? activeRoles.has("maker")
                    : role.id === "aliases"
                      ? activeRoles.has("aliases")
                      : activeRoles.has("links"));
                return (
                  <button
                    key={role.id}
                    disabled={role.alwaysOn}
                    className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                      isOn
                        ? "sf-chip-success"
                        : "sf-bg-surface-soft-strong sf-dk-surface-800 sf-text-muted sf-border-soft sf-hover-surface-soft-200 sf-dk-hover-surface-700"
                    } ${role.alwaysOn ? "cursor-default opacity-80" : ""}`}
                    onClick={() => {
                      if (role.alwaysOn) return;
                      const next = new Set(activeRoles);
                      if (role.id === "maker") {
                        if (next.has("maker")) {
                          next.delete("maker");
                          updateRoles({ maker: "" });
                        } else {
                          next.add("maker");
                          updateRoles({ maker: "yes" });
                        }
                      } else if (role.id === "aliases") {
                        if (next.has("aliases")) {
                          next.delete("aliases");
                          updateRoles({ aliases: [] });
                        } else {
                          next.add("aliases");
                        }
                      } else if (role.id === "links") {
                        if (next.has("links")) {
                          next.delete("links");
                          updateRoles({ links: [] });
                        } else {
                          next.add("links");
                        }
                      }
                      setActiveRoles(next);
                    }}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] sf-text-subtle mb-3">
              All tracked roles use{" "}
              <span className="font-semibold sf-text-muted">Authoritative</span>{" "}
              variance policy
            </div>

            {/* Alias values — shown when aliases role is active */}
            {activeRoles.has("aliases") ? (
              <div className="mb-4 border sf-border-default rounded p-3 sf-bg-surface-soft sf-dk-surface-900a20">
                <div className="flex items-center gap-2 mb-2">
                  <div className={labelCls}>Alias Values</div>
                </div>
                <TagPicker
                  values={
                    Array.isArray(roles.aliases)
                      ? roles.aliases.filter(
                          (a) => a.length > 1 || !/^[A-Z]$/.test(a),
                        )
                      : []
                  }
                  onChange={(v) => updateRoles({ aliases: v })}
                  placeholder="Type an alias and press Enter..."
                />
              </div>
            ) : null}

            {/* Attributes (Properties) */}
            <button
              type="button"
              onClick={() => toggleAttributes()}
              className="w-full flex items-center justify-between gap-2 mb-2"
            >
              <span className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
                  {showAttributes ? "-" : "+"}
                </span>
                <span className="text-xs font-semibold sf-text-muted">
                  Attributes ({propertyRows.length})
                  <Tip
                    style={{ position: "relative", left: "-3px", top: "-4px" }}
                    text={STUDIO_TIPS.comp_field_key}
                  />
                </span>
              </span>
              <span className="text-xs sf-text-subtle">
                {propertyRows.length} attribute
                {propertyRows.length !== 1 ? "s" : ""}
              </span>
            </button>
            {showAttributes ? (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className={labelCls}>
                    Attributes ({propertyRows.length})
                    <Tip
                      style={{
                        position: "relative",
                        left: "-3px",
                        top: "-4px",
                      }}
                      text={STUDIO_TIPS.comp_field_key}
                    />
                  </div>
                  {fieldOrder.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <select
                        className={`${selectCls} text-xs min-w-[180px]`}
                        value={pendingFieldKey}
                        onChange={(e) => setPendingFieldKey(e.target.value)}
                      >
                        <option value="">Select field key...</option>
                        {Object.entries(fieldKeyGroups).flatMap(([, keys]) =>
                          keys.map((k) => (
                            <option key={k.key} value={k.key}>
                              {k.label} ({k.type})
                            </option>
                          )),
                        )}
                      </select>
                      <button
                        className="px-3 py-1.5 text-xs font-medium sf-primary-button disabled:opacity-40"
                        disabled={!pendingFieldKey}
                        onClick={() => {
                          if (pendingFieldKey) {
                            addPropertyFromFieldKey(pendingFieldKey);
                            setPendingFieldKey("");
                          }
                        }}
                      >
                        + Add
                      </button>
                    </div>
                  ) : null}
                </div>
                {propertyRows.length > 0 ? (
                  <div className="space-y-2">
                    {propertyRows.map((prop, pidx) => {
                      const inherited = prop.field_key
                        ? getInheritedInfo(prop.field_key)
                        : null;
                      const hasEnumSource = inherited
                        ? !!inherited.enumSource
                        : false;
                      const isComponentDbEnum =
                        hasEnumSource &&
                        inherited!.enumSource.startsWith("component_db");
                      const isExternalEnum =
                        hasEnumSource && !isComponentDbEnum;
                      const varianceLocked = inherited
                        ? inherited.type !== "number" ||
                          inherited.isBool ||
                          hasEnumSource
                        : false;
                      const lockReason = inherited
                        ? inherited.isBool
                          ? 'Boolean field \u2014 variance locked to authoritative (yes/no only)'
                          : isComponentDbEnum
                            ? `enum.db (${inherited.enumSource.replace(/^component_db\./, "")}) \u2014 variance locked to authoritative`
                            : isExternalEnum
                              ? `Enum (${inherited.enumSource.replace(/^(known_values|data_lists)\./, "")}) \u2014 variance locked to authoritative`
                              : inherited.type !== "number" &&
                                  inherited.fieldValues.length > 0
                                ? `Manual values (${inherited.fieldValues.length}) \u2014 variance locked to authoritative`
                                : inherited.type !== "number"
                                  ? 'String property \u2014 variance locked to authoritative (only number fields without enums support variance)'
                                  : ""
                        : "";
                      return (
                        <div
                          key={pidx}
                          className="border sf-border-default dark:sf-border-soft rounded overflow-hidden"
                        >
                          <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end p-3 pb-2">
                            <div>
                              <div className="text-[10px] sf-text-subtle mb-0.5">
                                Field Key
                                <Tip
                                  style={{
                                    position: "relative",
                                    left: "-3px",
                                    top: "-4px",
                                  }}
                                  text={STUDIO_TIPS.comp_field_key}
                                />
                              </div>
                              <select
                                className={`${selectCls} w-full`}
                                value={prop.field_key}
                                onChange={(e) => {
                                  const newKey = e.target.value;
                                  selectFieldKey(pidx, newKey);
                                  if (newKey) {
                                    const info = getInheritedInfo(newKey);
                                    const shouldLock =
                                      info.type !== "number" ||
                                      info.isBool ||
                                      !!info.enumSource;
                                    if (shouldLock) {
                                      updatePropertyField(pidx, {
                                        field_key: newKey,
                                        variance_policy: "authoritative",
                                        tolerance: null,
                                      });
                                    }
                                  }
                                }}
                              >
                                <option value="">(select field key)</option>
                                {prop.field_key && rules[prop.field_key] ? (
                                  (() => {
                                    const r = rules[prop.field_key];
                                    const ct = r.contract || {};
                                    return (
                                      <option
                                        key={prop.field_key}
                                        value={prop.field_key}
                                      >
                                        {displayLabel(
                                          prop.field_key,
                                          r as Record<string, unknown>,
                                        )}{" "}
                                        ({String(ct.type || "string")}) &#10003;
                                      </option>
                                    );
                                  })()
                                ) : prop.field_key ? (
                                  <option
                                    key={prop.field_key}
                                    value={prop.field_key}
                                  >
                                    {prop.field_key} &#10003;
                                  </option>
                                ) : null}
                                {Object.entries(fieldKeyGroups).flatMap(
                                  ([, keys]) =>
                                    keys.map((k) => (
                                      <option key={k.key} value={k.key}>
                                        {k.label} ({k.type})
                                      </option>
                                    )),
                                )}
                              </select>
                            </div>
                            <div>
                              <div className="text-[10px] sf-text-subtle mb-0.5">
                                Variance
                                <Tip
                                  style={{
                                    position: "relative",
                                    left: "-3px",
                                    top: "-4px",
                                  }}
                                  text={STUDIO_TIPS.comp_variance_policy}
                                />
                              </div>
                              <select
                                className={`${selectCls} w-full ${varianceLocked || prop.variance_policy === "override_allowed" ? "opacity-50 cursor-not-allowed" : ""}`}
                                value={
                                  varianceLocked ||
                                  prop.variance_policy === "override_allowed"
                                    ? "authoritative"
                                    : prop.variance_policy
                                }
                                disabled={
                                  varianceLocked ||
                                  prop.variance_policy === "override_allowed"
                                }
                                title={
                                  prop.variance_policy === "override_allowed"
                                    ? 'Disabled \u2014 override checkbox is active'
                                    : lockReason
                                }
                                onChange={(e) =>
                                  updatePropertyField(pidx, {
                                    variance_policy: e.target
                                      .value as PropertyMapping["variance_policy"],
                                  })
                                }
                              >
                                {VARIANCE_POLICIES.map((vp) => (
                                  <option key={vp.value} value={vp.value}>
                                    {vp.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <div className="text-[10px] sf-text-subtle mb-0.5">Component only</div>
                              <label
                                className="flex items-center gap-1 py-1.5 cursor-pointer"
                                title="When checked, this attribute stays scoped to the component DB and won't appear in Key Navigator or the product Review grid."
                              >
                                <input
                                  type="checkbox"
                                  checked={prop.component_only === true}
                                  onChange={(e) =>
                                    updatePropertyField(pidx, {
                                      component_only: e.target.checked,
                                    })
                                  }
                                />
                                <span className="text-[10px] sf-text-subtle">scoped</span>
                              </label>
                            </div>
                            <div>
                              <button
                                onClick={() => removePropertyRow(pidx)}
                                className="text-xs sf-danger-text-soft sf-status-danger-hover py-1.5 px-2"
                                title="Remove"
                              >
                                &#10005;
                              </button>
                            </div>
                          </div>
                          {prop.component_only === true ? (
                            <div className="px-3 pb-2">
                              <span className="text-[10px] sf-text-subtle">
                                Attribute of the component itself; not promoted to product fields.
                              </span>
                            </div>
                          ) : null}

                          {/* Variance lock reason + enriched type metadata */}
                          {varianceLocked && inherited ? (
                            <div className="px-3 pb-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] px-1.5 py-0.5 rounded sf-bg-surface-soft-strong sf-text-subtle sf-dk-surface-700 dark:sf-text-muted">
                                  authoritative (locked)
                                </span>
                                {inherited.isBool ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded sf-chip-warning-soft">
                                    boolean: yes / no
                                  </span>
                                ) : null}
                                {isComponentDbEnum ? (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded sf-review-ai-pending-badge truncate max-w-[200px]"
                                    title={inherited.enumSource}
                                  >
                                    enum.db:{" "}
                                    {inherited.enumSource.replace(
                                      /^component_db\./,
                                      "",
                                    )}
                                  </span>
                                ) : null}
                                {isExternalEnum ? (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded sf-review-ai-pending-badge truncate max-w-[200px]"
                                    title={inherited.enumSource}
                                  >
                                    enum:{" "}
                                    {inherited.enumSource.replace(
                                      /^(known_values|data_lists)\./,
                                      "",
                                    )}
                                  </span>
                                ) : null}
                                {!inherited.isBool &&
                                !hasEnumSource &&
                                inherited.fieldValues.length > 0 &&
                                inherited.fieldValues.length <= 8 ? (
                                  <div className="flex flex-wrap gap-0.5">
                                    <span className="text-[10px] sf-text-subtle mr-0.5">
                                      manual:
                                    </span>
                                    {inherited.fieldValues.map((v) => (
                                      <span
                                        key={v}
                                        className="text-[9px] px-1 py-0.5 rounded sf-bg-surface-soft-strong sf-text-muted sf-dk-surface-700 dark:sf-text-subtle"
                                      >
                                        {v}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {!inherited.isBool &&
                                !hasEnumSource &&
                                inherited.fieldValues.length > 8 ? (
                                  <span
                                    className="text-[10px] sf-text-subtle"
                                    title={inherited.fieldValues.join(", ")}
                                  >
                                    manual: {inherited.fieldValues.length}{" "}
                                    values
                                  </span>
                                ) : null}
                                {!inherited.isBool &&
                                !hasEnumSource &&
                                inherited.fieldValues.length === 0 &&
                                inherited.type !== "number" ? (
                                  <span className="text-[10px] sf-text-subtle italic">
                                    string type
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {/* Allow Product Override checkbox (shown for unlocked number fields) */}
                          {!varianceLocked ? (
                            <div className="px-3 pb-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={
                                    prop.variance_policy === "override_allowed"
                                  }
                                  onChange={(e) =>
                                    updatePropertyField(pidx, {
                                      variance_policy: e.target.checked
                                        ? "override_allowed"
                                        : "authoritative",
                                      tolerance: e.target.checked
                                        ? null
                                        : prop.tolerance,
                                    })
                                  }
                                  className="rounded sf-border-soft"
                                />
                                <span className="text-[10px] sf-text-muted">
                                  Allow Product Override
                                </span>
                                <Tip text={STUDIO_TIPS.comp_override_allowed} />
                              </label>
                            </div>
                          ) : null}

                          {/* Tolerance input (shown for unlocked numeric upper_bound/lower_bound/range) */}
                          {!varianceLocked &&
                          (prop.variance_policy === "upper_bound" ||
                            prop.variance_policy === "lower_bound" ||
                            prop.variance_policy === "range") ? (
                            <div className="px-3 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] sf-text-subtle">
                                  Tolerance
                                  <Tip
                                    style={{
                                      position: "relative",
                                      left: "-3px",
                                      top: "-4px",
                                    }}
                                    text={STUDIO_TIPS.comp_tolerance}
                                  />
                                </span>
                                <input
                                  className={`${inputCls} w-24`}
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={prop.tolerance ?? ""}
                                  onChange={(e) =>
                                    updatePropertyField(pidx, {
                                      tolerance: e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    })
                                  }
                                  placeholder="e.g. 5"
                                />
                              </div>
                            </div>
                          ) : null}

                          {/* Inherited info banner */}
                          {inherited && prop.field_key ? (
                            <div className="sf-bg-surface-soft sf-dk-surface-900a50 px-3 py-2 text-[11px] sf-text-muted border-t sf-border-default">
                              <div className="flex flex-wrap gap-1.5 items-center">
                                <span className="font-medium sf-text-muted">
                                  Inherited:
                                </span>
                                <span className="inline-flex items-center gap-0.5">
                                  <span className="sf-chip-info px-1.5 py-0.5 rounded text-[10px]">
                                    {inherited.type}
                                  </span>
                                  <StaticBadges fieldPath="contract.type" />
                                </span>
                                {inherited.unit ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="sf-chip-info px-1.5 py-0.5 rounded text-[10px]">
                                      {inherited.unit}
                                    </span>
                                    <StaticBadges fieldPath="contract.unit" />
                                  </span>
                                ) : null}
                                {inherited.evidenceRefs > 0 ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="sf-chip-success px-1.5 py-0.5 rounded text-[10px]">
                                      evidence:{inherited.evidenceRefs} refs
                                    </span>
                                    <StaticBadges fieldPath="evidence.min_evidence_refs" />
                                  </span>
                                ) : null}
                                {isComponentDbEnum ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="sf-chip-warning px-1.5 py-0.5 rounded text-[10px]">
                                      enum.db:{" "}
                                      {inherited.enumSource.replace(
                                        /^component_db\./,
                                        "",
                                      )}
                                    </span>
                                    <StaticBadges fieldPath="enum.source" />
                                  </span>
                                ) : isExternalEnum ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="sf-chip-warning px-1.5 py-0.5 rounded text-[10px]">
                                      enum:{" "}
                                      {inherited.enumSource.replace(
                                        /^(known_values|data_lists)\./,
                                        "",
                                      )}
                                    </span>
                                    <StaticBadges fieldPath="enum.source" />
                                  </span>
                                ) : inherited.isBool ? (
                                  <span className="sf-chip-warning-soft px-1.5 py-0.5 rounded text-[10px]">
                                    boolean: yes / no
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {/* Read-only constraints from field rule */}
                          {inherited && inherited.constraints.length > 0 ? (
                            <div className="px-3 py-1.5 border-t sf-border-default text-[11px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="sf-text-muted inline-flex items-center gap-0.5">
                                  Constraints
                                  <StaticBadges fieldPath="constraints" />
                                </span>
                                {inherited.constraints.map((c, ci) => (
                                  <span
                                    key={ci}
                                    className="sf-chip-confirm px-1.5 py-0.5 rounded text-[10px]"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs sf-text-subtle">
                    No attributes. Use the dropdown above to add field keys.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Summary line */}
        <div className="mt-3 text-xs sf-text-subtle flex flex-wrap gap-1.5">
          <span className="px-1.5 py-0.5 rounded sf-chip-success">
            {propertyRows.length} attribute
            {propertyRows.length !== 1 ? "s" : ""}
          </span>
          <span className="px-1.5 py-0.5 rounded sf-chip-info">
            {trackedRoleCount} tracked role{trackedRoleCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
