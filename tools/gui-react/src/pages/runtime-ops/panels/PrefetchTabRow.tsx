import type { PrefetchTabKey } from '../types';
import { prefetchTabAccent } from '../helpers';

interface PrefetchTabRowProps {
  activeTab: PrefetchTabKey | null;
  onSelectTab: (tab: PrefetchTabKey | null) => void;
}

const TABS: { key: PrefetchTabKey; label: string; color: string }[] = [
  { key: 'needset', label: 'NeedSet', color: 'bg-emerald-500' },
  { key: 'search_profile', label: 'Search Profile', color: 'bg-purple-500' },
  { key: 'brand_resolver', label: 'Brand Resolver', color: 'bg-amber-500' },
  { key: 'search_planner', label: 'Search Planner', color: 'bg-amber-500' },
  { key: 'search_results', label: 'Search Results', color: 'bg-purple-500' },
  { key: 'url_predictor', label: 'URL Predictor', color: 'bg-amber-500' },
  { key: 'serp_triage', label: 'SERP Triage', color: 'bg-amber-500' },
  { key: 'domain_classifier', label: 'Domain Classifier', color: 'bg-amber-500' },
];

export function PrefetchTabRow({ activeTab, onSelectTab }: PrefetchTabRowProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto bg-gray-50 dark:bg-gray-800/50">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1 shrink-0">
        Pre-Fetch
      </span>
      {TABS.map((t) => {
        const isSelected = activeTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelectTab(isSelected ? null : t.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-t text-xs whitespace-nowrap border-b-2 transition-colors ${
              isSelected
                ? `bg-white dark:bg-gray-800 ${prefetchTabAccent(t.key)} shadow-sm text-gray-900 dark:text-gray-100`
                : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 dark:text-gray-400'
            }`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${t.color}`} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
