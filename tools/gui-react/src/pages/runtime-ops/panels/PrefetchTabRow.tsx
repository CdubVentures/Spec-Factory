import * as Tooltip from '@radix-ui/react-tooltip';
import type { PrefetchTabKey } from '../types';
import { prefetchTabAccent } from '../helpers';

interface PrefetchTabRowProps {
  activeTab: PrefetchTabKey | null;
  onSelectTab: (tab: PrefetchTabKey | null) => void;
  busyTabs?: Set<PrefetchTabKey>;
}

const TABS: { key: PrefetchTabKey; label: string; color: string; tip: string }[] = [
  {
    key: 'needset',
    label: 'NeedSet',
    color: 'bg-emerald-500',
    tip: 'Shows which product fields still need data and why.\nEvery field gets a score based on how urgently it needs evidence — the higher the score, the more important it is to find.',
  },
  {
    key: 'brand_resolver',
    label: 'Brand Resolver',
    color: 'bg-amber-500',
    tip: 'Identifies the official website for this brand.\nUsed to build targeted search queries like "site:razer.com" so the system prioritizes manufacturer pages first.',
  },
  {
    key: 'search_profile',
    label: 'Search Profile',
    color: 'bg-purple-500',
    tip: 'The search plan — all the queries the system will send to search engines.\nBuilt from the product name, missing fields, and the brand\'s official domain.',
  },
  {
    key: 'search_planner',
    label: 'Search Planner',
    color: 'bg-amber-500',
    tip: 'An AI that reviews the search plan and suggests additional queries.\nFocuses on hard-to-find fields that the standard templates might miss.',
  },
  {
    key: 'query_journey',
    label: 'Query Journey',
    color: 'bg-sky-500',
    tip: 'Story view for query selection and execution.\nShows what was planned first, what was sent, and why each query was selected.',
  },
  {
    key: 'search_results',
    label: 'Search Results',
    color: 'bg-purple-500',
    tip: 'Raw results returned by Google or SearXNG for each query.\nShows how many results came back and which search provider was used.',
  },
  {
    key: 'url_predictor',
    label: 'URL Predictor',
    color: 'bg-amber-500',
    tip: 'Predicts which URLs are most likely to contain useful specs.\nRanks pages by expected value and flags risky ones like paywalls or blocked sites.',
  },
  {
    key: 'serp_triage',
    label: 'SERP Triage',
    color: 'bg-amber-500',
    tip: 'Scores and filters every search result before fetching.\nKeeps high-value pages (manufacturer specs, lab reviews) and drops low-value ones (forums, unrelated products).',
  },
  {
    key: 'domain_classifier',
    label: 'Domain Classifier',
    color: 'bg-amber-500',
    tip: 'Checks whether each website is safe and useful to fetch.\nClassifies domains by role (manufacturer, review site, retailer) and blocks known-bad hosts.',
  },
];

export function PrefetchTabRow({ activeTab, onSelectTab, busyTabs }: PrefetchTabRowProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto bg-gray-50 dark:bg-gray-800/50">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1 shrink-0">
        Pre-Fetch
      </span>
      {TABS.map((t) => {
        const isSelected = activeTab === t.key;
        const isBusy = busyTabs?.has(t.key) ?? false;
        return (
          <Tooltip.Root key={t.key} delayDuration={300}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={() => onSelectTab(isSelected ? null : t.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-t text-xs whitespace-nowrap border-b-2 transition-colors ${
                  isSelected
                    ? `bg-white dark:bg-gray-800 ${prefetchTabAccent(t.key)} shadow-sm text-gray-900 dark:text-gray-100`
                    : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 dark:text-gray-400'
                }`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${t.color} ${isBusy ? 'animate-dot-bounce' : ''}`} />
                {t.label}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 max-w-xs px-3 py-2 text-xs leading-snug whitespace-pre-line text-gray-900 bg-white border border-gray-200 rounded shadow-lg dark:text-gray-100 dark:bg-gray-900 dark:border-gray-700"
                sideOffset={6}
                side="bottom"
              >
                {t.tip}
                <Tooltip.Arrow className="fill-white dark:fill-gray-900" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
    </div>
  );
}
