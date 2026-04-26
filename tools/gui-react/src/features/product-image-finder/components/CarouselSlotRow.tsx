import { memo, useMemo, useCallback, useState } from 'react';
import { SlotCard } from './SlotCard.tsx';
import { CarouselPreviewCard } from './CarouselPreviewCard.tsx';
import { CarouselPreviewPopup } from './CarouselPreviewPopup.tsx';
import { SlotImageLightbox } from './SlotImageLightbox.tsx';
import { resolveSlots } from '../selectors/pifSelectors.ts';
import { imageServeUrl } from '../helpers/pifImageUrls.ts';
import { useCarouselSlotMutation } from '../api/productImageFinderQueries.ts';
import type { ProductImageEntry, CarouselSlide, GalleryImage } from '../types.ts';

interface CarouselSlotRowProps {
  readonly variantKey: string;
  readonly variantId?: string;
  readonly viewBudget: string[];
  readonly heroCount: number;
  readonly carouselSlots: Record<string, Record<string, string | null>>;
  readonly images: readonly ProductImageEntry[];
  readonly category: string;
  readonly productId: string;
}

export const CarouselSlotRow = memo(function CarouselSlotRow({
  variantKey,
  variantId,
  viewBudget,
  heroCount,
  carouselSlots,
  images,
  category,
  productId,
}: CarouselSlotRowProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [openSlotFilename, setOpenSlotFilename] = useState<string | null>(null);
  const slotMutation = useCarouselSlotMutation(category, productId);
  const slots = resolveSlots(viewBudget, heroCount, variantKey, carouselSlots, images as ProductImageEntry[]);
  // WHY: Build filename→image lookup so SlotCard can show full meta (size, dims, source)
  const imageByFilename = useMemo(() => {
    const map = new Map<string, ProductImageEntry>();
    for (const img of images) map.set(img.filename, img);
    return map;
  }, [images]);

  const filledSlots = useMemo(() => slots.filter(s => s.filename && s.filename !== '__cleared__'), [slots]);

  const slides: CarouselSlide[] = useMemo(() =>
    filledSlots.map(s => {
      const img = imageByFilename.get(s.filename!);
      const isHero = s.slot.startsWith('hero_');
      return {
        slotLabel: isHero ? s.slot.replace('_', ' ').toUpperCase() : s.slot.toUpperCase(),
        source: s.source as 'user' | 'eval',
        src: imageServeUrl(category, productId, s.filename!, { cacheBust: img?.bytes, variant: 'preview' }),
        thumbSrc: imageServeUrl(category, productId, s.filename!, { cacheBust: img?.bytes, variant: 'thumb' }),
        fullSrc: imageServeUrl(category, productId, s.filename!, img?.bytes),
        bytes: img?.bytes ?? 0,
        width: img?.width ?? 0,
        height: img?.height ?? 0,
        reasoning: img?.eval_reasoning ?? '',
        runNumber: (img as GalleryImage | null)?.run_number ?? null,
      };
    }), [filledSlots, imageByFilename, category, productId]);
  const openSlotImage = openSlotFilename ? imageByFilename.get(openSlotFilename) : null;

  const handleDropOnSlot = useCallback((slotKey: string, filename: string) => {
    slotMutation.mutate({ variant_key: variantKey, variant_id: variantId, slot: slotKey, filename });
  }, [slotMutation, variantKey, variantId]);

  const handleClearSlot = useCallback((slotKey: string) => {
    // WHY: Always use '__cleared__' so the slot stays empty — no fallback to eval.
    slotMutation.mutate({ variant_key: variantKey, variant_id: variantId, slot: slotKey, filename: '__cleared__' });
  }, [slotMutation, variantKey, variantId]);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wider sf-text-muted">Carousel</span>
        <span className="text-[9px] sf-text-muted font-mono">{filledSlots.length}/{slots.length}</span>
      </div>
      <div className="flex gap-2 flex-wrap mb-2">
        <CarouselPreviewCard slides={slides} onClick={() => setPreviewOpen(true)} />
        {slots.map((slot) => {
          const slotFilename = slot.filename && slot.filename !== '__cleared__' ? slot.filename : null;
          return (
            <SlotCard
              key={slot.slot}
              slot={slot}
              img={slot.filename ? (imageByFilename.get(slot.filename) ?? null) : null}
              source={slot.source}
              category={category}
              productId={productId}
              onClear={() => handleClearSlot(slot.slot)}
              onDrop={(fn) => handleDropOnSlot(slot.slot, fn)}
              onOpen={slotFilename ? () => setOpenSlotFilename(slotFilename) : undefined}
            />
          );
        })}
      </div>
      {previewOpen && filledSlots.length > 0 && (
        <CarouselPreviewPopup slides={slides} onClose={() => setPreviewOpen(false)} />
      )}
      {openSlotFilename && (
        <SlotImageLightbox
          src={imageServeUrl(category, productId, openSlotFilename, openSlotImage?.bytes)}
          alt={openSlotFilename}
          onClose={() => setOpenSlotFilename(null)}
        />
      )}
    </div>
  );
});
