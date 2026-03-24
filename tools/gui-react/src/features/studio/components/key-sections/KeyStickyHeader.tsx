import { useState, useEffect } from "react";
import { displayLabel } from "../../state/studioDisplayLabel.ts";
import { validateNewKeyTs } from "../../state/keyUtils.ts";
import {
  inputCls,
} from "../studioConstants.ts";
import {
  btnPrimary,
} from "../studioSharedTypes.ts";

export interface KeyStickyHeaderProps {
  selectedKey: string;
  currentRule: Record<string, unknown>;
  editedRules: Record<string, Record<string, unknown>>;
  activeFieldOrder: string[];
  saving: boolean;
  saveSuccess: boolean;
  autoSaveEnabled: boolean;
  autoSaveLocked: boolean;
  autoSaveLockReason: string;
  onSaveAll: () => void;
  onRenameKey: (newKey: string) => void;
  onDeleteKey: () => void;
  onUpdateLabel: (label: string) => void;
  onSetAutoSaveEnabled: (enabled: boolean) => void;
  updateField: (key: string, path: string, value: unknown) => void;
  saveIfAutoSaveEnabled: () => void;
  category: string;
}

export function KeyStickyHeader({
  selectedKey,
  currentRule,
  editedRules,
  activeFieldOrder,
  saving,
  saveSuccess,
  autoSaveEnabled,
  autoSaveLocked,
  onSaveAll,
  onRenameKey,
  onDeleteKey,
  onSetAutoSaveEnabled,
  updateField,
}: KeyStickyHeaderProps) {
  // Label edit state
  const [editingLabel, setEditingLabel] = useState(false);
  const [editLabelValue, setEditLabelValue] = useState("");

  // Rename UI state
  const [renamingKey, setRenamingKey] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset local UI state when selected key changes
  useEffect(() => {
    setRenamingKey(false);
    setEditingLabel(false);
    setConfirmDelete(false);
  }, [selectedKey]);

  function handleRenameKey() {
    const newKey = renameValue.trim();
    if (!selectedKey || !newKey || newKey === selectedKey) {
      setRenamingKey(false);
      return;
    }
    const err = validateNewKeyTs(
      newKey,
      activeFieldOrder.filter((k) => k !== selectedKey),
    );
    if (err) {
      return;
    }
    onRenameKey(newKey);
    setRenamingKey(false);
  }

  return (
    <div className="sticky top-0 bg-white sf-dk-surface-900 z-10 border-b sf-border-default mb-1">
      {editingLabel ? (
        (() => {
          const trimmedLabel = editLabelValue.trim();
          const otherLabels = activeFieldOrder
            .filter(
              (k) => !k.startsWith("__grp::") && k !== selectedKey,
            )
            .map((k) =>
              displayLabel(k, editedRules[k]).toLowerCase(),
            );
          const labelDup =
            trimmedLabel &&
            otherLabels.includes(trimmedLabel.toLowerCase())
              ? "A field with this label already exists"
              : null;
          const labelDisabled = !trimmedLabel || !!labelDup;
          const commitLabel = () => {
            if (labelDisabled) return;
            updateField(selectedKey, "ui.label", trimmedLabel);
            setEditingLabel(false);
          };
          return (
            <div className="flex flex-col justify-center gap-1 px-4 min-h-[44px]">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  className={`${inputCls} text-lg font-semibold py-1 px-2 w-64`}
                  value={editLabelValue}
                  onChange={(e) => setEditLabelValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitLabel();
                    if (e.key === "Escape") setEditingLabel(false);
                  }}
                />
                <button
                  onClick={commitLabel}
                  disabled={labelDisabled}
                  className={`${btnPrimary} px-3 py-1.5 text-xs font-medium`}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingLabel(false)}
                  className="px-3 py-1.5 text-xs sf-text-muted hover:sf-text-muted sf-dk-hover-fg-300"
                >
                  Cancel
                </button>
              </div>
              {labelDup && (
                <span className="text-[10px] sf-danger-text-soft pl-1">
                  {labelDup}
                </span>
              )}
            </div>
          );
        })()
      ) : renamingKey ? (
        (() => {
          const renameErr =
            renameValue && renameValue.trim() !== selectedKey
              ? validateNewKeyTs(
                  renameValue.trim(),
                  activeFieldOrder.filter((k) => k !== selectedKey),
                )
              : null;
          const renameDisabled =
            !renameValue.trim() ||
            renameValue.trim() === selectedKey ||
            !!renameErr;
          return (
            <div className="flex flex-col justify-center gap-1 px-4 min-h-[44px]">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  className={`${inputCls} text-sm font-mono py-1 px-2 w-52`}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !renameDisabled)
                      handleRenameKey();
                    if (e.key === "Escape") setRenamingKey(false);
                  }}
                />
                {renameErr && (
                  <span className="text-[10px] sf-danger-text-soft">
                    {renameErr}
                  </span>
                )}
                <button
                  onClick={handleRenameKey}
                  disabled={renameDisabled}
                  className={`${btnPrimary} px-3 py-1.5 text-xs font-medium`}
                >
                  Save
                </button>
                <button
                  onClick={() => setRenamingKey(false)}
                  className="px-3 py-1.5 text-xs sf-text-muted hover:sf-text-muted sf-dk-hover-fg-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        })()
      ) : (
        <div className="flex items-center gap-3 px-4 min-h-[44px]">
          {/* Identity: label + key */}
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-lg font-semibold sf-text-primary dark:text-white truncate cursor-pointer hover:text-accent transition-colors leading-snug"
              onClick={() => {
                setEditingLabel(true);
                setEditLabelValue(
                  displayLabel(
                    selectedKey,
                    currentRule as Record<string, unknown>,
                  ),
                );
              }}
              title="Click to edit label"
            >
              {displayLabel(
                selectedKey,
                currentRule as Record<string, unknown>,
              )}
            </span>
            <span
              className="text-[10px] sf-text-subtle cursor-pointer hover:text-accent transition-colors flex-shrink-0"
              onClick={() => {
                setEditingLabel(true);
                setEditLabelValue(
                  displayLabel(
                    selectedKey,
                    currentRule as Record<string, unknown>,
                  ),
                );
              }}
            >
              &#9998;
            </span>
            <span className="sf-text-subtle select-none text-lg leading-snug">
              |
            </span>
            <span
              className="text-sm sf-text-muted font-mono truncate cursor-pointer hover:text-accent transition-colors leading-snug"
              onClick={() => {
                setRenamingKey(true);
                setRenameValue(selectedKey);
              }}
              title="Click to rename key"
            >
              {selectedKey}
            </span>
            <span
              className="text-[10px] sf-text-subtle cursor-pointer hover:text-accent transition-colors flex-shrink-0"
              onClick={() => {
                setRenamingKey(true);
                setRenameValue(selectedKey);
              }}
            >
              &#9998;
            </span>
            {Boolean(currentRule._edited) && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full sf-chip-warning-strong flex-shrink-0">
                Modified
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onSaveAll}
              disabled={saving || autoSaveEnabled}
              className={`relative px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-50 ${
                autoSaveEnabled
                  ? "sf-icon-button"
                  : "sf-primary-button"
              }`}
            >
              {saving ? "Saving\u2026" : "Save"}
            </button>
            <button
              onClick={() => {
                if (autoSaveLocked) return;
                onSetAutoSaveEnabled(!autoSaveEnabled);
              }}
              disabled={autoSaveLocked}
              className={`relative px-3 py-1.5 text-xs font-medium rounded transition-colors overflow-visible ${
                autoSaveEnabled
                  ? "sf-primary-button"
                  : "sf-action-button"
              } ${autoSaveLocked ? "opacity-80 cursor-not-allowed" : ""}`}
            >
              {autoSaveLocked
                ? "Auto-Save On (Locked)"
                : autoSaveEnabled
                  ? "Auto-Save On"
                  : "Auto-Save Off"}
              {saving && (
                <span
                  className="absolute inline-block h-2 w-2 rounded-full sf-dot-pending animate-pulse border border-white/90 shadow-sm"
                  style={{ right: "2px", bottom: "2px" }}
                />
              )}
              {!saving && saveSuccess && (
                <span
                  className="absolute inline-block h-2 w-2 rounded-full sf-success-bg-500 border border-white/90 shadow-sm"
                  style={{ right: "2px", bottom: "2px" }}
                />
              )}
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-1.5 text-xs font-medium sf-danger-text rounded border sf-danger-action-outline sf-danger-action-outline-hover transition-colors"
              >
                Delete
              </button>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="text-xs sf-danger-text-soft font-medium">
                  Delete?
                </span>
                <button
                  onClick={() => {
                    onDeleteKey();
                    setConfirmDelete(false);
                  }}
                  className="px-2.5 py-1 text-xs font-medium rounded sf-danger-solid-button"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1 text-xs sf-text-muted hover:sf-text-muted sf-dk-hover-fg-300"
                >
                  No
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
