import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { KeyContractSection } from "./key-sections/KeyContractSection.tsx";
import { KeyPrioritySection } from "./key-sections/KeyPrioritySection.tsx";
import { KeyAiAssistSection } from "./key-sections/KeyAiAssistSection.tsx";
import { KeyEnumSection } from "./key-sections/KeyEnumSection.tsx";
import { KeyConstraintsSection } from "./key-sections/KeyConstraintsSection.tsx";
import { KeyEvidenceSection } from "./key-sections/KeyEvidenceSection.tsx";
import { KeyTooltipSection } from "./key-sections/KeyTooltipSection.tsx";
import { KeySearchHintsSection } from "./key-sections/KeySearchHintsSection.tsx";
import { KeyStickyHeader } from "./key-sections/KeyStickyHeader.tsx";
import { KeyBulkPasteModal } from "./KeyBulkPasteModal.tsx";
import { usePersistedToggle } from "../../../stores/collapseStore.ts";
import { usePersistedTab } from "../../../stores/tabStore.ts";
import { JsonViewer } from "../../../shared/ui/data-display/JsonViewer.tsx";
import { SystemBadges } from "../workbench/SystemBadges.tsx";
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
import {
  type BulkGridRow,
} from "../../../shared/ui/forms/BulkPasteGrid.tsx";
import {
  strN,
} from "../state/nestedValueHelpers.ts";
import { displayLabel } from "../state/studioDisplayLabel.ts";
import {
  selectCls,
  inputCls,
} from "./studioConstants.ts";

import type { StudioPageActivePanelKeyProps as KeyNavigatorTabProps } from "./studioPagePanelContracts.ts";
import { getEgPresetForKey, EG_TOGGLEABLE_KEY_SET } from "../state/egPresetsClient.ts";
import { isComponentIdentityProjectionLocked } from "../state/componentLockClient.ts";
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
  autoSaveEnabled,
  setAutoSaveEnabled,
  autoSaveLocked,
  autoSaveLockReason,
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
  const [showFullRuleJson, toggleShowFullRuleJson] = usePersistedToggle(
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

  const B = useCallback(
    ({ p }: { p: string }) => <SystemBadges fieldPath={p} />,
    [],
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
            const isSelectedIdentityLocked = isComponentIdentityProjectionLocked(currentRule as Record<string, unknown>);
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
                isIdentityLocked={isSelectedIdentityLocked}
                BadgeRenderer={B}
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
                const contractType = strN(currentRule, "contract.type");
                const contractShape = strN(currentRule, "contract.shape", "scalar");
                const isBoolean = contractType === "boolean";
                const es = isBoolean ? "yes_no" : strN(
                  currentRule,
                  "enum.source",
                  strN(currentRule, "enum_source"),
                );
                const ep = isBoolean ? "closed" : strN(
                  currentRule,
                  "enum.policy",
                  strN(currentRule, "enum_policy", "open"),
                );
                const ctEnumSource = strN(currentRule, "enum.source");
                const ct = ctEnumSource.startsWith("component_db.")
                  ? ctEnumSource.slice("component_db.".length)
                  : "";
                const chipCls =
                  "px-2 py-0.5 text-[11px] rounded-full font-medium";
                const isComponent = !!ct;
                const isNumeric = ["number", "integer", "range", "mixed_number_range"].includes(contractType);
                return (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded border sf-border-default sf-bg-surface-soft sf-dk-surface-800a50 text-xs">
                    <span className="sf-text-subtle font-medium mr-1">
                      Contract:
                    </span>
                    <span
                      className={`${chipCls} ${isComponent ? "sf-review-ai-pending-badge" : isBoolean ? "sf-chip-info-strong" : isNumeric ? "sf-chip-orange-strong" : "sf-chip-success-strong"}`}
                    >
                      {contractType || "none"}
                    </span>
                    <span
                      className={`${chipCls} sf-bg-surface-soft-strong sf-text-muted sf-dk-surface-700 dark:sf-text-subtle`}
                    >
                      {contractShape}
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
                disabled={isSelectedEgLocked || isSelectedIdentityLocked}
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

              <KeyAiAssistSection
                selectedKey={selectedKey}
                currentRule={currentRule}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
                disabled={isSelectedEgLocked}
              />

              <KeyEnumSection
                selectedKey={selectedKey}
                currentRule={currentRule}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
                knownValues={knownValues}
                enumLists={enumLists}
                disabled={isSelectedEgLocked}
              />

              <KeyConstraintsSection
                selectedKey={selectedKey}
                currentRule={currentRule}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
                fieldOrder={activeFieldOrder}
                editedRules={editedRules}
                disabled={isSelectedEgLocked}
              />

              <KeyEvidenceSection
                selectedKey={selectedKey}
                currentRule={currentRule}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
                disabled={isSelectedEgLocked}
              />

              <KeyTooltipSection
                selectedKey={selectedKey}
                currentRule={currentRule as Record<string, unknown>}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
              />

              <KeySearchHintsSection
                selectedKey={selectedKey}
                currentRule={currentRule as Record<string, unknown>}
                updateField={updateField}
                category={category}
                BadgeRenderer={B}
                saveIfAutoSaveEnabled={saveIfAutoSaveEnabled}
              />

              <div className="mt-2">
                <button type="button" onClick={toggleShowFullRuleJson} className="text-xs sf-text-subtle cursor-pointer">
                  Full Rule JSON
                </button>
                {showFullRuleJson && (
                  <div className="mt-2">
                    <JsonViewer data={currentRule} maxDepth={3} />
                  </div>
                )}
              </div>
            </div>
            );
          })() : (
            <div className="text-sm sf-text-subtle mt-12 text-center">
              Select a key from the list to configure its field rule. Each key
              has Contract, Priority, Ai Assist, Enum Policy, Cross-Field
              Constraints, Evidence, Tooltip, and Search Hints settings.
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
 
