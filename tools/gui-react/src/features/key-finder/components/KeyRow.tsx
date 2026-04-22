/**
 * KeyRow — single row for one key in the Key Finder group table.
 *
 * Action buttons (3): ▶ Run (live), ∞ Loop (disabled Phase 3b), Prompt.
 * Per-key history moved to the panel-header Discovery History drawer (scoped
 * by field_key). Running state is derived from parent (via KeyEntry.running).
 */

import { memo } from 'react';
import { ConfidenceRing } from '../../../shared/ui/finder/ConfidenceRing.tsx';
import { RowActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import type { KeyEntry } from '../types.ts';
import { LIVE_MODES, DISABLED_REASONS } from '../types.ts';

interface KeyRowProps {
  readonly entry: KeyEntry;
  readonly onRun: (fieldKey: string) => void;
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
 * Render a resolved value as a compact, human-readable string. Arrays become
 * "[usb-c, bluetooth]" (truncated at 3 items), scalars use String(), "unk" is
 * dimmed via the caller's class.
 */
function renderValue(value: unknown): string {
  if (value == null) return '—';
  if (value === 'unk') return 'unk';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const shown = value.slice(0, 3).map((v) => String(v));
    const more = value.length > 3 ? ` +${value.length - 3}` : '';
    return `[${shown.join(', ')}${more}]`;
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

function BundlePreviewText({ passengers }: { readonly passengers: ReadonlyArray<{ readonly field_key: string; readonly cost: number }> }) {
  const total = passengers.reduce((sum, p) => sum + p.cost, 0);
  const title = `Will bundle ${passengers.length} passenger${passengers.length === 1 ? '' : 's'} (total cost ${total}): ${passengers.map((p) => `${p.field_key} (${p.cost})`).join(', ')}`;
  return (
    <span
      className="text-[11.5px] font-mono sf-text-primary whitespace-normal break-words leading-snug"
      title={title}
    >
      {passengers.map((p, i) => (
        <span key={p.field_key}>
          {i > 0 ? ', ' : ''}
          {p.field_key}
          <span className="italic text-[10px] sf-text-muted ml-0.5">({p.cost})</span>
        </span>
      ))}
    </span>
  );
}

export const KeyRow = memo(function KeyRow({ entry, onRun, onOpenPrompt }: KeyRowProps) {
  const confidenceRingValue = entry.last_confidence !== null
    ? Math.max(0, Math.min(1, entry.last_confidence / 100))
    : null;

  const valueText = renderValue(entry.last_value);

  return (
    <tr className="border-b sf-border-soft hover:bg-[var(--sf-token-accent-light,#edf2ff)]">
      <td className="px-3 py-2 align-middle">
        <code className="text-[12.5px] font-medium sf-text-primary">{entry.field_key}</code>
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        {entry.difficulty && (
          <span className={`sf-chip ${tagClass('difficulty', entry.difficulty)} mr-1`}>{entry.difficulty.replace('_', ' ')}</span>
        )}
        {entry.availability && (
          <span className={`sf-chip ${tagClass('availability', entry.availability)} mr-1`}>{entry.availability}</span>
        )}
        {entry.required_level && (
          <span className={`sf-chip ${tagClass('required', entry.required_level)}`}>{entry.required_level === 'mandatory' ? 'mand' : 'non-mand'}</span>
        )}
      </td>
      <td className="px-3 py-2 align-middle text-center whitespace-nowrap">
        <span
          className="text-[12px] font-mono font-semibold sf-text-primary"
          title="Attempt budget (what Loop mode would spend)"
        >
          {entry.budget ?? '—'}
        </span>
      </td>
      <td className="px-3 py-2 align-middle">
        {entry.bundle_preview.length === 0 ? (
          <span className="text-[11.5px] sf-text-subtle">—</span>
        ) : (
          <BundlePreviewText passengers={entry.bundle_preview} />
        )}
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap sf-text-subtle text-[11.5px] font-mono">
        {entry.last_model || '—'}
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        <span
          className={`text-[12px] font-mono truncate inline-block max-w-[200px] ${valueClass(entry.last_value, entry.running)}`}
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
            disabled={entry.running || !LIVE_MODES.keyRun}
            title={entry.running ? 'Already running…' : ''}
            width={ACTION_BUTTON_WIDTH.keyRow}
          />
          <RowActionButton
            intent="locked"
            label="Loop"
            onClick={() => { /* placeholder */ }}
            disabled
            title={DISABLED_REASONS.keyLoop}
            width={ACTION_BUTTON_WIDTH.keyRow}
          />
          <RowActionButton
            intent="prompt"
            label="Prompt"
            onClick={() => onOpenPrompt(entry.field_key)}
            width={ACTION_BUTTON_WIDTH.keyRow}
          />
        </span>
      </td>
    </tr>
  );
});
