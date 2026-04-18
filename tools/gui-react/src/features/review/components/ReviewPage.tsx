import { useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useUiStore } from '../../../stores/uiStore.ts';
import {
  useReviewStore, selectSelectedField, selectSelectedProductId,
  useActiveCell, useDrawerOpen, useCellMode, useEditingValue,
  useOriginalEditingValue, useSaveStatus, useBrandFilter, useSortMode,
  useConfidenceFilter, useCoverageFilter, useRunStatusFilter,
  useReviewActions,
} from '../state/reviewStore.ts';
import type { SortMode } from '../state/reviewStore.ts';
import { matchesConfidenceFilter, matchesCoverageFilter, matchesRunStatusFilter } from '../selectors/reviewFilterPredicates.ts';
import { FILTER_REGISTRY } from '../state/reviewFilterRegistry.ts';
import { FilterGroupBar } from './FilterGroupBar.tsx';
import { ReviewMatrix } from './ReviewMatrix.tsx';
import { FieldReviewDrawer } from './FieldReviewDrawer.tsx';
import { BrandFilterBar } from './BrandFilterBar.tsx';
import { ReviewDashboardStrip } from './ReviewDashboardStrip.tsx';
import { ReviewToolbar } from './ReviewToolbar.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { useFieldLabels } from '../../../hooks/useFieldLabels.ts';
import { computeReviewDashboardMetrics, deriveReviewKpiCards } from '../selectors/reviewMetricsSelectors.ts';
import { useDebouncedCallback } from '../../../hooks/useDebounce.ts';
import { readReviewGridSessionState, writeReviewGridSessionState } from '../state/reviewGridSessionState.ts';
import type { ReviewLayout, ProductsIndexResponse, CandidateResponse, CandidateDeleteResponse, ReviewCandidate } from '../../../types/review.ts';
import { parseCatalogProducts } from '../../catalog/api/catalogParsers.ts';
import { deleteCandidateBySourceId, deleteAllCandidatesForField } from '../api/reviewApi.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'brand', label: 'Brand' },
  { value: 'recent', label: 'Recent' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'missing', label: 'Missing' },
];

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function candidateSourceLabel(candidate: ReviewCandidate | null | undefined): string {
  if (!candidate) return '';
  const explicitSource = String(candidate.source || '').trim();
  if (explicitSource) return explicitSource;
  const sourceId = String(candidate.source_id || '').trim().toLowerCase();
  if (sourceId === 'pipeline') return 'Pipeline';
  if (sourceId === 'reference') return 'Reference';
  if (sourceId === 'user') return 'user';
  if (sourceId) return sourceId;
  const evidenceUrl = String(candidate.evidence?.url || '').trim();
  return evidenceUrl ? hostFromUrl(evidenceUrl) : '';
}

export function ReviewPage() {
  const category = useUiStore((s) => s.category);
  const { getLabel } = useFieldLabels(category);
  // State selectors (each re-renders only when its field changes)
  const activeCell = useActiveCell();
  const drawerOpen = useDrawerOpen();
  const cellMode = useCellMode();
  const editingValue = useEditingValue();
  const originalEditingValue = useOriginalEditingValue();
  const saveStatus = useSaveStatus();
  const brandFilter = useBrandFilter();
  const sortMode = useSortMode();
  const confidenceFilter = useConfidenceFilter();
  const coverageFilter = useCoverageFilter();
  const runStatusFilter = useRunStatusFilter();
  const selectedField = useReviewStore(selectSelectedField);
  const selectedProductId = useReviewStore(selectSelectedProductId);

  // Actions (stable refs, never cause re-renders)
  const {
    openDrawer, closeDrawer, selectCell, startEditing, cancelEditing,
    setEditingValue, commitEditing, setSaveStatus,
    setAvailableBrands, setBrandFilterMode, setBrandFilterSelection, setSortMode,
    setFilter,
  } = useReviewActions();
  const queryClient = useQueryClient();
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewGridHydratedRef = useRef<string>('');
  const categoryRef = useRef<string>(category);
  const persistedGridState = useMemo(
    () => readReviewGridSessionState(category),
    [category],
  );

  const { data: layout } = useQuery({
    queryKey: ['reviewLayout', category],
    queryFn: () => api.get<ReviewLayout>(`/review/${category}/layout`),
  });

  // Products index — ALL products without candidates, sorted by brand
  const { data: indexData, isLoading } = useQuery({
    queryKey: ['reviewProductsIndex', category],
    queryFn: () => api.get<ProductsIndexResponse>(`/review/${category}/products-index`),
  });

  const { data: catalogRows } = useQuery({
    queryKey: ['catalog-review', category],
    queryFn: () => api.parsedGet(`/catalog/${category}/products`, parseCatalogProducts),
    enabled: category !== 'all',
  });

  // Candidates query for the active drawer cell
  const { data: candidateData, isLoading: candidatesLoading } = useQuery({
    queryKey: ['candidates', category, selectedProductId, selectedField],
    queryFn: () => api.get<CandidateResponse>(`/review/${category}/candidates/${selectedProductId}/${selectedField}`),
    staleTime: 60_000,
    enabled: drawerOpen && !!selectedProductId && !!selectedField,
  });

  // Sync available brands from index response
  useEffect(() => {
    if (indexData?.brands) {
      setAvailableBrands(indexData.brands);
    }
  }, [indexData?.brands, setAvailableBrands]);

  // WHY: Publisher threshold drives which candidates are 'resolved' in SQL.
  // When the user changes publishConfidenceThreshold in Publisher settings,
  // backend reconcileThreshold runs and flips candidate statuses — the drawer's
  // source list (derived from status==='resolved') must refetch so the
  // displayed sources match the new resolved set. Products index also reflects
  // publisher state per-field, so invalidate both.
  const publishConfidenceThreshold = useRuntimeSettingsValueStore(
    (s) => s.values?.publishConfidenceThreshold,
  );
  useEffect(() => {
    if (publishConfidenceThreshold == null) return;
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
  }, [publishConfidenceThreshold, queryClient, category]);

  useEffect(() => {
    if (!indexData?.brands || indexData.brands.length === 0) return;
    if (reviewGridHydratedRef.current === category) return;
    setSortMode(persistedGridState.sortMode);
    if (persistedGridState.brandFilterMode === 'custom') {
      setBrandFilterSelection(persistedGridState.selectedBrands);
    } else {
      setBrandFilterMode(persistedGridState.brandFilterMode);
    }
    for (const def of FILTER_REGISTRY) {
      const persisted = persistedGridState[def.key as keyof typeof persistedGridState] as string;
      if (persisted && persisted !== def.defaultValue) {
        setFilter(def.key, persisted);
      }
    }
    reviewGridHydratedRef.current = category;
  }, [
    category,
    indexData?.brands,
    persistedGridState,
    setSortMode,
    setBrandFilterMode,
    setBrandFilterSelection,
    setFilter,
  ]);

  // WHY: Drawer selection belongs to a single category context — a product
  // from category A is meaningless in category B. Resetting on switch prevents
  // the drawer from stranding with a stale activeCell.
  useEffect(() => {
    if (categoryRef.current !== category) {
      categoryRef.current = category;
      closeDrawer();
    }
  }, [category, closeDrawer]);

  useEffect(() => {
    if (reviewGridHydratedRef.current !== category) return;
    writeReviewGridSessionState(category, {
      sortMode,
      brandFilterMode: brandFilter.mode,
      selectedBrands: Array.from(brandFilter.selected),
      confidenceFilter,
      coverageFilter,
      runStatusFilter,
    });
  }, [category, sortMode, brandFilter.mode, brandFilter.selected, confidenceFilter, coverageFilter, runStatusFilter]);

  // Auto-clear "saved" status after 2 seconds
  useEffect(() => {
    if (saveStatus === 'saved') {
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      return () => {
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      };
    }
  }, [saveStatus, setSaveStatus]);

  // Client-side brand filtering + sorting
  const products = useMemo(() => {
    if (!indexData?.products) return [];
    let filtered = indexData.products;

    // Brand filter
    if (brandFilter.mode === 'none') return [];
    if (brandFilter.mode === 'custom') {
      filtered = filtered.filter((p) => {
        const brand = (p.identity?.brand || '').trim();
        return brandFilter.selected.has(brand);
      });
    }

    // Metric filters
    if (confidenceFilter !== 'all') {
      filtered = filtered.filter((p) => matchesConfidenceFilter(p, confidenceFilter));
    }
    if (coverageFilter !== 'all') {
      filtered = filtered.filter((p) => matchesCoverageFilter(p, coverageFilter));
    }
    if (runStatusFilter !== 'all') {
      filtered = filtered.filter((p) => matchesRunStatusFilter(p, runStatusFilter));
    }

    // Sort
    const sorted = [...filtered];
    switch (sortMode) {
      case 'recent':
        sorted.sort((a, b) => {
          const tA = new Date(a.metrics.updated_at || 0).getTime();
          const tB = new Date(b.metrics.updated_at || 0).getTime();
          return tB - tA;
        });
        break;
      case 'confidence':
        sorted.sort((a, b) => a.metrics.confidence - b.metrics.confidence);
        break;
      case 'coverage':
        sorted.sort((a, b) => a.metrics.coverage - b.metrics.coverage);
        break;
      case 'missing':
        sorted.sort((a, b) => b.metrics.missing - a.metrics.missing);
        break;
      case 'brand':
      default:
        sorted.sort((a, b) => {
          const brandA = String(a.identity?.brand || '').toLowerCase();
          const brandB = String(b.identity?.brand || '').toLowerCase();
          if (brandA !== brandB) return brandA.localeCompare(brandB);
          const modelA = String(a.identity?.model || '').toLowerCase();
          const modelB = String(b.identity?.model || '').toLowerCase();
          return modelA.localeCompare(modelB);
        });
        break;
    }
    return sorted;
  }, [indexData?.products, brandFilter, sortMode, confidenceFilter, coverageFilter, runStatusFilter]);

  // First click = select + open drawer. Second click on same cell = start editing.
  // Uses getState() / getQueryData() to avoid stale closure deps that would cause
  // unnecessary ReviewMatrix re-renders (and potential virtualizer remounts).
  const handleCellClick = useCallback((productId: string, field: string) => {
    const { activeCell: currentCell, cellMode: currentMode } = useReviewStore.getState();
    const isSameCell = currentCell?.productId === productId && currentCell?.field === field;

    // Already editing this cell — no-op
    if (isSameCell && currentMode === 'editing') return;

    // Cell is selected but not editing — second click unlocks inline editor
    if (isSameCell && currentMode === 'selected') {
      const cached = queryClient.getQueryData<ProductsIndexResponse>(['reviewProductsIndex', category]);
      const product = cached?.products?.find(p => p.product_id === productId);
      const currentValue = product?.fields[field]?.selected.value;
      startEditing(currentValue != null ? String(currentValue) : '');
      return;
    }

    // Different cell or no cell selected — select + open drawer (no editing yet)
    selectCell(productId, field);
    openDrawer(productId, field);
  }, [selectCell, openDrawer, startEditing, queryClient, category]);

  // Start editing from keydown (typing in selected cell)
  const handleStartEditing = useCallback((productId: string, field: string, initialValue: string) => {
    selectCell(productId, field);
    startEditing(initialValue);
  }, [selectCell, startEditing]);

  // Manual override mutation (for inline edits)
  const manualOverrideMut = useMutation({
    mutationFn: (body: { productId: string; field: string; value: string }) =>
      api.post(`/review/${category}/manual-override`, body),
    onSuccess: () => {
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
      queryClient.invalidateQueries({ queryKey: ['catalog', category] });
      queryClient.invalidateQueries({ queryKey: ['product', category] });
    },
    onError: () => {
      setSaveStatus('error');
    },
  });

  // Candidate deletion mutations
  const deleteCandidateMut = useMutation({
    mutationFn: ({ sourceId }: { sourceId: string }) =>
      deleteCandidateBySourceId(category, selectedProductId, selectedField, sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
      queryClient.invalidateQueries({ queryKey: ['candidates', category] });
    },
  });

  const deleteAllCandidatesMut = useMutation({
    mutationFn: () =>
      deleteAllCandidatesForField(category, selectedProductId, selectedField),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
      queryClient.invalidateQueries({ queryKey: ['candidates', category] });
    },
  });

  // Optimistically update the products-index cache so the grid reflects changes instantly.
  // Accepts optional source metadata to preserve provenance from candidates or mark as 'user'.
  const optimisticUpdateField = useCallback((
    productId: string,
    field: string,
    value: string,
    sourceMeta?: { source?: string; method?: string; tier?: number | null; acceptedCandidateId?: string | null },
  ) => {
    // Only show OVR badge for manual entry, not for candidate acceptance
    const isManualOverride = sourceMeta?.method === 'manual_override';
    const now = new Date().toISOString();
    queryClient.setQueryData<ProductsIndexResponse>(
      ['reviewProductsIndex', category],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          products: old.products.map((p) => {
            if (p.product_id !== productId) return p;
            const existing = p.fields[field] || { candidate_count: 0, candidates: [] };
            return {
              ...p,
              fields: {
                ...p.fields,
                [field]: {
                  ...existing,
                  selected: {
                    value,
                    confidence: 1.0,
                    status: 'ok',
                    color: 'green' as const,
                  },
                  overridden: isManualOverride,
                  source_timestamp: now,
                  ...(sourceMeta?.source !== undefined ? { source: sourceMeta.source } : {}),
                  ...(sourceMeta?.method !== undefined ? { method: sourceMeta.method } : {}),
                  ...(sourceMeta?.tier !== undefined ? { tier: sourceMeta.tier } : {}),
                  ...(sourceMeta?.acceptedCandidateId !== undefined ? { accepted_candidate_id: sourceMeta.acceptedCandidateId } : {}),
                },
              },
            };
          }),
        };
      },
    );
  }, [queryClient, category]);

  // Core save logic — shared by debounced autosave and immediate commit
  const saveEdit = useCallback((productId: string, field: string, value: string, originalValue: string) => {
    if (value === originalValue) return;

    // Inline text edits are always manual overrides.
    optimisticUpdateField(
      productId,
      field,
      value,
      { source: 'user', method: 'manual_override', acceptedCandidateId: null },
    );
    setSaveStatus('saving');
    manualOverrideMut.mutate({ productId, field, value });
  }, [manualOverrideMut, setSaveStatus, optimisticUpdateField]);

  // Debounced autosave for inline editing (fires while user is still typing)
  const debouncedSave = useDebouncedCallback(saveEdit, 1500);

  // Stable commit/cancel callbacks for ReviewMatrix (use getState to avoid closure deps)
  const handleCommitEditing = useCallback(() => {
    debouncedSave.cancel();
    const { activeCell: cell, editingValue: val, originalEditingValue: orig } = useReviewStore.getState();
    if (cell) saveEdit(cell.productId, cell.field, val, orig);
    commitEditing();
  }, [debouncedSave, saveEdit, commitEditing]);

  const handleCancelEditing = useCallback(() => {
    debouncedSave.cancel();
    cancelEditing();
  }, [debouncedSave, cancelEditing]);

  // Trigger autosave when editingValue changes
  useEffect(() => {
    if (cellMode === 'editing' && saveStatus === 'unsaved' && activeCell) {
      debouncedSave.fn(activeCell.productId, activeCell.field, editingValue, originalEditingValue);
    }
  }, [cellMode, saveStatus, editingValue, originalEditingValue, activeCell, debouncedSave]);

  // WHY: Always derive from filtered products so metrics match the visible grid state.
  const dashboardMetrics = useMemo(
    () => computeReviewDashboardMetrics(products, indexData?.total ?? 0, layout?.rows.length ?? 0),
    [products, indexData?.total, layout?.rows.length],
  );
  const kpiCards = useMemo(() => deriveReviewKpiCards(dashboardMetrics), [dashboardMetrics]);

  // Active product for drawer
  const activeProduct = products.find(p => p.product_id === selectedProductId);
  const activeFieldState = activeProduct?.fields[selectedField];

  if (isLoading) return <Spinner className="h-8 w-8 mx-auto mt-12" />;
  if (!layout || !indexData || indexData.total === 0) {
    const hasCatalog = catalogRows && catalogRows.length > 0;
    return (
      <p className="mt-8 text-center sf-status-text-muted">
        {hasCatalog
          ? 'No review data yet. Run products from Indexing Lab first.'
          : 'No products in catalog. Add products from the Catalog tab before reviewing.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Dashboard strip: KPI metrics */}
      <ReviewDashboardStrip kpiCards={kpiCards} saveStatus={saveStatus} />

      {/* Sort + filter toolbar: all controls on one horizontal row */}
      <ReviewToolbar>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="shrink-0 w-auto px-2 py-0.5 rounded sf-select text-[10px]"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>
          ))}
        </select>
        <div className="sf-review-brand-filter-separator w-px h-4 shrink-0" />
        <BrandFilterBar brands={indexData.brands} products={indexData.products} />
        <FilterGroupBar def={FILTER_REGISTRY[0]} value={confidenceFilter} onChange={setFilter} />
        <FilterGroupBar def={FILTER_REGISTRY[1]} value={coverageFilter} onChange={setFilter} />
        <FilterGroupBar def={FILTER_REGISTRY[2]} value={runStatusFilter} onChange={setFilter} />
      </ReviewToolbar>

      {/* Main content: matrix + drawer */}
      <div className={`grid ${drawerOpen ? 'grid-cols-[1fr,420px]' : 'grid-cols-1'} gap-3`}>
        <ReviewMatrix
          layout={layout}
          products={products}
          onCellClick={handleCellClick}
          activeCell={activeCell}
          cellMode={cellMode}
          onCommitEditing={handleCommitEditing}
          onCancelEditing={handleCancelEditing}
          onStartEditing={handleStartEditing}
          category={category}
        />

        {drawerOpen && activeProduct && activeFieldState && (() => {
          const drawerCandidates = candidateData?.candidates ?? activeFieldState.candidates ?? [];
          const currentSource = activeFieldState.source
            || candidateSourceLabel(drawerCandidates.find((candidate) => candidateSourceLabel(candidate)) ?? drawerCandidates[0]);
          const activeLayoutRow = layout?.rows.find((r) => r.key === selectedField);
          const variantDependent = Boolean(activeLayoutRow?.field_rule?.variant_dependent);

          return (
            <FieldReviewDrawer
              title={getLabel(selectedField)}
              subtitle={`${activeProduct.identity.brand} ${activeProduct.identity.model}${activeProduct.identity.id ? ` #${activeProduct.identity.id}` : ''}`}
              fieldKey={selectedField}
              onClose={closeDrawer}
              currentValue={{
                value: activeFieldState.selected.value != null ? String(activeFieldState.selected.value) : '',
                confidence: activeFieldState.selected.confidence,
                color: activeFieldState.selected.color,
                source: currentSource,
                sourceTimestamp: activeFieldState.source_timestamp,
                overridden: activeFieldState.overridden,
              }}
              onManualOverride={(value) => {
                optimisticUpdateField(
                  selectedProductId,
                  selectedField,
                  value,
                  { source: 'user', method: 'manual_override', acceptedCandidateId: null },
                );
                manualOverrideMut.mutate({
                  productId: selectedProductId,
                  field: selectedField,
                  value,
                });
              }}
              isPending={manualOverrideMut.isPending}
              candidates={drawerCandidates}
              candidatesLoading={candidatesLoading}
              publishedValue={activeFieldState.selected.value}
              onDeleteCandidate={(sourceId) => deleteCandidateMut.mutate({ sourceId })}
              onDeleteAllCandidates={() => deleteAllCandidatesMut.mutate()}
              deletePending={deleteCandidateMut.isPending || deleteAllCandidatesMut.isPending}
              variantDependent={variantDependent}
              variantValues={activeFieldState.variant_values}
            />
          );
        })()}
      </div>
    </div>
  );
}
