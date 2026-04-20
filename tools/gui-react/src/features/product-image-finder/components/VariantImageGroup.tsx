/**
 * VariantImageGroup — memoized per-variant group in the PIF gallery.
 *
 * WHY: Extracted from ProductImageFinderPanel.tsx so each group only re-renders
 * when its own props change. Previously, per-group computation (resolveSlots,
 * resolveVariantColorAtoms, slotSourceMap) ran for every group on every parent
 * render, even when nothing changed.
 */
import { memo, useMemo } from 'react';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import {
  AnimatedDots,
  ColorSwatch,
  DataIntegrityBanner,
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
  const progressLabel = progress
    ? `${progress.viewsFilled}/${progress.viewsTotal} views \u00B7 ${progress.heroCount}/${progress.heroTarget} heroes`
    : null;

  return (
    <div className="mb-3 sf-surface-panel rounded-lg overflow-hidden">
      <div
        onClick={onToggle}
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
            onClick={(e) => { e.stopPropagation(); onRunView(group.key); }}
            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-primary-button"
            title="Single view run"
          >
            View
          </button>
          {heroEnabled && (
            <button
              onClick={(e) => { e.stopPropagation(); onRunHero(group.key); }}
              className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-primary-button"
              title="Single hero run"
            >
              Hero
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onLoopVariant(group.key); }}
            disabled={loopingVariant}
            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed"
            title="Loop: views then heroes until carousel complete"
          >
            {loopingVariant ? <>Loop <AnimatedDots /></> : 'Loop'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEvalVariant(group.key); }}
            disabled={evaluatingVariant || group.images.length === 0}
            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed"
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
              className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded sf-status-text-danger border sf-border-soft opacity-50 hover:opacity-100"
              title={`Delete all ${group.images.length} images for this variant`}
            >
              Del
            </button>
          )}
        </div>
      </div>
      {group.orphaned && (
        <div className="px-3 pb-1">
          <DataIntegrityBanner message="Orphaned variant — images reference a variant not in the registry. Re-run CEF to re-discover, or delete these images." />
        </div>
      )}
      {isOpen && (
        <div className="px-3 pb-3">
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
        </div>
      )}
    </div>
  );
});
