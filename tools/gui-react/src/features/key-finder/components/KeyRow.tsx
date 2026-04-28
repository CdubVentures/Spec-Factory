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
import { FinderRunModelBadge } from '../../../shared/ui/finder/FinderRunModelBadge.tsx';
import { PromptDrawerChevron } from '../../../shared/ui/finder/PromptDrawerChevron.tsx';
import { RowActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { KeyTypeIconStrip } from '../../../shared/ui/icons/KeyTypeIcons.tsx';
import { deriveKeyTypeIcons, deriveOwningComponent } from '../../../shared/ui/icons/keyTypeIconHelpers.ts';
import type { KeyEntry, RidingPrimaries } from '../types.ts';
import { LIVE_MODES, TOOLTIPS } from '../types.ts';

// WHY: KeyEntry doesn't carry the raw rule object — keyFinder summary only
// emits the targeted lineage signals (component_run_kind, component_parent_key,
// belongs_to_component). Synthesize a rule-shaped object so the shared
// deriveKeyTypeIcons predicate can run unchanged across all 4 surfaces.
function buildKeyTypeIconInput(entry: KeyEntry) {
  const rule: Record<string, unknown> = {
    variant_dependent: entry.variant_dependent,
    product_image_dependent: entry.product_image_dependent,
  };
  if (entry.component_run_kind === 'component') {
    rule.enum = { source: `component_db.${entry.field_key}` };
  } else if (
    entry.component_run_kind === 'component_brand'
    || entry.component_run_kind === 'component_link'
  ) {
    rule.component_identity_projection = {
      component_type: entry.component_parent_key,
      facet: entry.component_run_kind === 'component_brand' ? 'brand' : 'link',
    };
  }
  return {
    rule,
    fieldKey: entry.field_key,
    belongsToComponent: entry.belongs_to_component || '',
  };
}

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
 * item — the cell wraps to additional lines within the column width.
 * null/undefined/"unk" render as blank display state.
 */
function renderValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' && value.trim().toLowerCase() === 'unk') return '—';
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
  if (value == null || (typeof value === 'string' && value.trim().toLowerCase() === 'unk')) return 'sf-text-subtle';
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

function renderBundleCost(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function DedicatedCell({ title }: { readonly title: string }) {
  return (
    <span className="sf-text-subtle text-[11.5px] font-mono" title={title}>
      N/A
    </span>
  );
}

/**
 * Render the Riding column — one chip per primary currently carrying this key
 * as a passenger, each with a live spinner. Empty state shows em-dash. List
 * updates live as ops complete: the selector filters on status='running', so
 * a primary's chip drops the moment its op terminates.
 */
function RidingCell({ primaries, dedicated }: { readonly primaries: RidingPrimaries; readonly dedicated: boolean }) {
  if (dedicated) {
    return <DedicatedCell title="Component identity keys run dedicated and cannot ride as passengers." />;
  }
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
function PassengersCell({ passengers, dedicated }: { readonly passengers: RidingPrimaries; readonly dedicated: boolean }) {
  if (dedicated) {
    return <DedicatedCell title="Component identity keys run dedicated and cannot carry passengers." />;
  }
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

/**
 * Shared check-mark SVG. Used by the Status column (formerly Concrete) when a
 * field meets the 95/3 bar, AND by the Published column (formerly Status) in
 * place of the literal "resolved" label so the eye reads both columns the
 * same visual way.
 */
function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden focusable="false">
      <path
        d="M3.5 8.5 L6.5 11.5 L12.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Render the Status column — centered checkmark when the field's top bucket
 * publishes under the stricter passenger-exclude thresholds (default 95 conf
 * / 3 refs), "Improvable" when there's data but below the bar, em-dash when
 * no candidates exist. Boolean is computed server-side via isConcreteEvidence
 * → evaluateFieldBuckets, so the UI indicator can never drift from the
 * runtime exclusion decision.
 */
function ConcreteBadge({
  concrete,
  confidence,
  evidenceCount,
}: {
  readonly concrete: boolean;
  readonly confidence: number | null;
  readonly evidenceCount: number | null;
}) {
  const hasData = confidence !== null;
  if (concrete) {
    const tip = `Concrete evidence met (publisher evaluator): ${confidence ?? '—'} conf, ${evidenceCount ?? '—'} refs. Peer won't ride as a passenger until the knobs change.`;
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full sf-chip-success"
        title={tip}
        aria-label="Concrete evidence met"
      >
        <CheckMark />
      </span>
    );
  }
  if (hasData) {
    return (
      <span
        className="text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted"
        title={`Improvable: ${confidence ?? '—'} conf, ${evidenceCount ?? '—'} refs. Below the concrete bar; peer remains eligible to ride as passenger so bundling accumulates more evidence.`}
      >
        Improvable
      </span>
    );
  }
  return (
    <span
      className="sf-text-subtle text-[11.5px]"
      title="No candidate data yet."
    >
      —
    </span>
  );
}

function BundlePreviewText({
  passengers,
  pool,
  totalCost,
  dedicated,
}: {
  readonly passengers: ReadonlyArray<{ readonly field_key: string; readonly cost: number }>;
  readonly pool: number;
  readonly totalCost: number;
  readonly dedicated: boolean;
}) {
  if (dedicated) {
    return <DedicatedCell title="Dedicated component identity run. Passengers are forbidden." />;
  }
  const used = renderBundleCost(totalCost);
  const capacity = renderBundleCost(pool);
  const passengerDetail = passengers.map((p) => `${p.field_key} (${renderBundleCost(p.cost)})`).join(', ');
  const title = pool > 0
    ? `Next bundle preview — what a fresh Run / Loop would pack RIGHT NOW. Budget ${used}/${capacity}. ${passengers.length} passenger${passengers.length === 1 ? '' : 's'}: ${passengerDetail || '—'}. Preview reflects Loop mode — Run mode is always solo when alwaysSoloRun is ON. For the running op's actual packed list see the Passengers column.`
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
        {used}/{capacity}
      </span>
      {passengers.length === 0 ? (
        <span className="sf-text-subtle">—</span>
      ) : (
        <span>
          {passengers.map((p, i) => (
            <span key={p.field_key}>
              {i > 0 ? ', ' : ''}
              {p.field_key}
              <span className="italic text-[10px] sf-text-muted ml-0.5">({renderBundleCost(p.cost)})</span>
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
  const componentRunBlocked = entry.run_blocked_reason === 'component_parent_unpublished';
  const componentResolverAction = entry.component_run_kind === 'component_brand';
  const componentBlockTitle = componentRunBlocked
    ? `Run ${entry.component_parent_key || 'the parent component'} first. Component brand/link are locked until the parent component has a published value.`
    : '';
  const runDisabled = !LIVE_MODES.keyRun || componentRunBlocked;
  const loopDisabled = !LIVE_MODES.keyLoop || loopRunning || loopQueued || componentRunBlocked;
  const loopLabel = loopQueued ? 'Queued' : 'Loop';
  const loopTitle = loopRunning
    ? 'Loop running — use the side panel Stop button to cancel'
    : loopQueued
      ? 'Queued — waiting for its turn in the group Loop chain'
      : componentRunBlocked
        ? componentBlockTitle
        : TOOLTIPS.keyLoop;
  const runTitle = componentRunBlocked ? componentBlockTitle : TOOLTIPS.keyRun;
  const runIntent = componentResolverAction ? 'componentResolver' : 'spammable';
  const loopIntent = componentResolverAction ? 'componentResolverLocked' : 'locked';

  // Unresolve / Delete: disabled while any op is in flight on this key (the
  // server enforces the same gate via 409 key_busy). Unresolve is also
  // disabled when there's no published value — nothing to demote. Delete is
  // disabled when the key has no runs, no candidates, and nothing published —
  // nothing to wipe. Both otherwise render as 'spammable' (destructive but
  // confirm-gated in the parent handler).
  const unresolveDisabled = entry.running || !entry.published;
  const hasAnyData = entry.run_count > 0 || entry.candidate_count > 0 || entry.published;
  const deleteDisabled = entry.running || !hasAnyData;

  const iconInput = buildKeyTypeIconInput(entry);
  const iconKinds = deriveKeyTypeIcons(iconInput);
  const owningComponent = deriveOwningComponent(iconInput);

  return (
    <tr className="border-b sf-border-soft hover:bg-[var(--sf-token-accent-light)]">
      <td className="px-3 py-2 align-middle">
        <span className="inline-flex items-center gap-1.5">
          {iconKinds.length > 0 && (
            <KeyTypeIconStrip kinds={iconKinds} owningComponent={owningComponent} />
          )}
          <code className="text-[12.5px] font-medium sf-text-primary">{entry.field_key}</code>
        </span>
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
          entry.dedicated_run ? (
            <DedicatedCell title="Dedicated component identity run. Passengers are forbidden." />
          ) : (
            <span className="text-[11.5px] sf-text-subtle" title="No bundling pool for this difficulty tier">—</span>
          )
        ) : (
          <BundlePreviewText
            passengers={entry.bundle_preview}
            pool={entry.bundle_pool}
            totalCost={entry.bundle_total_cost}
            dedicated={entry.dedicated_run}
          />
        )}
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap sf-text-subtle text-[11.5px] font-mono">
        {entry.last_model ? (
          <FinderRunModelBadge
            model={entry.last_model}
            accessMode={entry.last_access_mode ?? undefined}
            effortLevel={entry.last_effort_level ?? undefined}
            fallbackUsed={entry.last_fallback_used ?? undefined}
            thinking={entry.last_thinking ?? undefined}
            webSearch={entry.last_web_search ?? undefined}
          />
        ) : (
          '—'
        )}
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
        <ConcreteBadge
          concrete={entry.concrete_evidence}
          confidence={entry.top_confidence}
          evidenceCount={entry.top_evidence_count}
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <RidingCell primaries={entry.ridingPrimaries} dedicated={entry.dedicated_run} />
      </td>
      <td className="px-3 py-2 align-middle">
        <PassengersCell passengers={entry.activePassengers} dedicated={entry.dedicated_run} />
      </td>
      <td className="px-3 py-2 align-middle text-center">
        <ConfidenceRing confidence={confidenceRingValue} />
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        {entry.running ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide sf-status-text-info animate-pulse">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
            running
          </span>
        ) : (
          <span className={`text-[11px] font-bold uppercase tracking-wide ${statusPillClass(entry)}`}>
            {statusLabel(entry)}
          </span>
        )}
      </td>
      <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <RowActionButton
            intent={runIntent}
            label="Run"
            onClick={() => onRun(entry.field_key)}
            disabled={runDisabled}
            title={runTitle}
            width={ACTION_BUTTON_WIDTH.keyRow}
          />
          <RowActionButton
            intent={loopIntent}
            label={loopLabel}
            onClick={() => onLoop(entry.field_key)}
            disabled={loopDisabled}
            busy={loopRunning}
            title={loopTitle}
            width={ACTION_BUTTON_WIDTH.keyRow}
          />
          <span className="inline-block h-5 w-px mx-0.5 bg-current opacity-20" aria-hidden />
          <PromptDrawerChevron
            storageKey={`key-finder:row-drawer:${entry.field_key}`}
            openWidthClass="w-[40rem]"
            ariaLabel={`Prompt + history + data actions for ${entry.field_key}`}
            closedTitle={`Show Prompt / Hist / Data for "${entry.field_key}"`}
            openedTitle={`Hide Prompt / Hist / Data for "${entry.field_key}"`}
            openTitle="Prompts:"
            actions={[
              {
                id: 'prompt',
                label: 'Prompt',
                intent: 'prompt',
                onClick: () => onOpenPrompt(entry.field_key),
                width: ACTION_BUTTON_WIDTH.keyRow,
                title: TOOLTIPS.keyPrompt,
              },
            ]}
            secondaryTitle="Hist:"
            secondaryLabelClass="sf-history-label"
            secondaryCustom={
              <DiscoveryHistoryButton
                finderId="keyFinder"
                productId={productId}
                category={category}
                scope="row"
                fieldKeyFilter={[entry.field_key]}
                width={ACTION_BUTTON_WIDTH.keyRowHistory}
              />
            }
            tertiaryTitle="Data:"
            tertiaryLabelClass="sf-delete-label"
            tertiaryActions={[
              {
                label: 'Unpub',
                onClick: () => onUnresolve(entry.field_key),
                disabled: unresolveDisabled,
                intent: unresolveDisabled ? 'locked' : 'delete',
                width: ACTION_BUTTON_WIDTH.keyRow,
                title: entry.running
                  ? 'Wait for the running op to finish before unpublishing.'
                  : !entry.published
                    ? 'Nothing to unpublish — no published value for this key.'
                    : TOOLTIPS.keyUnpub,
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
