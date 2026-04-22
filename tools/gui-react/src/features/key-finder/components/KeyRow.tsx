/**
 * KeyRow — single row for one key in the Key Finder group table.
 *
 * Action buttons (3): ▶ Run (live), ∞ Loop (Phase 3b live), Prompt.
 * Per-key history moved to the panel-header Discovery History drawer (scoped
 * by field_key). Running state is derived from parent (via KeyEntry.running +
 * opMode + opStatus).
 *
 * Button semantics:
 *  - Loop is disabled ONLY when a Loop is running or queued for this key
 *    (opMode='loop' AND opStatus∈{running,queued}). A live Run does NOT lock
 *    the Loop button — they're independent ops. Label is "Loop" | "…" (running)
 *    | "Queued" (chain-pending).
 *  - Run is spammable: stays clickable while a prior Run is in flight. The
 *    server's per-(pid, fieldKey) lock (acquireKeyLock in keyFinderRoutes.js)
 *    serializes concurrent clicks into a queue, and each click registers its
 *    own operation. Disabled only when the run mode is globally gated off.
 */

import { memo } from 'react';
import { ConfidenceRing } from '../../../shared/ui/finder/ConfidenceRing.tsx';
import { DiscoveryHistoryButton } from '../../../shared/ui/finder/DiscoveryHistoryButton.tsx';
import { PromptDrawerChevron } from '../../../shared/ui/finder/PromptDrawerChevron.tsx';
import { RowActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import type { KeyEntry, RidingPrimaries } from '../types.ts';
import { LIVE_MODES, TOOLTIPS } from '../types.ts';

interface KeyRowProps {
  readonly entry: KeyEntry;
  readonly productId: string;
  readonly category: string;
  readonly onRun: (fieldKey: string) => void;
  readonly onLoop: (fieldKey: string) => void;
  readonly onOpenPrompt: (fieldKey: string) => void;
  readonly onUnresolve: (fieldKey: string) => void;
  readonly onDelete: (fieldKey: string) => void;
}

function tagClass(dim: 'difficulty' | 'availability' | 'required', value: string): string {
  if (dim === 'difficulty') {
    if (value === 'easy') return 'sf-chip-success';
    if (value === 'medium') return 'sf-chip-accent';
    if (value === 'hard') return 'sf-chip-warning';
    if (value === 'very_hard') return 'sf-chip-danger';
  }
  if (dim === 'availability') {
    if (value === 'always') return 'sf-chip-accent';
    if (value === 'sometimes') return 'sf-chip-info';
    if (value === 'rare') return 'sf-chip-warning';
  }
  if (dim === 'required') {
    if (value === 'mandatory') return 'sf-chip-purple';
    if (value === 'non_mandatory') return 'sf-chip-neutral';
  }
  return 'sf-chip-neutral';
}

function statusPillClass(entry: KeyEntry): string {
  if (entry.running) return 'sf-status-text-info';
  if (entry.last_status === 'resolved') return 'sf-status-text-success';
  if (entry.last_status === 'below_threshold') return 'sf-status-text-warning';
  if (entry.last_status === 'unk') return 'sf-text-muted';
  if (entry.last_status === 'unresolved') return 'sf-status-text-warning';
  return 'sf-text-subtle';
}

function statusLabel(entry: KeyEntry): string {
  if (entry.running) return 'running';
  if (entry.last_status) return entry.last_status === 'below_threshold' ? 'below threshold' : entry.last_status;
  return '—';
}

/**
 * Render a resolved value as a human-readable string. Arrays show every
 * item — the cell wraps to additional lines within the column width. "unk"
 * is dimmed via the caller's class; null/undefined renders as em-dash.
 */
function renderValue(value: unknown): string {
  if (value == null) return '—';
  if (value === 'unk') return 'unk';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map((v) => String(v)).join(', ')}]`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

function valueClass(value: unknown, running: boolean): string {
  if (running) return 'sf-text-subtle italic';
  if (value == null || value === 'unk') return 'sf-text-subtle';
  return 'sf-text-primary';
}

/**
 * Render the Re-Run budget cell. Shows fractional raw_budget (to 2 decimals,
 * trailing zeros stripped) when non-integer; falls back to the integer
 * attempts value otherwise. Both null → em-dash.
 */
function renderBudget(raw: number | null, attempts: number | null): string {
  if (raw === null && attempts === null) return '—';
  if (raw !== null && !Number.isInteger(raw)) {
    return raw.toFixed(2).replace(/\.?0+$/, '');
  }
  return String(raw ?? attempts);
}

/**
 * Render the Riding column — one chip per primary currently carrying this key
 * as a passenger, each with a live spinner. Empty state shows em-dash. List
 * updates live as ops complete: the selector filters on status='running', so
 * a primary's chip drops the moment its op terminates.
 */
function RidingCell({ primaries }: { readonly primaries: RidingPrimaries }) {
  if (primaries.length === 0) {
    return <span className="sf-text-subtle text-[11.5px]">—</span>;
  }
  const count = primaries.length;
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1 text-[11.5px] font-mono sf-text-primary"
      title={`Currently riding as a passenger on ${count} primary call${count === 1 ? '' : 's'}: ${primaries.join(', ')}. Each spinner clears when its primary's LLM call finishes.`}
    >
      {primaries.map((p) => (
        <span
          key={p}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border sf-border-soft sf-surface-alt"
        >
          <Spinner className="h-2 w-2" />
          <code className="text-[10.5px]">{p}</code>
        </span>
      ))}
    </span>
  );
}

/**
 * Render the Passengers column — dual of RidingCell. One chip per passenger
 * the row's own in-flight primary op is currently carrying, each with a live
 * spinner. Empty when this key isn't running as a primary OR running solo.
 * Clears the instant the primary's op reaches terminal status.
 */
function PassengersCell({ passengers }: { readonly passengers: RidingPrimaries }) {
  if (passengers.length === 0) {
    return <span className="sf-text-subtle text-[11.5px]">—</span>;
  }
  const count = passengers.length;
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1 text-[11.5px] font-mono sf-text-primary"
      title={`Actively carrying ${count} passenger${count === 1 ? '' : 's'}: ${passengers.join(', ')}. Each spinner clears when the primary's LLM call finishes.`}
    >
      {passengers.map((p) => (
        <span
          key={p}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border sf-border-soft sf-surface-alt"
        >
          <Spinner className="h-2 w-2" />
          <code className="text-[10.5px]">{p}</code>
        </span>
      ))}
    </span>
  );
}

function BundlePreviewText({
  passengers,
  pool,
  totalCost,
}: {
  readonly passengers: ReadonlyArray<{ readonly field_key: string; readonly cost: number }>;
  readonly pool: number;
  readonly totalCost: number;
}) {
  const passengerDetail = passengers.map((p) => `${p.field_key} (${p.cost})`).join(', ');
  const title = pool > 0
    ? `Next bundle preview — what a fresh Run / Loop would pack RIGHT NOW. Budget ${totalCost}/${pool}. ${passengers.length} passenger${passengers.length === 1 ? '' : 's'}: ${passengerDetail || '—'}. Preview reflects Loop mode — Run mode is always solo when alwaysSoloRun is ON. For the running op's actual packed list see the Passengers column.`
    : `Bundling pool is 0 for this difficulty.`;
  // "{used}/{pool}" prefix — bundling budget display sitting next to the
  // additional keys per user's request, so the sum is verifiable at a glance.
  const poolBadgeClass = totalCost >= pool && pool > 0
    ? 'sf-chip-success'
    : totalCost === 0
      ? 'sf-chip-neutral'
      : 'sf-chip-info';
  return (
    <span
      className="text-[11.5px] font-mono sf-text-primary whitespace-normal break-words leading-snug inline-flex flex-wrap items-baseline gap-1.5"
      title={title}
    >
      <span
        className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-sm border-[1.5px] border-current ${poolBadgeClass}`}
        title="Bundling budget (used / pool for this primary's difficulty)"
      >
        {totalCost}/{pool}
      </span>
      {passengers.length === 0 ? (
        <span className="sf-text-subtle">—</span>
      ) : (
        <span>
          {passengers.map((p, i) => (
            <span key={p.field_key}>
              {i > 0 ? ', ' : ''}
              {p.field_key}
              <span className="italic text-[10px] sf-text-muted ml-0.5">({p.cost})</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export const KeyRow = memo(function KeyRow({ entry, productId, category, onRun, onLoop, onOpenPrompt, onUnresolve, onDelete }: KeyRowProps) {
  const confidenceRingValue = entry.last_confidence !== null
    ? Math.max(0, Math.min(1, entry.last_confidence / 100))
    : null;

  const valueText = renderValue(entry.last_value);

  // Loop button state derivation. Lock only on Loop's own lifecycle states
  // (running / queued in a chain). A live Run does not lock the Loop — Run
  // and Loop are independent ops with independent server-side locks.
  const loopRunning = entry.opMode === 'loop' && entry.opStatus === 'running';
  const loopQueued = entry.opMode === 'loop' && entry.opStatus === 'queued';
  const loopDisabled = !LIVE_MODES.keyLoop || loopRunning || loopQueued;
  const loopLabel = loopRunning ? '…' : loopQueued ? 'Queued' : 'Loop';
  const loopTitle = loopRunning
    ? 'Loop running — use the side panel Stop button to cancel'
    : loopQueued
      ? 'Queued — waiting for its turn in the group Loop chain'
      : TOOLTIPS.keyLoop;
  const loopIntent: 'locked' | 'spammable' = loopDisabled ? 'locked' : 'spammable';

  // Unresolve / Delete: disabled while any op is in flight on this key (the
  // server enforces the same gate via 409 key_busy). Unresolve is also
  // disabled when there's no published value — nothing to demote. Delete is
  // disabled when the key has no runs, no candidates, and nothing published —
  // nothing to wipe. Both otherwise render as 'spammable' (destructive but
  // confirm-gated in the parent handler).
  const unresolveDisabled = entry.running || !entry.published;
  const hasAnyData = entry.run_count > 0 || entry.candidate_count > 0 || entry.published;
  const deleteDisabled = entry.running || !hasAnyData;

  return (
    <tr className="border-b sf-border-soft hover:bg-[var(--sf-token-accent-light,#edf2ff)]">
      <td className="px-3 py-2 align-middle">
        <code className="text-[12.5px] font-medium sf-text-primary">{entry.field_key}</code>
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          {entry.difficulty && (
            <Chip
              label={entry.difficulty.replace('_', ' ')}
              className={tagClass('difficulty', entry.difficulty)}
            />
          )}
          {entry.availability && (
            <Chip
              label={entry.availability}
              className={tagClass('availability', entry.availability)}
            />
          )}
          {entry.required_level && (
            <Chip
              label={entry.required_level === 'mandatory' ? 'mand' : 'non-mand'}
              className={tagClass('required', entry.required_level)}
            />
          )}
        </span>
      </td>
      <td className="px-3 py-2 align-middle text-center whitespace-nowrap">
        <span
          className="text-[12px] font-mono font-semibold sf-text-primary"
          title={
            entry.raw_budget !== null && entry.budget !== null
              ? `Raw budget ${entry.raw_budget} — Loop spends ceil(raw) = ${entry.budget} attempts.`
              : 'Re-Run budget — attempts Loop mode would spend per calcKeyBudget'
          }
        >
          {renderBudget(entry.raw_budget, entry.budget)}
        </span>
      </td>
      <td className="px-3 py-2 align-middle">
        {entry.bundle_pool === 0 ? (
          <span className="text-[11.5px] sf-text-subtle" title="No bundling pool for this difficulty tier">—</span>
        ) : (
          <BundlePreviewText
            passengers={entry.bundle_preview}
            pool={entry.bundle_pool}
            totalCost={entry.bundle_total_cost}
          />
        )}
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap sf-text-subtle text-[11.5px] font-mono">
        {entry.last_model || '—'}
      </td>
      <td className="px-3 py-2 align-middle">
        <span
          className={`text-[12px] font-mono whitespace-normal break-words leading-snug ${valueClass(entry.last_value, entry.running)}`}
          title={valueText}
        >
          {valueText}
        </span>
      </td>
      <td className="px-3 py-2 align-middle">
        <RidingCell primaries={entry.ridingPrimaries} />
      </td>
      <td className="px-3 py-2 align-middle">
        <PassengersCell passengers={entry.activePassengers} />
      </td>
      <td className="px-3 py-2 align-middle text-center">
        <ConfidenceRing confidence={confidenceRingValue} />
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        <span className={`text-[11px] font-bold uppercase tracking-wide ${statusPillClass(entry)}`}>
          {statusLabel(entry)}
        </span>
      </td>
      <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <DiscoveryHistoryButton
            finderId="keyFinder"
            productId={productId}
            category={category}
            scope="row"
            fieldKeyFilter={[entry.field_key]}
            width={ACTION_BUTTON_WIDTH.keyRowHistory}
          />
          <div style={{ width: 1, height: 16, background: 'var(--sf-token-border, #dee2e6)' }} />
          <RowActionButton
            intent="spammable"
            label="Run"
            onClick={() => onRun(entry.field_key)}
            disabled={!LIVE_MODES.keyRun}
            title={TOOLTIPS.keyRun}
            width={ACTION_BUTTON_WIDTH.keyRow}
          />
          <RowActionButton
            intent={loopIntent}
            label={loopLabel}
            onClick={() => onLoop(entry.field_key)}
            disabled={loopDisabled}
            title={loopTitle}
            width={ACTION_BUTTON_WIDTH.keyRow}
          />
          <RowActionButton
            intent="prompt"
            label="Prompt"
            onClick={() => onOpenPrompt(entry.field_key)}
            title={TOOLTIPS.keyPrompt}
            width={ACTION_BUTTON_WIDTH.keyRow}
          />
          <div style={{ width: 1, height: 16, background: 'var(--sf-token-border, #dee2e6)' }} />
          <PromptDrawerChevron
            storageKey={`key-finder:destructive-drawer:${entry.field_key}`}
            openWidthClass="w-52"
            ariaLabel={`Destructive actions for ${entry.field_key}`}
            closedTitle="Show Unresolve / Delete"
            openedTitle="Hide Unresolve / Delete"
            chevronClass="sf-status-text-danger"
            actions={[
              {
                label: 'Unresolve',
                onClick: () => onUnresolve(entry.field_key),
                disabled: unresolveDisabled,
                intent: unresolveDisabled ? 'locked' : 'delete',
                width: ACTION_BUTTON_WIDTH.keyRow,
                title: entry.running
                  ? 'Wait for the running op to finish before unresolving.'
                  : !entry.published
                    ? 'Nothing to unresolve — no published value for this key.'
                    : TOOLTIPS.keyUnresolve,
              },
              {
                label: 'Delete',
                onClick: () => onDelete(entry.field_key),
                disabled: deleteDisabled,
                intent: deleteDisabled ? 'locked' : 'delete',
                width: ACTION_BUTTON_WIDTH.keyRow,
                title: entry.running
                  ? 'Wait for the running op to finish before deleting.'
                  : !hasAnyData
                    ? 'Nothing to delete — no runs, candidates, or published value for this key.'
                    : TOOLTIPS.keyDelete,
              },
            ]}
          />
        </span>
      </td>
    </tr>
  );
});
