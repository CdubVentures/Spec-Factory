import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { KeyPrioritySection } from "./key-sections/KeyPrioritySection.tsx";
import { KeyComponentsSection } from "./key-sections/KeyComponentsSection.tsx";
import { KeyContractSection } from "./key-sections/KeyContractSection.tsx";
import { KeyParseRulesSection } from "./key-sections/KeyParseRulesSection.tsx";
import { KeyEvidenceSection } from "./key-sections/KeyEvidenceSection.tsx";
import { KeyStickyHeader } from "./key-sections/KeyStickyHeader.tsx";
import { KeyHintsSection } from "./key-sections/KeyHintsSection.tsx";
import { KeyBulkPasteModal } from "./KeyBulkPasteModal.tsx";
import { usePersistedToggle } from "../../../stores/collapseStore.ts";
import { usePersistedTab } from "../../../stores/tabStore.ts";
import { JsonViewer } from "../../../shared/ui/data-display/JsonViewer.tsx";
import { EnumConfigurator } from "./EnumConfigurator.tsx";
import { SystemBadges } from "../workbench/SystemBadges.tsx";
import type { DownstreamSystem } from "../workbench/systemMapping.ts";
import {
  useStudioFieldRulesActions,
  useStudioFieldRulesState,
} from "../state/studioFieldRulesController.ts";
import { useFieldRulesStore } from "../state/useFieldRulesStore.ts";
import {
  validateNewKeyTs,
  rewriteConstraintsTs,
  constraintRefsKey,
  deriveGroupsTs,
  validateNewGroupTs,
  validateBulkRows,
  type BulkKeyRow,
} from "../state/keyUtils.ts";
import DraggableKeyList from "./DraggableKeyList.tsx";
import { Section } from "./Section.tsx";
import {
  type BulkGridRow,
} from "../../../shared/ui/forms/BulkPasteGrid.tsx";
import {
  arrN,
  strN,
} from "../state/nestedValueHelpers.ts";
import {
  buildNextConsumerOverrides,
} from "../state/studioBehaviorContracts.ts";
import { displayLabel } from "../state/studioDisplayLabel.ts";
import { KeyConstraintEditor } from "./KeyConstraintEditor.tsx";
import {
  selectCls,
  inputCls,
  STUDIO_TIPS,
} from "./studioConstants.ts";

import type { StudioPageActivePanelKeyProps as KeyNavigatorTabProps } from "./studioPagePanelContracts.ts";
import { getEgPresetForKey, EG_TOGGLEABLE_KEY_SET } from "../state/egPresetsClient.ts";
import {
  btnPrimary,
  btnSecondary,
} from "./studioSharedTypes.ts";

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Property row type ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// Legacy property key ÃƒÂ¢Ã¢â‚¬Â ' product field key mapping (used during migration)


// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Editable Enum List ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬

export function KeyNavigatorTab({
  category,
  selectedKey,
  onSelectKey,
  onSave,
  onPersistOrder,
  saving,
  saveSuccess,
  knownValues,
  enumLists,
  componentSources,
  autoSaveEnabled,
  setAutoSaveEnabled,
  autoSaveLocked,
  autoSaveLockReason,
  onRunEnumConsistency,
  enumConsistencyPending,
}: KeyNavigatorTabProps) {
  const { editedRules, editedFieldOrder, egLockedKeys, egToggles, registeredColors } = useStudioFieldRulesState();
  const {
    updateField,
    setEgToggle,
    addKey,
    removeKey,
    renameKey,
    bulkAddKeys,
    reorder,
    addGroup,
    removeGroup,
    renameGroup,
  } = useStudioFieldRulesActions();
  // Add key UI state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addKeyValue, setAddKeyValue] = useState("");
  const [addKeyGroup, setAddKeyGroup] = useState("");

  const [enumConsistencyMessage, setEnumConsistencyMessage] = useState("");
  const [enumConsistencyError, setEnumConsistencyError] = useState("");

  // Group UI state
  const [selectedGroup, setSelectedGroup] = usePersistedTab<string>(
    `studio:keyNavigator:selectedGroup:${category}`,
    "",
  );
  const [showAddGroupForm, setShowAddGroupForm] = useState(false);
  const [addGroupValue, setAddGroupValue] = useState("");

  // Bulk paste modal state
  const [bulkOpen, , setBulkOpen] = usePersistedToggle(
    `studio:keyNavigator:bulkOpen:${category}`,
    false,
  );
  const [bulkGridRows, setBulkGridRows] = useState<BulkGridRow[]>([]);
  const [bulkGroup, setBulkGroup] = usePersistedTab<string>(
    `studio:keyNavigator:bulkGroup:${category}`,
    "",
  );
  const [showFullRuleJson, , setShowFullRuleJson] = usePersistedToggle(
    `studio:keyNavigator:section:fullRuleJson:${category}`,
    false,
  );

  const activeFieldOrder = editedFieldOrder;
  const activeFieldKeys = useMemo(
    () => activeFieldOrder.filter((key) => !key.startsWith("__grp::")),
    [activeFieldOrder],
  );

  useEffect(() => {
    if (activeFieldKeys.length === 0) {
      if (selectedKey) onSelectKey("");
      return;
    }
    if (!selectedKey || !activeFieldKeys.includes(selectedKey)) {
      onSelectKey(activeFieldKeys[0]);
    }
  }, [selectedKey, activeFieldKeys, onSelectKey]);

  const groups = useMemo(() => {
    return deriveGroupsTs(activeFieldOrder, editedRules);
  }, [activeFieldOrder, editedRules]);

  useEffect(() => {
    if (!selectedGroup) return;
    const groupExists = groups.some(
      ([groupName]) => groupName === selectedGroup,
    );
    if (!groupExists) {
      setSelectedGroup("");
    }
  }, [selectedGroup, groups, setSelectedGroup]);

  const existingGroups = useMemo(() => {
    const gs = new Set<string>();
    for (const [g] of groups) gs.add(g);
    return Array.from(gs);
  }, [groups]);

  const existingLabels = useMemo(() => {
    return activeFieldKeys.map((key) => displayLabel(key, editedRules[key]));
  }, [activeFieldKeys, editedRules]);

  const bulkPreviewRows: BulkKeyRow[] = useMemo(() => {
    const filled = bulkGridRows.filter((r) => r.col1.trim() || r.col2.trim());
    if (filled.length === 0) return [];
    const lines = filled.map((r) =>
      r.col2.trim() ? `${r.col1}\t${r.col2}` : r.col1,
    );
    const existingKeys = activeFieldOrder.filter(
      (k) => !k.startsWith("__grp::"),
    );
    return validateBulkRows(lines, existingKeys, existingLabels);
  }, [bulkGridRows, activeFieldOrder, existingLabels]);

  const bulkCounts = useMemo(() => {
    const c = { ready: 0, existing: 0, duplicate: 0, invalid: 0 };
    for (const row of bulkPreviewRows) {
      if (row.status === "ready") c.ready++;
      else if (row.status === "duplicate_existing") c.existing++;
      else if (row.status === "duplicate_in_paste") c.duplicate++;
      else c.invalid++;
    }
    return c;
  }, [bulkPreviewRows]);

  const bulkReadyRows = useMemo(
    () => bulkPreviewRows.filter((r) => r.status === "ready"),
    [bulkPreviewRows],
  );

  // WHY: Stabilize refs so callbacks passed to DndContext don't churn.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onPersistOrderRef = useRef(onPersistOrder);
  onPersistOrderRef.current = onPersistOrder;

  const saveIfAutoSaveEnabled = useCallback(() => {
    if (!autoSaveEnabled) return;
    onSaveRef.current();
  }, [autoSaveEnabled]);

  // WHY: Reads store directly (not stale React state) so the order
  // sent to SQL reflects the mutation that just ran synchronously.
  const persistOrderNow = useCallback(() => {
    const { editedFieldOrder: current } = useFieldRulesStore.getState();
    onPersistOrderRef.current(current);
  }, []);

  const handleReorder = useCallback(
    (activeItem: string, overItem: string) => {
      reorder(activeItem, overItem);
      persistOrderNow();
    },
    [reorder, persistOrderNow],
  );

  function handleSaveAll() {
    onSave();
  }

  function handleAddKey() {
    const key = addKeyValue.trim();
    const err = validateNewKeyTs(key, activeFieldOrder);
    if (err) return;
    const label = key
      .split("_")
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    addKey(
      key,
      {
        label,
        group: addKeyGroup || "ungrouped",
        ui: { label, group: addKeyGroup || "ungrouped" },
        constraints: [],
      },
      selectedKey || undefined,
    );
    setShowAddForm(false);
    setAddKeyValue("");
    setAddKeyGroup("");
    setSelectedGroup("");
    onSelectKey(key);
    saveIfAutoSaveEnabled();
  }

  function handleDeleteKey() {
    if (!selectedKey) return;
    const deletedKey = selectedKey;
    removeKey(deletedKey);
    const nextOrder = activeFieldOrder.filter((k) => k !== deletedKey);
    const idx = activeFieldOrder.indexOf(deletedKey);
    const nextKey = nextOrder[Math.min(idx, nextOrder.length - 1)] || "";
    onSelectKey(nextKey);
    saveIfAutoSaveEnabled();
  }

  function handleRenameKeyFromHeader(newKey: string) {
    if (!selectedKey || !newKey || newKey === selectedKey) return;
    renameKey(selectedKey, newKey, rewriteConstraintsTs, constraintRefsKey);
    onSelectKey(newKey);
    saveIfAutoSaveEnabled();
  }

  function handleAddGroup() {
    const name = addGroupValue.trim();
    const err = validateNewGroupTs(name, existingGroups);
    if (err) return;
    addGroup(name);
    setShowAddGroupForm(false);
    setAddGroupValue("");
    persistOrderNow();
  }

  function handleBulkImport() {
    if (bulkReadyRows.length === 0) return;
    const group = bulkGroup || "ungrouped";
    bulkAddKeys(
      bulkReadyRows.map((row) => ({
        key: row.key,
        rule: {
          label: row.label,
          group,
          ui: { label: row.label, group },
          constraints: [],
        },
      })),
    );
    saveIfAutoSaveEnabled();
    setBulkOpen(false);
    setBulkGridRows([]);
    setBulkGroup("");
  }

  function handleDeleteGroup(group: string) {
    if (
      !window.confirm(
        `Delete group "${group}"? Fields in this group will become ungrouped.`,
      )
    )
      return;
    removeGroup(group);
    setSelectedGroup("");
    persistOrderNow();
    saveIfAutoSaveEnabled();
  }

  function handleRenameGroup(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const otherGroups = existingGroups.filter(
      (g) => g.toLowerCase() !== oldName.toLowerCase(),
    );
    if (validateNewGroupTs(trimmed, otherGroups)) return;
    renameGroup(oldName, trimmed);
    setSelectedGroup(trimmed);
    persistOrderNow();
    saveIfAutoSaveEnabled();
  }

  function handleSelectGroup(group: string) {
    setSelectedGroup(selectedGroup === group ? "" : group);
    onSelectKey("");
  }

  function handleSelectKey(key: string) {
    setSelectedGroup("");
    onSelectKey(key);
  }

  const currentRule = selectedKey ? editedRules[selectedKey] || null : null;

  const handleConsumerToggle = useCallback(
    (fieldPath: string, system: DownstreamSystem, enabled: boolean) => {
      if (!selectedKey || !currentRule) return;
      const cur = (currentRule.consumers || {}) as Record<
        string,
        Record<string, boolean>
      >;
      updateField(
        selectedKey,
        "consumers",
        buildNextConsumerOverrides(cur, fieldPath, system, enabled),
      );
      saveIfAutoSaveEnabled();
    },
    [selectedKey, currentRule, updateField, saveIfAutoSaveEnabled],
  );

  const B = useCallback(
    ({ p }: { p: string }) =>
      currentRule ? (
        <SystemBadges
          fieldPath={p}
          rule={currentRule}
          onToggle={handleConsumerToggle}
        />
      ) : null,
    [currentRule, handleConsumerToggle],
  );

  return (
    <>
      <div className="flex gap-4 min-h-[calc(100vh-350px)]">
        {/* Key list */}
        <div className="w-56 flex-shrink-0 border-r sf-border-default pr-3 overflow-y-auto max-h-[calc(100vh-350px)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sf-text-muted">Click a key to edit</p>
            <span className="text-xs sf-text-subtle">
              {activeFieldOrder.filter((k) => !k.startsWith("__grp::")).length}{" "}
              keys
            </span>
          </div>

          {/* Add Key Button + Add Group Button + Bulk Paste */}
          {!showAddForm && !showAddGroupForm && (
            <div className="flex flex-col gap-1 mb-2">
              <div className="flex gap-1">
                <button
                  onClick={() => setShowAddForm(true)}
                  className={`${btnSecondary} flex-1 text-xs`}
                >
                  + Add Key
                </button>
                <button
                  onClick={() => setShowAddGroupForm(true)}
                  className={`${btnSecondary} flex-1 text-xs`}
                >
                  + Add Group
                </button>
              </div>
              <button
                onClick={() => setBulkOpen(true)}
                className={`${btnSecondary} w-full text-xs`}
              >
                Bulk Paste
              </button>
            </div>
          )}

          {/* Add Key Inline Form */}
          {showAddForm && (
            <div className="mb-3 p-2 rounded sf-callout sf-callout-info space-y-1.5">
              <input
                autoFocus
                className={`${inputCls} w-full text-xs`}
                placeholder="new_field_key"
                value={addKeyValue}
                onChange={(e) => setAddKeyValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddKey();
                  if (e.key === "Escape") {
                    setShowAddForm(false);
                    setAddKeyValue("");
                  }
                }}
              />
              {addKeyValue &&
                validateNewKeyTs(addKeyValue.trim(), activeFieldOrder) && (
                  <p className="text-[10px] sf-danger-text-soft">
                    {validateNewKeyTs(addKeyValue.trim(), activeFieldOrder)}
                  </p>
                )}
              <select
                className={`${selectCls} w-full text-xs`}
                value={addKeyGroup}
                onChange={(e) => setAddKeyGroup(e.target.value)}
              >
                <option value="">Group: ungrouped</option>
                {existingGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <button
                  onClick={handleAddKey}
                  disabled={
                    !!validateNewKeyTs(addKeyValue.trim(), activeFieldOrder)
                  }
                  className={`${btnPrimary} text-xs py-1 flex-1`}
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setAddKeyValue("");
                  }}
                  className={`${btnSecondary} text-xs py-1 flex-1`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Add Group Inline Form */}
          {showAddGroupForm && (
            <div className="mb-3 p-2 rounded sf-callout sf-callout-success space-y-1.5">
              <input
                autoFocus
                className={`${inputCls} w-full text-xs`}
                placeholder="Group name"
                value={addGroupValue}
                onChange={(e) => setAddGroupValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddGroup();
                  if (e.key === "Escape") {
                    setShowAddGroupForm(false);
                    setAddGroupValue("");
                  }
                }}
              />
              {addGroupValue &&
                validateNewGroupTs(addGroupValue.trim(), existingGroups) && (
                  <p className="text-[10px] sf-danger-text-soft">
                    {validateNewGroupTs(addGroupValue.trim(), existingGroups)}
                  </p>
                )}
              <div className="flex gap-1">
                <button
                  onClick={handleAddGroup}
                  disabled={
                    !!validateNewGroupTs(addGroupValue.trim(), existingGroups)
                  }
                  className={`${btnPrimary} text-xs py-1 flex-1`}
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowAddGroupForm(false);
                    setAddGroupValue("");
                  }}
                  className={`${btnSecondary} text-xs py-1 flex-1`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <DraggableKeyList
            fieldOrder={activeFieldOrder}
            selectedKey={selectedKey}
            editedRules={editedRules}
            rules={editedRules}
            displayLabel={displayLabel}
            onSelectKey={handleSelectKey}
            onReorder={handleReorder}
            selectedGroup={selectedGroup}
            onSelectGroup={handleSelectGroup}
            onDeleteGroup={handleDeleteGroup}
            onRenameGroup={handleRenameGroup}
            existingGroups={existingGroups}
            egLockedKeys={egLockedKeys}
          />
        </div>

        {/* Key detail editor */}
        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-350px)] pr-2">
          {selectedKey && currentRule ? (() => {
            const isSelectedEgLocked = egLockedKeys.includes(selectedKey);
            return (
            <div key={selectedKey} className="space-y-3">
              <KeyStickyHeader
                selectedKey={selectedKey}
                currentRule={currentRule as Record<string, unknown>}
                editedRules={editedRules}
                activeFieldOrder={activeFieldOrder}
                saving={saving}
                saveSuccess={saveSuccess}
                autoSaveEnabled={autoSaveEnabled}
                autoSaveLocked={autoSaveLocked}
                autoSaveLockReason={autoSaveLockReason}
                onSaveAll={handleSaveAll}
                onRenameKey={handleRenameKeyFromHeader}
                onDeleteKey={handleDeleteKey}
                onUpdateLabel={(label) => updateField(selectedKey, "ui.label", label)}
                onSetAutoSaveEnabled={setAutoSaveEnabled}
                updateField={updateField}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
                category={category}
                isEgLocked={egLockedKeys.includes(selectedKey)}
              />

              {EG_TOGGLEABLE_KEY_SET.has(selectedKey) && (
                <label className="flex items-center gap-2 px-3 py-2 text-xs sf-surface-alt rounded border sf-border-soft mt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={egToggles[selectedKey] !== false}
                    onChange={(e) => {
                      const ctx = registeredColors.length > 0 ? { colorNames: registeredColors } : undefined;
                      const preset = getEgPresetForKey(selectedKey, ctx);
                      if (preset) setEgToggle(selectedKey, e.target.checked, preset);
                    }}
                    className="rounded sf-border-soft"
                  />
                  <span className="font-medium sf-text-default">EG Defaults</span>
                  <span className="sf-text-subtle">Lock and pre-populate with EG format</span>
                </label>
              )}

              {/*ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Field Coupling Summary ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ */}
              {(() => {
                const pt = strN(
                  currentRule,
                  "parse.template",
                  strN(currentRule, "parse_template"),
                );
                const es = strN(
                  currentRule,
                  "enum.source",
                  strN(currentRule, "enum_source"),
                );
                const ep = strN(
                  currentRule,
                  "enum.policy",
                  strN(currentRule, "enum_policy", "open"),
                );
                const ct = strN(currentRule, "component.type");
                const chipCls =
                  "px-2 py-0.5 text-[11px] rounded-full font-medium";
                const isComponent = pt === "component_reference";
                const isBoolean = pt === "boolean_yes_no_unk";
                const isNumeric = [
                  "number_with_unit",
                  "list_of_numbers_with_unit",
                  "list_numbers_or_ranges_with_unit",
                ].includes(pt);
                return (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded border sf-border-default sf-bg-surface-soft sf-dk-surface-800a50 text-xs">
                    <span className="sf-text-subtle font-medium mr-1">
                      Pipeline:
                    </span>
                    <span
                      className={`${chipCls} ${isComponent ? "sf-review-ai-pending-badge" : isBoolean ? "sf-chip-info-strong" : isNumeric ? "sf-chip-orange-strong" : "sf-chip-success-strong"}`}
                    >
                      {pt || "none"}
                    </span>
                    <span className="sf-text-subtle">|</span>
                    <span className="sf-text-muted">
                      Enum: <span className="font-mono">{ep}</span>
                    </span>
                    {es ? (
                      <>
                        <span className="sf-text-subtle">|</span>
                        <span className="sf-text-muted">
                          Source: <span className="font-mono">{es}</span>
                        </span>
                      </>
                    ) : null}
                    {ct ? (
                      <>
                        <span className="sf-text-subtle">|</span>
                        <span
                          className={`${chipCls} sf-review-ai-pending-badge`}
                        >
                          DB: {ct}
                        </span>
                      </>
                    ) : null}
                  </div>
                );
              })()}

              <KeyContractSection
                selectedKey={selectedKey}
                currentRule={currentRule}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
                disabled={isSelectedEgLocked}
              />

              <KeyPrioritySection
                selectedKey={selectedKey}
                currentRule={currentRule}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
                disabled={isSelectedEgLocked}
              />

              <KeyParseRulesSection
                selectedKey={selectedKey}
                currentRule={currentRule}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
                disabled={isSelectedEgLocked}
              />

              {/* ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Enum ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ */}
              <Section
                title="Enum Policy"
                persistKey={`studio:keyNavigator:section:enum:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_enum}
                disabled={isSelectedEgLocked}
              >
                <EnumConfigurator
                  persistTabKey={`studio:keyNavigator:enumSourceTab:${category}:${selectedKey}`}
                  fieldKey={selectedKey}
                  rule={currentRule}
                  knownValues={knownValues}
                  enumLists={enumLists}
                  parseTemplate={strN(
                    currentRule,
                    "parse.template",
                    strN(currentRule, "parse_template"),
                  )}
                  onUpdate={(path, value) =>
                    updateField(selectedKey, path, value)
                  }
                  isEgLocked={isSelectedEgLocked}
                  renderLabelSuffix={(path) => <B p={path} />}
                  onRunConsistency={async (options) => {
                    if (!selectedKey) return;
                    setEnumConsistencyMessage("");
                    setEnumConsistencyError("");
                    try {
                      const result = (await onRunEnumConsistency(
                        selectedKey,
                        options,
                      )) as {
                        applied?: {
                          changed?: number;
                          mapped?: number;
                          kept?: number;
                          uncertain?: number;
                        };
                        skipped_reason?: string | null;
                      };
                      const changed = Number(result?.applied?.changed || 0);
                      if (changed > 0) {
                        setEnumConsistencyMessage(
                          `Consistency applied ${changed} change${changed === 1 ? "" : "s"}.`,
                        );
                      } else if (result?.skipped_reason) {
                        setEnumConsistencyMessage(
                          `Consistency skipped: ${String(result.skipped_reason).replace(/_/g, " ")}.`,
                        );
                      } else {
                        setEnumConsistencyMessage(
                          "Consistency finished with no changes.",
                        );
                      }
                    } catch (error) {
                      setEnumConsistencyError(
                        (error as Error)?.message || "Consistency run failed.",
                      );
                    }
                  }}
                  consistencyPending={enumConsistencyPending}
                  consistencyMessage={enumConsistencyMessage}
                  consistencyError={enumConsistencyError}
                />
              </Section>

              <KeyComponentsSection
                selectedKey={selectedKey}
                currentRule={currentRule}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
                componentSources={componentSources}
                knownValues={knownValues}
                editedRules={editedRules}
                disabled={isSelectedEgLocked}
              />

              <Section
                title={
                  <span className="flex items-center gap-1">
                    Cross-Field Constraints
                    <B p="constraints" />
                  </span>
                }
                persistKey={`studio:keyNavigator:section:constraints:${category}`}
                titleTooltip={STUDIO_TIPS.key_section_constraints}
                disabled={isSelectedEgLocked}
              >
                <KeyConstraintEditor
                  currentKey={selectedKey}
                  constraints={arrN(currentRule, "constraints")}
                  onChange={(next) =>
                    updateField(selectedKey, "constraints", next)
                  }
                  fieldOrder={activeFieldOrder}
                  rules={editedRules}
                />
              </Section>

              <KeyEvidenceSection
                selectedKey={selectedKey}
                currentRule={currentRule}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
                disabled={isSelectedEgLocked}
              />

              <KeyHintsSection
                selectedKey={selectedKey}
                currentRule={currentRule as Record<string, unknown>}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
              />

              <details
                className="mt-2"
                open={showFullRuleJson}
                onToggle={(event) =>
                  setShowFullRuleJson(event.currentTarget.open)
                }
              >
                <summary className="text-xs sf-text-subtle cursor-pointer">
                  Full Rule JSON
                </summary>
                <div className="mt-2">
                  <JsonViewer data={currentRule} maxDepth={3} />
                </div>
              </details>
            </div>
            );
          })() : (
            <div className="text-sm sf-text-subtle mt-12 text-center">
              Select a key from the list to configure its field rule. Each key
              has Contract, Priority, Parse, Enum, Evidence, UI, and Search
              settings.
            </div>
          )}
        </div>
      </div>

      {bulkOpen && (
        <KeyBulkPasteModal
          bulkGridRows={bulkGridRows}
          onGridRowsChange={setBulkGridRows}
          bulkGroup={bulkGroup}
          onBulkGroupChange={setBulkGroup}
          bulkPreviewRows={bulkPreviewRows}
          bulkCounts={bulkCounts}
          bulkReadyRows={bulkReadyRows}
          existingGroups={existingGroups}
          onImport={handleBulkImport}
          onClose={() => {
            setBulkOpen(false);
            setBulkGridRows([]);
            setBulkGroup("");
          }}
        />
      )}
    </>
  );
}

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Field Contract ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Compile & Reports ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
 
