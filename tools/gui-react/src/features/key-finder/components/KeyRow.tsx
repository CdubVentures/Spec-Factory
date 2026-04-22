/**
 * KeyRow — single row for one key in the Key Finder group table.
 *
 * Action buttons (3): ▶ Run (live), ∞ Loop (Phase 3b live), Prompt.
 * Per-key history moved to the panel-header Discovery History drawer (scoped
 * by field_key). Running state is derived from parent (via KeyEntry.running +
 * opMode + opStatus).
 *
 * Phase 3b button semantics:
 *  - Loop disabled when opMode='loop' (running or queued) — shows spinner if
 *    running, "Queued" pill if queued. Also disabled when opMode='run' is
 *    active (can't queue a Loop on top of a live Run in the UI — the user can
 *    always wait for the Run to finish).
 *  - Run is spammable: stays clickable while a prior Run is in flight. The
 *    server's per-(pid, fieldKey) lock (acquireKeyLock in keyFinderRoutes.js)
 *    serializes concurrent clicks into a queue, and each click registers its
 *    own operation. Disabled only when the run mode is globally gated off.
 */

import { memo } from 'react';
import { ConfidenceRing } from '../../../shared/ui/finder/ConfidenceRing.tsx';
import { RowActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import type { KeyEntry } from '../types.ts';
import { LIVE_MODES, TOOLTIPS } from '../types.ts';

interface KeyRowProps {
  readonly entry: KeyEntry;
  readonly onRun: (fieldKey: string) => void;
  readonly onLoop: (fieldKey: string) => void;
  readonly onOpenPrompt: (fieldKey: string) => void;
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
    ? `Bundling budget ${totalCost}/${pool} used. ${passengers.length} passenger${passengers.length === 1 ? '' : 's'}: ${passengerDetail || '—'}. Preview reflects Loop mode — Run mode is always solo when alwaysSoloRun is ON.`
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

export const KeyRow = memo(function KeyRow({ entry, onRun, onLoop, onOpenPrompt }: KeyRowProps) {
  const confidenceRingValue = entry.last_confidence !== null
    ? Math.max(0, Math.min(1, entry.last_confidence / 100))
    : null;

  const valueText = renderValue(entry.last_value);

  // Phase 3b button state derivation
  const loopRunning = entry.opMode === 'loop' && entry.opStatus === 'running';
  const loopQueued = entry.opMode === 'loop' && entry.opStatus === 'queued';
  const runRunning = entry.opMode === 'run' && entry.opStatus === 'running';
  // Stage C: in-flight registry indicator. When this key is already riding as
  // a passenger elsewhere, the Loop button gets a visual "riding" cue so the
  // user doesn't stack redundant Loops on a key that's already being harvested.
  const ridingElsewhere = !entry.running
    && !loopRunning
    && !loopQueued
    && entry.in_flight_as_passenger_count > 0;

  // Loop: disabled whenever this key has any active op (prevents firing a
  // duplicate Loop or stacking a Loop on top of a running Run). Label shows
  // current state — spinner for running Loop, "Queued" for queued Loop.
  const loopDisabled = !LIVE_MODES.keyLoop || loopRunning || loopQueued || runRunning;
  const loopLabel = loopRunning
    ? '…'
    : loopQueued
      ? 'Queued'
      : ridingElsewhere
        ? `Loop (riding ×${entry.in_flight_as_passenger_count})`
        : 'Loop';
  const loopTitle = loopRunning
    ? 'Loop running — use the side panel Stop button to cancel'
    : loopQueued
      ? 'Queued — waiting for this key to free up'
      : runRunning
        ? 'Run in progress — wait before starting a Loop'
        : ridingElsewhere
          ? TOOLTIPS.keyRiding
          : TOOLTIPS.keyLoop;
  const loopIntent: 'locked' | 'spammable' = loopDisabled ? 'locked' : 'spammable';

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
        </span>
      </td>
    </tr>
  );
});
