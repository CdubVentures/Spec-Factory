/**
 * VariantImageGroup — memoized per-variant group in the PIF gallery.
 *
 * WHY: Extracted from ProductImageFinderPanel.tsx so each group only re-renders
 * when its own props change. Previously, per-group computation (resolveSlots,
 * resolveVariantColorAtoms, slotSourceMap) ran for every group on every parent
 * render, even when nothing changed.
 */
import { memo, useMemo } from 'react';
import {
  AnimatedDots,
  DataIntegrityBanner,
  FinderVariantRow,
  ImageCountBadge,
  PromptDrawerChevron,
  VariantSlotDots,
} from '../../../shared/ui/finder/index.ts';
import { resolveVariantColorAtoms, resolveSlots } from '../selectors/pifSelectors.ts';
import { GalleryCard } from './GalleryCard.tsx';
import { CarouselSlotRow } from './CarouselSlotRow.tsx';
import type { ImageGroup, GalleryImage, ProductImageEntry, CarouselProgress } from '../types.ts';

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
  readonly loopingVariant: boolean;
  readonly evaluatingVariant: boolean;
  readonly onRunView: (variantKey: string) => void;
  readonly onRunHero: (variantKey: string) => void;
  readonly onLoopVariant: (variantKey: string) => void;
  readonly onEvalVariant: (variantKey: string) => void;
  readonly onOpenPromptModal: (variantKey: string, mode: 'view' | 'hero' | 'loop' | 'view-eval') => void;
  readonly onOpenLightbox: (img: GalleryImage) => void;
  readonly onDeleteImage: (filename: string) => void;
  readonly onDeleteVariantImages: (filenames: readonly string[], label: string) => void;
  readonly onProcessImage: (filename: string) => void;
  readonly processingFilename: string | null;
  readonly category: string;
  readonly productId: string;
}

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
  loopingVariant,
  evaluatingVariant,
  onRunView,
  onRunHero,
  onLoopVariant,
  onEvalVariant,
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
  // WHY: backend only writes carouselProgress after a variant runs. Unrun
  // variants have no entry — fall back to configured viewBudget/heroCount so
  // dots always render (empty for never-run, filled as runs complete).
  const viewsTotal = progress?.viewsTotal ?? viewBudget.length;
  const heroTotal = progress?.heroTarget ?? heroCount;
  const viewsFilled = progress?.viewsFilled ?? 0;
  const heroFilled = progress?.heroCount ?? 0;

  const variantAdapter = {
    variant_id: group.variant_id ?? null,
    variant_key: group.key,
    variant_label: group.label,
    variant_type: group.type,
  };

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
            <button
              onClick={(e) => { e.stopPropagation(); onRunView(group.key); }}
              className="inline-flex items-center justify-center h-7 px-2 text-[9px] font-bold uppercase tracking-wide rounded sf-primary-button"
              title="Single view run"
            >
              View
            </button>
            {heroEnabled && (
              <button
                onClick={(e) => { e.stopPropagation(); onRunHero(group.key); }}
                className="inline-flex items-center justify-center h-7 px-2 text-[9px] font-bold uppercase tracking-wide rounded sf-primary-button"
                title="Single hero run"
              >
                Hero
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onLoopVariant(group.key); }}
              disabled={loopingVariant}
              className="inline-flex items-center justify-center h-7 px-2 text-[9px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed"
              title="Loop: views then heroes until carousel complete"
            >
              {loopingVariant ? <>Loop <AnimatedDots /></> : 'Loop'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEvalVariant(group.key); }}
              disabled={evaluatingVariant || group.images.length === 0}
              className="inline-flex items-center justify-center h-7 px-2 text-[9px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed"
              title="Carousel Builder: evaluate images and pick best per view"
            >
              Eval
            </button>
            {group.images.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteVariantImages(group.images.map(img => img.filename).filter(Boolean), group.label);
                }}
                className="inline-flex items-center justify-center h-7 px-2 text-[9px] font-bold uppercase tracking-wide rounded sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100"
                title={`Delete all ${group.images.length} images for this variant`}
              >
                Del
              </button>
            )}
            <span className="inline-block h-5 w-px mx-0.5 bg-current opacity-20" aria-hidden />
            <PromptDrawerChevron
              storageKey={`indexing:pif:prompt-drawer:${productId}:${group.key}`}
              openWidthClass="w-80"
              ariaLabel={`Prompt previews for ${group.label}`}
              openTitle="Prompts:"
              actions={[
                { label: 'View', onClick: () => onOpenPromptModal(group.key, 'view') },
                { label: 'Hero', onClick: () => onOpenPromptModal(group.key, 'hero'), disabled: !heroEnabled },
                { label: 'Loop', onClick: () => onOpenPromptModal(group.key, 'loop') },
                { label: 'Eval', onClick: () => onOpenPromptModal(group.key, 'view-eval') },
              ]}
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
