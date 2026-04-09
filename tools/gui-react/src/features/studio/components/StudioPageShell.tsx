import type { ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Tip } from "../../../shared/ui/feedback/Tip.tsx";
import { labelCls } from "./studioConstants.ts";
import {
  STUDIO_TAB_IDS,
  type StudioTabId,
} from "../state/studioPageTabs.ts";

export { STUDIO_TAB_IDS };
export type { StudioTabId };

const subTabs: Array<{ id: StudioTabId; label: string }> = [
  { id: "mapping", label: "1) Mapping Studio" },
  { id: "keys", label: "2) Key Navigator" },
  { id: "contract", label: "3) Field Contract" },
  { id: "reports", label: "4) Compile & Reports" },
];

import { btnPrimary, btnSecondary, sectionCls, actionBtnWidth } from '../../../shared/ui/buttonClasses.ts';

export interface StudioPageShellProps {
  category: string;
  activeTab: StudioTabId;
  onSelectTab: (tab: StudioTabId) => void;
  reportsTabRunning: boolean;
  fieldCount: number;
  compileErrorsCount: number;
  compileWarningsCount: number;
  authorityConflictVersion?: string | null;
  authorityConflictDetectedAt?: string | null;
  onReloadAuthoritySnapshot: () => void;
  onKeepLocalChangesForAuthorityConflict: () => void;
  saveStatusLabel: string;
  saveStatusDot: string;
  savePending: boolean;
  autoSaveAllEnabled: boolean;
  onSaveEdits: () => void;
  onToggleAutoSaveAll: () => void;
  compileStatusLabel: string;
  compileStatusDot: string;
  compilePending: boolean;
  compileProcessRunning: boolean;
  processRunning: boolean;
  onRunCompile: () => void;
  onRefresh: () => void | Promise<void>;
  activePanel: ReactNode;
}

export function StudioPageShell({
  category,
  activeTab,
  onSelectTab,
  reportsTabRunning,
  fieldCount,
  compileErrorsCount,
  compileWarningsCount,
  authorityConflictVersion,
  authorityConflictDetectedAt,
  onReloadAuthoritySnapshot,
  onKeepLocalChangesForAuthorityConflict,
  saveStatusLabel,
  saveStatusDot,
  savePending,
  autoSaveAllEnabled,
  onSaveEdits,
  onToggleAutoSaveAll,
  compileStatusLabel,
  compileStatusDot,
  compilePending,
  compileProcessRunning,
  processRunning,
  onRunCompile,
  onRefresh,
  activePanel,
}: StudioPageShellProps) {
  const saveStudioDocsMut = { isPending: savePending };
  const compileMut = { isPending: compilePending };
  const processStatus = { running: processRunning };
  const runCompileFromStudio = onRunCompile;
  const reloadAuthoritySnapshot = onReloadAuthoritySnapshot;
  const keepLocalChangesForAuthorityConflict =
    onKeepLocalChangesForAuthorityConflict;

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div className={sectionCls}>
            <div className={labelCls}>Category</div>
            <div className="text-lg font-semibold">{category}</div>
          </div>
          <div className={sectionCls}>
            <div className={labelCls}>Contract Keys</div>
            <div className="text-lg font-semibold">{fieldCount}</div>
          </div>
          <div className={sectionCls}>
            <div className={labelCls}>Compile Errors</div>
            <div
              className={`text-lg font-semibold ${compileErrorsCount > 0 ? "sf-danger-text" : "sf-status-text-success"}`}
            >
              {compileErrorsCount}
            </div>
          </div>
          <div className={sectionCls}>
            <div className={labelCls}>Compile Warnings</div>
            <div
              className={`text-lg font-semibold ${compileWarningsCount > 0 ? "sf-status-text-warning" : "sf-status-text-success"}`}
            >
              {compileWarningsCount}
            </div>
          </div>
        </div>

        {authorityConflictVersion ? (
          <div className="rounded-lg sf-callout sf-callout-warning px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[220px]">
                <div className="text-sm font-semibold sf-status-text-warning">
                  Server rules changed while local edits are unsaved
                </div>
                <div className="text-xs sf-status-text-warning mt-1">
                  Choose whether to load the latest authority snapshot or keep
                  your local unsaved changes.
                </div>
                <div className="text-[11px] sf-status-text-warning mt-1">
                  Snapshot: {authorityConflictVersion}
                  {authorityConflictDetectedAt
                    ? ` | detected ${new Date(authorityConflictDetectedAt).toLocaleString()}`
                    : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={reloadAuthoritySnapshot}
                  className={`${btnPrimary} h-9 min-h-9 px-3`}
                >
                  Load Server Snapshot
                </button>
                <button
                  onClick={keepLocalChangesForAuthorityConflict}
                  className={`${btnSecondary} h-9 min-h-9 px-3`}
                >
                  Keep Local Changes
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border sf-border-default bg-white sf-dk-surface-800 p-2">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onSaveEdits}
              disabled={saveStudioDocsMut.isPending || autoSaveAllEnabled}
              className={`${autoSaveAllEnabled ? btnSecondary : btnPrimary} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth}`}
            >
              <span className="w-full text-center font-medium truncate">
                Save Edits
              </span>
              <span className="absolute top-0 right-0 -ml-1 translate-x-1/2 -translate-y-1/2">
                <Tip
                  text={
                    "Save Edits (manual)\n\nWrites your field-rule edits into saved Field Studio docs (map selected_keys + field_overrides)."
                  }
                />
              </span>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span
                    tabIndex={0}
                    aria-label={`Save status: ${saveStatusLabel}`}
                    className={`absolute inline-block h-2.5 w-2.5 rounded-full ${saveStatusDot} border border-white/90 shadow-sm`}
                    style={{ right: "3px", bottom: "3px" }}
                  />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="z-50 max-w-xs px-3 py-2 text-xs leading-snug whitespace-pre-line sf-text-primary bg-white border sf-border-default rounded shadow-lg sf-dk-fg-100 sf-dk-surface-900 dark:sf-border-default"
                    sideOffset={5}
                  >
                    {saveStatusLabel}
                    <Tooltip.Arrow className="sf-tooltip-arrow" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </button>

            <button
              onClick={onToggleAutoSaveAll}
              className={`relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth} transition-colors ${
                autoSaveAllEnabled ? "sf-primary-button" : "sf-action-button"
              }`}
            >
              <span className="w-full text-center font-medium truncate">
                {autoSaveAllEnabled ? "Auto-Save All On" : "Auto-Save All Off"}
              </span>
              <span className="absolute top-0 right-0 -ml-1 translate-x-1/2 -translate-y-1/2">
                <Tip
                  text={
                    "Auto-Save All\n\nWhen enabled, contract and mapping Auto-Save are locked on.\nThis applies to all Field Rules Studio edits."
                  }
                />
              </span>
            </button>

            <button
              onClick={runCompileFromStudio}
              disabled={compileMut.isPending || processStatus.running}
              className={`${btnPrimary} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth}`}
            >
              <span className="w-full text-center font-medium truncate">
                {compileProcessRunning
                  ? "Compiling..."
                  : compileMut.isPending
                    ? "Starting..."
                    : processStatus.running
                      ? "Process Running..."
                      : "Compile & Generate"}
              </span>
              <span className="absolute top-0 right-0 -ml-1 translate-x-1/2 -translate-y-1/2">
                <Tip
                  text={
                    "Compile & Generate Artifacts\n\n" +
                    "Reads your saved Field Studio docs and generates production artifacts:\n\n" +
                    "\u2022 field_rules.json \u2014 compiled field definitions\n" +
                    "\u2022 component_db/*.json \u2014 component databases\n" +
                    "\u2022 known_values.json \u2014 enum / known value lists\n" +
                    "\u2022 key_migrations.json \u2014 key migration mappings\n\n" +
                    "Workflow:\n" +
                    "\u2022 Edit in Studio \u2192 Save Edits (fast preview)\n" +
                    "\u2022 Ready to finalize \u2192 Compile (generates files)\n\n" +
                    "Status values:\n" +
                    '\u2022 "Not compiled" \u2014 saved docs are newer than compile.\n' +
                    '\u2022 "Compiled" \u2014 artifacts are up to date.'
                  }
                />
              </span>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span
                    tabIndex={0}
                    aria-label={`Compile status: ${compileStatusLabel}`}
                    className={`absolute inline-block h-2.5 w-2.5 rounded-full ${compileStatusDot} border border-white/90 shadow-sm`}
                    style={{ right: "3px", bottom: "3px" }}
                  />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="z-50 max-w-xs px-3 py-2 text-xs leading-snug whitespace-pre-line sf-text-primary bg-white border sf-border-default rounded shadow-lg sf-dk-fg-100 sf-dk-surface-900 dark:sf-border-default"
                    sideOffset={5}
                  >
                    {compileStatusLabel}
                    <Tooltip.Arrow className="sf-tooltip-arrow" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </button>

            <button
              onClick={onRefresh}
              className={`${btnSecondary} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap ${actionBtnWidth}`}
            >
              <span className="w-full text-center font-medium truncate">
                Refresh
              </span>
              <span className="absolute top-0 right-0 -ml-1 translate-x-1/2 -translate-y-1/2">
                <Tip
                  text={
                    "Refresh\n\n" +
                    "Clears all caches and reloads from disk:\n\n" +
                    "\u2022 Server field rules cache\n" +
                    "\u2022 Server review layout cache\n" +
                    "\u2022 Browser query cache\n\n" +
                    "When to use:\n" +
                    "\u2022 After editing files outside the GUI\n" +
                    "\u2022 After a manual Field Studio mapping change\n" +
                    "\u2022 If displayed data appears stale"
                  }
                />
              </span>
            </button>
          </div>
        </div>

        <div className="flex border-b sf-border-default">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`relative px-3 py-2 text-sm font-medium border-b-2 ${
                activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent sf-text-muted hover:sf-text-muted"
              } ${tab.id === "reports" ? "pr-7" : ""}`}
            >
              {tab.label}
              {tab.id === "reports" && reportsTabRunning ? (
                <span
                  aria-label="Compile/validation in progress"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <span className="block h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {activePanel}
      </div>
    </Tooltip.Provider>
  );
}
