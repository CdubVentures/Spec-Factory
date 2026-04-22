/**
 * IndexingPanelHeader — single reusable header for all six indexing-lab
 * panels (pipeline, cef, pif, rdf, sku, key). Panel identity drives color
 * (rail + icon chip) via the [data-panel] attribute; slot content is the
 * only thing that varies per caller.
 *
 * Right-cluster layout: historySlot → divider → promptSlot → actionSlot/Run.
 * Divider is rendered only when historySlot is present AND at least one of
 * (promptSlot, actionSlot, onRun) is also present.
 */

import type { ReactNode } from 'react';
import { Chip } from '../feedback/Chip.tsx';
import { Tip } from '../feedback/Tip.tsx';
import { HeaderActionButton } from '../actionButton/index.ts';
import './IndexingPanelHeader.css';

export type IndexingPanelId = 'pipeline' | 'cef' | 'pif' | 'rdf' | 'sku' | 'key' | 'picker';

export interface IndexingPanelHeaderProps {
  readonly panel: IndexingPanelId;
  /** Glyph rendered inside the colored icon chip — matches the tab-bar icon. */
  readonly icon: string;
  readonly title: string;
  readonly tip: string;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly isRunning?: boolean;
  /** True while the POST is in-flight (~50ms). Disables the default Run button during send. */
  readonly sendBusy?: boolean;
  /** Inline status after the title — breadcrumb, selection summary, etc. Picker uses this. */
  readonly subtitleSlot?: ReactNode;
  /** Model chip(s) — 1 for scalar finders, 2 for PIF, 4 tier chips for Key, 5 phase chips for Pipeline. */
  readonly modelStrip?: ReactNode;
  /** Secondary-action slot rendered left-most in the right cluster. */
  readonly historySlot?: ReactNode;
  /** Purple-outline Prompt preview trigger. Rendered after divider. */
  readonly promptSlot?: ReactNode;
  /** When provided, replaces the default Run button entirely (used by PIF, GenericScalar, KeyFinder). */
  readonly actionSlot?: ReactNode;
  /** Default Run button handler. Ignored when actionSlot is provided. */
  readonly onRun?: () => void;
  readonly runLabel?: string;
  readonly runDisabled?: boolean;
  /** When provided + isRunning=true, replaces the Run button with a red Stop button. */
  readonly onStop?: () => void;
  readonly stopLabel?: string;
  readonly stopPending?: boolean;
  /** Shared width class applied to the default Run + Stop buttons so the
   *  entire right cluster (Run/Stop + historySlot + promptSlot) lines up. */
  readonly defaultButtonWidth?: string;
}

export function IndexingPanelHeader({
  panel,
  icon,
  title,
  tip,
  collapsed,
  onToggle,
  isRunning = false,
  sendBusy = false,
  subtitleSlot,
  modelStrip,
  historySlot,
  promptSlot,
  actionSlot,
  onRun,
  runLabel = 'Run',
  runDisabled = false,
  onStop,
  stopLabel = 'Stop',
  stopPending = false,
  defaultButtonWidth,
}: IndexingPanelHeaderProps) {
  const hasRightCluster = Boolean(promptSlot || actionSlot || onRun || onStop);
  const showDivider = Boolean(historySlot) && hasRightCluster;

  return (
    <div
      className={`sf-indexing-panel flex items-center gap-2.5 px-6 pt-4 ${collapsed ? 'pb-3' : 'pb-0'}`}
      data-panel={panel}
    >
      <button
        onClick={onToggle}
        className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button"
        title={collapsed ? 'Expand' : 'Collapse'}
        aria-expanded={!collapsed}
      >
        {collapsed ? '+' : '-'}
      </button>

      <span className="sf-indexing-panel-icon" aria-hidden="true">{icon}</span>

      <span className="text-[15px] font-bold sf-text-primary">{title}</span>
      <Tip text={tip} />

      {subtitleSlot && (
        <span className="sf-indexing-panel-subtitle inline-flex items-center gap-1.5 min-w-0">
          {subtitleSlot}
        </span>
      )}

      {isRunning && (
        <Chip label="Running" className="sf-chip-purple animate-pulse" />
      )}

      {modelStrip && (
        <span className="inline-flex items-center gap-1.5 flex-wrap min-w-0">
          {modelStrip}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {historySlot}
        {showDivider && <span className="sf-indexing-panel-divider" aria-hidden="true" />}
        {promptSlot}
        {actionSlot ?? (
          <>
            {onStop && (
              <HeaderActionButton
                intent="stop"
                label={stopLabel}
                onClick={onStop}
                busy={stopPending}
                disabled={!isRunning}
                title="Force kill the IndexLab process tree and sweep orphan pids."
                width={defaultButtonWidth}
              />
            )}
            {onRun && (
              <HeaderActionButton
                intent="locked"
                label={runLabel}
                onClick={onRun}
                busy={sendBusy}
                disabled={runDisabled || isRunning}
                width={defaultButtonWidth}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
