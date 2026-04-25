import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import type { PifVariantProgressGen } from '../../types/product.generated.ts';
import { ColorSwatch } from '../../shared/ui/finder/ColorSwatch.tsx';
import { FinderRunModelBadge, PromptPreviewModal, useResolvedFinderModel } from '../../shared/ui/finder/index.ts';
import { Popover } from '../../shared/ui/overlay/Popover.tsx';
import { FinderRunPopoverShell } from '../../shared/ui/overlay/FinderRunPopoverShell.tsx';
import { useFireAndForget } from '../../features/operations/hooks/useFireAndForget.ts';
import { useIsModuleRunning } from '../../features/operations/hooks/useFinderOperations.ts';
import { usePromptPreviewQuery } from '../../features/indexing/api/promptPreviewQueries.ts';
import { useFinderDiscoveryHistoryStore } from '../../stores/finderDiscoveryHistoryStore.ts';
import { groupHistory, type FinderRun } from '../../shared/ui/finder/discoveryHistoryHelpers.ts';
import { RunPreviewCell } from './RunPreviewCell.tsx';
import {
  buildGalleryImages,
  resolveSlots,
  sortByPriorityAndSize,
} from '../../features/product-image-finder/selectors/pifSelectors.ts';
import { imageServeUrl } from '../../features/product-image-finder/helpers/pifImageUrls.ts';
import { CarouselPreviewPopup } from '../../features/product-image-finder/components/CarouselPreviewPopup.tsx';
import {
  createPifLoopPromptPreviewState,
  createPifPromptPreviewBody,
  type PifPromptPreviewState,
} from '../../features/product-image-finder/state/pifPromptPreviewState.ts';
import type {
  CarouselSlide,
  GalleryImage,
  ProductImageEntry,
  ProductImageFinderResult,
} from '../../features/product-image-finder/types.ts';
import { PifVariantRings } from './PifVariantRings.tsx';

export interface PifVariantPopoverProps {
  readonly productId: string;
  readonly category: string;
  readonly variant: PifVariantProgressGen;
  readonly hexMap: ReadonlyMap<string, string>;
  /** When true, the trigger SVGs pulse (this variant has a PIF op running). */
  readonly pulsing?: boolean;
}

const EVAL_STAGGER_MS = 500;
const DEFAULT_VIEW_BUDGET: readonly string[] = ['top', 'left', 'angle'];

const INDIVIDUAL_VIEWS: ReadonlyArray<{ readonly id: string; readonly label: string }> = [
  { id: 'top',    label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'left',   label: 'Left' },
  { id: 'right',  label: 'Right' },
  { id: 'front',  label: 'Front' },
  { id: 'rear',   label: 'Rear' },
  { id: 'sangle', label: 'S-Angle' },
  { id: 'angle',  label: 'Angle' },
];

/**
 * Per-variant PIF cell with two click targets:
 *   • Color swatch     → action popover (Run View / Hero / Loop / Evaluate)
 *   • Rings + fraction → full-screen Embla carousel of this variant's
 *                         resolved slots (same component the Indexing Lab uses)
 */
export function PifVariantPopover({
  productId, category, variant, hexMap, pulsing = false,
}: PifVariantPopoverProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [promptPreview, setPromptPreview] = useState<PifPromptPreviewState | null>(null);
  const hexParts = variant.color_atoms.map((atom) => hexMap.get(atom) || '').filter(Boolean);
  const label = variant.variant_label || variant.variant_key || variant.variant_id;
  const totalFilled = variant.priority_filled + variant.loop_filled + variant.hero_filled;
  const totalTarget = variant.priority_total + variant.hero_target + variant.loop_total;

  const fire = useFireAndForget({ type: 'pif', category, productId });
  const isRunning = useIsModuleRunning('pif', productId);

  const runUrl = `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  const loopUrl = `${runUrl}/loop`;
  const evalViewUrl = `${runUrl}/evaluate-view`;
  const evalHeroUrl = `${runUrl}/evaluate-hero`;

  const finderModel = useResolvedFinderModel('imageFinder');
  const evalModel = useResolvedFinderModel('imageEvaluator');

  // WHY: Same cache key the Indexing Lab uses. Lazy-enabled only when either
  // popup is open so we don't pay one fetch per row at table render time.
  // staleTime:0 + refetchOnMount:'always' guarantees that re-opening after an
  // eval round-trip pulls fresh slot assignments — the WS data-change handler
  // also invalidates this key, so an open popup updates live as the lab
  // shifts user-overrides or eval winners.
  const popOpen = popoverOpen || carouselOpen;
  const { data: pifData } = useQuery<ProductImageFinderResult>({
    queryKey: ['product-image-finder', category, productId],
    queryFn: () => api.get<ProductImageFinderResult>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: popOpen && Boolean(category) && Boolean(productId),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const variantKey = variant.variant_key || '';
  const variantId = variant.variant_id;

  // Eval-target detection for the action button — uses the lightweight images
  // list on the PIF result so we know which views have something to evaluate.
  const evalTargets = useMemo(() => {
    const set = new Set<string>();
    for (const img of pifData?.images ?? []) {
      if ((img?.variant_key || '') === variantKey) set.add(img?.view || '');
    }
    return set;
  }, [pifData?.images, variantKey]);
  const canonicalViews = useMemo(
    () => [...evalTargets].filter((v) => v && v !== 'hero'),
    [evalTargets],
  );
  const hasHeroes = evalTargets.has('hero');
  const hasEvalTargets = canonicalViews.length > 0 || hasHeroes;

  // Carousel slides — bit-for-bit parity with Indexing Lab's CarouselSlotRow:
  //   buildGalleryImages → filter to variant → sortByPriorityAndSize
  //   → resolveSlots → keep only filled (non-'__cleared__') slots
  // Output is bounded to viewBudget.length + heroCount slides — exactly the
  // images currently *occupying* a carousel slot (user-override OR eval
  // winner / ranked hero). No raw run-output images, no candidates that
  // didn't make the cut.
  const slides = useMemo<readonly CarouselSlide[]>(() => {
    if (!pifData) return [];
    const settings = pifData.carouselSettings;
    const viewBudget: string[] = [...(settings?.viewBudget ?? DEFAULT_VIEW_BUDGET)];
    const heroCount = settings?.heroEnabled ? 3 : 0;
    const carouselSlots = pifData.carousel_slots ?? {};
    const galleryImages = buildGalleryImages(pifData.runs ?? []);
    const variantImages = sortByPriorityAndSize(
      galleryImages.filter((img) => (img.variant_key || '') === variantKey),
      category,
    );
    const slots = resolveSlots(viewBudget, heroCount, variantKey, carouselSlots, variantImages as ProductImageEntry[]);
    const filenameToImage = new Map<string, GalleryImage>();
    for (const img of variantImages) filenameToImage.set(img.filename, img);
    const filledSlots = slots.filter((s) => s.filename && s.filename !== '__cleared__');
    return filledSlots.map((s) => {
      const img = filenameToImage.get(s.filename!);
      const isHero = s.slot.startsWith('hero_');
      return {
        slotLabel: isHero ? s.slot.replace('_', ' ').toUpperCase() : s.slot.toUpperCase(),
        source: s.source as 'user' | 'eval',
        src: imageServeUrl(category, productId, s.filename!),
        bytes: img?.bytes ?? 0,
        width: img?.width ?? 0,
        height: img?.height ?? 0,
        reasoning: img?.eval_reasoning ?? '',
        runNumber: img?.run_number ?? null,
      };
    });
  }, [pifData, variantKey, category, productId]);

  const handleRunPriority = useCallback(() => {
    fire(runUrl, { variant_key: variantKey, variant_id: variantId, mode: 'view' }, { subType: 'priority-view', variantKey });
    setPopoverOpen(false);
  }, [fire, runUrl, variantKey, variantId]);

  const handleRunIndividualView = useCallback((view: string) => {
    fire(runUrl, { variant_key: variantKey, variant_id: variantId, mode: 'view', view }, { subType: 'view-single', variantKey });
    setPopoverOpen(false);
  }, [fire, runUrl, variantKey, variantId]);

  const handleRunHero = useCallback(() => {
    fire(runUrl, { variant_key: variantKey, variant_id: variantId, mode: 'hero' }, { subType: 'hero', variantKey });
    setPopoverOpen(false);
  }, [fire, runUrl, variantKey, variantId]);

  const handleRunLoop = useCallback(() => {
    fire(loopUrl, { variant_key: variantKey, variant_id: variantId }, { subType: 'loop', variantKey });
    setPopoverOpen(false);
  }, [fire, loopUrl, variantKey, variantId]);

  const handleEval = useCallback(() => {
    canonicalViews.forEach((view, i) => {
      setTimeout(() => {
        fire(evalViewUrl, { variant_key: variantKey, variant_id: variantId, view }, { subType: 'evaluate', variantKey });
      }, i * EVAL_STAGGER_MS);
    });
    if (hasHeroes) {
      setTimeout(() => {
        fire(evalHeroUrl, { variant_key: variantKey, variant_id: variantId }, { subType: 'evaluate', variantKey });
      }, canonicalViews.length * EVAL_STAGGER_MS);
    }
    setPopoverOpen(false);
  }, [fire, evalViewUrl, evalHeroUrl, canonicalViews, hasHeroes, variantKey, variantId]);

  const promptPreviewBody = useMemo(
    () => createPifPromptPreviewBody(promptPreview),
    [promptPreview],
  );
  const promptPreviewQuery = usePromptPreviewQuery(
    'pif',
    category,
    productId,
    promptPreviewBody,
    Boolean(promptPreview),
  );

  // Per-variant Hist: union URL/query counts across view+hero modes for this
  // variant. Mirrors the indexing-lab variant row so the Overview popover and
  // the lab show identical counts for the same variant.
  const histCounts = useMemo(() => {
    if (!variantId) return null;
    const grouped = groupHistory((pifData?.runs ?? []) as readonly FinderRun[], 'variant+mode');
    const modes = grouped.byVariantMode.get(variantId);
    if (!modes) return { urls: 0, queries: 0 };
    const urls = new Set<string>();
    const queries = new Set<string>();
    for (const bucket of modes.values()) {
      for (const u of bucket.urls) urls.add(u);
      for (const q of bucket.queries) queries.add(q);
    }
    return { urls: urls.size, queries: queries.size };
  }, [pifData?.runs, variantId]);

  const openHistoryDrawer = useFinderDiscoveryHistoryStore((s) => s.openDrawer);
  const handleOpenHistory = useCallback(() => {
    if (!variantId) return;
    openHistoryDrawer({
      finderId: 'productImageFinder',
      productId,
      category,
      variantIdFilter: variantId,
    });
    setPopoverOpen(false);
  }, [openHistoryDrawer, productId, category, variantId]);

  const ringsTitle = slides.length > 0
    ? `Open carousel preview (${slides.length} image${slides.length === 1 ? '' : 's'})`
    : pifData
      ? 'No carousel images yet for this variant.'
      : 'Open carousel preview';

  return (
    <span className={`sf-pif-rings-cluster${pulsing ? ' sf-pulsing' : ''}`}>
      <Popover
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        triggerLabel={`PIF ${label} — actions`}
        triggerClassName="sf-pif-rings-color-trigger"
        trigger={<ColorSwatch hexParts={hexParts} size="md" />}
      >
        <FinderRunPopoverShell
          title={`Product Image Finder — ${label}`}
          meta={
            <>P {variant.priority_filled}/{variant.priority_total} &middot; H {variant.hero_filled}/{variant.hero_target} &middot; L {variant.loop_filled}/{variant.loop_total}</>
          }
          modelSlot={
            <>
              <FinderRunModelBadge
                labelPrefix="PIF"
                model={finderModel.modelDisplay}
                accessMode={finderModel.accessMode}
                thinking={finderModel.model?.thinking ?? false}
                webSearch={finderModel.model?.webSearch ?? false}
                effortLevel={finderModel.effortLevel}
              />
              <FinderRunModelBadge
                labelPrefix="Eval"
                model={evalModel.modelDisplay}
                accessMode={evalModel.accessMode}
                thinking={evalModel.model?.thinking ?? false}
                webSearch={evalModel.model?.webSearch ?? false}
                effortLevel={evalModel.effortLevel}
              />
            </>
          }
          actions={
            <div className="sf-pif-popover-actions-stack">
              <div className="sf-pif-popover-runs-grid">
                <RunPreviewCell
                  label="Priority"
                  runTitle="Priority View Run — one LLM call across all viewConfig priority views"
                  previewTitle="Preview the Priority View Run prompt"
                  onRun={handleRunPriority}
                  onPreview={() => setPromptPreview({ variantKey, mode: 'view', label: 'Priority View Run' })}
                  primary
                />
                {INDIVIDUAL_VIEWS.map((v) => (
                  <RunPreviewCell
                    key={v.id}
                    label={v.label}
                    runTitle={`Individual View Run — ${v.label}`}
                    previewTitle={`Preview the ${v.label} Individual View Run prompt`}
                    onRun={() => handleRunIndividualView(v.id)}
                    onPreview={() => setPromptPreview({ variantKey, mode: 'view', view: v.id, label: `${v.label} Individual View Run` })}
                  />
                ))}
                <RunPreviewCell
                  label="Hero"
                  runTitle="Hero Run — lifestyle/contextual images"
                  previewTitle="Preview the Hero Run prompt"
                  onRun={handleRunHero}
                  onPreview={() => setPromptPreview({ variantKey, mode: 'hero', label: 'Hero Run' })}
                />
              </div>
              <div className="sf-pif-popover-tail-grid">
                <RunPreviewCell
                  label="Loop"
                  runTitle="Loop: per-view focused calls until carousel complete"
                  previewTitle="Preview the Loop prompt sequence"
                  onRun={handleRunLoop}
                  onPreview={() => setPromptPreview(createPifLoopPromptPreviewState(variantKey))}
                  disabled={isRunning}
                />
                <button
                  type="button"
                  className="sf-frp-btn-secondary"
                  onClick={handleEval}
                  disabled={!hasEvalTargets || isRunning}
                  title="Carousel Builder: vision LLM picks winners"
                >
                  Evaluate
                </button>
              </div>
              <button
                type="button"
                className="sf-frp-btn-history"
                onClick={handleOpenHistory}
                disabled={!variantId}
                title={!variantId ? 'No variant_id — open the panel-level history.' : `Open Discovery History filtered to "${label}".`}
              >
                Hist
                <span className="ml-1 font-mono text-[11px]">
                  (<span className="font-bold">{histCounts?.queries ?? 0}</span>
                  <span className="font-normal opacity-70">qu</span>)
                  (<span className="font-bold">{histCounts?.urls ?? 0}</span>
                  <span className="font-normal opacity-70">url</span>)
                </span>
              </button>
            </div>
          }
        />
      </Popover>

      <button
        type="button"
        className="sf-pif-rings-carousel-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setCarouselOpen(true);
        }}
        title={ringsTitle}
        aria-label={ringsTitle}
        disabled={false}
      >
        <PifVariantRings
          priorityFilled={variant.priority_filled}
          priorityTotal={variant.priority_total}
          loopFilled={variant.loop_filled}
          loopTotal={variant.loop_total}
          heroFilled={variant.hero_filled}
          heroTarget={variant.hero_target}
        />
        <span className="sf-pif-rings-label">{totalFilled}/{totalTarget}</span>
        <span
          className="sf-pif-rings-imgcount"
          title={`${variant.image_count} image${variant.image_count === 1 ? '' : 's'} collected for this variant`}
        >
          {variant.image_count} img
        </span>
      </button>

      {carouselOpen && slides.length > 0 && (
        <CarouselPreviewPopup slides={slides} onClose={() => setCarouselOpen(false)} />
      )}
      {carouselOpen && slides.length === 0 && (
        <CarouselEmptyOverlay onClose={() => setCarouselOpen(false)} label={label} />
      )}

      <PromptPreviewModal
        open={Boolean(promptPreview)}
        onClose={() => setPromptPreview(null)}
        query={promptPreviewQuery}
        title={`PIF — ${promptPreview?.label ?? ''}`}
        subtitle={`variant: ${promptPreview?.variantKey ?? variantKey}`}
        storageKeyPrefix={`overview:pif:preview:${productId}:${variantKey}:${promptPreview?.mode ?? ''}:${promptPreview?.view ?? ''}`}
      />
    </span>
  );
}


/** Lightweight overlay shown when the carousel button is clicked but the
 *  variant has no resolved slots yet. Matches the carousel popup's z-index
 *  and dismissal contract so users get clear feedback rather than a no-op. */
function CarouselEmptyOverlay({ label, onClose }: { readonly label: string; readonly onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
      role="dialog"
      aria-label={`No carousel images for ${label}`}
    >
      <div
        className="rounded-lg px-6 py-5 text-center"
        style={{ backgroundColor: 'rgba(24,24,24,1)', color: 'rgba(255,255,255,0.85)', minWidth: 280 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[13px] font-semibold mb-1">No carousel images yet</div>
        <div className="text-[11px] opacity-70">Run PIF for {label} to generate carousel slots, then click the rings again.</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 px-3 py-1 rounded text-[11px] font-semibold"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)' }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
