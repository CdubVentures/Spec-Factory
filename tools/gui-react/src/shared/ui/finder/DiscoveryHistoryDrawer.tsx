// WHY: Dashboard-style right-side drawer for URL + query discovery history.
// 100% registry-driven — any finder in FINDER_PANELS with a scopeLevel gets
// this drawer for free (just mount DiscoveryHistoryButton in its panel header).
//
// Rendered via React Portal at document.body to escape parent stacking
// contexts. Slide-in uses a one-RAF deferred visibility flag so the drawer
// first paints off-screen (translate-x-full) and then transitions to
// translate-x-0, producing a real CSS slide on open and close.
//
// When closed, the portal stays mounted but the drawer is translate-x-full +
// pointer-events-none, so the rest of the page is fully interactive.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { FINDER_PANELS } from '../../../features/indexing/state/finderPanelRegistry.generated.ts';
import { useFinderDiscoveryHistoryStore } from '../../../stores/finderDiscoveryHistoryStore.ts';
import { useColorEditionFinderQuery } from '../../../features/color-edition-finder/index.ts';
import { buildFinderVariantRows } from './variantRowHelpers.ts';
import {
  groupHistory,
  getLogFromRun,
  type ScopeLevel,
  type FinderRun,
} from './discoveryHistoryHelpers.ts';
import { FinderKpiCard } from './FinderKpiCard.tsx';
import { FinderSectionCard } from './FinderSectionCard.tsx';
import type { KpiCard } from './types.ts';

interface GenericFinderResponse {
  runs?: FinderRun[];
}

type KindFilter = 'all' | 'url' | 'query';

interface FilteredBucket {
  urls: string[];
  queries: string[];
}

function resolveRoutePrefix(finderId: string): string {
  const p = FINDER_PANELS.find((x) => x.id === finderId);
  return p?.routePrefix || '';
}

function resolveScopeLevel(finderId: string): ScopeLevel {
  const p = FINDER_PANELS.find((x) => x.id === finderId);
  return (p?.scopeLevel || '') as ScopeLevel;
}

function resolveFinderLabel(finderId: string): string {
  const p = FINDER_PANELS.find((x) => x.id === finderId);
  return p?.label || finderId;
}

export function DiscoveryHistoryDrawer() {
  const { open, finderId, productId, category, closeDrawer } = useFinderDiscoveryHistoryStore();

  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => { if (open) setEverOpened(true); }, [open]);

  if (!finderId || !productId || !category) return null;
  if (!everOpened) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <DrawerImpl
      open={open}
      finderId={finderId}
      productId={productId}
      category={category}
      onClose={closeDrawer}
    />,
    document.body,
  );
}

interface DrawerImplProps {
  open: boolean;
  finderId: string;
  productId: string;
  category: string;
  onClose: () => void;
}

function DrawerImpl({ open, finderId, productId, category, onClose }: DrawerImplProps) {
  const scopeLevel = resolveScopeLevel(finderId);
  const routePrefix = resolveRoutePrefix(finderId);
  const finderLabel = resolveFinderLabel(finderId);
  // WHY: Optional allow-list of field_keys. keyFinder's group-history button
  // sets this to the current group's keys so the drawer shows one group's
  // worth of buckets instead of all of them. Panel keeps this live by calling
  // setFieldKeyFilter whenever the group's membership changes.
  const fieldKeyFilter = useFinderDiscoveryHistoryStore((s) => s.fieldKeyFilter);

  // WHY: One-RAF flip so the component first paints off-screen then transitions
  // to on-screen. Without it, the initial paint already has translate-x-0 and
  // the slide appears to skip. Also used for close → slide back out.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
  }, [open]);

  const runsQuery = useQuery<GenericFinderResponse>({
    queryKey: ['finder-runs-for-history', finderId, category, productId],
    queryFn: () => api.get<GenericFinderResponse>(
      `/${routePrefix}/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: open && Boolean(routePrefix),
  });

  const { data: cefData } = useColorEditionFinderQuery(category, productId);
  const variantRows = useMemo(() => buildFinderVariantRows(cefData as never), [cefData]);
  const labelByVariantId = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of variantRows) {
      if (v.variant_id) m.set(v.variant_id, v.variant_label);
      m.set(v.variant_key, v.variant_label);
    }
    return m;
  }, [variantRows]);

  const grouped = useMemo(() => {
    const runs = runsQuery.data?.runs || [];
    return groupHistory(runs, scopeLevel);
  }, [runsQuery.data, scopeLevel]);

  const [searchText, setSearchText] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [variantFilter, setVariantFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  // Optional preset: panels can open the drawer scoped to a single variant
  // (per-variant Hist button) or leave it unset for the full history.
  const variantIdFilter = useFinderDiscoveryHistoryStore((s) => s.variantIdFilter);
  useEffect(() => {
    if (open) {
      // Initialize the internal variant filter from the store's preset on
      // open. Leaving it set after close would persist across subsequent
      // unfiltered opens — so the close-branch below resets it too.
      if (variantIdFilter) setVariantFilter(variantIdFilter);
    } else {
      setSearchText('');
      setKind('all');
      setVariantFilter('');
      setModeFilter('');
    }
  }, [open, variantIdFilter]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const matches = (item: string) => q === '' || item.toLowerCase().includes(q);
    const filterUrls = (items: readonly string[]) =>
      kind === 'query' ? [] : items.filter(matches);
    const filterQueries = (items: readonly string[]) =>
      kind === 'url' ? [] : items.filter(matches);

    const productUrls = filterUrls(grouped.productUrls);
    const productQueries = filterQueries(grouped.productQueries);

    const byVariant = new Map<string, FilteredBucket>();
    for (const [vid, bucket] of grouped.byVariant.entries()) {
      if (variantFilter && variantFilter !== vid) continue;
      const u = filterUrls([...bucket.urls]);
      const qu = filterQueries([...bucket.queries]);
      if (u.length === 0 && qu.length === 0) continue;
      byVariant.set(vid, { urls: u, queries: qu });
    }

    const byVariantMode = new Map<string, Map<string, FilteredBucket>>();
    for (const [vid, modes] of grouped.byVariantMode.entries()) {
      if (variantFilter && variantFilter !== vid) continue;
      const mm = new Map<string, FilteredBucket>();
      for (const [m, bucket] of modes.entries()) {
        if (modeFilter && modeFilter !== m) continue;
        const u = filterUrls([...bucket.urls]);
        const qu = filterQueries([...bucket.queries]);
        if (u.length === 0 && qu.length === 0) continue;
        mm.set(m, { urls: u, queries: qu });
      }
      if (mm.size > 0) byVariantMode.set(vid, mm);
    }

    const allowedFieldKeys = fieldKeyFilter ? new Set(fieldKeyFilter) : null;
    const byFieldKey = new Map<string, FilteredBucket>();
    for (const [fk, bucket] of grouped.byFieldKey.entries()) {
      if (allowedFieldKeys && !allowedFieldKeys.has(fk)) continue;
      const u = filterUrls([...bucket.urls]);
      const qu = filterQueries([...bucket.queries]);
      if (u.length === 0 && qu.length === 0) continue;
      byFieldKey.set(fk, { urls: u, queries: qu });
    }

    const totalUrls = productUrls.length
      + [...byVariant.values()].reduce((s, b) => s + b.urls.length, 0)
      + [...byVariantMode.values()].reduce(
          (s1, modes) => s1 + [...modes.values()].reduce((s2, b) => s2 + b.urls.length, 0), 0,
        )
      + [...byFieldKey.values()].reduce((s, b) => s + b.urls.length, 0);
    const totalQueries = productQueries.length
      + [...byVariant.values()].reduce((s, b) => s + b.queries.length, 0)
      + [...byVariantMode.values()].reduce(
          (s1, modes) => s1 + [...modes.values()].reduce((s2, b) => s2 + b.queries.length, 0), 0,
        )
      + [...byFieldKey.values()].reduce((s, b) => s + b.queries.length, 0);

    return { productUrls, productQueries, byVariant, byVariantMode, byFieldKey, totalUrls, totalQueries };
  }, [grouped, searchText, kind, variantFilter, modeFilter, fieldKeyFilter]);

  const variantOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const vid of grouped.byVariant.keys()) ids.add(vid);
    for (const vid of grouped.byVariantMode.keys()) ids.add(vid);
    return [...ids].sort();
  }, [grouped]);

  const modeOptions = useMemo(() => {
    const ms = new Set<string>();
    for (const modes of grouped.byVariantMode.values()) {
      for (const m of modes.keys()) ms.add(m);
    }
    return [...ms].sort();
  }, [grouped]);

  const runsUsed = useMemo(() => {
    const runs = runsQuery.data?.runs || [];
    let count = 0;
    for (const run of runs) {
      const log = getLogFromRun(run);
      if (!log) continue;
      const urls = Array.isArray(log.urls_checked) ? log.urls_checked : [];
      const queries = Array.isArray(log.queries_run) ? log.queries_run : [];
      if (urls.length + queries.length > 0) count++;
    }
    return count;
  }, [runsQuery.data]);

  const kpiCards: KpiCard[] = useMemo(() => {
    let third: KpiCard;
    if (scopeLevel === 'product') {
      third = { label: 'Runs Used', value: String(runsUsed), tone: 'success' };
    } else if (scopeLevel === 'field_key') {
      third = { label: 'Keys', value: String(grouped.byFieldKey.size), tone: 'success' };
    } else {
      third = {
        label: 'Variants',
        value: String(
          scopeLevel === 'variant' ? grouped.byVariant.size : grouped.byVariantMode.size,
        ),
        tone: 'success',
      };
    }
    return [
      { label: 'URLs', value: String(filtered.totalUrls), tone: 'info' },
      { label: 'Queries', value: String(filtered.totalQueries), tone: 'info' },
      third,
    ];
  }, [scopeLevel, filtered, grouped, runsUsed]);

  const hasAnyData = filtered.totalUrls + filtered.totalQueries > 0;

  return (
    <div
      className={`fixed inset-y-0 right-0 w-[520px] max-w-[95vw] z-50 sf-surface-panel border-l sf-border-default flex flex-col shadow-2xl transform transition-transform duration-300 ease-out ${shown ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
      role="dialog"
      aria-label="Discovery History"
      aria-hidden={!shown}
    >
      <DrawerHeader
        finderLabel={finderLabel}
        finderId={finderId}
        scopeLevel={scopeLevel}
        productId={productId}
        category={category}
        onClose={onClose}
      />

      <div className="px-5 py-4 border-b sf-border-soft shrink-0 grid grid-cols-3 gap-2">
        {kpiCards.map((card) => (
          <CompactKpiCard key={card.label} label={card.label} value={card.value} tone={card.tone} />
        ))}
      </div>

      <FilterBar
        scopeLevel={scopeLevel}
        searchText={searchText}
        onSearchChange={setSearchText}
        kind={kind}
        onKindChange={setKind}
        variantFilter={variantFilter}
        onVariantChange={setVariantFilter}
        modeFilter={modeFilter}
        onModeChange={setModeFilter}
        variantOptions={variantOptions}
        modeOptions={modeOptions}
        labelByVariantId={labelByVariantId}
      />

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-2.5 text-left">
        {runsQuery.isLoading && (
          <div className="text-[11px] sf-text-muted">Loading…</div>
        )}
        {runsQuery.isError && (
          <div className="text-[11px] sf-status-text-danger">Failed to load runs.</div>
        )}
        {!runsQuery.isLoading && !hasAnyData && (
          <div className="text-[11px] sf-text-muted italic py-4">
            {grouped.totalUrls + grouped.totalQueries === 0
              ? 'No discovery history yet for this product.'
              : 'No items match your filters.'}
          </div>
        )}

        {scopeLevel === 'product' && hasAnyData && (
          <FlatBody
            finderId={finderId}
            productId={productId}
            urls={filtered.productUrls}
            queries={filtered.productQueries}
            kind={kind}
          />
        )}

        {scopeLevel === 'variant' && hasAnyData && (
          <VariantBody
            finderId={finderId}
            productId={productId}
            groups={filtered.byVariant}
            labelByVariantId={labelByVariantId}
            kind={kind}
          />
        )}

        {scopeLevel === 'variant+mode' && hasAnyData && (
          <VariantModeBody
            finderId={finderId}
            productId={productId}
            groups={filtered.byVariantMode}
            labelByVariantId={labelByVariantId}
            kind={kind}
          />
        )}

        {scopeLevel === 'field_key' && hasAnyData && (
          <FieldKeyBody
            finderId={finderId}
            productId={productId}
            groups={filtered.byFieldKey}
            kind={kind}
          />
        )}
      </div>
    </div>
  );
}

interface DrawerHeaderProps {
  finderLabel: string;
  finderId: string;
  scopeLevel: ScopeLevel;
  productId: string;
  category: string;
  onClose: () => void;
}

function DrawerHeader({ finderLabel, finderId, scopeLevel, productId, category, onClose }: DrawerHeaderProps) {
  return (
    <div className="px-5 py-4 border-b sf-border-default shrink-0 flex items-start gap-3 text-left">
      <div className="flex-1 min-w-0">
        <h2 className="font-bold text-base sf-text-primary">Discovery History</h2>
        <div className="text-[11px] sf-text-muted mt-1 flex items-center gap-2 flex-wrap">
          <span className="font-semibold uppercase tracking-wide">{finderLabel}</span>
          <span className="sf-text-subtle">·</span>
          <span className="font-mono">{finderId}</span>
          <span className="sf-text-subtle">·</span>
          <span className="uppercase tracking-wide">{scopeLevel || 'unscoped'}</span>
        </div>
        <div className="text-[11px] sf-text-subtle mt-0.5 font-mono truncate">
          {category} / {productId}
        </div>
      </div>
      <button
        onClick={onClose}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded sf-action-button"
        aria-label="Close drawer"
        title="Close"
      >
        <span className="text-base leading-none">&times;</span>
      </button>
    </div>
  );
}

function CompactKpiCard({ label, value, tone }: KpiCard) {
  const toneClass =
    tone === 'warning' ? 'sf-status-text-warning'
    : tone === 'danger' ? 'sf-status-text-danger'
    : tone === 'success' ? 'sf-status-text-success'
    : tone === 'info' ? 'sf-status-text-info'
    : 'sf-text-primary';
  return (
    <div className="sf-surface-elevated rounded-md p-2.5 flex flex-col gap-0.5 border sf-border-soft text-left">
      <div className={`text-[20px] font-bold font-mono leading-none tracking-tight tabular-nums ${toneClass}`}>
        {value}
      </div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] sf-text-muted">
        {label}
      </div>
    </div>
  );
}

interface FilterBarProps {
  scopeLevel: ScopeLevel;
  searchText: string;
  onSearchChange: (v: string) => void;
  kind: KindFilter;
  onKindChange: (v: KindFilter) => void;
  variantFilter: string;
  onVariantChange: (v: string) => void;
  modeFilter: string;
  onModeChange: (v: string) => void;
  variantOptions: string[];
  modeOptions: string[];
  labelByVariantId: Map<string, string>;
}

function FilterBar({
  scopeLevel, searchText, onSearchChange, kind, onKindChange,
  variantFilter, onVariantChange, modeFilter, onModeChange,
  variantOptions, modeOptions, labelByVariantId,
}: FilterBarProps) {
  const showVariantSelect = scopeLevel === 'variant' || scopeLevel === 'variant+mode';
  const showModeSelect = scopeLevel === 'variant+mode';
  return (
    <div className="px-5 py-3 border-b sf-border-soft shrink-0 space-y-2 text-left">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter URLs or queries…"
          className="flex-1 h-7 px-2 text-[11px] rounded sf-surface-elevated border sf-border-soft sf-text-primary placeholder:sf-text-subtle"
        />
        <KindToggle kind={kind} onChange={onKindChange} />
      </div>
      {(showVariantSelect || showModeSelect) && (
        <div className="flex items-center gap-2">
          {showVariantSelect && (
            <select
              value={variantFilter}
              onChange={(e) => onVariantChange(e.target.value)}
              className="flex-1 h-7 px-2 text-[11px] rounded sf-surface-elevated border sf-border-soft sf-text-primary"
            >
              <option value="">All variants</option>
              {variantOptions.map((vid) => (
                <option key={vid} value={vid}>
                  {labelByVariantId.get(vid) || vid}
                </option>
              ))}
            </select>
          )}
          {showModeSelect && (
            <select
              value={modeFilter}
              onChange={(e) => onModeChange(e.target.value)}
              className="h-7 px-2 text-[11px] rounded sf-surface-elevated border sf-border-soft sf-text-primary"
            >
              <option value="">All modes</option>
              {modeOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

function KindToggle({ kind, onChange }: { kind: KindFilter; onChange: (v: KindFilter) => void }) {
  const opts: { label: string; value: KindFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'URLs', value: 'url' },
    { label: 'Queries', value: 'query' },
  ];
  return (
    <div className="flex items-center shrink-0 rounded overflow-hidden border sf-border-soft">
      {opts.map((o) => {
        const active = o.value === kind;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`h-7 px-2.5 text-[10px] font-bold uppercase tracking-wide border-r sf-border-soft last:border-r-0 ${active ? 'sf-primary-button' : 'sf-secondary-button'}`}
            style={{ borderRadius: 0 }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface FlatBodyProps {
  finderId: string;
  productId: string;
  urls: string[];
  queries: string[];
  kind: KindFilter;
}

function FlatBody({ finderId, productId, urls, queries, kind }: FlatBodyProps) {
  return (
    <>
      {kind !== 'query' && urls.length > 0 && (
        <FinderSectionCard
          title="URLs"
          count={`${urls.length}`}
          storeKey={`discoveryHistory:${finderId}:${productId}:urls`}
        >
          <ItemList items={urls} kind="url" />
        </FinderSectionCard>
      )}
      {kind !== 'url' && queries.length > 0 && (
        <FinderSectionCard
          title="Queries"
          count={`${queries.length}`}
          storeKey={`discoveryHistory:${finderId}:${productId}:queries`}
        >
          <ItemList items={queries} kind="query" />
        </FinderSectionCard>
      )}
    </>
  );
}

interface VariantBodyProps {
  finderId: string;
  productId: string;
  groups: Map<string, FilteredBucket>;
  labelByVariantId: Map<string, string>;
  kind: KindFilter;
}

function VariantBody({
  finderId, productId, groups, labelByVariantId, kind,
}: VariantBodyProps) {
  return (
    <>
      {[...groups.entries()].map(([vid, bucket]) => (
        <FinderSectionCard
          key={vid}
          title={labelByVariantId.get(vid) || vid}
          count={`${bucket.urls.length} url · ${bucket.queries.length} qu`}
          storeKey={`discoveryHistory:${finderId}:${productId}:variant:${vid}`}
        >
          {kind !== 'query' && bucket.urls.length > 0 && (
            <SubList
              label={`URLs (${bucket.urls.length})`}
              items={bucket.urls}
              kind="url"
            />
          )}
          {kind !== 'url' && bucket.queries.length > 0 && (
            <SubList
              label={`Queries (${bucket.queries.length})`}
              items={bucket.queries}
              kind="query"
            />
          )}
        </FinderSectionCard>
      ))}
    </>
  );
}

interface FieldKeyBodyProps {
  finderId: string;
  productId: string;
  groups: Map<string, FilteredBucket>;
  kind: KindFilter;
}

function FieldKeyBody({
  finderId, productId, groups, kind,
}: FieldKeyBodyProps) {
  return (
    <>
      {[...groups.entries()].map(([fk, bucket]) => (
        <FinderSectionCard
          key={fk}
          title={fk}
          count={`${bucket.urls.length} url · ${bucket.queries.length} qu`}
          storeKey={`discoveryHistory:${finderId}:${productId}:field:${fk}`}
        >
          {kind !== 'query' && bucket.urls.length > 0 && (
            <SubList
              label={`URLs (${bucket.urls.length})`}
              items={bucket.urls}
              kind="url"
            />
          )}
          {kind !== 'url' && bucket.queries.length > 0 && (
            <SubList
              label={`Queries (${bucket.queries.length})`}
              items={bucket.queries}
              kind="query"
            />
          )}
        </FinderSectionCard>
      ))}
    </>
  );
}

interface VariantModeBodyProps {
  finderId: string;
  productId: string;
  groups: Map<string, Map<string, FilteredBucket>>;
  labelByVariantId: Map<string, string>;
  kind: KindFilter;
}

function VariantModeBody({
  finderId, productId, groups, labelByVariantId, kind,
}: VariantModeBodyProps) {
  return (
    <>
      {[...groups.entries()].map(([vid, modes]) => {
        let urlSum = 0, querySum = 0;
        for (const b of modes.values()) { urlSum += b.urls.length; querySum += b.queries.length; }
        return (
          <FinderSectionCard
            key={vid}
            title={labelByVariantId.get(vid) || vid}
            count={`${urlSum} url · ${querySum} qu · ${modes.size} modes`}
            storeKey={`discoveryHistory:${finderId}:${productId}:variant:${vid}`}
          >
            <div className="flex flex-col gap-2">
              {[...modes.entries()].map(([m, bucket]) => (
                <FinderSectionCard
                  key={m}
                  title={m}
                  count={`${bucket.urls.length} url · ${bucket.queries.length} qu`}
                  storeKey={`discoveryHistory:${finderId}:${productId}:variant:${vid}:mode:${m}`}
                >
                  {kind !== 'query' && bucket.urls.length > 0 && (
                    <SubList
                      label={`URLs (${bucket.urls.length})`}
                      items={bucket.urls}
                      kind="url"
                    />
                  )}
                  {kind !== 'url' && bucket.queries.length > 0 && (
                    <SubList
                      label={`Queries (${bucket.queries.length})`}
                      items={bucket.queries}
                      kind="query"
                    />
                  )}
                </FinderSectionCard>
              ))}
            </div>
          </FinderSectionCard>
        );
      })}
    </>
  );
}

function SubList({
  label, items, kind,
}: { label: string; items: string[]; kind: 'url' | 'query' }) {
  return (
    <div className="text-left">
      <div className="text-[10px] font-bold uppercase tracking-wide sf-text-subtle mb-1">
        {label}
      </div>
      <ItemList items={items} kind={kind} />
    </div>
  );
}

function ItemList({
  items, kind,
}: { items: readonly string[]; kind: 'url' | 'query' }) {
  return (
    <ul className="divide-y sf-border-soft border sf-border-soft rounded text-left">
      {items.map((item) => (
        <li key={item} className="px-2 py-1 flex items-center gap-2 text-[11px]">
          <span className="flex-1 font-mono truncate sf-text-primary" title={item}>
            {kind === 'url' ? (
              <a href={item} target="_blank" rel="noreferrer" className="hover:underline">{item}</a>
            ) : item}
          </span>
        </li>
      ))}
    </ul>
  );
}
