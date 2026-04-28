import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import type { KeyFinderSummaryRow } from '../../features/key-finder/types.ts';
import { DiscoveryHistoryButton, FinderRunModelBadge, PromptPreviewModal } from '../../shared/ui/finder/index.ts';
import { Popover } from '../../shared/ui/overlay/Popover.tsx';
import { FinderRunPopoverShell } from '../../shared/ui/overlay/FinderRunPopoverShell.tsx';
import { useFireAndForget } from '../../features/operations/hooks/useFireAndForget.ts';
import { useRunningFieldKeys } from '../../features/operations/hooks/useFinderOperations.ts';
import { usePromptPreviewQuery } from '../../features/indexing/api/promptPreviewQueries.ts';
import { useKeyDifficultyModelMap, type DifficultyTier } from '../../features/key-finder/hooks/useKeyDifficultyModelMap.ts';
import { Chip } from '../../shared/ui/feedback/Chip.tsx';
import { tagCls } from '../../registries/fieldRuleTaxonomy.ts';
import './KeyTierPopover.css';

export type KeyTierName = 'easy' | 'medium' | 'hard' | 'very_hard' | 'mandatory';

const TIER_DISPLAY_NAME: Readonly<Record<KeyTierName, string>> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  very_hard: 'Very Hard',
  mandatory: 'Mandatory',
};

const DIFFICULTY_TIER_ORDER: readonly DifficultyTier[] = ['easy', 'medium', 'hard', 'very_hard'];

const MODEL_BADGE_LABEL: Readonly<Record<DifficultyTier, string>> = {
  easy: 'KF-EASY',
  medium: 'KF-MED',
  hard: 'KF-HARD',
  very_hard: 'KF-VHARD',
};

export interface KeyTierPopoverProps {
  readonly productId: string;
  readonly category: string;
  readonly tier: KeyTierName;
  readonly resolved: number;
  readonly total: number;
  readonly trigger: ReactNode;
  readonly triggerLabel?: string;
}

type KeyPromptPreviewState = {
  readonly fieldKey: string;
  readonly mode: 'run' | 'loop';
  readonly label: string;
};

function matchesTier(row: KeyFinderSummaryRow, tier: KeyTierName): boolean {
  if (tier === 'mandatory') return row.required_level === 'mandatory';
  return row.difficulty === tier;
}

function formatDifficultyLabel(value: string): string {
  return value.replace('_', ' ');
}

function KeyTierModelSlot({ tier }: { readonly tier: KeyTierName }) {
  const tierMap = useKeyDifficultyModelMap();
  const renderBadge = (difficulty: DifficultyTier) => {
    const resolved = tierMap[difficulty];
    return (
      <FinderRunModelBadge
        key={difficulty}
        labelPrefix={MODEL_BADGE_LABEL[difficulty]}
        model={resolved.model}
        accessMode={resolved.accessMode}
        thinking={resolved.thinking}
        webSearch={resolved.webSearch}
        effortLevel={resolved.effortLevel}
      />
    );
  };

  if (tier === 'mandatory') {
    return <>{DIFFICULTY_TIER_ORDER.map(renderBadge)}</>;
  }

  return renderBadge(tier);
}

/** 5-pointed star — renders at the row's right edge when the key has cleared
 *  the concrete-evidence gate ("not improvable, fully done"). */
function ConcreteStarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="12" height="12" aria-hidden>
      <polygon
        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Per-tier keyFinder popover for the Overview Keys cell. Lazy-loads the
 * keyFinder summary on open, filters to the tier, preserves the natural
 * group ordering from Field Studio, and renders one row per key with Run +
 * Loop buttons scoped to that field_key. Each row pulses while its field_key
 * has a keyFinder op in flight.
 */
export function KeyTierPopover({
  productId, category, tier, resolved, total, trigger, triggerLabel,
}: KeyTierPopoverProps) {
  const [open, setOpen] = useState(false);
  const [promptPreview, setPromptPreview] = useState<KeyPromptPreviewState | null>(null);

  const fire = useFireAndForget({ type: 'kf', category, productId });
  const runningFieldKeys = useRunningFieldKeys('kf', productId);

  const promptPreviewBody = useMemo(() => (
    promptPreview
      ? { field_key: promptPreview.fieldKey, mode: promptPreview.mode }
      : {}
  ), [promptPreview]);
  const promptPreviewQuery = usePromptPreviewQuery(
    'key',
    category,
    productId,
    promptPreviewBody,
    Boolean(promptPreview),
  );

  // Lazy — fetch only when popover is open. React-query dedups across the 5
  // tier popovers so opening several per session still only hits once per
  // staleTime window.
  const { data: summary = [], isLoading } = useQuery<readonly KeyFinderSummaryRow[]>({
    queryKey: ['key-finder', category, productId, 'summary'],
    queryFn: () => api.get<readonly KeyFinderSummaryRow[]>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/summary`,
    ),
    enabled: open && Boolean(productId) && Boolean(category),
    staleTime: 5_000,
  });

  const rowsForTier = useMemo(
    () => summary.filter((r) => matchesTier(r, tier)),
    [summary, tier],
  );

  // Group by rule.group preserving natural order of first appearance.
  const grouped = useMemo(() => {
    const groups: Array<{ group: string; rows: KeyFinderSummaryRow[] }> = [];
    const seenIdx = new Map<string, number>();
    for (const r of rowsForTier) {
      const g = r.group || '';
      let idx = seenIdx.get(g);
      if (idx === undefined) {
        idx = groups.length;
        seenIdx.set(g, idx);
        groups.push({ group: g, rows: [] });
      }
      groups[idx].rows.push(r);
    }
    return groups;
  }, [rowsForTier]);

  const runUrl = `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;

  const handleRun = useCallback((fieldKey: string) => {
    fire(runUrl, { field_key: fieldKey, mode: 'run' }, { fieldKey });
  }, [fire, runUrl]);

  const handleLoop = useCallback((fieldKey: string) => {
    fire(runUrl, { field_key: fieldKey, mode: 'loop' }, { subType: 'loop', fieldKey });
  }, [fire, runUrl]);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      triggerLabel={triggerLabel ?? `${TIER_DISPLAY_NAME[tier]} — ${resolved}/${total} resolved`}
      contentClassName="sf-ktp-panel"
      trigger={trigger}
    >
      <FinderRunPopoverShell
        title={`Key Finder — ${TIER_DISPLAY_NAME[tier]}`}
        meta={<>{resolved}/{total} resolved</>}
        modelSlot={<KeyTierModelSlot tier={tier} />}
      >
        <div className="sf-ktp-legend" aria-label="Row state legend">
          <span className="sf-ktp-legend-item">
            <span className="sf-ktp-legend-sw sf-ktp-legend-sw-done" />
            Published
          </span>
          <span className="sf-ktp-legend-item">
            <span className="sf-ktp-legend-sw sf-ktp-legend-sw-part" />
            Below threshold
          </span>
          <span className="sf-ktp-legend-item">
            <ConcreteStarIcon className="sf-ktp-legend-star" />
            Perfect
          </span>
        </div>
        <div className="sf-ktp-list-wrap">
          {isLoading && rowsForTier.length === 0 ? (
            <div className="sf-ktp-empty">Loading keys&hellip;</div>
          ) : rowsForTier.length === 0 ? (
            <div className="sf-ktp-empty">No keys in this tier</div>
          ) : (
            <ul className="sf-ktp-list">
              {grouped.map(({ group, rows }) => (
                <li key={group || '_nogroup_'} className="sf-ktp-group">
                  {group && <div className="sf-ktp-group-label">{group}</div>}
                  <ul className="sf-ktp-group-rows">
                    {rows.map((r) => {
                      const busy = runningFieldKeys.has(r.field_key);
                      const blocked = r.run_blocked_reason === 'component_parent_unpublished';
                      const componentResolverAction = r.component_run_kind === 'component_brand';
                      const runButtonClass = componentResolverAction ? 'sf-warning-button-solid' : 'sf-ktp-btn-primary';
                      const loopButtonClass = componentResolverAction ? 'sf-warning-button-solid' : 'sf-ktp-btn-secondary';
                      const blockedTitle = 'Run the parent component first. Component brand/link are locked until the parent component publishes.';
                      const stateClass = r.published
                        ? 'sf-ktp-row-done'
                        : r.last_status === 'below_threshold' ? 'sf-ktp-row-part' : '';
                      return (
                        <li
                          key={r.field_key}
                          className={`sf-ktp-row ${stateClass} ${busy ? 'sf-ktp-row-busy' : ''}`}
                        >
                          <span className="sf-ktp-row-label" title={r.field_key}>
                            <span className="sf-ktp-row-label-text">{r.label || r.field_key}</span>
                            {tier === 'mandatory' && r.difficulty && (
                              <span className="sf-ktp-row-difficulty">
                                <Chip
                                  label={formatDifficultyLabel(r.difficulty)}
                                  className={tagCls('difficulty', r.difficulty)}
                                />
                              </span>
                            )}
                            {r.concrete_evidence && (
                              <ConcreteStarIcon className="sf-ktp-row-star" />
                            )}
                          </span>
                          <span className="sf-ktp-row-actions">
                            <span className="sf-ktp-row-action-cell">
                              <button
                                type="button"
                                className={`sf-ktp-btn ${runButtonClass}`}
                                disabled={blocked}
                                onClick={() => handleRun(r.field_key)}
                                title="Run this key once — fire-and-forget; spam-click to queue multiple runs"
                              >
                                Run
                              </button>
                              <button
                                type="button"
                                className="sf-prompt-preview-button sf-ktp-btn-prompt"
                                onClick={() => setPromptPreview({ fieldKey: r.field_key, mode: 'run', label: `${r.label || r.field_key} — Run` })}
                                title="Preview the Run prompt for this key"
                                aria-label={`Preview the Run prompt for ${r.label || r.field_key}`}
                              >
                                Prompt
                              </button>
                            </span>
                            <span className="sf-ktp-row-action-cell">
                              <button
                                type="button"
                                className={`sf-ktp-btn ${loopButtonClass}`}
                                disabled={busy || blocked}
                                onClick={() => handleLoop(r.field_key)}
                                title={blocked ? blockedTitle : 'Loop this key until the concrete gate passes or budget is spent'}
                              >
                                Loop
                              </button>
                              <button
                                type="button"
                                className="sf-prompt-preview-button sf-ktp-btn-prompt"
                                onClick={() => setPromptPreview({ fieldKey: r.field_key, mode: 'loop', label: `${r.label || r.field_key} — Loop` })}
                                title="Preview the Loop prompt (iteration 1) for this key"
                                aria-label={`Preview the Loop prompt for ${r.label || r.field_key}`}
                              >
                                Prompt
                              </button>
                            </span>
                            <DiscoveryHistoryButton
                              finderId="keyFinder"
                              productId={productId}
                              category={category}
                              scope="row"
                              fieldKeyFilter={[r.field_key]}
                              width="w-28"
                            />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </FinderRunPopoverShell>

      <PromptPreviewModal
        open={Boolean(promptPreview)}
        onClose={() => setPromptPreview(null)}
        query={promptPreviewQuery}
        title={`Key Finder — ${promptPreview?.label ?? ''}`}
        subtitle={promptPreview ? `field_key: ${promptPreview.fieldKey}` : undefined}
        storageKeyPrefix={`overview:key:preview:${productId}:${promptPreview?.fieldKey ?? ''}:${promptPreview?.mode ?? ''}`}
      />
    </Popover>
  );
}
