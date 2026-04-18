// WHY: Header-slot button that opens the shared Discovery History drawer.
// Matches the Run button's dimensions (w-28 px-3 py-1.5) and shows live
// counts of what's currently accumulated for this product, broken out as
// (NNqu)(NNurl). Counts subtract suppressions so they mirror what the next
// prompt injection would actually see.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { FINDER_PANELS } from '../../../features/indexing/state/finderPanelRegistry.generated.ts';
import { useFinderDiscoveryHistoryStore } from '../../../stores/finderDiscoveryHistoryStore.ts';
import { useDiscoverySuppressionsQuery } from './discoverySuppressionsQueries.ts';
import { groupHistory, type ScopeLevel, type FinderRun } from './discoveryHistoryHelpers.ts';

interface DiscoveryHistoryButtonProps {
  finderId: string;
  productId: string;
  category: string;
}

interface GenericFinderResponse {
  runs?: FinderRun[];
}

export function DiscoveryHistoryButton({ finderId, productId, category }: DiscoveryHistoryButtonProps) {
  const openDrawer = useFinderDiscoveryHistoryStore((s) => s.openDrawer);

  const panel = FINDER_PANELS.find((p) => p.id === finderId);
  const routePrefix = panel?.routePrefix || '';
  const scopeLevel = (panel?.scopeLevel || '') as ScopeLevel;

  const { data: finderData } = useQuery<GenericFinderResponse>({
    queryKey: [routePrefix, category, productId],
    queryFn: () => api.get<GenericFinderResponse>(
      `/${routePrefix}/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: Boolean(routePrefix) && Boolean(category) && Boolean(productId),
  });

  const { data: suppressionsData } = useDiscoverySuppressionsQuery(finderId, category, productId);

  const counts = useMemo(() => {
    const runs = finderData?.runs || [];
    const suppressions = suppressionsData?.suppressions || [];
    const g = groupHistory(runs, scopeLevel, suppressions);
    return { urls: g.totalUrls, queries: g.totalQueries };
  }, [finderData, suppressionsData, scopeLevel]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openDrawer({ finderId, productId, category });
      }}
      className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-action-button whitespace-nowrap text-center"
      title="Open Discovery History drawer"
    >
      <span>History</span>
      <span className="ml-1 font-mono">
        (<span className="font-bold">{counts.queries}</span>
        <span className="font-normal opacity-70">qu</span>)
        (<span className="font-bold">{counts.urls}</span>
        <span className="font-normal opacity-70">url</span>)
      </span>
    </button>
  );
}
