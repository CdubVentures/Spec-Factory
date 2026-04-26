import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useDataChangeMutation } from '../../data-change/index.js';
import { useUiCategoryStore } from '../../../stores/uiCategoryStore.ts';
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
import {
  deleteCandidateBySourceId,
  deleteAllCandidatesForField,
  deleteReviewFieldRow,
  deleteReviewProductNonVariantKeys,
  unpublishReviewFieldRow,
  unpublishReviewProductNonVariantKeys,
  type ReviewFieldRowActionResponse,
  type ReviewProductNonVariantActionResponse,
} from '../api/reviewApi.ts';
import { isVariantGeneratorField } from '../selectors/overrideFormState.ts';
import {
  buildReviewFieldRowDeleteTarget,
  buildReviewProductHeaderDeleteTarget,
  deriveReviewProductHeaderActionState,
  type ReviewFieldRowActionKind,
  type ReviewProductHeaderActionKind,
} from '../selectors/reviewFieldRowActions.ts';
import { FinderDeleteConfirmModal } from '../../../shared/ui/finder/FinderDeleteConfirmModal.tsx';
import type { DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import {
  cancelReviewCandidateCacheQueries,
  cancelReviewFieldValueCacheQueries,
  cancelReviewProductNonVariantCacheQueries,
  cancelReviewFieldRowCacheQueries,
  clearPublishedReviewFieldFromCaches,
  deleteReviewProductNonVariantFromCaches,
  deleteReviewFieldRowFromCaches,
  removeAllReviewCandidatesFromCaches,
  removeReviewCandidateFromCaches,
  restoreReviewCandidateCaches,
  restoreReviewFieldValueCaches,
  restoreReviewProductNonVariantCaches,
  restoreReviewFieldRowCaches,
  updateReviewFieldValueInCaches,
  unpublishReviewProductNonVariantFromCaches,
  unpublishReviewFieldRowFromCaches,
  type ReviewCandidateCacheSnapshot,
  type ReviewFieldValueCacheSnapshot,
  type ReviewProductNonVariantCacheSnapshot,
  type ReviewFieldRowCacheSnapshot,
} from '../state/reviewCandidateCache.ts';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'brand', label: 'Brand' },
  { value: 'recent', label: 'Recent' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'missing', label: 'Missing' },
];

interface CandidateDeleteMutationContext {
  readonly category: string;
  readonly productId: string;
  readonly field: string;
  readonly snapshot: ReviewCandidateCacheSnapshot;
}

interface FieldRowMutationContext {
  readonly snapshot: ReviewFieldRowCacheSnapshot;
}

interface ProductNonVariantMutationContext {
  readonly snapshot: ReviewProductNonVariantCacheSnapshot;
}

interface FieldValueMutationContext {
  readonly snapshot: ReviewFieldValueCacheSnapshot;
}

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
  const category = useUiCategoryStore((s) => s.category);
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
  const [fieldRowDeleteTarget, setFieldRowDeleteTarget] = useState<DeleteTarget | null>(null);
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

    // variantGenerator fields (colors, editions) are CEF-authoritative — no inline
    // edit. Drawer's override UI is suppressed too; backend rejects the POST. Keep
    // the click selecting + opening the drawer (read-only).
    if (isSameCell && currentMode === 'selected' && !isVariantGeneratorField(field)) {
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
    if (isVariantGeneratorField(field)) return; // CEF-authoritative fields reject inline edit
    selectCell(productId, field);
    startEditing(initialValue);
  }, [selectCell, startEditing]);

  // Manual override mutation (for inline edits)
  const manualOverrideMut = useDataChangeMutation<
    unknown,
    Error,
    { productId: string; field: string; value: string; variantId?: string },
    FieldValueMutationContext | undefined
  >({
    event: 'review-manual-override',
    category,
    mutationFn: (body: { productId: string; field: string; value: string; variantId?: string }) =>
      api.post(`/review/${category}/manual-override`, body),
    options: {
      onMutate: async ({ productId, field, value, variantId }) => {
        if (variantId) return undefined;
        const target = { category, productId, field };
        await cancelReviewFieldValueCacheQueries(queryClient, target);
        return {
          snapshot: updateReviewFieldValueInCaches(queryClient, {
            ...target,
            value,
            timestamp: new Date().toISOString(),
            sourceMeta: {
              source: 'user',
              method: 'manual_override',
              acceptedCandidateId: null,
            },
          }),
        };
      },
      onSuccess: () => {
      setSaveStatus('saved');
      },
      onError: (err: unknown, _variables, context) => {
      if (context) restoreReviewFieldValueCaches(queryClient, context.snapshot);
      setSaveStatus('error');
      // WHY: silent failure was confusing — surface the API error so the user
      // sees exactly why override didn't land (validation, 400 shape, etc.).
      console.error('manual override failed', err);
      },
    },
  });

  // Clear published mutation — demotes resolved row(s) + removes JSON projection.
  const clearPublishedMut = useDataChangeMutation<
    unknown,
    Error,
    { productId: string; field: string; variantId?: string; allVariants?: boolean },
    FieldValueMutationContext | undefined
  >({
    event: 'review-clear-published',
    category,
    mutationFn: (body: { productId: string; field: string; variantId?: string; allVariants?: boolean }) =>
      api.post(`/review/${category}/clear-published`, body),
    options: {
      onMutate: async ({ productId, field, variantId, allVariants }) => {
        if (variantId || allVariants) return undefined;
        const target = { category, productId, field };
        await cancelReviewFieldValueCacheQueries(queryClient, target);
        return {
          snapshot: clearPublishedReviewFieldFromCaches(queryClient, target),
        };
      },
      onError: (err: unknown, _variables, context) => {
        if (context) restoreReviewFieldValueCaches(queryClient, context.snapshot);
        console.error('clear published failed', err);
      },
    },
  });

  // Candidate deletion mutations
  const deleteCandidateMut = useDataChangeMutation<
    CandidateDeleteResponse,
    Error,
    { sourceId: string },
    CandidateDeleteMutationContext | undefined
  >({
    event: 'candidate-deleted',
    category,
    mutationFn: ({ sourceId }: { sourceId: string }) =>
      deleteCandidateBySourceId(category, selectedProductId, selectedField, sourceId),
    options: {
      onMutate: async ({ sourceId }) => {
        const target = {
          category,
          productId: selectedProductId,
          field: selectedField,
        };
        if (!target.productId || !target.field) return undefined;
        await cancelReviewCandidateCacheQueries(queryClient, target);
        return {
          ...target,
          snapshot: removeReviewCandidateFromCaches(queryClient, {
            ...target,
            sourceId,
          }),
        };
      },
      onError: (_error, _variables, context) => {
        if (!context) return;
        restoreReviewCandidateCaches(
          queryClient,
          context.category,
          context.productId,
          context.field,
          context.snapshot,
        );
      },
    },
  });

  const deleteAllCandidatesMut = useDataChangeMutation<
    CandidateDeleteResponse,
    Error,
    void,
    CandidateDeleteMutationContext | undefined
  >({
    event: 'candidate-deleted',
    category,
    mutationFn: () =>
      deleteAllCandidatesForField(category, selectedProductId, selectedField),
    options: {
      onMutate: async () => {
        const target = {
          category,
          productId: selectedProductId,
          field: selectedField,
        };
        if (!target.productId || !target.field) return undefined;
        await cancelReviewCandidateCacheQueries(queryClient, target);
        return {
          ...target,
          snapshot: removeAllReviewCandidatesFromCaches(queryClient, target),
        };
      },
      onError: (_error, _variables, context) => {
        if (!context) return;
        restoreReviewCandidateCaches(
          queryClient,
          context.category,
          context.productId,
          context.field,
          context.snapshot,
        );
      },
    },
  });

  const fieldRowUnpublishMut = useDataChangeMutation<
    ReviewFieldRowActionResponse,
    Error,
    { fieldKey: string },
    FieldRowMutationContext
  >({
    event: 'key-finder-unpublished',
    category,
    mutationFn: ({ fieldKey }) => unpublishReviewFieldRow(category, fieldKey),
    options: {
      onMutate: async ({ fieldKey }) => {
        const target = { category, field: fieldKey };
        await cancelReviewFieldRowCacheQueries(queryClient, target);
        return {
          snapshot: unpublishReviewFieldRowFromCaches(queryClient, target),
        };
      },
      onError: (_error, _variables, context) => {
        if (!context) return;
        restoreReviewFieldRowCaches(queryClient, context.snapshot);
      },
    },
  });

  const fieldRowDeleteMut = useDataChangeMutation<
    ReviewFieldRowActionResponse,
    Error,
    { fieldKey: string },
    FieldRowMutationContext
  >({
    event: 'key-finder-field-deleted',
    category,
    mutationFn: ({ fieldKey }) => deleteReviewFieldRow(category, fieldKey),
    options: {
      onMutate: async ({ fieldKey }) => {
        const target = { category, field: fieldKey };
        await cancelReviewFieldRowCacheQueries(queryClient, target);
        return {
          snapshot: deleteReviewFieldRowFromCaches(queryClient, target),
        };
      },
      onError: (_error, _variables, context) => {
        if (!context) return;
        restoreReviewFieldRowCaches(queryClient, context.snapshot);
      },
    },
  });

  const productNonVariantUnpublishMut = useDataChangeMutation<
    ReviewProductNonVariantActionResponse,
    Error,
    { productId: string; fieldKeys: readonly string[] },
    ProductNonVariantMutationContext
  >({
    event: 'key-finder-unpublished',
    category,
    mutationFn: ({ productId }) => unpublishReviewProductNonVariantKeys(category, productId),
    options: {
      onMutate: async ({ productId, fieldKeys }) => {
        const target = { category, productId, fieldKeys };
        await cancelReviewProductNonVariantCacheQueries(queryClient, target);
        return {
          snapshot: unpublishReviewProductNonVariantFromCaches(queryClient, target),
        };
      },
      onError: (_error, _variables, context) => {
        if (!context) return;
        restoreReviewProductNonVariantCaches(queryClient, context.snapshot);
      },
    },
  });

  const productNonVariantDeleteMut = useDataChangeMutation<
    ReviewProductNonVariantActionResponse,
    Error,
    { productId: string; fieldKeys: readonly string[] },
    ProductNonVariantMutationContext
  >({
    event: 'key-finder-field-deleted',
    category,
    mutationFn: ({ productId }) => deleteReviewProductNonVariantKeys(category, productId),
    options: {
      onMutate: async ({ productId, fieldKeys }) => {
        const target = { category, productId, fieldKeys };
        await cancelReviewProductNonVariantCacheQueries(queryClient, target);
        return {
          snapshot: deleteReviewProductNonVariantFromCaches(queryClient, target),
        };
      },
      onError: (_error, _variables, context) => {
        if (!context) return;
        restoreReviewProductNonVariantCaches(queryClient, context.snapshot);
      },
    },
  });

  // Core save logic — shared by debounced autosave and immediate commit.
  //
  // WHY variantId lookup: for variant-dependent fields (release_date, etc.)
  // the cell displays the default variant's value (per reviewGridData seeding),
  // so an inline edit must be scoped to that variant. The backend now rejects
  // variant-dependent overrides without variantId (variant_id_required).
  const saveEdit = useCallback((productId: string, field: string, value: string, originalValue: string) => {
    if (value === originalValue) return;

    const cached = queryClient.getQueryData<ProductsIndexResponse>(['reviewProductsIndex', category]);
    const product = cached?.products?.find((p) => p.product_id === productId);
    const fieldState = product?.fields?.[field];
    const defaultVariantId = fieldState?.variant_values
      ? Object.entries(fieldState.variant_values).find(([, entry]) => entry.is_default === true)?.[0]
      : undefined;

    setSaveStatus('saving');
    manualOverrideMut.mutate({
      productId,
      field,
      value,
      ...(defaultVariantId ? { variantId: defaultVariantId } : {}),
    });
  }, [manualOverrideMut, setSaveStatus, queryClient, category]);

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
  const productHeaderActionState = useMemo(
    () => deriveReviewProductHeaderActionState({ rows: layout?.rows ?? [] }),
    [layout?.rows],
  );
  const fieldRowActionPending = fieldRowUnpublishMut.isPending || fieldRowDeleteMut.isPending;
  const productHeaderActionPending = productNonVariantUnpublishMut.isPending || productNonVariantDeleteMut.isPending;
  const reviewGridActionPending = fieldRowActionPending || productHeaderActionPending;
  const handleFieldRowAction = useCallback((action: ReviewFieldRowActionKind, fieldKey: string) => {
    setFieldRowDeleteTarget(buildReviewFieldRowDeleteTarget({
      action,
      fieldKey,
      productCount: indexData?.total ?? products.length,
    }));
  }, [indexData?.total, products.length]);
  const handleProductHeaderAction = useCallback((action: ReviewProductHeaderActionKind, productId: string, productLabel: string) => {
    setFieldRowDeleteTarget(buildReviewProductHeaderDeleteTarget({
      action,
      productId,
      productLabel,
      fieldCount: productHeaderActionState.fieldCount,
    }));
  }, [productHeaderActionState.fieldCount]);
  const handleConfirmReviewGridAction = useCallback(() => {
    if (!fieldRowDeleteTarget) return;
    const dismiss = () => setFieldRowDeleteTarget(null);
    const onError = (err: unknown) => {
      setFieldRowDeleteTarget(null);
      const verb = fieldRowDeleteTarget.kind === 'field-row-unpublish' || fieldRowDeleteTarget.kind === 'product-nonvariant-unpublish'
        ? 'Unpublish'
        : 'Delete';
      const message = err instanceof Error ? err.message : String(err || 'Unknown error');
      window.alert(`${verb} failed: ${message}`);
    };
    if (fieldRowDeleteTarget.kind === 'field-row-unpublish') {
      if (!fieldRowDeleteTarget.fieldKey) return;
      const fieldKey = fieldRowDeleteTarget.fieldKey;
      void fieldRowUnpublishMut.mutateAsync({ fieldKey }).then(dismiss).catch(onError);
      return;
    }
    if (fieldRowDeleteTarget.kind === 'field-row-delete') {
      if (!fieldRowDeleteTarget.fieldKey) return;
      const fieldKey = fieldRowDeleteTarget.fieldKey;
      void fieldRowDeleteMut.mutateAsync({ fieldKey }).then(dismiss).catch(onError);
      return;
    }
    if (fieldRowDeleteTarget.kind === 'product-nonvariant-unpublish') {
      if (!fieldRowDeleteTarget.productId) return;
      void productNonVariantUnpublishMut.mutateAsync({
        productId: fieldRowDeleteTarget.productId,
        fieldKeys: productHeaderActionState.fieldKeys,
      }).then(dismiss).catch(onError);
      return;
    }
    if (fieldRowDeleteTarget.kind === 'product-nonvariant-delete') {
      if (!fieldRowDeleteTarget.productId) return;
      void productNonVariantDeleteMut.mutateAsync({
        productId: fieldRowDeleteTarget.productId,
        fieldKeys: productHeaderActionState.fieldKeys,
      }).then(dismiss).catch(onError);
    }
  }, [
    fieldRowDeleteTarget,
    fieldRowUnpublishMut,
    fieldRowDeleteMut,
    productNonVariantUnpublishMut,
    productNonVariantDeleteMut,
    productHeaderActionState.fieldKeys,
  ]);

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
          onFieldRowAction={handleFieldRowAction}
          fieldRowActionPending={reviewGridActionPending}
          onProductHeaderAction={handleProductHeaderAction}
          productHeaderActionPending={reviewGridActionPending}
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
              onManualOverride={(value, variantId) => {
                manualOverrideMut.mutate({
                  productId: selectedProductId,
                  field: selectedField,
                  value,
                  ...(variantId ? { variantId } : {}),
                });
              }}
              onClearPublished={({ variantId, allVariants }) => {
                clearPublishedMut.mutate({
                  productId: selectedProductId,
                  field: selectedField,
                  ...(variantId ? { variantId } : {}),
                  ...(allVariants ? { allVariants: true } : {}),
                });
              }}
              clearPending={clearPublishedMut.isPending}
              overrideError={manualOverrideMut.error instanceof Error ? manualOverrideMut.error.message : null}
              clearError={clearPublishedMut.error instanceof Error ? clearPublishedMut.error.message : null}
              isPending={manualOverrideMut.isPending}
              candidates={drawerCandidates}
              candidatesLoading={candidatesLoading}
              publishedValue={activeFieldState.selected.value}
              onDeleteCandidate={(sourceId) => deleteCandidateMut.mutate({ sourceId })}
              onDeleteAllCandidates={() => deleteAllCandidatesMut.mutate()}
              deletePending={deleteCandidateMut.isPending || deleteAllCandidatesMut.isPending}
              variantDependent={variantDependent}
              variantValues={activeFieldState.variant_values}
              variantCatalog={activeProduct.variants}
            />
          );
        })()}
      </div>
      {fieldRowDeleteTarget && (
        <FinderDeleteConfirmModal
          target={fieldRowDeleteTarget}
          onConfirm={handleConfirmReviewGridAction}
          onCancel={() => setFieldRowDeleteTarget(null)}
          isPending={reviewGridActionPending}
          moduleLabel="Review Grid"
          confirmLabel={
            fieldRowDeleteTarget.kind === 'field-row-unpublish' || fieldRowDeleteTarget.kind === 'product-nonvariant-unpublish'
              ? 'Unpublish'
              : 'Delete'
          }
        />
      )}
    </div>
  );
}
