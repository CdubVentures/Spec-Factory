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
import { Spinner } from '../feedback/Spinner.tsx';
import './IndexingPanelHeader.css';

export type IndexingPanelId = 'pipeline' | 'cef' | 'pif' | 'rdf' | 'sku' | 'key';

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
  modelStrip,
  historySlot,
  promptSlot,
  actionSlot,
  onRun,
  runLabel = 'Run',
  runDisabled = false,
}: IndexingPanelHeaderProps) {
  const hasRightCluster = Boolean(promptSlot || actionSlot || onRun);
  const showDivider = Boolean(historySlot) && hasRightCluster;

  return (
    <div
      className={`sf-indexing-panel flex items-center gap-2.5 px-6 pt-4 ${collapsed ? 'pb-3' : 'pb-0'}`}
      data-panel={panel}
    >
      <span className="sf-indexing-panel-rail" aria-hidden="true" />

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
        {actionSlot ?? (onRun && (
          <button
            onClick={(e) => { e.stopPropagation(); onRun(); }}
            disabled={sendBusy || runDisabled || isRunning}
            className="w-28 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-primary-button disabled:opacity-40 disabled:cursor-not-allowed text-center"
          >
            {sendBusy ? (
              <span className="flex items-center justify-center gap-1.5"><Spinner className="h-3 w-3" /> Sending...</span>
            ) : runLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
