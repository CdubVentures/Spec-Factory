/**
 * VariantImageGroup — memoized per-variant group in the PIF gallery.
 *
 * WHY: Extracted from ProductImageFinderPanel.tsx so each group only re-renders
 * when its own props change. Previously, per-group computation (resolveSlots,
 * resolveVariantColorAtoms, slotSourceMap) ran for every group on every parent
 * render, even when nothing changed.
 */
import { memo, useCallback, useMemo } from 'react';
import {
  DataIntegrityBanner,
  FinderVariantRow,
  ImageCountBadge,
  PromptDrawerChevron,
  VariantSlotDots,
} from '../../../shared/ui/finder/index.ts';
import { RowActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { resolveVariantColorAtoms, resolveSlots } from '../selectors/pifSelectors.ts';
import { GalleryCard } from './GalleryCard.tsx';
import { CarouselSlotRow } from './CarouselSlotRow.tsx';
import { PifRunStackDrawer } from './PifRunStackDrawer.tsx';
import { useFinderDiscoveryHistoryStore } from '../../../stores/finderDiscoveryHistoryStore.ts';
import type { ImageGroup, GalleryImage, ProductImageEntry, CarouselProgress } from '../types.ts';
import type { PifPromptPreviewMode } from '../state/pifPromptPreviewState.ts';

interface VariantImageGroupProps {
  readonly group: ImageGroup;
  readonly editions: Record<string, { display_name?: string; colors?: string[] }>;
  readonly hexMap: ReadonlyMap<string, string>;
  readonly viewBudget: string[];
  readonly heroCount: number;
  readonly carouselSlots: Record<string, Record<string, string | null>>;
  readonly carouselProgressMap: Record<string, CarouselProgress>;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly heroEnabled: boolean;
  readonly pifDependencyLocked: boolean;
  readonly pifDependencyTitle: string;
  readonly loopingVariant: boolean;
  readonly evaluatingVariant: boolean;
  /** Per-variant URL/query counts for the Hist button label. Null when the
   *  variant has no runs in history. */
  readonly histCounts: { readonly urls: number; readonly queries: number } | null;
  readonly onRunPriorityView: (variantKey: string) => void;
  readonly onRunIndividualView: (variantKey: string, view: string) => void;
  readonly onRunHero: (variantKey: string) => void;
  readonly onLoopVariant: (variantKey: string) => void;
  readonly onEvalVariant: (variantKey: string) => void;
  readonly onClearCarouselWinners: (variantKey: string, variantId: string | null, label: string) => void;
  readonly onOpenPromptModal: (variantKey: string, mode: PifPromptPreviewMode, view?: string) => void;
  readonly onOpenLightbox: (img: GalleryImage) => void;
  readonly onDeleteImage: (filename: string) => void;
  readonly onDeleteVariantImages: (filenames: readonly string[], label: string) => void;
  readonly onProcessImage: (filename: string) => void;
  readonly processingFilename: string | null;
  readonly category: string;
  readonly productId: string;
}

const INDIVIDUAL_VIEW_BUTTONS: ReadonlyArray<{ readonly id: string; readonly label: string }> = [
  { id: 'top',    label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'left',   label: 'Left' },
  { id: 'right',  label: 'Right' },
  { id: 'front',  label: 'Front' },
  { id: 'rear',   label: 'Rear' },
  { id: 'sangle', label: 'S-Angle' },
  { id: 'angle',  label: 'Angle' },
];

export const VariantImageGroup = memo(function VariantImageGroup({
  group,
  editions,
  hexMap,
  viewBudget,
  heroCount,
  carouselSlots,
  carouselProgressMap,
  isOpen,
  onToggle,
  heroEnabled,
  pifDependencyLocked,
  pifDependencyTitle,
  loopingVariant,
  evaluatingVariant,
  histCounts,
  onRunPriorityView,
  onRunIndividualView,
  onRunHero,
  onLoopVariant,
  onEvalVariant,
  onClearCarouselWinners,
  onOpenPromptModal,
  onOpenLightbox,
  onDeleteImage,
  onDeleteVariantImages,
  onProcessImage,
  processingFilename,
  category,
  productId,
}: VariantImageGroupProps) {
  const groupColorAtoms = useMemo(() => resolveVariantColorAtoms(group.key, editions), [group.key, editions]);
  const groupHexParts = useMemo(() => groupColorAtoms.map(a => hexMap.get(a.trim()) || ''), [groupColorAtoms, hexMap]);

  const groupSlots = useMemo(
    () => resolveSlots(viewBudget, heroCount, group.key, carouselSlots, group.images as ProductImageEntry[]),
    [viewBudget, heroCount, group.key, carouselSlots, group.images],
  );

  const slotSourceMap = useMemo(() => {
    const map = new Map<string, 'eval' | 'user'>();
    for (const s of groupSlots) {
      if (s.filename && s.source !== 'empty') map.set(s.filename, s.source as 'eval' | 'user');
    }
    return map;
  }, [groupSlots]);

  const progress = carouselProgressMap[group.key];
  // WHY: Dot fills must reflect carousel *slot occupancy* (user-override OR
  // eval winner / ranked hero), not "N images collected for this view" —
  // those are different things. Count non-empty slots from the already-
  // computed groupSlots (same source the CarouselPreviewPopup uses).
  // Totals fall back to configured viewBudget/heroCount when carouselProgress
  // is missing for a never-run variant so dots still render.
  const dynamicViewsTotal = groupSlots.filter((s) => !s.slot.startsWith('hero_')).length;
  const viewsTotal = Math.max(progress?.viewsTotal ?? 0, dynamicViewsTotal || viewBudget.length);
  const heroTotal = progress?.heroTarget ?? heroCount;
  const viewsFilled = useMemo(() =>
    groupSlots.filter((s) =>
      !s.slot.startsWith('hero_')
      && s.filename
      && s.filename !== '__cleared__',
    ).length,
  [groupSlots]);
  const heroFilled = useMemo(() =>
    groupSlots.filter((s) =>
      s.slot.startsWith('hero_')
      && s.filename
      && s.filename !== '__cleared__',
    ).length,
  [groupSlots]);

  const variantAdapter = {
    variant_id: group.variant_id ?? null,
    variant_key: group.key,
    variant_label: group.label,
    variant_type: group.type,
  };

  // Hist: open the shared discovery drawer pre-filtered to this variant.
  // Mirrors the SKU/RDF per-variant Hist button. variant_id is the SSOT for
  // the drawer filter; variant_key is what shows up in the UI label.
  const openHistoryDrawer = useFinderDiscoveryHistoryStore((s) => s.openDrawer);
  const handleOpenHistory = useCallback(() => {
    if (!group.variant_id) return;
    openHistoryDrawer({
      finderId: 'productImageFinder',
      productId,
      category,
      variantIdFilter: group.variant_id,
    });
  }, [openHistoryDrawer, productId, category, group.variant_id]);

  const histLabel = useMemo(() => (
    <>
      Hist
      <span className="ml-1 font-mono">
        (<span className="font-bold">{histCounts?.queries ?? 0}</span>
        <span className="font-normal opacity-70">qu</span>)
        (<span className="font-bold">{histCounts?.urls ?? 0}</span>
        <span className="font-normal opacity-70">url</span>)
      </span>
    </>
  ), [histCounts]);

  return (
    <FinderVariantRow
      variant={variantAdapter}
      hexParts={groupHexParts}
      expanded={isOpen}
      onToggle={onToggle}
      secondary={
        <VariantSlotDots
          viewsFilled={viewsFilled}
          viewsTotal={viewsTotal}
          heroFilled={heroFilled}
          heroTotal={heroTotal}
        />
      }
      afterHeader={group.orphaned ? (
        <div className="px-3 pb-1">
          <DataIntegrityBanner message="Orphaned variant — images reference a variant not in the registry. Re-run CEF to re-discover, or delete these images." />
        </div>
      ) : null}
      trailing={
        <>
          <ImageCountBadge count={group.images.length} />
          <div className="shrink-0 flex items-center gap-1">
            <PifRunStackDrawer
              storageKey={`indexing:pif:run-drawer:${productId}:${group.key}`}
              openWidthClass="w-[44rem]"
              ariaLabel={`Run actions for ${group.label}`}
              openTitle="Run:"
              actions={[
                {
                  id: 'priority',
                  label: 'Priority',
                  runTitle: 'Priority View Run — one LLM call across all viewConfig priority views',
                  previewTitle: 'Preview the Priority View Run prompt',
                  disabledTitle: pifDependencyTitle,
                  runDisabled: pifDependencyLocked,
                  onRun: () => onRunPriorityView(group.key),
                  onPreview: () => onOpenPromptModal(group.key, 'view'),
                },
                ...INDIVIDUAL_VIEW_BUTTONS.map((v) => ({
                  id: v.id,
                  label: v.label,
                  runTitle: `Individual View Run — ${v.label}`,
                  previewTitle: `Preview the ${v.label} Individual View Run prompt`,
                  disabledTitle: pifDependencyTitle,
                  runDisabled: pifDependencyLocked,
                  onRun: () => onRunIndividualView(group.key, v.id),
                  onPreview: () => onOpenPromptModal(group.key, 'view', v.id),
                })),
                ...(heroEnabled ? [{
                  id: 'hero',
                  label: 'Hero',
                  runTitle: 'Hero Run — lifestyle/contextual images',
                  previewTitle: 'Preview the Hero Run prompt',
                  disabledTitle: pifDependencyTitle,
                  runDisabled: pifDependencyLocked,
                  onRun: () => onRunHero(group.key),
                  onPreview: () => onOpenPromptModal(group.key, 'hero'),
                }] : []),
              ]}
            />
            <RowActionButton
              intent="locked"
              label="Loop"
              onClick={() => onLoopVariant(group.key)}
              busy={loopingVariant}
              disabled={pifDependencyLocked}
              title={pifDependencyLocked ? pifDependencyTitle : 'Loop: views then heroes until carousel complete'}
              width={ACTION_BUTTON_WIDTH.standardRow}
            />
            <RowActionButton
              intent="locked"
              label="Eval"
              onClick={() => onEvalVariant(group.key)}
              busy={evaluatingVariant}
              disabled={pifDependencyLocked || group.images.length === 0}
              title={pifDependencyLocked ? pifDependencyTitle : 'Carousel Builder: evaluate images and pick best per view'}
              width={ACTION_BUTTON_WIDTH.standardRow}
            />
            <RowActionButton
              intent="delete"
              label="Clear"
              onClick={() => onClearCarouselWinners(group.key, group.variant_id ?? null, group.label)}
              disabled={(viewsFilled + heroFilled) === 0}
              title="Clear all current carousel winners for this variant"
              width={ACTION_BUTTON_WIDTH.standardRow}
            />
            {group.images.length > 0 && (
              <RowActionButton
                intent="delete"
                label="Del"
                onClick={() => onDeleteVariantImages(group.images.map(img => img.filename).filter(Boolean), group.label)}
                title={`Delete all ${group.images.length} images for this variant`}
                width={ACTION_BUTTON_WIDTH.standardRow}
              />
            )}
            <span className="inline-block h-5 w-px mx-0.5 bg-current opacity-20" aria-hidden />
            <PromptDrawerChevron
              storageKey={`indexing:pif:prompt-drawer:${productId}:${group.key}`}
              openWidthClass="w-[30rem]"
              ariaLabel={`Prompt previews + history for ${group.label}`}
              openTitle="Prompts:"
              primaryCustom={
                // WHY: Compact 2x2 grid of half-height buttons (h-[13px] × 2 +
                // gap-0.5 = 28px = h-7) so the drawer keeps the standard row
                // height. Inline styling intentionally bypasses RowActionButton's
                // fixed h-7 — sizing is locked in the primitive, but this
                // sub-cluster is a one-off compact variant.
                <div className="grid grid-cols-2 grid-rows-2 gap-0.5 self-center">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenPromptModal(group.key, 'loop-view'); }}
                    title="Preview the Loop view-iteration prompt — uses this variant's loop-view search history"
                    className="inline-flex items-center justify-center h-[13px] w-20 px-1.5 text-[8px] font-bold uppercase tracking-wide rounded whitespace-nowrap sf-prompt-preview-button"
                  >
                    Loop View
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenPromptModal(group.key, 'view-eval'); }}
                    title="Preview the per-view Eval prompt"
                    className="inline-flex items-center justify-center h-[13px] w-20 px-1.5 text-[8px] font-bold uppercase tracking-wide rounded whitespace-nowrap sf-prompt-preview-button"
                  >
                    View Eval
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenPromptModal(group.key, 'loop-hero'); }}
                    disabled={!heroEnabled}
                    title="Preview the Loop hero-iteration prompt — uses this variant's loop-hero search history"
                    className="inline-flex items-center justify-center h-[13px] w-20 px-1.5 text-[8px] font-bold uppercase tracking-wide rounded whitespace-nowrap sf-prompt-preview-button disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Loop Hero
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenPromptModal(group.key, 'hero-eval'); }}
                    disabled={!heroEnabled}
                    title="Preview the Hero Eval prompt"
                    className="inline-flex items-center justify-center h-[13px] w-20 px-1.5 text-[8px] font-bold uppercase tracking-wide rounded whitespace-nowrap sf-prompt-preview-button disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Hero Eval
                  </button>
                </div>
              }
              secondaryTitle="Hist:"
              secondaryLabelClass="sf-history-label"
              secondaryActions={[{
                id: 'hist',
                label: histLabel,
                onClick: handleOpenHistory,
                disabled: !group.variant_id,
                intent: group.variant_id ? 'history' : 'locked',
                width: 'w-36',
                title: !group.variant_id
                  ? 'Variant has no variant_id — open the panel-level history.'
                  : `Open Discovery History filtered to "${group.label}".`,
              }]}
            />
          </div>
        </>
      }
    >
      <CarouselSlotRow
        variantKey={group.key}
        variantId={group.variant_id}
        viewBudget={viewBudget}
        heroCount={heroCount}
        carouselSlots={carouselSlots}
        images={group.images}
        category={category}
        productId={productId}
      />
      {group.images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {group.images.map((img, i) => (
            <GalleryCard
              key={`${img.run_number}-${img.variant_key}-${img.view}-${i}`}
              img={img}
              category={category}
              productId={productId}
              onOpen={onOpenLightbox}
              onDelete={onDeleteImage}
              onProcess={onProcessImage}
              isProcessing={processingFilename === img.filename}
              carouselSource={slotSourceMap.get(img.filename)}
            />
          ))}
        </div>
      )}
    </FinderVariantRow>
  );
});
