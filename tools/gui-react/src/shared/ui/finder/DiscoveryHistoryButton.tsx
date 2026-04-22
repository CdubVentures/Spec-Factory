// WHY: Opens the shared Discovery History drawer. Renders via HeaderActionButton
// (default 'header' scope) or RowActionButton ('row' scope for the key-group
// header) with intent="history" (brown). Label embeds live (NNqu)(NNurl) counts
// of URLs/queries that would be injected next.
//
// When fieldKeyFilter is passed, counts fold across ONLY those field keys and
// the drawer opens pre-filtered to the same set. This is how the key-group
// History button scopes to its group's keys.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { FINDER_PANELS } from '../../../features/indexing/state/finderPanelRegistry.generated.ts';
import { useFinderDiscoveryHistoryStore } from '../../../stores/finderDiscoveryHistoryStore.ts';
import { groupHistory, type ScopeLevel, type FinderRun } from './discoveryHistoryHelpers.ts';
import { HeaderActionButton, RowActionButton } from '../actionButton/index.ts';

interface DiscoveryHistoryButtonProps {
  finderId: string;
  productId: string;
  category: string;
  /** 'header' (h-8, default) or 'row' (h-7, used by key-group header). */
  scope?: 'header' | 'row';
  /** When provided, counts fold across only these field keys, and the drawer
   *  opens pre-filtered to the same set. Used by the key-group History button. */
  fieldKeyFilter?: readonly string[];
  /** Shared width class for same-section button alignment. */
  width?: string;
}

interface GenericFinderResponse {
  runs?: FinderRun[];
}

export function DiscoveryHistoryButton({
  finderId,
  productId,
  category,
  scope = 'header',
  fieldKeyFilter,
  width,
}: DiscoveryHistoryButtonProps) {
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

  const counts = useMemo(() => {
    const runs = finderData?.runs || [];
    const g = groupHistory(runs, scopeLevel);

    if (fieldKeyFilter && fieldKeyFilter.length > 0) {
      let urls = 0;
      let queries = 0;
      for (const fk of fieldKeyFilter) {
        const bucket = g.byFieldKey.get(fk);
        if (!bucket) continue;
        urls += bucket.urls.size;
        queries += bucket.queries.size;
      }
      return { urls, queries };
    }

    return { urls: g.totalUrls, queries: g.totalQueries };
  }, [finderData, scopeLevel, fieldKeyFilter]);

  const handleClick = () => {
    openDrawer({
      finderId,
      productId,
      category,
      ...(fieldKeyFilter ? { fieldKeyFilter: [...fieldKeyFilter] } : {}),
    });
  };

  const label = (
    <>
      History
      <span className="ml-1 font-mono">
        (<span className="font-bold">{counts.queries}</span>
        <span className="font-normal opacity-70">qu</span>)
        (<span className="font-bold">{counts.urls}</span>
        <span className="font-normal opacity-70">url</span>)
      </span>
    </>
  );

  if (scope === 'row') {
    return (
      <RowActionButton
        intent="history"
        label={label}
        onClick={handleClick}
        title="Open Discovery History drawer"
        ariaLabel="Open discovery history"
        width={width}
      />
    );
  }

  return (
    <HeaderActionButton
      intent="history"
      label={label}
      onClick={handleClick}
      title="Open Discovery History drawer"
      ariaLabel="Open discovery history"
      width={width}
    />
  );
}
