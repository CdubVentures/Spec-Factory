import * as Tooltip from '@radix-ui/react-tooltip';
import type { PrefetchTabKey } from '../types';

interface PrefetchTabRowProps {
  activeTab: PrefetchTabKey | null;
  onSelectTab: (tab: PrefetchTabKey | null) => void;
  busyTabs?: Set<PrefetchTabKey>;
  disabledTabs?: Set<PrefetchTabKey>;
}

const TABS: { key: PrefetchTabKey; label: string; markerClass: string; idleClass: string; outlineClass: string; tip: string }[] = [
  {
    key: 'needset',
    label: 'NeedSet',
    markerClass: 'sf-prefetch-dot-success',
    idleClass: 'sf-prefetch-tab-idle-success',
    outlineClass: 'sf-prefetch-tab-outline-success',
    tip: 'Shows which product fields still need data and why.\nEvery field gets a score based on how urgently it needs evidence Ã¢â‚¬â€ the higher the score, the more important it is to find.',
  },
  {
    key: 'brand_resolver',
    label: 'Brand Resolver',
    markerClass: 'sf-prefetch-dot-warning',
    idleClass: 'sf-prefetch-tab-idle-warning',
    outlineClass: 'sf-prefetch-tab-outline-warning',
    tip: 'Identifies the official website for this brand.\nUsed to build targeted search queries like "site:razer.com" so the system prioritizes manufacturer pages first.',
  },
  {
    key: 'search_profile',
    label: 'Search Profile',
    markerClass: 'sf-prefetch-dot-accent',
    idleClass: 'sf-prefetch-tab-idle-accent',
    outlineClass: 'sf-prefetch-tab-outline-accent',
    tip: 'The search plan Ã¢â‚¬â€ all the queries the system will send to search engines.\nBuilt from the product name, missing fields, and the brand\'s official domain.',
  },
  {
    key: 'search_planner',
    label: 'Search Planner',
    markerClass: 'sf-prefetch-dot-warning',
    idleClass: 'sf-prefetch-tab-idle-warning',
    outlineClass: 'sf-prefetch-tab-outline-warning',
    tip: 'An AI that reviews the search plan and suggests additional queries.\nFocuses on hard-to-find fields that the standard templates might miss.',
  },
  {
    key: 'query_journey',
    label: 'Query Journey',
    markerClass: 'sf-prefetch-dot-info',
    idleClass: 'sf-prefetch-tab-idle-info',
    outlineClass: 'sf-prefetch-tab-outline-info',
    tip: 'Story view for query selection and execution.\nShows what was planned first, what was sent, and why each query was selected.',
  },
  {
    key: 'search_results',
    label: 'Search Results',
    markerClass: 'sf-prefetch-dot-accent',
    idleClass: 'sf-prefetch-tab-idle-accent',
    outlineClass: 'sf-prefetch-tab-outline-accent',
    tip: 'Raw results returned by configured providers for each query.\nSupports Google, Bing, DuckDuckGo, SearXNG, and Dual mode, including provider usage counts.',
  },
  {
    key: 'url_predictor',
    label: 'URL Predictor',
    markerClass: 'sf-prefetch-dot-warning',
    idleClass: 'sf-prefetch-tab-idle-warning',
    outlineClass: 'sf-prefetch-tab-outline-warning',
    tip: 'Predicts which URLs are most likely to contain useful specs.\nRanks pages by expected value and flags risky ones like paywalls or blocked sites.',
  },
  {
    key: 'serp_triage',
    label: 'SERP Triage',
    markerClass: 'sf-prefetch-dot-warning',
    idleClass: 'sf-prefetch-tab-idle-warning',
    outlineClass: 'sf-prefetch-tab-outline-warning',
    tip: 'Scores and filters every search result before fetching.\nKeeps high-value pages (manufacturer specs, lab reviews) and drops low-value ones (forums, unrelated products).',
  },
  {
    key: 'domain_classifier',
    label: 'Domain Classifier',
    markerClass: 'sf-prefetch-dot-warning',
    idleClass: 'sf-prefetch-tab-idle-warning',
    outlineClass: 'sf-prefetch-tab-outline-warning',
    tip: 'Checks whether each website is safe and useful to fetch.\nClassifies domains by role (manufacturer, review site, retailer) and blocks known-bad hosts.',
  },
];

export function PrefetchTabRow({ activeTab, onSelectTab, busyTabs, disabledTabs }: PrefetchTabRowProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b sf-border-default overflow-x-auto sf-surface-shell">
      <span className="sf-text-caption font-semibold uppercase tracking-wider sf-text-subtle mr-1 shrink-0">
        Pre-Fetch
      </span>
      {TABS.map((t) => {
        const isSelected = activeTab === t.key;
        const isBusy = busyTabs?.has(t.key) ?? false;
        const isDisabled = disabledTabs?.has(t.key) ?? false;
        return (
          <Tooltip.Root key={t.key} delayDuration={300}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={() => onSelectTab(isSelected ? null : t.key)}
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
