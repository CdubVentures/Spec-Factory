/**
 * PIF Selectors — pure transform/derivation functions for the Product Image Finder panel.
 *
 * Follows the CEF selector pattern: all functions are pure (data in → display model out),
 * testable in isolation, and consumed by ProductImageFinderPanel.tsx as the sole orchestrator.
 */
import { formatAtomLabel, resolveVariantColorAtoms as sharedResolveVariantColorAtoms } from '../../../shared/ui/finder/finderSelectors.ts';
import type { KpiCard } from '../../../shared/ui/finder/types.ts';
import type {
  ProductImageEntry,
  ProductImageFinderRun,
  ProductImageFinderResult,
  VariantInfo,
  VariantRegistryEntry,
  ResolvedSlot,
  EvalRecord,
  GalleryImage,
  ImageGroup,
  RunGroup,
  EvalVariantGroup,
} from '../types.ts';

/* ── Constants ────────────────────────────────────────────────────── */

/** Per-category view priority order. Hero always sorts last. */
export const VIEW_PRIORITY_ORDER: Readonly<Record<string, readonly string[]>> = {
  mouse:    ['top', 'left', 'angle', 'sangle', 'front', 'bottom', 'right', 'rear', 'hero'],
  keyboard: ['top', 'left', 'angle', 'sangle', 'front', 'bottom', 'right', 'rear', 'hero'],
  monitor:  ['front', 'angle', 'rear', 'left', 'right', 'top', 'bottom', 'sangle', 'hero'],
  mousepad: ['top', 'angle', 'left', 'front', 'bottom', 'right', 'rear', 'sangle', 'hero'],
};
export const GENERIC_VIEW_ORDER: readonly string[] = ['top', 'left', 'angle', 'sangle', 'front', 'bottom', 'right', 'rear', 'hero'];

/* ── Variant / Color Helpers ──────────────────────────────────────── */

export const resolveVariantColorAtoms = sharedResolveVariantColorAtoms;

/**
 * Build an ordered variant list from the variant_registry (SSOT).
 *
 * WHY: Registry is the one-variant-per-row truth. Building from published
 * colors + editions maps produced duplicates once edition combos started
 * cascading into published colors (edition IS a color). PIF runs against
 * variants; the list must reflect exactly what's in the registry.
 *
 * Label priority:
 *   - edition variant → edition_display_name → variant_label → slug
 *   - color variant   → color_names[combo] → variant_label → formatAtomLabel(combo)
 */
export function buildVariantList(
  registry: readonly VariantRegistryEntry[],
  colorNames?: Readonly<Record<string, string>>,
): VariantInfo[] {
  const names = colorNames || {};
  return registry.map(entry => {
    if (entry.variant_type === 'edition') {
      const label = entry.edition_display_name
        || entry.variant_label
        || entry.edition_slug
        || '';
      return {
        key: entry.variant_key,
        label,
        type: 'edition',
        variant_id: entry.variant_id,
      };
    }
    const combo = entry.variant_key.replace(/^color:/, '');
    const named = names[combo] || entry.variant_label || '';
    const hasNamedLabel = !!(named && named.toLowerCase() !== combo.toLowerCase());
    return {
      key: entry.variant_key,
      label: hasNamedLabel ? named : formatAtomLabel(combo),
      type: 'color',
      variant_id: entry.variant_id,
    };
  });
}

/* ── Gallery Image Transforms ─────────────────────────────────────── */

/** Build a flat list of all images across all runs, ordered by run_number asc. */
export function buildGalleryImages(runs: ProductImageFinderRun[]): GalleryImage[] {
  const images: GalleryImage[] = [];
  const sorted = [...runs].sort((a, b) => a.run_number - b.run_number);
  for (const run of sorted) {
    for (const img of run.selected?.images || []) {
      images.push({
        ...img,
        run_number: run.run_number,
        run_model: run.model || 'unknown',
        run_ran_at: run.ran_at || '',
      });
    }
  }
  return images;
}

/** Sort images by view type (grouped by category priority), then by pixel area descending. */
export function sortByPriorityAndSize(images: GalleryImage[], category: string): GalleryImage[] {
  const order = VIEW_PRIORITY_ORDER[category] || GENERIC_VIEW_ORDER;
  const idx = new Map(order.map((v, i) => [v, i]));
  return [...images].sort((a, b) => {
    const ai = idx.get(a.view) ?? 99;
    const bi = idx.get(b.view) ?? 99;
    if (ai !== bi) return ai - bi;
    return (b.width * b.height) - (a.width * a.height);
  });
}

/** Group gallery images by variant key, preserving variant order from CEF. */
export function groupImagesByVariant(images: GalleryImage[], variants: VariantInfo[], category: string): ImageGroup[] {
  const imageMap = new Map<string, GalleryImage[]>();
  for (const img of images) {
    const key = img.variant_key || '';
    if (!imageMap.has(key)) imageMap.set(key, []);
    imageMap.get(key)!.push(img);
  }
  const groups: ImageGroup[] = [];
  for (const v of variants) {
    const imgs = imageMap.get(v.key);
    groups.push({
      key: v.key,
      label: v.label,
      type: v.type,
      variant_id: v.variant_id,
      images: imgs && imgs.length > 0 ? sortByPriorityAndSize(imgs, category) : [],
    });
  }
  for (const [key, imgs] of imageMap) {
    if (!variants.some(v => v.key === key) && imgs.length > 0) {
      const label = imgs[0].variant_label || formatAtomLabel(key.replace(/^(color|edition):/, ''));
      groups.push({ key, label, type: key.startsWith('edition:') ? 'edition' : 'color', orphaned: true, images: sortByPriorityAndSize(imgs, category) });
    }
  }
  return groups;
}

/* ── Carousel Slot Resolution ─────────────────────────────────────── */

/** Resolve carousel slot assignments: user override > eval winner > empty. */
export function resolveSlots(
  viewBudget: string[],
  heroCount: number,
  variantKey: string,
  carouselSlots: Record<string, Record<string, string | null>>,
  images: ProductImageEntry[],
): ResolvedSlot[] {
  const varSlots = carouselSlots[variantKey] ?? {};
  const result: ResolvedSlot[] = [];

  for (const view of viewBudget) {
    const userOverride = varSlots[view];
    if (userOverride) {
      result.push({ slot: view, filename: userOverride, source: 'user' });
    } else {
      const evalWinner = images.find(img => img.view === view && img.eval_best === true);
      result.push(evalWinner
        ? { slot: view, filename: evalWinner.filename, source: 'eval' }
        : { slot: view, filename: null, source: 'empty' });
    }
  }

  const heroes = images
    .filter(img => img.hero === true && img.hero_rank != null)
    .sort((a, b) => (a.hero_rank ?? 99) - (b.hero_rank ?? 99));

  for (let i = 0; i < heroCount; i++) {
    const slotKey = `hero_${i + 1}`;
    const userOverride = varSlots[slotKey];
    if (userOverride) {
      result.push({ slot: slotKey, filename: userOverride, source: 'user' });
    } else if (heroes[i]) {
      result.push({ slot: slotKey, filename: heroes[i].filename, source: 'eval' });
    } else {
      result.push({ slot: slotKey, filename: null, source: 'empty' });
    }
  }

  return result;
}

/* ── Run / Eval Grouping ──────────────────────────────────────────── */

/** Resolve run mode from top-level or response blob (SQL path). */
export function resolveRunMode(run: ProductImageFinderRun): 'view' | 'hero' | null {
  return run.mode || run.response?.mode || null;
}

/** Resolve loop_id from top-level or response blob. */
export function resolveLoopId(run: ProductImageFinderRun): string | null {
  return run.loop_id || run.response?.loop_id || null;
}

/** Build the mode badge label: VIEW, HERO, LOOP VIEW, LOOP HERO. */
export function buildModeBadge(run: ProductImageFinderRun): { label: string; className: string } | null {
  const mode = resolveRunMode(run);
  if (!mode) return null;
  const isLoop = Boolean(resolveLoopId(run));
  const label = isLoop ? `LOOP ${mode.toUpperCase()}` : mode.toUpperCase();
  const className = mode === 'hero' ? 'sf-chip-accent' : 'sf-chip-info';
  return { label, className };
}

/** Group runs by loop_id. Non-loop runs become single-run groups. */
export function groupRunsByLoop(runs: ProductImageFinderRun[]): RunGroup[] {
  const groups: RunGroup[] = [];
  const loopMap = new Map<string, ProductImageFinderRun[]>();
  const order: Array<{ type: 'single'; run: ProductImageFinderRun } | { type: 'loop'; loopId: string }> = [];
  const seenLoops = new Set<string>();

  for (const run of runs) {
    const lid = resolveLoopId(run);
    if (lid) {
      if (!loopMap.has(lid)) loopMap.set(lid, []);
      loopMap.get(lid)!.push(run);
      if (!seenLoops.has(lid)) {
        seenLoops.add(lid);
        order.push({ type: 'loop', loopId: lid });
      }
    } else {
      order.push({ type: 'single', run });
    }
  }

  for (const entry of order) {
    if (entry.type === 'single') {
      groups.push({ type: 'single', runs: [entry.run] });
    } else {
      groups.push({ type: 'loop', loopId: entry.loopId, runs: loopMap.get(entry.loopId)! });
    }
  }

  return groups;
}

/** Group eval records by variant_key, preserving chronological order. */
export function groupEvalsByVariant(evals: EvalRecord[]): EvalVariantGroup[] {
  const groups: EvalVariantGroup[] = [];
  const map = new Map<string, EvalRecord[]>();
  const order: string[] = [];

  for (const ev of evals) {
    const vk = ev.variant_key || '';
    if (!map.has(vk)) {
      map.set(vk, []);
      order.push(vk);
    }
    map.get(vk)!.push(ev);
  }

  for (const vk of order) {
    groups.push({ variantKey: vk, evals: map.get(vk)! });
  }
  return groups;
}

/* ── KPI Cards ────────────────────────────────────────────────────── */

/** Derive the 4 KPI cards for the PIF panel header. */
export function derivePifKpiCards(
  imageCount: number,
  variantCount: number,
  runCount: number,
  carouselAgg: { filled: number; total: number; allComplete: boolean },
): KpiCard[] {
  return [
    { label: 'Images', value: String(imageCount), tone: 'accent' },
    { label: 'Variants', value: String(variantCount), tone: 'purple' },
    { label: 'Runs', value: String(runCount), tone: 'success' },
    {
      label: 'Carousel Images',
      value: carouselAgg.total > 0 ? `${carouselAgg.filled}/${carouselAgg.total}` : '--',
      tone: carouselAgg.allComplete ? 'success' : 'info',
    },
  ];
}

/* ── Optimistic Cache Helpers ──────────────────────────────────────── */

/**
 * Produce a new ProductImageFinderResult with a single image removed by filename.
 * Filters from: images[], runs[].selected.images[], runs[].response.images[].
 * Decrements image_count by the number of removals from the top-level images[].
 * Returns data unchanged when the filename is not found.
 */
export function removeImageFromResult(
  data: ProductImageFinderResult,
  filename: string,
): ProductImageFinderResult {
  const nextImages = data.images.filter((img) => img.filename !== filename);
  const removed = data.images.length - nextImages.length;
  if (removed === 0) {
    // WHY: Nothing to filter in runs either — short-circuit to avoid unnecessary cloning.
    const hasInRuns = data.runs.some(
      (r) =>
        r.selected.images.some((i) => i.filename === filename) ||
        r.response.images.some((i) => i.filename === filename),
    );
    if (!hasInRuns) return data;
  }

  const nextRuns = data.runs.map((run) => ({
    ...run,
    selected: { ...run.selected, images: run.selected.images.filter((i) => i.filename !== filename) },
    response: { ...run.response, images: run.response.images.filter((i) => i.filename !== filename) },
  }));

  return {
    ...data,
    images: nextImages,
    image_count: data.image_count - removed,
    runs: nextRuns,
  };
}
