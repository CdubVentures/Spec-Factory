/**
 * KeyGroupSection — collapsible group container with per-group actions.
 *
 * Header: chev + group name + stats + status badge + History (scoped) +
 * Loop group + Run group (the last two are Phase 5 placeholders). Body:
 * keys table via KeyRow.
 */

import { memo, useCallback } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import type { KeyGroup } from '../types.ts';
import { LIVE_MODES, DISABLED_REASONS, TOOLTIPS } from '../types.ts';
import { KeyRow } from './KeyRow.tsx';
import { RowActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { DiscoveryHistoryButton } from '../../../shared/ui/finder/DiscoveryHistoryButton.tsx';
import { PromptDrawerChevron } from '../../../shared/ui/finder/PromptDrawerChevron.tsx';

interface KeyGroupSectionProps {
  readonly group: KeyGroup;
  readonly storeKeyPrefix: string;
  readonly productId: string;
  readonly category: string;
  readonly onRunKey: (fieldKey: string) => void;
  readonly onLoopKey: (fieldKey: string) => void;
  readonly onOpenKeyPrompt: (fieldKey: string) => void;
  readonly onUnpubKey: (fieldKey: string) => void;
  readonly onDeleteKey: (fieldKey: string) => void;
  readonly onUnpubGroup: (groupName: string) => void;
  readonly onDeleteGroup: (groupName: string) => void;
  /** How many keys in this group currently have a published value (drives
   *  the Unresolve group button's enabled state). */
  readonly publishedCount: number;
  /** How many keys have any data (runs, candidates, or published) — drives
   *  the Delete group button's enabled state. */
  readonly dataCount: number;
  readonly onRunGroup: (groupName: string) => void;
  readonly onLoopGroup: (groupName: string) => void;
  /** Non-null when THIS group has an active Loop chain. Drives the progress
   *  label on the "Loop group" button. */
  readonly loopChainProgress?: { readonly current: number; readonly total: number } | null;
  /** True when another group/global Loop line is active. Bulk Loop is a single
   *  ordered line so additional group chains must wait. */
  readonly loopBlockedByChain?: boolean;
  /** True when the Pipeline Settings `alwaysSoloRun` knob is ON. When true,
   *  per-key Run is always solo — the `Next bundle` preview reflects Loop
   *  mode only (Run would show empty passengers). Drives the small sub-label
   *  under the column header so users understand why the preview packs
   *  while their Run fires solo. */
  readonly alwaysSoloRun?: boolean;
}


export const KeyGroupSection = memo(function KeyGroupSection({
  group,
  storeKeyPrefix,
  productId,
  category,
  onRunKey,
  onLoopKey,
  onOpenKeyPrompt,
  onUnpubKey,
  onDeleteKey,
  onUnpubGroup,
  onDeleteGroup,
  publishedCount,
  dataCount,
  onRunGroup,
  onLoopGroup,
  loopChainProgress = null,
  loopBlockedByChain = false,
  alwaysSoloRun = false,
}: KeyGroupSectionProps) {
  const [open, toggle] = usePersistedToggle(`${storeKeyPrefix}:grp:${group.name}`, true);

  const handleRunGroup = useCallback(() => { onRunGroup(group.name); }, [group.name, onRunGroup]);
  const handleLoopGroup = useCallback(() => { onLoopGroup(group.name); }, [group.name, onLoopGroup]);
  const handleUnpubGroup = useCallback(() => { onUnpubGroup(group.name); }, [group.name, onUnpubGroup]);
  const handleDeleteGroup = useCallback(() => { onDeleteGroup(group.name); }, [group.name, onDeleteGroup]);

  const groupFieldKeys = group.keys.map((k) => k.field_key);

  return (
    <div className="border-b sf-border-soft">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2.5 px-5 py-2.5 sf-surface-soft hover:sf-surface-alt cursor-pointer select-none border-b sf-border-soft"
      >
        <span
          className="text-[10px] sf-text-muted shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        >
          ▶
        </span>
        <span className="text-[13.5px] font-bold sf-text-primary">{group.name}</span>
        <span className="text-[11.5px] sf-text-muted font-normal">
          · {group.stats.total} keys · {group.stats.resolved} resolved
          {group.stats.running > 0 ? ` · ${group.stats.running} running` : ''}
        </span>
        <div className="flex-1" />
        <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
          <RowActionButton
            intent={LIVE_MODES.groupRun ? 'spammable' : 'locked'}
            label="Run group"
            onClick={handleRunGroup}
            disabled={!LIVE_MODES.groupRun}
            title={LIVE_MODES.groupRun ? TOOLTIPS.groupRun : DISABLED_REASONS.groupRun}
            width={ACTION_BUTTON_WIDTH.keyGroup}
          />
          <RowActionButton
            intent="locked"
            label={loopChainProgress ? `Loop (${loopChainProgress.current}/${loopChainProgress.total})` : 'Loop group'}
            onClick={handleLoopGroup}
            disabled={!LIVE_MODES.groupLoop || loopBlockedByChain}
            busy={loopChainProgress !== null || loopBlockedByChain}
            title={
              !LIVE_MODES.groupLoop
                ? DISABLED_REASONS.groupLoop
                : loopBlockedByChain
                  ? 'A sorted Loop line is already active. Wait for it to finish before starting another group loop.'
                : loopChainProgress
                  ? `Loop chain in progress for this group (${loopChainProgress.current} of ${loopChainProgress.total}). Cancel the running Loop from the Operations panel to halt.`
                  : TOOLTIPS.groupLoop
            }
            width={ACTION_BUTTON_WIDTH.keyGroup}
          />
          <span className="inline-block h-5 w-px mx-0.5 bg-current opacity-20" aria-hidden />
          <PromptDrawerChevron
            storageKey={`key-finder:group-drawer:${group.name}`}
            openWidthClass="w-[40rem]"
            ariaLabel={`History + data actions for group ${group.name}`}
            closedTitle={`Show Hist / Data for "${group.name}"`}
            openedTitle={`Hide Hist / Data for "${group.name}"`}
            openTitle="Hist:"
            labelClass="sf-history-label"
            primaryCustom={
              <DiscoveryHistoryButton
                finderId="keyFinder"
                productId={productId}
                category={category}
                scope="row"
                fieldKeyFilter={groupFieldKeys}
                width={ACTION_BUTTON_WIDTH.keyGroup}
              />
            }
            secondaryTitle="Data:"
            secondaryLabelClass="sf-delete-label"
            secondaryActions={[
              {
                label: 'Unpub group',
                onClick: handleUnpubGroup,
                disabled: publishedCount === 0,
                intent: publishedCount === 0 ? 'locked' : 'delete',
                width: ACTION_BUTTON_WIDTH.keyGroup,
                title: publishedCount === 0
                  ? 'Nothing to unpublish — no published keys in this group.'
                  : `Demote all ${publishedCount} published key(s) in this group back to candidate. Reversible.`,
              },
              {
                label: 'Delete group',
                onClick: handleDeleteGroup,
                disabled: dataCount === 0,
                intent: dataCount === 0 ? 'locked' : 'delete',
                width: ACTION_BUTTON_WIDTH.keyGroup,
                title: dataCount === 0
                  ? 'Nothing to delete — no keys in this group have runs, candidates, or published values.'
                  : `Wipe every trace of ${dataCount} key(s) in this group. Not reversible.`,
              },
            ]}
          />
        </span>
      </button>
      {open && (
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="sf-surface-soft">
              <th className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[22%]">Key</th>
              <th className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted">Axes</th>
              <th className="px-3 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[64px]" title="Re-Run budget — attempts Loop mode would spend (calcKeyBudget)">Re-Run</th>
              <th
                className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[18%]"
                title={
                  alwaysSoloRun
                    ? "Preview of what a Loop would pack right now (used / pool + passengers with cost breakdown). Per-key Run is solo while alwaysSoloRun is ON — change that setting in Pipeline Settings → Key Finder → Bundling to bundle on Run too. Updates live as registry state changes."
                    : "Preview of what a fresh Run / Loop would pack right now (used / pool + passengers with cost breakdown). Updates live as registry state changes. For what an active run is ACTUALLY carrying, see the Passengers column; for where this key is riding, see the Riding column."
                }
              >
                <div>Next bundle (used/pool)</div>
                {alwaysSoloRun && (
                  <div className="text-[9px] font-normal normal-case tracking-normal sf-text-subtle italic mt-0.5">
                    Loop only — see alwaysSoloRun setting
                  </div>
                )}
              </th>
              <th className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[14%]">Last model</th>
              <th className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[18%]">Value</th>
              <th
                className="px-3 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[70px]"
                title="Status — does the field meet the passenger-exclude thresholds (≥95 conf + ≥3 refs by default) under the publisher's deterministic bucket evaluator? ✓ means the key has earned its way out of the passenger pool; 'Improvable' means it has data but more runs would strengthen it; — means no data yet."
              >
                Status
              </th>
              <th
                className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[12%]"
                title="Primaries currently carrying this key as a passenger. Each chip spins while that primary's LLM call is in flight; drops off live as each call finishes."
              >
                Riding
              </th>
              <th
                className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[12%]"
                title="Keys this row is actively carrying as passengers on its running Run / Loop. Each chip spins while the primary's LLM call is in flight; clears the moment the primary terminates."
              >
                Passengers
              </th>
              <th className="px-3 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[56px]">Conf</th>
              <th
                className="px-3 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[110px]"
                title="Published — has the key crossed the publisher's gate (publishConfidenceThreshold + min_evidence_refs)? ✓ = published/resolved. Stricter maturity (≥95 conf + ≥3 refs) lives in the Status column to the left."
              >
                Published
              </th>
              <th className="px-3 py-1.5 text-right text-[10.5px] font-semibold uppercase tracking-wide sf-text-muted w-[560px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {group.keys.map((entry) => (
              <KeyRow
                key={entry.field_key}
                entry={entry}
                productId={productId}
                category={category}
                onRun={onRunKey}
                onLoop={onLoopKey}
                onOpenPrompt={onOpenKeyPrompt}
                onUnresolve={onUnpubKey}
                onDelete={onDeleteKey}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
});
