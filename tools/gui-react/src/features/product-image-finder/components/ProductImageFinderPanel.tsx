/**
 * Product Image Finder Panel — Indexing Lab embedded panel.
 *
 * Shows ALL unique images found across ALL runs, tagged with run number,
 * ordered by run. Click any thumbnail to view full size.
 * Gate: requires CEF data before PIF can run.
 */

import { useMemo, useCallback, useState } from 'react';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import './ProductImageFinderPanel.css';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import {
  FinderPanelHeader,
  FinderKpiCard,
  FinderPanelFooter,
  FinderDeleteConfirmModal,
  FinderSectionCard,
  FinderHowItWorks,
  useResolvedFinderModel,
  deriveFinderStatusChip,
  ColorSwatch,
  usePagination,
  PagerSizeSelector,
  PagerNavFooter,
  DataIntegrityBanner,
} from '../../../shared/ui/finder/index.ts';
import type { KpiCard, DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { usePersistedExpandMap } from '../../../stores/tabStore.ts';
import { useOperationsStore } from '../../../stores/operationsStore.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useColorEditionFinderQuery } from '../../color-edition-finder/index.ts';
import type { ColorRegistryEntry } from '../../color-edition-finder/index.ts';
import {
  useProductImageFinderQuery,
  useDeleteProductImageFinderAllMutation,
  useDeleteProductImageFinderRunMutation,
  useDeleteProductImageFinderRunsBatchMutation,
  useDeleteProductImageMutation,
  useProcessProductImageMutation,
  useProcessAllProductImagesMutation,
  useDeleteEvalRecordMutation,
} from '../api/productImageFinderQueries.ts';
import type { ProductImageEntry, GalleryImage } from '../types.ts';
import { pifHowItWorksSections } from '../pifHowItWorksContent.ts';
import { ImageLightbox } from './ImageLightbox.tsx';
import { GalleryCard } from './GalleryCard.tsx';
import { imageServeUrl } from '../helpers/pifImageUrls.ts';
import {
  resolveVariantColorAtoms,
  buildVariantList,
  buildGalleryImages,
  groupImagesByVariant,
  resolveSlots,
  groupRunsByLoop,
  groupEvalsByVariant,
} from '../selectors/pifSelectors.ts';
import { CarouselSlotRow } from './CarouselSlotRow.tsx';
import { PifRunHistoryRow } from './PifRunHistoryRow.tsx';
import { EvalHistoryRow } from './EvalHistoryRow.tsx';
import { EvalVariantGroupRow } from './EvalVariantGroupRow.tsx';
import { PifLoopGroup } from './PifLoopGroup.tsx';

/* ── Main Panel ──────────────────────────────────────────────────── */

interface ProductImageFinderPanelProps {
  productId: string;
  category: string;
}

export function ProductImageFinderPanel({ productId, category }: ProductImageFinderPanelProps) {
  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:pif:collapsed:${productId}`, true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [lightboxImg, setLightboxImg] = useState<GalleryImage | null>(null);
  const [pifImageGroupExpand, togglePifImageGroupExpand, replacePifImageGroupExpand] = usePersistedExpandMap(`indexing:pif:imageGroups:${productId}`);
  const [pifRunExpand, togglePifRunExpand] = usePersistedExpandMap(`indexing:pif:runExpand:${productId}`);
  const [pifEvalExpand, togglePifEvalExpand] = usePersistedExpandMap(`indexing:pif:evalExpand:${productId}`);
  const [pifEvalGroupExpand, togglePifEvalGroupExpand] = usePersistedExpandMap(`indexing:pif:evalGroupExpand:${productId}`);
  const [pifLoopExpand, togglePifLoopExpand] = usePersistedExpandMap(`indexing:pif:loopExpand:${productId}`);

  // LLM model for imageFinder phase (shared hook, parameterized by phase ID)
  const { model: resolvedModel, accessMode: resolvedAccessMode, modelDisplay, effortLevel } = useResolvedFinderModel('imageFinder');
  const { model: evalModel, accessMode: evalAccessMode, modelDisplay: evalModelDisplay, effortLevel: evalEffortLevel } = useResolvedFinderModel('imageEvaluator');

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

  const deleteRunMut = useDeleteProductImageFinderRunMutation(category, productId);
  const deleteRunsBatchMut = useDeleteProductImageFinderRunsBatchMutation(category, productId);
  const deleteAllMut = useDeleteProductImageFinderAllMutation(category, productId);
  const deleteImageMut = useDeleteProductImageMutation(category, productId);
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

  // Operations tracker — only Loop locks per-variant; View/Hero are spammable
  const ops = useOperationsStore((s) => s.operations);
  const loopingVariants = useMemo(() => {
    const set = new Set<string>();
    for (const o of ops.values()) {
      if (o.type === 'pif' && o.productId === productId && o.status === 'running' && o.variantKey && o.subType === 'loop') {
        set.add(o.variantKey);
      }
    }
    return set;
  }, [ops, productId]);
  const evaluatingVariants = useMemo(() => {
    const set = new Set<string>();
    for (const o of ops.values()) {
      if (o.type === 'pif' && o.productId === productId && o.status === 'running' && o.subType === 'evaluate') {
        if (o.variantKey) set.add(o.variantKey);
      }
    }
    return set;
  }, [ops, productId]);
  const isRunning = useMemo(
    () => [...ops.values()].some((o) => o.type === 'pif' && o.productId === productId && o.status === 'running'),
    [ops, productId],
  );

  // Build variant list from CEF published data, enriched with stable variant_id from registry
  const variants = useMemo(() => {
    if (cefError) return [];
    const pub = cefData?.published;
    if (!pub?.colors?.length) return [];
    const list = buildVariantList({
      colors: pub.colors,
      color_names: pub.color_names,
      editions: pub.edition_details,
    });
    // Enrich with stable variant_id from CEF registry
    const registry = cefData?.variant_registry;
    if (registry?.length) {
      const registryMap = new Map(registry.map((r) => [r.variant_key, r.variant_id]));
      for (const v of list) {
        v.variant_id = registryMap.get(v.key);
      }
    }
    return list;
  }, [cefData, cefError]);

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
  const pifRunUrl = `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  const pifLoopUrl = `${pifRunUrl}/loop`;
  const pifEvalViewUrl = `${pifRunUrl}/evaluate-view`;
  const pifEvalHeroUrl = `${pifRunUrl}/evaluate-hero`;

  const findVariantId = useCallback((variantKey: string) =>
    variants.find((v) => v.key === variantKey)?.variant_id, [variants]);

  const handleRunVariantView = useCallback((variantKey: string) => {
    fire(pifRunUrl, { variant_key: variantKey, variant_id: findVariantId(variantKey), mode: 'view' }, { subType: 'view', variantKey });
  }, [fire, pifRunUrl, findVariantId]);

  const handleRunVariantHero = useCallback((variantKey: string) => {
    fire(pifRunUrl, { variant_key: variantKey, variant_id: findVariantId(variantKey), mode: 'hero' }, { subType: 'hero', variantKey });
  }, [fire, pifRunUrl, findVariantId]);

  const handleLoopAll = useCallback(() => {
    for (const v of variants) {
      if (!loopingVariants.has(v.key)) {
        fire(pifLoopUrl, { variant_key: v.key, variant_id: v.variant_id }, { subType: 'loop', variantKey: v.key });
      }
    }
  }, [fire, pifLoopUrl, variants, loopingVariants]);

  const handleLoopVariant = useCallback((variantKey: string) => {
    if (!loopingVariants.has(variantKey)) {
      fire(pifLoopUrl, { variant_key: variantKey, variant_id: findVariantId(variantKey) }, { subType: 'loop', variantKey });
    }
  }, [fire, pifLoopUrl, loopingVariants, findVariantId]);

  // WHY: Stagger eval calls 500ms apart to avoid overwhelming the server.
  // Each view eval + hero eval fires as its own operation tracker entry.
  // Returns the number of calls scheduled so callers can chain delays.
  const EVAL_STAGGER_MS = 500;

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

  const fireEvalForVariant = useCallback((variantKey: string, startDelay = 0): number => {
    // WHY: Look up views from PIF's own image data, not by filtering on the
    // CEF-derived variant key. This decouples eval from CEF state — eval works
    // even if CEF is mid-run or variant keys have drifted.
    const viewSet = pifVariantViewMap.get(variantKey);
    if (!viewSet || viewSet.size === 0) return 0;
    const canonicalViews = [...viewSet].filter((v) => v !== 'hero');
    const hasHeroes = viewSet.has('hero');
    const vid = findVariantId(variantKey);

    canonicalViews.forEach((view, i) => {
      setTimeout(() => {
        fire(pifEvalViewUrl, { variant_key: variantKey, variant_id: vid, view }, { subType: 'evaluate', variantKey });
      }, startDelay + i * EVAL_STAGGER_MS);
    });

    // Hero eval fires after canonical views — evaluates view='hero' candidates with vision
    if (hasHeroes) {
      setTimeout(() => {
        fire(pifEvalHeroUrl, { variant_key: variantKey, variant_id: vid }, { subType: 'evaluate', variantKey });
      }, startDelay + canonicalViews.length * EVAL_STAGGER_MS);
    }

    return canonicalViews.length + (hasHeroes ? 1 : 0);
  }, [fire, pifEvalViewUrl, pifEvalHeroUrl, pifData, findVariantId]);

  const handleEvalAll = useCallback(() => {
    let totalDelay = 0;
    for (const v of variants) {
      const callCount = fireEvalForVariant(v.key, totalDelay);
      totalDelay += callCount * EVAL_STAGGER_MS;
    }
  }, [fireEvalForVariant, variants, EVAL_STAGGER_MS]);

  const handleEvalVariant = useCallback((variantKey: string) => {
    if (!evaluatingVariants.has(variantKey)) {
      fireEvalForVariant(variantKey);
    }
  }, [fireEvalForVariant, evaluatingVariants]);

  const heroEnabled = pifData?.carouselSettings?.heroEnabled ?? true;

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'run' && deleteTarget.runNumber) {
      deleteRunMut.mutate(deleteTarget.runNumber, { onSuccess: () => setDeleteTarget(null) });
    } else if (deleteTarget.kind === 'loop' && deleteTarget.runNumbers?.length) {
      deleteRunsBatchMut.mutate(deleteTarget.runNumbers, { onSuccess: () => setDeleteTarget(null) });
    } else {
      deleteAllMut.mutate(undefined, { onSuccess: () => setDeleteTarget(null) });
    }
  }, [deleteTarget, deleteRunMut, deleteRunsBatchMut, deleteAllMut]);

  if (!productId || !category) return null;

  const hasCefData = Boolean(variants.length);
  const effectiveResult = isError ? null : pifData;
  const statusChip = deriveFinderStatusChip(effectiveResult ?? null);
  const imageCount = galleryImages.length;
  const runCount = effectiveResult?.run_count ?? 0;
  const runs = effectiveResult?.runs || [];

  // Aggregate carousel progress across all variants
  const carouselProgressMap = effectiveResult?.carouselProgress ?? {};
  // Slots per variant = viewBudget views + hero slots
  const slotsPerVariant = (pifData?.carouselSettings?.viewBudget ?? ['top', 'left', 'angle']).length
    + (pifData?.carouselSettings?.heroEnabled ? 3 : 0);

  const carouselAgg = useMemo(() => {
    if (variants.length === 0 || slotsPerVariant === 0) return { filled: 0, total: 0, allComplete: false };
    // Count filled slots across all variant groups
    const vb = pifData?.carouselSettings?.viewBudget ?? ['top', 'left', 'angle'];
    const hc = pifData?.carouselSettings?.heroEnabled ? 3 : 0;
    const cSlots = pifData?.carousel_slots ?? {};
    let filled = 0;
    for (const group of imageGroups) {
      const slots = resolveSlots(vb, hc, group.key, cSlots, group.images as ProductImageEntry[]);
      filled += slots.filter(s => s.filename && s.filename !== '__cleared__').length;
    }
    const total = variants.length * slotsPerVariant;
    return { filled, total, allComplete: filled >= total };
  }, [imageGroups, variants, slotsPerVariant, pifData]);

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
  const evalBadgeProps = {
    accessMode: evalAccessMode,
    role: (evalModel?.useReasoning ? 'reasoning' : 'primary') as 'reasoning' | 'primary',
    thinking: evalModel?.thinking ?? false,
    webSearch: evalModel?.webSearch ?? false,
  };

  // Memoize grouped lists for pagination (previously computed inline in JSX)
  const pifRunGroups = useMemo(() => groupRunsByLoop([...runs].reverse()), [runs]);
  const pifEvalGroups = useMemo(() => groupEvalsByVariant([...(pifData?.evaluations ?? [])].reverse()), [pifData?.evaluations]);

  const pifRunPag = usePagination({ totalItems: pifRunGroups.length, storageKey: 'finder-page-size:pif-history' });
  const pifEvalPag = usePagination({ totalItems: pifEvalGroups.length, storageKey: 'finder-page-size:pif-eval' });

  const visiblePifRunGroups = pifRunGroups.slice(pifRunPag.startIndex, pifRunPag.endIndex);
  const visiblePifEvalGroups = pifEvalGroups.slice(pifEvalPag.startIndex, pifEvalPag.endIndex);

  return (
    <div className="sf-surface-panel p-0 flex flex-col">
      {/* Header */}
      <FinderPanelHeader
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        title="Product Image Finder"
        tip="Finds and downloads high-resolution product images per color variant and edition. Requires CEF data."
        isRunning={isRunning}
        runDisabled={false}
        runLabel="Loop"
        onRun={handleLoopAll}
        actionSlot={
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); handleEvalAll(); }}
              disabled={!hasCefData || imageCount === 0 || evaluatingVariants.size > 0}
              className="w-28 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed text-center"
              title="Carousel Builder: evaluate all variants"
            >
              Eval All
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleLoopAll(); }}
              disabled={!hasCefData || (variants.length > 0 && variants.every((v) => loopingVariants.has(v.key)))}
              className="w-28 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-primary-button disabled:opacity-40 disabled:cursor-not-allowed text-center"
            >
              Loop
            </button>
          </div>
        }
      >
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold tracking-[0.04em] sf-chip-purple border-[1.5px] border-current">
          <ModelBadgeGroup {...badgeProps} />
          {modelDisplay}
          {effortLevel && <span className="sf-text-muted font-normal">{effortLevel}</span>}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold tracking-[0.04em] sf-chip-accent border-[1.5px] border-current">
          <ModelBadgeGroup {...evalBadgeProps} />
          {evalModelDisplay}
          {evalEffortLevel && <span className="sf-text-muted font-normal">{evalEffortLevel}</span>}
        </span>
      </FinderPanelHeader>

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
                      className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded border sf-border-soft hover:opacity-100"
                      style={{
                        color: isProcessingAll ? 'var(--sf-muted)' : 'var(--sf-accent, #4263eb)',
                        opacity: isProcessingAll ? 0.8 : 0.7,
                      }}
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
                </div>
              }
            >
              <div className="pif-gallery-columns">
                {imageGroups.map(group => {
                  const isOpen = !!pifImageGroupExpand[group.key];
                  const groupColorAtoms = resolveVariantColorAtoms(group.key, editions);
                  const groupHexParts = groupColorAtoms.map(a => hexMap.get(a.trim()) || '');
                  const groupSlots = resolveSlots(
                    pifData?.carouselSettings?.viewBudget ?? ['top', 'left', 'angle'],
                    pifData?.carouselSettings?.heroEnabled ? 3 : 0,
                    group.key,
                    pifData?.carousel_slots ?? {},
                    group.images as ProductImageEntry[],
                  );
                  const progress = carouselProgressMap[group.key];
                  const progressLabel = progress
                    ? `${progress.viewsFilled}/${progress.viewsTotal} views \u00B7 ${progress.heroCount}/${progress.heroTarget} heroes`
                    : null;
                  return (
                    <div key={group.key} className="break-inside-avoid mb-3 sf-surface-panel rounded-lg overflow-hidden">
                      <div
                        onClick={() => togglePifImageGroupExpand(group.key)}
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none hover:opacity-80"
                      >
                        <span
                          className={`text-[10px] sf-text-muted shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                        >
                          {'\u25B6'}
                        </span>
                        <ColorSwatch hexParts={groupHexParts} />
                        <span className="text-[12px] font-semibold sf-text-primary truncate min-w-0 flex-1">
                          {group.label}
                        </span>
                        <Chip
                          label={group.type === 'edition' ? 'ED' : 'CLR'}
                          className={group.type === 'edition' ? 'sf-chip-accent' : 'sf-chip-info'}
                        />
                        {group.images.length > 0 ? (
                          <Chip label={`${group.images.length} img`} className="sf-chip-success" />
                        ) : (
                          <span className="text-[10px] sf-text-muted italic">no images</span>
                        )}
                        {progressLabel && (
                          <span className="text-[9px] sf-text-muted font-mono whitespace-nowrap">{progressLabel}</span>
                        )}
                        <div className="shrink-0 flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRunVariantView(group.key); }}
                            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-primary-button"
                            title="Single view run"
                          >
                            View
                          </button>
                          {heroEnabled && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRunVariantHero(group.key); }}
                              className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-primary-button"
                              title="Single hero run"
                            >
                              Hero
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleLoopVariant(group.key); }}
                            disabled={loopingVariants.has(group.key)}
                            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Loop: views then heroes until carousel complete"
                          >
                            Loop
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEvalVariant(group.key); }}
                            disabled={evaluatingVariants.has(group.key) || group.images.length === 0}
                            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Carousel Builder: evaluate images and pick best per view"
                          >
                            Eval
                          </button>
                        </div>
                      </div>
                      {group.orphaned && (
                        <div className="px-3 pb-1">
                          <DataIntegrityBanner message="Orphaned variant — images reference a variant not in the registry. Re-run CEF to re-discover, or delete these images." />
                        </div>
                      )}
                      {isOpen && (
                        <div className="px-3 pb-3">
                          {/* Carousel Slots — inside variant group, same card size */}
                          <CarouselSlotRow
                            variantKey={group.key}
                            variantId={group.variant_id}
                            viewBudget={pifData?.carouselSettings?.viewBudget ?? ['top', 'left', 'angle']}
                            heroCount={pifData?.carouselSettings?.heroEnabled ? 3 : 0}
                            carouselSlots={pifData?.carousel_slots ?? {}}
                            images={group.images}
                            category={category}
                            productId={productId}
                          />
                          {group.images.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {(() => {
                                const slotSourceMap = new Map<string, 'eval' | 'user'>();
                                for (const s of groupSlots) {
                                  if (s.filename && s.source !== 'empty') slotSourceMap.set(s.filename, s.source as 'eval' | 'user');
                                }
                                return group.images.map((img, i) => (
                                <GalleryCard
                                  key={`${img.run_number}-${img.variant_key}-${img.view}-${i}`}
                                  img={img}
                                  category={category}
                                  productId={productId}
                                  onOpen={() => setLightboxImg(img)}
                                  onDelete={(filename) => deleteImageMut.mutate(filename)}
                                  onProcess={handleProcessImage}
                                  isProcessing={processingFilename === img.filename}
                                  carouselSource={slotSourceMap.get(img.filename)}
                                />
                              ));
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                  <button
                    onClick={() => setDeleteTarget({ kind: 'all', count: runCount })}
                    disabled={deleteAllMut.isPending}
                    className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Delete All
                  </button>
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
                  <button
                    onClick={() => {
                      const allEvalNumbers = (pifData?.evaluations ?? []).map(e => e.eval_number);
                      for (const n of allEvalNumbers) deleteEvalMut.mutate(n);
                    }}
                    disabled={deleteEvalMut.isPending}
                    className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Delete All
                  </button>
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
                      onDelete={(n) => deleteEvalMut.mutate(n)}
                      expanded={!!pifEvalExpand[String(group.evals[0].eval_number)]}
                      onToggle={() => togglePifEvalExpand(String(group.evals[0].eval_number))}
                    />
                  ) : (
                    <EvalVariantGroupRow
                      key={group.variantKey}
                      group={group}
                      hexMap={hexMap}
                      editions={editions}
                      onDeleteEval={(n) => deleteEvalMut.mutate(n)}
                      onDeleteVariantEvals={(nums) => { for (const n of nums) deleteEvalMut.mutate(n); }}
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
          isPending={deleteRunMut.isPending || deleteRunsBatchMut.isPending || deleteAllMut.isPending}
          moduleLabel="PIF"
        />
      )}

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
