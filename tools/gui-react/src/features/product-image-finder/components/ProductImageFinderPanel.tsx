/**
 * Product Image Finder Panel — Indexing Lab embedded panel.
 *
 * Shows ALL unique images found across ALL runs, tagged with run number,
 * ordered by run. Click any thumbnail to view full size.
 * Gate: requires CEF data before PIF can run.
 */

import { useMemo, useCallback, useState } from 'react';
import './ProductImageFinderPanel.css';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import {
  IndexingPanelHeader,
  PromptPreviewTriggerButton,
  PromptDrawerChevron,
  FinderKpiCard,
  FinderPanelFooter,
  FinderEditablePhaseModelBadge,
  FinderDeleteConfirmModal,
  FinderSectionCard,
  FinderHowItWorks,
  DiscoveryHistoryButton,
  PromptPreviewModal,
  useResolvedFinderModel,
  usePagination,
  PagerSizeSelector,
  PagerNavFooter,
  getIndexingPanelCollapsedDefault,
} from '../../../shared/ui/finder/index.ts';
import { HeaderActionButton, RowActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { usePromptPreviewQuery } from '../../indexing/api/promptPreviewQueries.ts';
import type { KpiCard, DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { usePersistedExpandMap } from '../../../stores/tabStore.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';
import { useIsModuleRunning, useRunningFieldKeys, useRunningVariantKeys } from '../../operations/hooks/useFinderOperations.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useColorEditionFinderQuery } from '../../color-edition-finder/index.ts';
import type { ColorRegistryEntry } from '../../color-edition-finder/index.ts';
import {
  useProductImageFinderQuery,
  useProductImageDependenciesQuery,
  useDeleteProductImageFinderAllMutation,
  useDeleteProductImageFinderRunMutation,
  useDeleteProductImageFinderRunsBatchMutation,
  useDeleteProductImageMutation,
  useDeleteProductImagesMutation,
  useProcessProductImageMutation,
  useProcessAllProductImagesMutation,
  useClearCarouselWinnersMutation,
  useDeleteEvalRecordMutation,
} from '../api/productImageFinderQueries.ts';
import type { ProductImageDependencyStatus, ProductImageEntry, GalleryImage } from '../types.ts';
import { pifHowItWorksSections } from '../pifHowItWorksContent.ts';
import { ImageLightbox } from './ImageLightbox.tsx';
import { imageServeUrl } from '../helpers/pifImageUrls.ts';
import {
  createPifHeaderPromptPreviewState,
  createPifPromptPreviewBody,
  type PifPromptPreviewState,
} from '../state/pifPromptPreviewState.ts';
import {
  buildVariantList,
  buildGalleryImages,
  groupImagesByVariant,
  resolveSlots,
  groupRunsByLoop,
  groupEvalsByVariant,
  buildExpandAllRunHistoryMaps,
  isAllRunHistoryExpanded,
} from '../selectors/pifSelectors.ts';
import { VariantImageGroup } from './VariantImageGroup.tsx';
import { PifRunHistoryRow } from './PifRunHistoryRow.tsx';
import { EvalHistoryRow } from './EvalHistoryRow.tsx';
import { EvalVariantGroupRow } from './EvalVariantGroupRow.tsx';
import { PifLoopGroup } from './PifLoopGroup.tsx';
import { groupHistory, type FinderRun } from '../../../shared/ui/finder/discoveryHistoryHelpers.ts';

/* ── Main Panel ──────────────────────────────────────────────────── */

interface ProductImageFinderPanelProps {
  productId: string;
  category: string;
}

function formatDependencyLockTitle(status: ProductImageDependencyStatus | undefined): string {
  if (!status) return 'Checking Product Image Dependent keys before PIF can run.';
  if (status.ready) return 'Product Image Dependent keys are resolved; PIF can run.';
  const missing = status.missing_keys.join(', ') || 'unknown';
  return `PIF locked until Product Image Dependent key(s) are resolved: ${missing}. Use Run Dep to run these keys solo.`;
}

export function ProductImageFinderPanel({ productId, category }: ProductImageFinderPanelProps) {
  const [collapsed, toggleCollapsed] = usePersistedToggle(
    `indexing:pif:collapsed:${productId}`,
    getIndexingPanelCollapsedDefault('pif'),
  );
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [activePromptModal, setActivePromptModal] = useState<PifPromptPreviewState | null>(null);
  const [lightboxImg, setLightboxImg] = useState<GalleryImage | null>(null);
  const [pifImageGroupExpand, togglePifImageGroupExpand, replacePifImageGroupExpand] = usePersistedExpandMap(`indexing:pif:imageGroups:${productId}`);
  const [pifRunExpand, togglePifRunExpand, replacePifRunExpand] = usePersistedExpandMap(`indexing:pif:runExpand:${productId}`);
  const [pifEvalExpand, togglePifEvalExpand] = usePersistedExpandMap(`indexing:pif:evalExpand:${productId}`);
  const [pifEvalGroupExpand, togglePifEvalGroupExpand] = usePersistedExpandMap(`indexing:pif:evalGroupExpand:${productId}`);
  const [pifLoopExpand, togglePifLoopExpand, replacePifLoopExpand] = usePersistedExpandMap(`indexing:pif:loopExpand:${productId}`);

  // LLM model for imageFinder phase (shared hook, parameterized by phase ID)
  const { model: resolvedModel, accessMode: resolvedAccessMode, modelDisplay, effortLevel } = useResolvedFinderModel('imageFinder');

  // Color registry for hex lookup in run history badges
  const { data: colorRegistry = [] } = useQuery<ColorRegistryEntry[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<ColorRegistryEntry[]>('/colors'),
  });
  const hexMap = useMemo(() => new Map(colorRegistry.map(c => [c.name, c.hex])), [colorRegistry]);

  // CEF data — gate dependency
  const { data: cefData, isError: cefError } = useColorEditionFinderQuery(category, productId);

  // Editions map for resolving edition variant_key → color atoms
  const editions = useMemo(
    () => (cefData?.published?.edition_details ?? {}) as Record<string, { display_name?: string; colors?: string[] }>,
    [cefData],
  );

  // PIF data
  const { data: pifData, isLoading, isError } = useProductImageFinderQuery(category, productId);
  const { data: dependencyStatus } = useProductImageDependenciesQuery(category, productId);

  const promptPreviewBody = useMemo(
    () => createPifPromptPreviewBody(activePromptModal),
    [activePromptModal],
  );
  const promptPreviewQuery = usePromptPreviewQuery(
    'pif',
    category,
    productId,
    promptPreviewBody,
    Boolean(activePromptModal),
  );

  const [headerPromptModalOpen, setHeaderPromptModalOpen] = useState(false);

  const deleteRunMut = useDeleteProductImageFinderRunMutation(category, productId);
  const deleteRunsBatchMut = useDeleteProductImageFinderRunsBatchMutation(category, productId);
  const deleteAllMut = useDeleteProductImageFinderAllMutation(category, productId);
  const deleteImageMut = useDeleteProductImageMutation(category, productId);
  const deleteImagesMut = useDeleteProductImagesMutation(category, productId);
  const clearCarouselWinnersMut = useClearCarouselWinnersMutation(category, productId);
  const deleteEvalMut = useDeleteEvalRecordMutation(category, productId);
  const processImageMut = useProcessProductImageMutation(category, productId);
  const processAllMut = useProcessAllProductImagesMutation(category, productId);
  const [processingFilename, setProcessingFilename] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);

  const handleProcessImage = useCallback((filename: string) => {
    setProcessingFilename(filename);
    setProcessError(null);
    processImageMut.mutate(filename, {
      onSuccess: () => setProcessingFilename(null),
      onError: (err) => {
        setProcessingFilename(null);
        setProcessError(`Failed to process ${filename}: ${err.message}`);
      },
    });
  }, [processImageMut]);

  // WHY: Stable refs so GalleryCard's React.memo is effective. Inline closures
  // over `img` would create new function refs on every render, defeating memo.
  const handleOpenLightbox = useCallback((img: GalleryImage) => setLightboxImg(img), []);
  const handleDeleteImage = useCallback((filename: string) => {
    setDeleteTarget({ kind: 'image', filename });
  }, []);
  const handleDeleteVariantImages = useCallback((filenames: readonly string[], label: string, variantKey: string) => {
    setDeleteTarget({ kind: 'images-variant', filenames, count: filenames.length, label, variantKey });
  }, []);
  const handleClearVariantCarousel = useCallback((variantKey: string, variantId: string | null, label: string) => {
    setDeleteTarget({ kind: 'carousel-clear-variant', variantKey, variantId: variantId ?? undefined, label });
  }, []);

  // Operations tracker — focused selectors only re-render when PIF-specific state changes
  const isRunning = useIsModuleRunning('pif', productId);
  const runningDependencyKeys = useRunningFieldKeys('kf', productId);
  const loopingVariants = useRunningVariantKeys('pif', productId, 'loop');
  const evaluatingVariants = useRunningVariantKeys('pif', productId, 'evaluate');

  // WHY: Build variants directly from the CEF variant_registry (SSOT).
  // One registry row = one variant. Labels use color_names[combo] for colors
  // and edition_display_name for editions. This avoids the duplicate-edition
  // bug that arose when deriving from published.colors (which now cascades
  // edition combos into colors).
  const variants = useMemo(() => {
    if (cefError) return [];
    const registry = cefData?.variant_registry;
    if (!registry?.length) return [];
    return buildVariantList(registry, cefData?.published?.color_names);
  }, [cefData, cefError]);
  const headerPromptState = useMemo(
    () => createPifHeaderPromptPreviewState(variants),
    [variants],
  );
  const headerPromptBody = useMemo(
    () => createPifPromptPreviewBody(headerPromptState),
    [headerPromptState],
  );
  const headerPromptQuery = usePromptPreviewQuery(
    'pif',
    category,
    productId,
    headerPromptBody,
    headerPromptModalOpen && Boolean(headerPromptState),
  );

  // All images from all runs, ordered by run_number, tagged with run metadata
  const galleryImages = useMemo(
    () => buildGalleryImages(pifData?.runs || []),
    [pifData],
  );

  const unprocessedImages = useMemo(
    () => galleryImages.filter(img => !img.bg_removed && img.filename),
    [galleryImages],
  );

  const isProcessingAll = processAllMut.isPending;

  const handleProcessAll = useCallback(async () => {
    if (unprocessedImages.length === 0) return;
    setProcessError(null);
    try {
      await processAllMut.mutateAsync(undefined);
    } catch (err) {
      setProcessError(`Batch processing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [unprocessedImages.length, processAllMut]);

  // Images grouped by variant (preserves CEF variant order)
  const imageGroups = useMemo(
    () => groupImagesByVariant(galleryImages, variants, category),
    [galleryImages, variants],
  );

  // ── Fire-and-forget (each call is independent — safe to spam) ──
  const fire = useFireAndForget({ type: 'pif', category, productId });
  const fireKeyFinder = useFireAndForget({ type: 'kf', category, productId });
  const pifRunUrl = `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  const pifLoopUrl = `${pifRunUrl}/loop`;
  const pifEvalCarouselUrl = `${pifRunUrl}/evaluate-carousel`;
  const keyFinderRunUrl = `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;

  const findVariantId = useCallback((variantKey: string) =>
    variants.find((v) => v.key === variantKey)?.variant_id, [variants]);

  const effectiveDependencyStatus = dependencyStatus ?? pifData?.dependencyStatus;
  const pifDependencyLocked = effectiveDependencyStatus?.ready !== true;
  const pifDependencyTitle = formatDependencyLockTitle(effectiveDependencyStatus);
  const missingDependencyKeys = effectiveDependencyStatus?.missing_keys ?? [];
  const dependencyRunBusy = missingDependencyKeys.some((fieldKey) => runningDependencyKeys.has(fieldKey));

  const handleRunDependencies = useCallback(() => {
    for (const fieldKey of missingDependencyKeys) {
      if (runningDependencyKeys.has(fieldKey)) continue;
      fireKeyFinder(
        keyFinderRunUrl,
        { field_key: fieldKey, mode: 'run', force_solo: true, reason: 'pif_dependency' },
        { fieldKey },
      );
    }
  }, [fireKeyFinder, keyFinderRunUrl, missingDependencyKeys, runningDependencyKeys]);

  const handleRunVariantPriorityView = useCallback((variantKey: string) => {
    if (pifDependencyLocked) return;
    fire(pifRunUrl, { variant_key: variantKey, variant_id: findVariantId(variantKey), mode: 'view' }, { subType: 'priority-view', variantKey });
  }, [fire, pifRunUrl, findVariantId, pifDependencyLocked]);

  const handleRunVariantIndividualView = useCallback((variantKey: string, view: string) => {
    if (pifDependencyLocked) return;
    fire(pifRunUrl, { variant_key: variantKey, variant_id: findVariantId(variantKey), mode: 'view', view }, { subType: 'view-single', variantKey });
  }, [fire, pifRunUrl, findVariantId, pifDependencyLocked]);

  const handleRunVariantHero = useCallback((variantKey: string) => {
    if (pifDependencyLocked) return;
    fire(pifRunUrl, { variant_key: variantKey, variant_id: findVariantId(variantKey), mode: 'hero' }, { subType: 'hero', variantKey });
  }, [fire, pifRunUrl, findVariantId, pifDependencyLocked]);

  const handleLoopAll = useCallback(() => {
    if (pifDependencyLocked) return;
    for (const v of variants) {
      if (!loopingVariants.has(v.key)) {
        fire(pifLoopUrl, { variant_key: v.key, variant_id: v.variant_id }, { subType: 'loop', variantKey: v.key });
      }
    }
  }, [fire, pifLoopUrl, variants, loopingVariants, pifDependencyLocked]);

  const handleLoopVariant = useCallback((variantKey: string) => {
    if (pifDependencyLocked) return;
    if (!loopingVariants.has(variantKey)) {
      fire(pifLoopUrl, { variant_key: variantKey, variant_id: findVariantId(variantKey) }, { subType: 'loop', variantKey });
    }
  }, [fire, pifLoopUrl, loopingVariants, findVariantId, pifDependencyLocked]);

  // WHY: Build a PIF-native variant→views map from accumulated images.
  // This is keyed by the actual variant_key stored on PIF images, not the
  // CEF-derived variant key. If CEF re-runs and variant keys shift, eval
  // still works because we match against PIF's own stored keys.
  const pifVariantViewMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const img of (pifData?.images ?? []) as Array<{ variant_key: string; view: string }>) {
      const key = img.variant_key || '';
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(img.view);
    }
    return map;
  }, [pifData]);

  const fireEvalForVariant = useCallback((variantKey: string): number => {
    if (pifDependencyLocked) return 0;
    // WHY: Look up views from PIF's own image data, not by filtering on the
    // CEF-derived variant key. This decouples eval from CEF state — eval works
    // even if CEF is mid-run or variant keys have drifted.
    const viewSet = pifVariantViewMap.get(variantKey);
    if (!viewSet || viewSet.size === 0) return 0;
    const canonicalViews = [...viewSet].filter((v) => v !== 'hero');
    const hasHeroes = viewSet.has('hero');
    const vid = findVariantId(variantKey);

    if (canonicalViews.length === 0 && !hasHeroes) return 0;
    fire(pifEvalCarouselUrl, { variant_key: variantKey, variant_id: vid }, { subType: 'evaluate', variantKey });

    return 1;
  }, [fire, pifEvalCarouselUrl, pifVariantViewMap, findVariantId, pifDependencyLocked]);

  const handleEvalAll = useCallback(() => {
    for (const v of variants) {
      fireEvalForVariant(v.key);
    }
  }, [fireEvalForVariant, variants]);

  const handleEvalVariant = useCallback((variantKey: string) => {
    if (!evaluatingVariants.has(variantKey)) {
      fireEvalForVariant(variantKey);
    }
  }, [fireEvalForVariant, evaluatingVariants]);

  const heroEnabled = pifData?.carouselSettings?.heroEnabled ?? true;

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const dismiss = () => setDeleteTarget(null);
    switch (deleteTarget.kind) {
      case 'run':
        if (deleteTarget.runNumber) deleteRunMut.mutate(deleteTarget.runNumber, { onSuccess: dismiss });
        break;
      case 'loop':
        if (deleteTarget.runNumbers?.length) deleteRunsBatchMut.mutate(deleteTarget.runNumbers, { onSuccess: dismiss });
        break;
      case 'image':
        if (deleteTarget.filename) deleteImageMut.mutate(deleteTarget.filename, { onSuccess: dismiss });
        break;
      case 'eval':
        if (deleteTarget.evalNumber != null) deleteEvalMut.mutate(deleteTarget.evalNumber, { onSuccess: dismiss });
        break;
      case 'eval-all':
      case 'eval-variant':
        if (deleteTarget.evalNumbers?.length) {
          for (const n of deleteTarget.evalNumbers) deleteEvalMut.mutate(n);
          dismiss();
        }
        break;
      case 'carousel-clear-variant':
        if (deleteTarget.variantKey) {
          clearCarouselWinnersMut.mutate({
            variant_key: deleteTarget.variantKey,
            variant_id: deleteTarget.variantId,
          }, { onSuccess: dismiss });
        }
        break;
      case 'images-all':
      case 'images-variant':
        if (deleteTarget.filenames?.length) {
          deleteImagesMut.mutate({
            filenames: deleteTarget.filenames,
            scope: deleteTarget.kind === 'images-all' ? 'all' : 'variant',
            variantKey: deleteTarget.variantKey,
          }, { onSuccess: dismiss });
        }
        break;
      default:
        deleteAllMut.mutate(undefined, { onSuccess: dismiss });
    }
  }, [deleteTarget, deleteRunMut, deleteRunsBatchMut, deleteAllMut, deleteImageMut, deleteImagesMut, deleteEvalMut, clearCarouselWinnersMut]);

  const hasCefData = Boolean(variants.length);
  const effectiveResult = isError ? null : pifData;
  const imageCount = galleryImages.length;
  const runCount = effectiveResult?.run_count ?? 0;
  const runs = effectiveResult?.runs || [];

  // Per-variant URL/query counts for the in-row Hist button label. PIF's
  // discovery scope is 'variant+mode'; the inner buckets are now run-scope
  // pools (priority-view / view:<focus> / loop-view / loop-hero / hero), not
  // just coarse modes — but we still union URLs/queries across all pools per
  // variant_id to surface a single total, matching what the drawer renders
  // when opened for that variant.
  const histCountsByVariantId = useMemo(() => {
    const grouped = groupHistory(runs as readonly FinderRun[], 'variant+mode');
    const map = new Map<string, { urls: number; queries: number }>();
    for (const [vid, modes] of grouped.byVariantMode.entries()) {
      const urls = new Set<string>();
      const queries = new Set<string>();
      for (const bucket of modes.values()) {
        for (const u of bucket.urls) urls.add(u);
        for (const q of bucket.queries) queries.add(q);
      }
      map.set(vid, { urls: urls.size, queries: queries.size });
    }
    return map;
  }, [runs]);

  // Aggregate carousel progress across all variants
  const carouselProgressMap = effectiveResult?.carouselProgress ?? {};
  // Configured target slots stay as the fallback; resolved slots may grow with extras.
  const configuredSlotsPerVariant = (pifData?.carouselSettings?.viewBudget ?? ['top', 'left', 'angle']).length
    + (pifData?.carouselSettings?.heroEnabled ? 3 : 0);

  const carouselAgg = useMemo(() => {
    if (variants.length === 0 || configuredSlotsPerVariant === 0) return { filled: 0, total: 0, allComplete: false };
    // Count filled slots across all variant groups
    const vb = pifData?.carouselSettings?.viewBudget ?? ['top', 'left', 'angle'];
    const hc = pifData?.carouselSettings?.heroEnabled ? 3 : 0;
    const cSlots = pifData?.carousel_slots ?? {};
    let filled = 0;
    let total = 0;
    for (const group of imageGroups) {
      const slots = resolveSlots(vb, hc, group.key, cSlots, group.images as ProductImageEntry[]);
      filled += slots.filter(s => s.filename && s.filename !== '__cleared__').length;
      total += Math.max(slots.length, configuredSlotsPerVariant);
    }
    return { filled, total, allComplete: filled >= total };
  }, [imageGroups, variants, configuredSlotsPerVariant, pifData]);

  const kpiCards: KpiCard[] = [
    { label: 'Images', value: String(imageCount), tone: 'accent' },
    { label: 'Variants', value: String(variants.length), tone: 'purple' },
    { label: 'Runs', value: String(runCount), tone: 'success' },
    {
      label: 'Carousel Images',
      value: carouselAgg.total > 0 ? `${carouselAgg.filled}/${carouselAgg.total}` : '--',
      tone: carouselAgg.allComplete ? 'success' : 'info',
    },
  ];

  const badgeProps = {
    accessMode: resolvedAccessMode,
    role: (resolvedModel?.useReasoning ? 'reasoning' : 'primary') as 'reasoning' | 'primary',
    thinking: resolvedModel?.thinking ?? false,
    webSearch: resolvedModel?.webSearch ?? false,
  };

  // Memoize grouped lists for pagination (previously computed inline in JSX)
  const pifRunGroups = useMemo(() => groupRunsByLoop([...runs].reverse()), [runs]);
  const pifEvalGroups = useMemo(() => groupEvalsByVariant([...(pifData?.evaluations ?? [])].reverse()), [pifData?.evaluations]);

  const pifRunPag = usePagination({ totalItems: pifRunGroups.length, storageKey: 'finder-page-size:pif-history' });
  const pifEvalPag = usePagination({ totalItems: pifEvalGroups.length, storageKey: 'finder-page-size:pif-eval' });

  const visiblePifRunGroups = pifRunGroups.slice(pifRunPag.startIndex, pifRunPag.endIndex);
  const visiblePifEvalGroups = pifEvalGroups.slice(pifEvalPag.startIndex, pifEvalPag.endIndex);

  const allRunHistoryExpanded = useMemo(
    () => isAllRunHistoryExpanded(pifRunGroups, pifLoopExpand, pifRunExpand),
    [pifRunGroups, pifLoopExpand, pifRunExpand],
  );

  const handleToggleExpandAllRunHistory = useCallback(() => {
    if (allRunHistoryExpanded) {
      replacePifLoopExpand({});
      replacePifRunExpand({});
      return;
    }
    const { loops, runs: runMap } = buildExpandAllRunHistoryMaps(pifRunGroups);
    replacePifLoopExpand(loops);
    replacePifRunExpand(runMap);
  }, [allRunHistoryExpanded, pifRunGroups, replacePifLoopExpand, replacePifRunExpand]);

  return (
    <div className="sf-surface-panel p-0 flex flex-col" data-panel="pif">
      {/* Header */}
      <IndexingPanelHeader
        panel="pif"
        icon="▣"
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        title="Product Image Finder"
        tip="Finds and downloads high-resolution product images per color variant and edition. Requires CEF data."
        isRunning={isRunning}
        modelStrip={
          <>
            <FinderEditablePhaseModelBadge phaseId="imageFinder" labelPrefix="PIF" title="PIF - Product Image Finder" />
            <FinderEditablePhaseModelBadge phaseId="imageEvaluator" labelPrefix="EVAL" title="EVAL - Image Evaluator" />
          </>
        }
        actionSlot={
          <>
            <HeaderActionButton
              intent="locked"
              label="Run Dep"
              onClick={handleRunDependencies}
              disabled={!effectiveDependencyStatus || missingDependencyKeys.length === 0}
              busy={dependencyRunBusy}
              title={!effectiveDependencyStatus
                ? 'Checking Product Image Dependent keys.'
                : missingDependencyKeys.length === 0
                ? (effectiveDependencyStatus?.required_keys.length ? 'Product Image Dependent keys are already resolved.' : 'This category has no Product Image Dependent keys.')
                : `Run missing Product Image Dependent key(s) solo: ${missingDependencyKeys.join(', ')}`}
              width={ACTION_BUTTON_WIDTH.standardHeader}
            />
            <HeaderActionButton
              intent="locked"
              label="Eval All"
              onClick={handleEvalAll}
              disabled={pifDependencyLocked || !hasCefData || imageCount === 0}
              busy={evaluatingVariants.size > 0}
              title={pifDependencyLocked ? pifDependencyTitle : 'Carousel Builder: evaluate all variants'}
              width={ACTION_BUTTON_WIDTH.standardHeader}
            />
            <HeaderActionButton
              intent="locked"
              label="Loop"
              onClick={handleLoopAll}
              disabled={pifDependencyLocked || !hasCefData}
              busy={variants.length > 0 && variants.every((v) => loopingVariants.has(v.key))}
              title={pifDependencyLocked ? pifDependencyTitle : 'Loop all variants: views then heroes until carousel complete'}
              width={ACTION_BUTTON_WIDTH.standardHeader}
            />
            <span className="inline-block h-5 w-px mx-0.5 bg-current opacity-20" aria-hidden />
            <PromptDrawerChevron
              storageKey={`indexing:pif:panel-drawer:${productId}`}
              openWidthClass="w-[40rem]"
              drawerHeight="header"
              ariaLabel="Prompt + history + delete actions for PIF"
              closedTitle="Show Prompt / Hist / Data for PIF"
              openedTitle="Hide Prompt / Hist / Data for PIF"
              openTitle="Prompts:"
              primaryCustom={
                <PromptPreviewTriggerButton
                  onClick={() => setHeaderPromptModalOpen(true)}
                  disabled={!productId || !headerPromptState}
                  width={ACTION_BUTTON_WIDTH.standardHeader}
                />
              }
              secondaryTitle="Hist:"
              secondaryLabelClass="sf-history-label"
              secondaryCustom={
                <DiscoveryHistoryButton
                  finderId="productImageFinder"
                  productId={productId}
                  category={category}
                  width={ACTION_BUTTON_WIDTH.standardHeader}
                />
              }
              tertiaryTitle="Data:"
              tertiaryLabelClass="sf-delete-label"
              tertiaryActions={[
                {
                  id: 'del-all',
                  label: 'Delete All',
                  onClick: () => setDeleteTarget({ kind: 'all', count: runCount }),
                  disabled: deleteAllMut.isPending,
                  intent: deleteAllMut.isPending ? 'locked' : 'delete',
                  width: ACTION_BUTTON_WIDTH.standardHeader,
                  title: 'Permanently wipe ALL PIF data for this product (runs, URL/query history, image files on disk, evals, carousel slots). Cannot be undone.',
                },
              ]}
            />
          </>
        }
      />

      {/* Body */}
      {collapsed ? null : !hasCefData ? (
        <div className="px-6 pb-6 pt-4">
          <div className="sf-callout sf-callout-warning px-4 py-3 rounded-lg sf-text-caption">
            Run the <strong>Color & Edition Finder</strong> first — PIF needs color data to build the variant list.
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : (
        <div className="px-6 pb-6 pt-4 space-y-5">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpiCards.map(card => (
              <FinderKpiCard key={card.label} value={card.value} label={card.label} tone={card.tone} />
            ))}
          </div>

          {/* How It Works — collapsed by default */}
          <FinderHowItWorks
            storeKey={`pif:${productId}`}
            subtitle="Image discovery, learning & evaluation"
            sections={pifHowItWorksSections}
          />

          {/* All Images — grouped by variant, each group collapsible */}
          {variants.length > 0 && (
            <FinderSectionCard
              title="All Images"
              count={`${imageCount} across ${imageGroups.length} variant${imageGroups.length !== 1 ? 's' : ''}`}
              storeKey={`pif:images:${productId}`}
              defaultOpen
              trailing={
                <div className="flex items-center gap-2">
                  {unprocessedImages.length > 0 && (
                    <button
                      onClick={handleProcessAll}
                      disabled={isProcessingAll}
                      className={`px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded border sf-border-soft hover:opacity-100 ${isProcessingAll ? 'pif-process-btn--busy' : 'pif-process-btn'}`}
                    >
                      {isProcessingAll
                        ? 'Processing...'
                        : `Process All (${unprocessedImages.length})`}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const allOpen = imageGroups.every(g => !!pifImageGroupExpand[g.key]);
                      const next = Object.fromEntries(imageGroups.map(g => [g.key, !allOpen]));
                      replacePifImageGroupExpand(next);
                    }}
                    className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button border sf-border-soft opacity-60 hover:opacity-100"
                  >
                    {imageGroups.every(g => !!pifImageGroupExpand[g.key]) ? 'Collapse All' : 'Expand All'}
                  </button>
                  {imageCount > 0 && (
                    <RowActionButton
                      intent="delete"
                      label="Delete All"
                      onClick={() => {
                        const allFilenames = galleryImages.map(img => img.filename).filter(Boolean);
                        setDeleteTarget({ kind: 'images-all', filenames: allFilenames, count: allFilenames.length });
                      }}
                      disabled={deleteImageMut.isPending || deleteImagesMut.isPending}
                    />
                  )}
                </div>
              }
            >
              <div className="pif-gallery-columns">
                {[0, 1].map((colIdx) => (
                <div key={colIdx} className="flex flex-col gap-3">
                {imageGroups.filter((_, i) => i % 2 === colIdx).map(group => (
                  <VariantImageGroup
                    key={group.key}
                    group={group}
                    editions={editions}
                    hexMap={hexMap}
                    viewBudget={pifData?.carouselSettings?.viewBudget ?? ['top', 'left', 'angle']}
                    heroCount={pifData?.carouselSettings?.heroEnabled ? 3 : 0}
                    carouselSlots={pifData?.carousel_slots ?? {}}
                    carouselProgressMap={carouselProgressMap}
                    isOpen={!!pifImageGroupExpand[group.key]}
                    onToggle={() => togglePifImageGroupExpand(group.key)}
                    heroEnabled={heroEnabled}
                    pifDependencyLocked={pifDependencyLocked}
                    pifDependencyTitle={pifDependencyTitle}
                    loopingVariant={loopingVariants.has(group.key)}
                    evaluatingVariant={evaluatingVariants.has(group.key)}
                    histCounts={group.variant_id ? histCountsByVariantId.get(group.variant_id) ?? null : null}
                    onRunPriorityView={handleRunVariantPriorityView}
                    onRunIndividualView={handleRunVariantIndividualView}
                    onRunHero={handleRunVariantHero}
                    onLoopVariant={handleLoopVariant}
                    onEvalVariant={handleEvalVariant}
                    onClearCarouselWinners={handleClearVariantCarousel}
                    onOpenPromptModal={(variantKey, mode, view) => setActivePromptModal({ variantKey, mode, ...(view ? { view } : {}) })}
                    onOpenLightbox={handleOpenLightbox}
                    onDeleteImage={handleDeleteImage}
                    onDeleteVariantImages={handleDeleteVariantImages}
                    onProcessImage={handleProcessImage}
                    processingFilename={processingFilename}
                    category={category}
                    productId={productId}
                  />
                ))}
                </div>
                ))}
              </div>
            </FinderSectionCard>
          )}

          {/* Run History — collapsible, default closed, paginated */}
          {runs.length > 0 && (
            <FinderSectionCard
              title="Run History"
              count={`${runs.length} run${runs.length !== 1 ? 's' : ''}`}
              storeKey={`pif:history:${productId}`}
              trailing={
                <div className="flex items-center gap-2">
                  <PagerSizeSelector pageSize={pifRunPag.pageSize} onPageSizeChange={pifRunPag.setPageSize} />
                  <RowActionButton
                    intent="neutral"
                    label={allRunHistoryExpanded ? 'Collapse All' : 'Expand All'}
                    onClick={handleToggleExpandAllRunHistory}
                    disabled={pifRunGroups.length === 0}
                  />
                  <RowActionButton
                    intent="delete"
                    label="Delete All"
                    onClick={() => setDeleteTarget({ kind: 'all', count: runCount })}
                    disabled={deleteAllMut.isPending}
                  />
                </div>
              }
            >
              <div className="space-y-1.5">
                {visiblePifRunGroups.map((group, gi) => (
                  group.type === 'loop' ? (
                    <PifLoopGroup
                      key={group.loopId ?? gi}
                      group={group}
                      hexMap={hexMap}
                      editions={editions}
                      onDeleteRun={(rn) => setDeleteTarget({ kind: 'run', runNumber: rn })}
                      onDeleteLoop={(rns) => setDeleteTarget({ kind: 'loop', runNumbers: rns })}
                      expanded={!!pifLoopExpand[group.loopId ?? String(gi)]}
                      onToggle={() => togglePifLoopExpand(group.loopId ?? String(gi))}
                      runExpandMap={pifRunExpand}
                      onToggleRunExpand={togglePifRunExpand}
                    />
                  ) : (
                    <PifRunHistoryRow
                      key={group.runs[0].run_number}
                      run={group.runs[0]}
                      hexMap={hexMap}
                      editions={editions}
                      onDelete={(rn) => setDeleteTarget({ kind: 'run', runNumber: rn })}
                      expanded={!!pifRunExpand[String(group.runs[0].run_number)]}
                      onToggle={() => togglePifRunExpand(String(group.runs[0].run_number))}
                    />
                  )
                ))}
              </div>
              <PagerNavFooter page={pifRunPag.page} totalPages={pifRunPag.totalPages} showingLabel={pifRunPag.showingLabel} onPageChange={pifRunPag.setPage} />
            </FinderSectionCard>
          )}

          {/* Eval History — separate from run history, grouped by variant, paginated */}
          {(pifData?.evaluations?.length ?? 0) > 0 && (
            <FinderSectionCard
              title="Eval History"
              count={`${pifData?.evaluations?.length ?? 0} eval${(pifData?.evaluations?.length ?? 0) !== 1 ? 's' : ''}`}
              storeKey={`pif:eval-history:${productId}`}
              trailing={
                <div className="flex items-center gap-2">
                  <PagerSizeSelector pageSize={pifEvalPag.pageSize} onPageSizeChange={pifEvalPag.setPageSize} />
                  <RowActionButton
                    intent="delete"
                    label="Delete All"
                    onClick={() => {
                      const allEvalNumbers = (pifData?.evaluations ?? []).map(e => e.eval_number);
                      setDeleteTarget({ kind: 'eval-all', evalNumbers: allEvalNumbers, count: allEvalNumbers.length });
                    }}
                    disabled={deleteEvalMut.isPending}
                  />
                </div>
              }
            >
              <div className="space-y-1.5">
                {visiblePifEvalGroups.map((group) => (
                  group.evals.length === 1 ? (
                    <EvalHistoryRow
                      key={group.evals[0].eval_number}
                      evalRecord={group.evals[0]}
                      hexMap={hexMap}
                      editions={editions}
                      onDelete={(n) => setDeleteTarget({ kind: 'eval', evalNumber: n })}
                      expanded={!!pifEvalExpand[String(group.evals[0].eval_number)]}
                      onToggle={() => togglePifEvalExpand(String(group.evals[0].eval_number))}
                    />
                  ) : (
                    <EvalVariantGroupRow
                      key={group.variantKey}
                      group={group}
                      hexMap={hexMap}
                      editions={editions}
                      onDeleteEval={(n) => setDeleteTarget({ kind: 'eval', evalNumber: n })}
                      onDeleteVariantEvals={(nums, variantLabel) => setDeleteTarget({ kind: 'eval-variant', evalNumbers: [...nums], count: nums.length, label: variantLabel })}
                      expanded={!!pifEvalGroupExpand[group.variantKey]}
                      onToggle={() => togglePifEvalGroupExpand(group.variantKey)}
                      evalExpandMap={pifEvalExpand}
                      onToggleEvalExpand={togglePifEvalExpand}
                    />
                  )
                ))}
              </div>
              <PagerNavFooter page={pifEvalPag.page} totalPages={pifEvalPag.totalPages} showingLabel={pifEvalPag.showingLabel} onPageChange={pifEvalPag.setPage} />
            </FinderSectionCard>
          )}

          {processError && (
            <div className="sf-callout sf-callout-danger px-3 py-2 rounded sf-text-caption cursor-pointer" onClick={() => setProcessError(null)}>
              {processError}
            </div>
          )}

          {/* Footer */}
          <FinderPanelFooter
            lastRanAt={effectiveResult?.last_ran_at}
            runCount={runCount}
            modelSlot={
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold sf-text-subtle">
                <ModelBadgeGroup {...badgeProps} />
                {modelDisplay}
                {effortLevel && <span className="sf-text-muted font-normal">{effortLevel}</span>}
              </span>
            }
          />
        </div>
      )}

      {deleteTarget && (
        <FinderDeleteConfirmModal
          target={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteRunMut.isPending || deleteRunsBatchMut.isPending || deleteAllMut.isPending || deleteImageMut.isPending || deleteImagesMut.isPending || deleteEvalMut.isPending || clearCarouselWinnersMut.isPending}
          moduleLabel="PIF"
          confirmLabel={deleteTarget.kind === 'carousel-clear-variant' ? 'Clear' : undefined}
          pendingLabel={deleteTarget.kind === 'carousel-clear-variant' ? 'Clearing...' : undefined}
          descriptionOverrides={{
            // WHY: Server-side onAfterDeleteAll cascade now wipes image
            // files, evaluations, carousel slots, and the SQL projection
            // alongside the runs cleanup. Description must reflect the
            // true scope so users aren't surprised by the disk wipe.
            'all': 'This will permanently wipe everything for this product\u2019s PIF data: every run and its discovery history (URLs + queries), every image file on disk (master + originals), all eval records, and every carousel slot selection. CEF variants are preserved. This cannot be undone.',
          }}
        />
      )}

      <PromptPreviewModal
        open={Boolean(activePromptModal)}
        onClose={() => setActivePromptModal(null)}
        query={promptPreviewQuery}
        title={`PIF — ${activePromptModal?.mode ?? ''}`}
        subtitle={activePromptModal ? `variant: ${activePromptModal.variantKey}` : undefined}
        storageKeyPrefix={`indexing:pif:preview:${productId}:${activePromptModal?.variantKey ?? ''}:${activePromptModal?.mode ?? ''}`}
      />

      <PromptPreviewModal
        open={headerPromptModalOpen}
        onClose={() => setHeaderPromptModalOpen(false)}
        query={headerPromptQuery}
        title="Product Image Finder — Priority View Prompt"
        subtitle={headerPromptState ? `variant: ${headerPromptState.variantKey}` : undefined}
        storageKeyPrefix={`indexing:pif:header-preview:${productId}:${headerPromptState?.variantKey ?? ''}`}
      />

      {/* Lightbox overlay */}
      {lightboxImg && (
        <ImageLightbox
          img={lightboxImg}
          src={lightboxImg.filename ? imageServeUrl(category, productId, lightboxImg.filename, lightboxImg.bytes) : ''}
          category={category}
          productId={productId}
          onClose={() => setLightboxImg(null)}
        />
      )}
    </div>
  );
}
