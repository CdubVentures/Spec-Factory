// WHY: Generic version of PrefetchTabRow — renders stage tabs for any group.
// Parameterized on the registry entries and group label so all groups share
// identical tab UI without duplication.

import * as Tooltip from '@radix-ui/react-tooltip';
import type { StageEntry } from './stageGroupContracts.ts';
import { buildStageTabState, resolveNextStageTabSelection } from './stageTabUiContracts.ts';

interface StageGroupTabRowProps {
  /** Display label for the group (e.g. "Pre-Fetch", "Fetch") */
  groupLabel: string;
  /** Registry entries to render as tabs */
  registry: readonly StageEntry<string, unknown>[];
  /** Currently active tab key (null = no stage selected / worker mode) */
  activeTab: string | null;
  /** Called when user clicks a tab; receives the key or null to deselect */
  onSelectTab: (tab: string | null) => void;
  /** Set of tab keys that are currently busy (show bounce animation) */
  busyTabs?: Set<string>;
  /** Set of tab keys that are currently disabled */
  disabledTabs?: Set<string>;
}

export function StageGroupTabRow({ groupLabel, registry, activeTab, onSelectTab, busyTabs, disabledTabs }: StageGroupTabRowProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b sf-border-default overflow-x-auto sf-surface-shell">
      <span className="sf-text-caption font-semibold uppercase tracking-wider sf-text-subtle mr-1 shrink-0">
        {groupLabel}
      </span>
      {registry.map((t) => {
        const { isSelected, isBusy, isDisabled, ariaDisabled } = buildStageTabState({
          activeTab,
          tabKey: t.key,
          busyTabs,
          disabledTabs,
        });
        return (
          <Tooltip.Root key={t.key} delayDuration={300}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                aria-disabled={ariaDisabled}
                onClick={() => onSelectTab(resolveNextStageTabSelection({
                  activeTab,
                  tabKey: t.key,
                  disabledTabs,
                }))}
                className={`sf-prefetch-tab-button flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs whitespace-nowrap border transition-colors ${
                  isSelected
                    ? isDisabled
                      ? 'sf-prefetch-tab-selected-disabled'
                      : `sf-prefetch-tab-selected ${t.idleClass}`
                    : isDisabled
                      ? 'border-transparent sf-text-subtle opacity-50'
                      : t.outlineClass
                }`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isDisabled ? 'sf-chip-neutral' : t.markerClass} ${isBusy && !isDisabled ? 'animate-dot-bounce' : ''}`} />
                {t.label}
                {isDisabled && <span className="sf-text-nano sf-text-subtle ml-0.5">OFF</span>}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 max-w-xs px-3 py-2 sf-text-caption leading-snug whitespace-pre-line sf-text-primary sf-surface-elevated border sf-border-default rounded shadow-lg"
                sideOffset={6}
                side="bottom"
              >
                {isDisabled ? `${t.tip}\n\nLLM is disabled for this step.` : t.tip}
                <Tooltip.Arrow className="fill-current sf-text-primary" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
    </div>
  );
}
