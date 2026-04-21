import { useState } from "react";
import { usePersistedToggle } from "../../../stores/collapseStore.ts";
import { Tip } from "../../../shared/ui/feedback/Tip.tsx";
import { TagPicker } from "../../../shared/ui/forms/TagPicker.tsx";
import {
  selectCls,
  inputCls,
  labelCls,
  STUDIO_TIPS,
  NORMALIZE_MODES,
} from "./studioConstants.ts";
import { btnDanger, type DataListEntry } from "./studioSharedTypes.ts";
import { displayLabel } from "../state/studioDisplayLabel.ts";
import {
  parseBoundedIntInput,
} from "../state/numericInputHelpers.ts";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../state/studioNumericKnobBounds.ts";
import {
  normalizeAiAssistConfig,
  normalizePriorityProfile,
} from "../state/studioPriority.ts";
import type { PriorityProfile, AiAssistConfig } from "../../../types/studio.ts";

export interface EditableDataListProps {
  entry: DataListEntry;
  index: number;
  isDuplicate: boolean;
  onUpdate: (updates: Partial<DataListEntry>) => void;
  onRemove: () => void;
}

export function EditableDataList({
  entry,
  index,
  isDuplicate,
  onUpdate,
  onRemove,
}: EditableDataListProps) {
  const dlKey = entry.field || `idx-${index}`;
  const [expanded, , setExpanded] = usePersistedToggle(
    `studio:dataList:${dlKey}:expanded`,
    false,
  );
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [showAiSections, toggleAiSections] = usePersistedToggle(
    `studio:dataList:${dlKey}:ai`,
    false,
  );

  const valueCount = entry.manual_values.length;
  const listPriority = normalizePriorityProfile(entry.priority);
  const listAiAssist = normalizeAiAssistConfig(entry.ai_assist);
  const listTitle = entry.field
    ? displayLabel(entry.field)
    : `Enum ${index + 1}`;
  function updatePriority(updates: Partial<PriorityProfile>) {
    onUpdate({ priority: { ...listPriority, ...updates } });
  }
  function updateAiAssist(updates: Partial<AiAssistConfig>) {
    onUpdate({ ai_assist: { ...listAiAssist, ...updates } });
  }

  // Collapsed view
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
            <span className="w-full text-left px-6 truncate">{listTitle}</span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-2">
              {valueCount > 0 ? (
                <span className="text-xs sf-text-muted">
                  {valueCount} values
                </span>
              ) : null}
              {isDuplicate ? (
                <span className="text-xs sf-danger-text-soft font-medium">
                  Duplicate!
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
                  className="px-2 py-1 text-[11px] rounded border sf-border-soft bg-white sf-dk-surface-800 sf-text-muted sf-hover-bg-surface-soft sf-dk-hover-surface-700"
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
    <div className="border sf-border-default rounded p-3 space-y-3 sf-bg-surface-soft sf-dk-surface-750">
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
          <span className="w-full text-left px-6 truncate">{listTitle}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-2">
            {valueCount > 0 ? (
              <span className="text-xs sf-text-muted">{valueCount} values</span>
            ) : null}
            {isDuplicate ? (
              <span className="text-xs sf-danger-text-soft font-medium">
                Duplicate!
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
                className="px-2 py-1 text-[11px] rounded border sf-border-soft bg-white sf-dk-surface-800 sf-text-muted sf-hover-bg-surface-soft sf-dk-hover-surface-700"
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

      {isDuplicate && (
        <div className="text-xs sf-callout sf-callout-danger rounded px-2 py-1">
          Warning: Another data list uses the same field name "{entry.field}".
          Each field should have only one list.
        </div>
      )}

      {/* Identity row: field name + normalize */}
      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className={labelCls}>
            Field Name{" "}
            <Tip
              style={{ position: "relative", left: "-3px", top: "-4px" }}
              text={STUDIO_TIPS.data_list_field}
            />
          </label>
          <input
            className={inputCls + " w-full"}
            value={entry.field}
            onChange={(e) =>
              onUpdate({
                field: e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "_")
                  .replace(/^_+|_+$/g, ""),
              })
            }
            placeholder="e.g. form_factor"
          />
        </div>
        <div>
          <label className={labelCls}>
            Normalize{" "}
            <Tip
              style={{ position: "relative", left: "-3px", top: "-4px" }}
              text={STUDIO_TIPS.data_list_normalize}
            />
          </label>
          <select
            className={selectCls + " w-full"}
            value={entry.normalize}
            onChange={(e) => onUpdate({ normalize: e.target.value })}
          >
            {NORMALIZE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List review priority */}
      <button
        type="button"
        onClick={() => toggleAiSections()}
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
        <div className="border sf-border-default dark:sf-border-soft rounded p-2.5 bg-white sf-dk-surface-800a40">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>
                Required Level{" "}
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.required_level}
                />
              </label>
              <select
                className={selectCls + " w-full"}
                value={listPriority.required_level}
                onChange={(e) =>
                  updatePriority({ required_level: e.target.value as PriorityProfile['required_level'] })
                }
              >
                <option value="mandatory">mandatory</option>
                <option value="non_mandatory">non_mandatory</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>
                Availability{" "}
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.availability}
                />
              </label>
              <select
                className={selectCls + " w-full"}
                value={listPriority.availability}
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
              <label className={labelCls}>
                Difficulty{" "}
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.difficulty}
                />
              </label>
              <select
                className={selectCls + " w-full"}
                value={listPriority.difficulty}
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
        const explicitNote = listAiAssist.reasoning_note || "";
        const autoNote = [
          `List review for "${entry.field || "list"}".`,
          `Required level ${listPriority.required_level}, difficulty ${listPriority.difficulty}.`,
          "Return normalized values that match the list policy and preserve supporting evidence refs.",
        ].join(" ");
        const hasExplicit = explicitNote.length > 0;
        return (
          <div className="border sf-border-default dark:sf-border-soft rounded p-2.5 bg-white sf-dk-surface-800a40 mt-2">
            <div className="flex items-center gap-2 mb-1">
              <span className={labelCls.replace(" mb-1", "")}>
                Extraction Guidance (sent to LLM)
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
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
              onChange={(e) => updateAiAssist({ reasoning_note: e.target.value })}
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

      {/* Manual values */}
      <div>
        <label className={labelCls}>
          Values{" "}
          <Tip
            style={{ position: "relative", left: "-3px", top: "-4px" }}
            text={STUDIO_TIPS.data_list_manual_values}
          />
        </label>
        <TagPicker
          values={entry.manual_values}
          onChange={(v) => onUpdate({ manual_values: v })}
          placeholder="Type a value and press Enter..."
        />
      </div>
    </div>
  );
}
