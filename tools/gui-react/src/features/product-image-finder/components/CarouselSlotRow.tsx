import { memo, useMemo, useCallback, useEffect, useState } from 'react';
import { SlotCard } from './SlotCard.tsx';
import { CarouselPreviewCard } from './CarouselPreviewCard.tsx';
import { CarouselPreviewPopup } from './CarouselPreviewPopup.tsx';
import { SlotImageLightbox } from './SlotImageLightbox.tsx';
import {
  MANUAL_CAROUSEL_SLOT_BASES,
  resolveNextManualCarouselSlotKey,
  resolveSlots,
  type ManualCarouselSlotBase,
} from '../selectors/pifSelectors.ts';
import { imageServeUrl } from '../helpers/pifImageUrls.ts';
import { useCarouselSlotMutation } from '../api/productImageFinderQueries.ts';
import type { ProductImageEntry, CarouselSlide, GalleryImage } from '../types.ts';

const MANUAL_SLOT_LABELS: Record<ManualCarouselSlotBase, string> = {
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
  front: 'Front',
  rear: 'Rear',
  sangle: 'S-Angle',
  angle: 'Angle',
  hero: 'Hero',
};

interface AddCarouselSlotCardProps {
  readonly onAdd: (base: ManualCarouselSlotBase) => void;
}

function AddCarouselSlotCard({ onAdd }: AddCarouselSlotCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="shrink-0 rounded-lg border border-dashed sf-border-soft overflow-hidden flex flex-col transition-colors w-40 opacity-80 hover:opacity-100">
      <button
        type="button"
        className="relative w-full h-32 flex flex-col items-center justify-center gap-1 sf-surface-bg sf-text-muted hover:opacity-100"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="text-3xl leading-none font-light">+</span>
        <span className="text-[9px] font-bold uppercase tracking-wider">Add Slot</span>
      </button>
      {open && (
        <div className="px-2 py-1.5 border-t sf-border-soft grid grid-cols-3 gap-1">
          {MANUAL_CAROUSEL_SLOT_BASES.map((base) => (
            <button
              key={base}
              type="button"
              className="text-[9px] leading-none rounded border sf-border-soft sf-surface-elevated px-1 py-1 sf-text-muted hover:opacity-100"
              onClick={() => {
                onAdd(base);
                setOpen(false);
              }}
            >
              {MANUAL_SLOT_LABELS[base]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [pendingSlots, setPendingSlots] = useState<Record<string, string | null>>({});
  const slotMutation = useCarouselSlotMutation(category, productId);
  const effectiveCarouselSlots = useMemo(() => {
    if (Object.keys(pendingSlots).length === 0) return carouselSlots;
    return {
      ...carouselSlots,
      [variantKey]: {
        ...(carouselSlots[variantKey] ?? {}),
        ...pendingSlots,
      },
    };
  }, [carouselSlots, pendingSlots, variantKey]);
  const slots = resolveSlots(viewBudget, heroCount, variantKey, effectiveCarouselSlots, images as ProductImageEntry[]);
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

  useEffect(() => {
    const persistedSlots = carouselSlots[variantKey] ?? {};
    setPendingSlots((current) => {
      let changed = false;
      const next: Record<string, string | null> = {};
      for (const [slot, filename] of Object.entries(current)) {
        if (persistedSlots[slot] === filename) {
          changed = true;
          continue;
        }
        next[slot] = filename;
      }
      return changed ? next : current;
    });
  }, [carouselSlots, variantKey]);

  const persistSlot = useCallback((slotKey: string, filename: string | null) => {
    setPendingSlots((current) => ({ ...current, [slotKey]: filename }));
    slotMutation.mutate(
      { variant_key: variantKey, variant_id: variantId, slot: slotKey, filename },
      {
        onError: () => {
          setPendingSlots((current) => {
            if (!(slotKey in current)) return current;
            const next = { ...current };
            delete next[slotKey];
            return next;
          });
        },
      },
    );
  }, [slotMutation, variantKey, variantId]);

  const handleDropOnSlot = useCallback((slotKey: string, filename: string) => {
    persistSlot(slotKey, filename);
  }, [persistSlot]);

  const handleAddManualSlot = useCallback((base: ManualCarouselSlotBase) => {
    const slotKey = resolveNextManualCarouselSlotKey(base, slots.map((slot) => slot.slot));
    persistSlot(slotKey, '__cleared__');
  }, [persistSlot, slots]);

  const handleClearSlot = useCallback((slotKey: string) => {
    // WHY: Always use '__cleared__' so the slot stays empty — no fallback to eval.
    persistSlot(slotKey, '__cleared__');
  }, [persistSlot]);

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
              img={slotFilename ? (imageByFilename.get(slotFilename) ?? null) : null}
              source={slot.source}
              category={category}
              productId={productId}
              onClear={() => handleClearSlot(slot.slot)}
              onDrop={(fn) => handleDropOnSlot(slot.slot, fn)}
              onOpen={slotFilename ? () => setOpenSlotFilename(slotFilename) : undefined}
            />
          );
        })}
        <AddCarouselSlotCard onAdd={handleAddManualSlot} />
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
