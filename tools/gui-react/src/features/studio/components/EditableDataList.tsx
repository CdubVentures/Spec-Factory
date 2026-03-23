import { useState } from "react";
import { usePersistedToggle } from "../../../stores/collapseStore";
import { Tip } from "../../../shared/ui/feedback/Tip";
import { TagPicker } from "../../../shared/ui/forms/TagPicker";
import {
  selectCls,
  inputCls,
  labelCls,
  STUDIO_TIPS,
  NORMALIZE_MODES,
} from "./studioConstants";
import { btnDanger, type DataListEntry } from "./studioSharedTypes";
import { displayLabel } from "../state/studioDisplayLabel";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "../state/studioNumericKnobBounds";
import {
  clampNumber,
  parseBoundedIntInput,
  parseOptionalPositiveIntInput,
} from "../state/numericInputHelpers";
import {
  normalizeAiAssistConfig,
  normalizePriorityProfile,
  deriveAiModeFromPriority,
  deriveAiCallsFromEffort,
} from "../state/studioPriority";
import type { PriorityProfile, AiAssistConfig } from "../../../types/studio";

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

      {/* List review priority / effort */}
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
          <div className="grid grid-cols-4 gap-2">
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
                  updatePriority({ required_level: e.target.value })
                }
              >
                <option value="identity">identity</option>
                <option value="required">required</option>
                <option value="critical">critical</option>
                <option value="expected">expected</option>
                <option value="optional">optional</option>
                <option value="editorial">editorial</option>
                <option value="commerce">commerce</option>
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
                  updatePriority({ availability: e.target.value })
                }
              >
                <option value="always">always</option>
                <option value="expected">expected</option>
                <option value="sometimes">sometimes</option>
                <option value="rare">rare</option>
                <option value="editorial_only">editorial_only</option>
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
                onChange={(e) => updatePriority({ difficulty: e.target.value })}
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
                <option value="instrumented">instrumented</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>
                Effort (1-10){" "}
                <Tip
                  style={{ position: "relative", left: "-3px", top: "-4px" }}
                  text={STUDIO_TIPS.effort}
                />
              </label>
              <input
                type="number"
                min={STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min}
                max={STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max}
                className={inputCls + " w-full"}
                value={listPriority.effort}
                onChange={(e) =>
                  updatePriority({
                    effort: parseBoundedIntInput(
                      e.target.value,
                      STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min,
                      STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max,
                      STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.fallback,
                    ),
                  })
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* List-level AI assist (same controls as Key Navigator) */}
      <button
        type="button"
        onClick={() => toggleAiSections()}
        className="w-full flex items-center gap-2 mb-2 mt-2"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 border sf-border-soft rounded text-xs font-medium sf-text-muted">
          {showAiSections ? "-" : "+"}
        </span>
        <span className="text-xs font-semibold sf-text-muted">AI Assist</span>
      </button>
      {showAiSections
        ? (() => {
            const explicitMode = listAiAssist.mode || "";
            const strategy = listAiAssist.model_strategy || "auto";
            const explicitCalls = listAiAssist.max_calls || 0;
            const reqLvl = listPriority.required_level;
            const diff = listPriority.difficulty;
            const effort = listPriority.effort;

            const derivedMode = deriveAiModeFromPriority(listPriority);
            const effectiveMode = explicitMode || derivedMode;

            const derivedCalls = deriveAiCallsFromEffort(effort);
            const effectiveCalls =
              explicitCalls > 0 ? Math.min(explicitCalls, 10) : derivedCalls;

            const modeToModel: Record<
              string,
              { model: string; reasoning: boolean }
            > = {
              off: { model: "none", reasoning: false },
              advisory: { model: "gpt-5-low", reasoning: false },
              planner: {
                model: "gpt-5-low -> gpt-5.2-high on escalation",
                reasoning: false,
              },
              judge: { model: "gpt-5.2-high", reasoning: true },
            };
            let effectiveModel = modeToModel[effectiveMode] || modeToModel.off;
            if (strategy === "force_fast")
              effectiveModel = {
                model: "gpt-5-low (forced)",
                reasoning: false,
              };
            else if (strategy === "force_deep")
              effectiveModel = {
                model: "gpt-5.2-high (forced)",
                reasoning: true,
              };

            const explicitNote = listAiAssist.reasoning_note || "";
            const autoNote = [
              `List review for "${entry.field || "list"}".`,
              `Apply ${effectiveMode} mode with evidence-first extraction.`,
              `Required level ${reqLvl}, availability ${listPriority.availability}, difficulty ${diff}, effort ${effort}.`,
              "Return normalized values that match the list policy and preserve supporting evidence refs.",
            ].join(" ");
            const hasExplicit = explicitNote.length > 0;

            return (
              <div className="border sf-border-default dark:sf-border-soft rounded p-2.5 bg-white sf-dk-surface-800a40">
                <h4 className="text-xs font-semibold sf-text-muted mb-2">
                  AI Assist
                  <Tip
                    style={{ position: "relative", left: "-3px", top: "-4px" }}
                    text={STUDIO_TIPS.ai_mode}
                  />
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className={labelCls}>
                      Mode
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.ai_mode}
                      />
                    </label>
                    <select
                      className={selectCls + " w-full"}
                      value={explicitMode}
                      onChange={(e) =>
                        updateAiAssist({ mode: e.target.value || null })
                      }
                    >
                      <option value="">auto ({derivedMode})</option>
                      <option value="off">
                        off - no LLM, deterministic only
                      </option>
                      <option value="advisory">
                        advisory - gpt-5-low, single pass
                      </option>
                      <option value="planner">
                        planner - gpt-5-low -&gt; gpt-5.2-high
                      </option>
                      <option value="judge">
                        judge - gpt-5.2-high, reasoning
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>
                      Model Strategy
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.ai_model_strategy}
                      />
                    </label>
                    <select
                      className={selectCls + " w-full"}
                      value={strategy}
                      onChange={(e) =>
                        updateAiAssist({ model_strategy: e.target.value })
                      }
                    >
                      <option value="auto">auto - mode decides model</option>
                      <option value="force_fast">
                        force_fast - always gpt-5-low
                      </option>
                      <option value="force_deep">
                        force_deep - always gpt-5.2-high
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>
                      Max Calls
                      <Tip
                        text={STUDIO_TIPS.ai_max_calls}
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                      />
                    </label>
                    <input
                      className={inputCls + " w-full"}
                      type="number"
                      min={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.min}
                      max={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.max}
                      value={explicitCalls || ""}
                      onChange={(e) => {
                        const parsed = parseOptionalPositiveIntInput(
                          e.target.value,
                        );
                        updateAiAssist({
                          max_calls:
                            parsed === null
                              ? null
                              : clampNumber(
                                  parsed,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.min,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.max,
                                ),
                        });
                      }}
                      placeholder={`auto (${derivedCalls})`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      Max Tokens
                      <Tip
                        style={{
                          position: "relative",
                          left: "-3px",
                          top: "-4px",
                        }}
                        text={STUDIO_TIPS.ai_max_tokens}
                      />
                    </label>
                    <input
                      className={inputCls + " w-full"}
                      type="number"
                      min={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.min}
                      max={STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.max}
                      step={1024}
                      value={listAiAssist.max_tokens || ""}
                      onChange={(e) => {
                        const parsed = parseOptionalPositiveIntInput(
                          e.target.value,
                        );
                        updateAiAssist({
                          max_tokens:
                            parsed === null
                              ? null
                              : clampNumber(
                                  parsed,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.min,
                                  STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.max,
                                ),
                        });
                      }}
                      placeholder={`auto (${effectiveMode === "off" ? "0" : effectiveMode === "advisory" ? "4096" : effectiveMode === "planner" ? "8192" : "16384"})`}
                    />
                  </div>
                </div>

                <div className="mt-2 text-[11px] sf-bg-surface-soft sf-dk-surface-800a50 rounded p-2 border sf-border-default space-y-1">
                  <div className="text-[10px] font-semibold sf-text-subtle mb-1">
                    Effective AI Configuration
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="sf-text-subtle w-14">Mode:</span>
                    <span className="sf-text-muted">{effectiveMode}</span>
                    {!explicitMode && (
                      <span className="sf-text-subtle italic text-[10px]">
                        (auto from {reqLvl}
                        {diff !== "easy" ? ` + ${diff}` : ""})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="sf-text-subtle w-14">Model:</span>
                    <span className="sf-text-muted font-mono text-[10px]">
                      {effectiveModel.model}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="sf-text-subtle w-14">Budget:</span>
                    <span className="sf-text-muted">
                      {effectiveMode === "off" ? "0" : effectiveCalls} call
                      {effectiveCalls !== 1 ? "s" : ""}
                    </span>
                    {!explicitCalls && effectiveMode !== "off" && (
                      <span className="sf-text-subtle italic text-[10px]">
                        (auto from effort {effort})
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2">
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
              </div>
            );
          })()
        : null}

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
