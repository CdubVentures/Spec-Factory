/**
 * CommandConsoleKeysDropdown — per-key Run picker for the catalog Overview
 * Command Console KF chip.
 *
 * Built for prompt-refinement workflows: pick one or a handful of specific
 * keys (e.g. release_year, weight_g) and Run them across the currently
 * selected products. Complements the existing "Run all groups" / "Loop all
 * groups" buttons which fan out every eligible key per product.
 *
 * Also surfaces the `alwaysSoloRun` knob inline. Same backend setting Pipeline
 * Settings → keyFinder → Bundling writes (global scope, auto-resolved by the
 * module-settings authority); both surfaces share the React Query cache key
 * ['module-settings', 'global', 'keyFinder'] so a write in either is visible
 * in the other on the next refetch tick.
 *
 * Dispatch policy lives in the parent (CommandConsole). The dropdown only
 * gathers state and calls back via onRunPicked(pickedKeys).
 */

import { useCallback, useMemo, useState } from 'react';
import { Popover } from '../../shared/ui/overlay/Popover.tsx';
import { Chip } from '../../shared/ui/feedback/Chip.tsx';
import { tagCls } from '../../registries/fieldRuleTaxonomy.ts';
import {
  useReservedKeysQuery,
  useKeyFinderSummaryQuery,
  useKeyFinderBundlingConfigQuery,
} from '../../features/key-finder/api/keyFinderQueries.ts';
import { useModuleSettingsAuthority } from '../../features/pipeline-settings/state/moduleSettingsAuthority.ts';
import {
  parseAxisOrder,
  sortKeysByPriority,
} from '../../features/key-finder/state/keyFinderGroupedRows.ts';
import type { KeyFinderSummaryRow } from '../../features/key-finder/types.ts';
import type { CatalogRow } from '../../types/product.ts';

export interface CommandConsoleKeysDropdownProps {
  readonly category: string;
  readonly selectedProducts: readonly CatalogRow[];
  readonly disabled: boolean;
  /** Called when the user clicks Run picked. Parent owns confirmation
   *  (collision warn, large-batch confirm) and the actual dispatch call. */
  readonly onRunPicked: (pickedKeys: ReadonlySet<string>) => void;
}

interface PickerRow {
  readonly field_key: string;
  readonly difficulty: string;
  readonly availability: string;
  readonly required_level: string;
  readonly resolved: boolean;
  readonly run_blocked_reason: string;
}

function rowFromSummary(summary: KeyFinderSummaryRow): PickerRow {
  return {
    field_key: summary.field_key,
    difficulty: summary.difficulty || '',
    availability: summary.availability || '',
    required_level: summary.required_level || '',
    resolved: summary.published === true || summary.last_status === 'resolved',
    run_blocked_reason: summary.run_blocked_reason || '',
  };
}

function ResolvedCheck() {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full sf-chip-success"
      title="Already resolved"
      aria-label="resolved"
    >
      <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden focusable="false">
        <path
          d="M3.5 8.5 L6.5 11.5 L12.5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function CommandConsoleKeysDropdown({
  category,
  selectedProducts,
  disabled,
  onRunPicked,
}: CommandConsoleKeysDropdownProps) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [filterText, setFilterText] = useState('');

  // Pin master key list to the first selected product. Keys come from
  // category authority so any product yields the same canonical list.
  const firstProductId = selectedProducts[0]?.productId ?? '';

  const reservedQuery = useReservedKeysQuery(category);
  const summaryQuery = useKeyFinderSummaryQuery(category, firstProductId);
  const bundlingQuery = useKeyFinderBundlingConfigQuery(category, firstProductId);
  const settingsAuthority = useModuleSettingsAuthority({ category, moduleId: 'keyFinder' });

  const reservedSet = useMemo<ReadonlySet<string>>(
    () => new Set(reservedQuery.data?.reserved ?? []),
    [reservedQuery.data],
  );

  // The summary + bundling queries are gated on `firstProductId` being
  // non-empty (see useKeyFinderSummaryQuery's `enabled`). If nothing is
  // selected those queries never fire — `data` stays undefined and `isLoading`
  // stays false. We surface that as "Select products first" rather than the
  // ambiguous "Loading keys…" so the user knows what to do.
  const noSelection = selectedProducts.length === 0;
  const queryError = reservedQuery.error || summaryQuery.error || bundlingQuery.error;
  const isFetching = reservedQuery.isLoading || summaryQuery.isLoading || bundlingQuery.isLoading;
  const allReady = !noSelection
    && !queryError
    && !isFetching
    && Array.isArray(summaryQuery.data);

  const visibleRows = useMemo<readonly PickerRow[]>(() => {
    if (!allReady) return [];
    const summary = (summaryQuery.data ?? []) as readonly KeyFinderSummaryRow[];
    const eligible = summary.filter((s) => {
      if (!s.field_key) return false;
      if (reservedSet.has(s.field_key)) return false;
      if (s.variant_dependent === true) return false;
      return true;
    }).map(rowFromSummary);
    const axisOrder = parseAxisOrder(bundlingQuery.data?.sortAxisOrder ?? '');
    const sorted = sortKeysByPriority(eligible, axisOrder);
    if (filterText.trim() === '') return sorted;
    const needle = filterText.toLowerCase().trim();
    return sorted.filter((r) => r.field_key.toLowerCase().includes(needle));
  }, [allReady, summaryQuery.data, reservedSet, bundlingQuery.data, filterText]);

  const blockedKeys = useMemo<ReadonlySet<string>>(
    () => new Set(visibleRows.filter((row) => row.run_blocked_reason).map((row) => row.field_key)),
    [visibleRows],
  );
  const runnablePicked = useMemo<ReadonlySet<string>>(
    () => new Set([...picked].filter((fieldKey) => !blockedKeys.has(fieldKey))),
    [picked, blockedKeys],
  );

  const togglePick = useCallback((fieldKey: string) => {
    if (blockedKeys.has(fieldKey)) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  }, [blockedKeys]);

  const pickAll = useCallback(() => {
    setPicked(new Set(visibleRows.filter((r) => !r.run_blocked_reason).map((r) => r.field_key)));
  }, [visibleRows]);

  const pickNone = useCallback(() => {
    setPicked(new Set<string>());
  }, []);

  // Settings are stored stringified; absent → default ON per the
  // finderSettingsRegistry default (alwaysSoloRun=true).
  const alwaysSoloRun = settingsAuthority.settings.alwaysSoloRun !== 'false';
  const onToggleAlwaysSoloRun = useCallback(() => {
    settingsAuthority.saveSetting('alwaysSoloRun', alwaysSoloRun ? 'false' : 'true');
  }, [settingsAuthority, alwaysSoloRun]);

  const runDisabled = runnablePicked.size === 0 || selectedProducts.length === 0 || settingsAuthority.isSaving;
  const onClickRun = useCallback(() => {
    if (runDisabled) return;
    onRunPicked(runnablePicked);
    // Keep dropdown open so the user can keep tweaking and re-running.
  }, [runDisabled, onRunPicked, runnablePicked]);

  const triggerLabel = `Keys ${picked.size > 0 ? `(${picked.size})` : ''}\u00A0\u25BE`;

  // Block the popover from opening when the chip is disabled (no products
  // selected, or pipeline running). Without this gate the Popover's <span
  // role="button"> wraps the visually-disabled trigger and still toggles
  // open on click, surfacing a "Loading keys…" panel that can never resolve
  // because the per-product summary/bundling queries are gated on a
  // non-empty productId.
  const onOpenChange = useCallback((next: boolean) => {
    if (next && disabled) return;
    setOpen(next);
  }, [disabled]);

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={onOpenChange}
      triggerLabel="KeyFinder per-key picker"
      contentClassName="sf-cc-keys-popover"
      trigger={
        <span
          className={`sf-cc-btn sf-cc-btn-secondary ${disabled ? 'is-disabled' : ''}`}
          aria-disabled={disabled}
          title={disabled ? 'Select products to pick keys' : 'Pick specific keys to run'}
        >
          {triggerLabel}
        </span>
      }
    >
      <div className="sf-cc-keys-body" role="group" aria-label="Per-key Run picker">
        <div className="sf-cc-keys-toggle-row">
          <label className="sf-cc-keys-toggle">
            <input
              type="checkbox"
              checked={alwaysSoloRun}
              onChange={onToggleAlwaysSoloRun}
              disabled={settingsAuthority.isLoading || settingsAuthority.isSaving}
              aria-label="Always solo Run"
            />
            <span>Always solo Run</span>
          </label>
          <span
            className="sf-cc-keys-toggle-tip"
            title="Mirrored to Pipeline Settings → keyFinder → Bundling. When ON, Run never packs passengers regardless of bundlingEnabled. Loop ignores this knob."
            aria-hidden
          >
            ?
          </span>
        </div>

        {noSelection ? (
          <div className="sf-cc-keys-loading">Select products first.</div>
        ) : queryError ? (
          <div className="sf-cc-keys-loading">Failed to load keys: {String((queryError as Error)?.message ?? queryError)}</div>
        ) : !allReady ? (
          <div className="sf-cc-keys-loading">Loading keys…</div>
        ) : (
          <>
            <div className="sf-cc-keys-filter-row">
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter keys…"
                className="sf-cc-keys-filter"
                aria-label="Filter keys"
              />
              <button
                type="button"
                className="sf-cc-btn sf-cc-btn-link"
                onClick={pickAll}
                disabled={visibleRows.length === 0}
                title="Select every visible key"
              >
                All
              </button>
              <button
                type="button"
                className="sf-cc-btn sf-cc-btn-link"
                onClick={pickNone}
                disabled={picked.size === 0}
                title="Clear selection"
              >
                None
              </button>
            </div>

            <div className="sf-cc-keys-list" role="listbox" aria-label="Available keys">
              {visibleRows.length === 0 ? (
                <div className="sf-cc-keys-empty">
                  {filterText.trim() === '' ? 'No keys available.' : 'No matches.'}
                </div>
              ) : (
                visibleRows.map((row) => {
                  const isPicked = picked.has(row.field_key);
                  const blocked = Boolean(row.run_blocked_reason);
                  return (
                    <label
                      key={row.field_key}
                      className={`sf-cc-keys-row ${isPicked ? 'is-picked' : ''} ${blocked ? 'is-disabled' : ''}`}
                      title={blocked ? 'Run the parent component first. Component brand/link are locked until the parent component publishes.' : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={isPicked}
                        disabled={blocked}
                        onChange={() => togglePick(row.field_key)}
                        aria-label={`Pick ${row.field_key}`}
                      />
                      <code className="sf-cc-keys-row-name">{row.field_key}</code>
                      <span className="sf-cc-keys-row-chips">
                        {row.difficulty && (
                          <Chip label={row.difficulty.replace('_', ' ')} className={tagCls('difficulty', row.difficulty)} />
                        )}
                        {row.availability && (
                          <Chip label={row.availability} className={tagCls('availability', row.availability)} />
                        )}
                        {row.required_level && (
                          <Chip
                            label={row.required_level === 'mandatory' ? 'mand' : 'non-mand'}
                            className={tagCls('required', row.required_level)}
                          />
                        )}
                      </span>
                      <span className="sf-cc-keys-row-resolved">
                        {row.resolved ? <ResolvedCheck /> : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="sf-cc-keys-footer">
              <span className="sf-cc-keys-footer-meta">
                {picked.size} picked · {selectedProducts.length} product{selectedProducts.length === 1 ? '' : 's'}
                {' '}= {runnablePicked.size * selectedProducts.length} ops
              </span>
              <button
                type="button"
                className="sf-cc-btn sf-cc-btn-primary"
                onClick={onClickRun}
                disabled={runDisabled}
                title={
                  selectedProducts.length === 0
                    ? 'Select products first'
                    : runnablePicked.size === 0
                      ? 'Pick at least one key'
                      : `Run ${runnablePicked.size} key${runnablePicked.size === 1 ? '' : 's'} across ${selectedProducts.length} product${selectedProducts.length === 1 ? '' : 's'}`
                }
              >
                Run picked ({runnablePicked.size})
              </button>
            </div>
          </>
        )}
      </div>
    </Popover>
  );
}
