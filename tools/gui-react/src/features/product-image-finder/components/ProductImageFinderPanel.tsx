/**
 * Product Image Finder Panel — Indexing Lab embedded panel.
 *
 * Shows ALL unique images found across ALL runs, tagged with run number,
 * ordered by run. Click any thumbnail to view full size.
 * Gate: requires CEF data before PIF can run.
 */

import { useMemo, useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import {
  FinderPanelHeader,
  FinderKpiCard,
  FinderCooldownStrip,
  FinderPanelFooter,
  FinderDeleteConfirmModal,
  FinderRunPromptDetails,
  FinderRunTimestamp,
  FinderSectionCard,
  useResolvedFinderModel,
  deriveCooldownState,
  deriveFinderStatusChip,
  formatAtomLabel,
} from '../../../shared/ui/finder/index.ts';
import type { KpiCard, DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { useOperationsStore } from '../../../stores/operationsStore.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useColorEditionFinderQuery } from '../../color-edition-finder/api/colorEditionFinderQueries.ts';
import type { ColorRegistryEntry } from '../../color-edition-finder/types.ts';
import {
  useProductImageFinderQuery,
  useDeleteProductImageFinderAllMutation,
  useDeleteProductImageFinderRunMutation,
  useDeleteProductImageMutation,
  useProcessProductImageMutation,
  useProcessAllProductImagesMutation,
} from '../api/productImageFinderQueries.ts';
import type { ProductImageEntry, ProductImageFinderRun, VariantInfo, CarouselProgress } from '../types.ts';

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDims(w: number, h: number): string {
  if (!w && !h) return '';
  return `${w}\u00D7${h}`;
}

function imageServeUrl(category: string, productId: string, filename: string): string {
  return `/api/v1/product-image-finder/${category}/${productId}/images/${encodeURIComponent(filename)}`;
}

function originalImageServeUrl(category: string, productId: string, filename: string): string {
  return `/api/v1/product-image-finder/${category}/${productId}/images/originals/${encodeURIComponent(filename)}`;
}

/* ── Color swatch (shared pattern from CEF) ──────────────────────── */

function colorCircleStyle(hexParts: readonly string[]): React.CSSProperties {
  const colors = hexParts.filter(Boolean);
  if (colors.length === 0) return { backgroundColor: 'var(--sf-text-muted)' };
  if (colors.length === 1) return { backgroundColor: colors[0] };
  if (colors.length === 2) {
    return { background: `linear-gradient(45deg, ${colors[0]} 50%, ${colors[1]} 50%)` };
  }
  const angle = 360 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * angle}deg ${(i + 1) * angle}deg`);
  const from = colors.length === 3 ? 240 : (270 - angle / 2);
  return { background: `conic-gradient(from ${from}deg, ${stops.join(', ')})` };
}

function ColorSwatch({ hexParts, size = 'sm' }: { readonly hexParts: readonly string[]; readonly size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <span
      className={`inline-block ${sizeClass} rounded-sm border sf-border-soft shadow-[0_0_0_0.5px_rgba(0,0,0,0.15)] shrink-0`}
      style={colorCircleStyle(hexParts)}
    />
  );
}

/** Convert hex (#rrggbb) to rgba at given opacity. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Check if a hex color is very light (luminance > 0.85). */
function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 0.85;
}

/** Per-color border stop: light colors get a dark fallback so they stay visible. */
function borderStopColor(hex: string): string {
  return isLightColor(hex) ? 'rgba(0,0,0,0.2)' : hexToRgba(hex, 0.45);
}

/** Build a light-tinted background + color-matched border style from hex parts. */
function variantBadgeBgStyle(hexParts: readonly string[]): React.CSSProperties {
  const colors = hexParts.filter(Boolean);
  if (colors.length === 0) return {};

  if (colors.length === 1) {
    return { backgroundColor: hexToRgba(colors[0], 0.15), border: `1px solid ${borderStopColor(colors[0])}` };
  }

  // Multi-color border via border-image — each stop checked individually
  const bgStops = colors.map((c) => hexToRgba(c, 0.15));
  const borderStops = colors.map(borderStopColor);
  const pct = 100 / colors.length;
  const bgCss = colors.map((_, i) => `${bgStops[i]} ${i * pct}% ${(i + 1) * pct}%`);
  const borderCss = borderStops.map((s, i) => `${s} ${i * pct}% ${(i + 1) * pct}%`);

  return {
    background: `linear-gradient(90deg, ${bgCss.join(', ')})`,
    border: '1px solid transparent',
    borderImage: `linear-gradient(90deg, ${borderCss.join(', ')}) 1`,
  };
}

/**
 * Resolve color atoms from a variant_key, looking up edition colors from CEF.
 * - "color:black+red" → ["black", "red"]
 * - "edition:cod-bo6-edition" → looks up edition's colors combo → ["dark-gray", "black", "orange"]
 */
function resolveVariantColorAtoms(
  variantKey: string,
  editions: Record<string, { display_name?: string; colors?: string[] }>,
): string[] {
  if (variantKey.startsWith('edition:')) {
    const slug = variantKey.replace('edition:', '');
    const ed = editions[slug];
    const combo = ed?.colors?.[0] || '';
    return combo.split('+').filter(Boolean);
  }
  return variantKey.replace(/^color:/, '').split('+').filter(Boolean);
}

/**
 * Every entry in colors is a colorway. Search priority:
 *   1. Edition display name (if combo matches an edition)
 *   2. Marketing name (from color_names)
 *   3. Titlecased atom/combo (fallback)
 */
function buildVariantList(cefData: {
  colors?: string[];
  color_names?: Record<string, string>;
  editions?: Record<string, { display_name?: string; colors?: string[] }>;
}): VariantInfo[] {
  const colors = cefData.colors || [];
  const colorNames = cefData.color_names || {};
  const editions = cefData.editions || {};

  const comboToEdition = new Map<string, { slug: string; displayName: string }>();
  for (const [slug, ed] of Object.entries(editions)) {
    const combo = (ed.colors || [])[0];
    if (combo) comboToEdition.set(combo, { slug, displayName: ed.display_name || slug });
  }

  const variants: VariantInfo[] = [];
  for (const entry of colors) {
    const edition = comboToEdition.get(entry);
    if (edition) {
      variants.push({ key: `edition:${edition.slug}`, label: edition.displayName, type: 'edition' });
    } else {
      const name = colorNames[entry];
      const hasName = !!(name && name.toLowerCase() !== entry.toLowerCase());
      variants.push({ key: `color:${entry}`, label: hasName ? name : formatAtomLabel(entry), type: 'color' });
    }
  }
  return variants;
}

/** Image entry enriched with run metadata for the gallery. */
interface GalleryImage extends ProductImageEntry {
  run_number: number;
  run_model: string;
  run_ran_at: string;
}

/** Build a flat list of all images across all runs, ordered by run_number asc. */
function buildGalleryImages(runs: ProductImageFinderRun[]): GalleryImage[] {
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

interface ImageGroup {
  key: string;
  label: string;
  type: 'color' | 'edition';
  images: GalleryImage[];
}

/** Sort images by view type (grouped), then by pixel area descending within each type. */
/** Per-category view priority order. Hero always sorts last. */
const VIEW_PRIORITY_ORDER: Record<string, string[]> = {
  mouse:    ['top', 'left', 'angle', 'sangle', 'front', 'bottom', 'right', 'rear', 'hero'],
  keyboard: ['top', 'left', 'angle', 'sangle', 'front', 'bottom', 'right', 'rear', 'hero'],
  monitor:  ['front', 'angle', 'rear', 'left', 'right', 'top', 'bottom', 'sangle', 'hero'],
  mousepad: ['top', 'angle', 'left', 'front', 'bottom', 'right', 'rear', 'sangle', 'hero'],
};
const GENERIC_VIEW_ORDER = ['top', 'left', 'angle', 'sangle', 'front', 'bottom', 'right', 'rear', 'hero'];

function sortByPriorityAndSize(images: GalleryImage[], category: string): GalleryImage[] {
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
function groupImagesByVariant(images: GalleryImage[], variants: VariantInfo[], category: string): ImageGroup[] {
  const imageMap = new Map<string, GalleryImage[]>();
  for (const img of images) {
    const key = img.variant_key || '';
    if (!imageMap.has(key)) imageMap.set(key, []);
    imageMap.get(key)!.push(img);
  }
  const groups: ImageGroup[] = [];
  for (const v of variants) {
    const imgs = imageMap.get(v.key);
    if (imgs && imgs.length > 0) {
      groups.push({ key: v.key, label: v.label, type: v.type, images: sortByPriorityAndSize(imgs, category) });
    }
  }
  for (const [key, imgs] of imageMap) {
    if (!variants.some(v => v.key === key) && imgs.length > 0) {
      const label = imgs[0].variant_label || formatAtomLabel(key.replace(/^(color|edition):/, ''));
      groups.push({ key, label, type: key.startsWith('edition:') ? 'edition' : 'color', images: sortByPriorityAndSize(imgs, category) });
    }
  }
  return groups;
}

/* ── Lightbox (portaled to document.body) ────────────────────────── */

function ImageLightbox({
  img,
  src,
  category,
  productId,
  onClose,
}: {
  readonly img: GalleryImage;
  readonly src: string;
  readonly category: string;
  readonly productId: string;
  readonly onClose: () => void;
}) {
  const dims = formatDims(img.width, img.height);
  const hasOriginal = Boolean(img.original_filename);

  const originalSrc = hasOriginal
    ? originalImageServeUrl(category, productId, img.original_filename ?? '')
    : '';

  const checkerboard = img.bg_removed
    ? 'repeating-conic-gradient(#808080 0% 25%, #606060 0% 50%) 0 0 / 20px 20px'
    : 'none';

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white text-xl"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
      >
        {'\u2715'}
      </button>

      {/* Image area — side by side only when bg was actually removed */}
      {hasOriginal && img.bg_removed ? (
        <div
          className="flex-1 flex items-center justify-center w-full p-6 gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Processed (left) */}
          <div className="flex-1 flex flex-col items-center gap-2 max-h-full">
            <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">Processed</span>
            <div
              className="flex items-center justify-center flex-1 rounded-lg overflow-hidden"
              style={{ background: checkerboard }}
            >
              <img src={src} alt={`${img.view} processed`} className="max-w-full max-h-[75vh] object-contain" />
            </div>
          </div>
          {/* Original (right) */}
          <div className="flex-1 flex flex-col items-center gap-2 max-h-full">
            <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">Original</span>
            <div className="flex items-center justify-center flex-1 rounded-lg overflow-hidden">
              <img src={originalSrc} alt={`${img.view} original`} className="max-w-full max-h-[75vh] object-contain" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center w-full p-8" onClick={(e) => e.stopPropagation()}>
          <img src={src} alt={img.alt_text || `${img.view} view`} className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {/* Info bar */}
      <div
        className="w-full px-6 py-3 flex items-center gap-4 flex-wrap justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Chip label={`Run #${img.run_number}`} className="sf-chip-info" />
        <Chip label={img.view} className="sf-chip-neutral" />
        {hasOriginal && <Chip label={img.bg_removed ? 'BG Removed' : 'RAW'} className={img.bg_removed ? 'sf-chip-success' : 'sf-chip-neutral'} />}
        <span className="text-[12px] text-white/80 font-mono">{formatBytes(img.bytes)}</span>
        {dims && <span className="text-[12px] text-white/60 font-mono">{dims}px</span>}
        <span className="text-[12px] text-white/50">{img.variant_label || img.variant_key}</span>
        {img.url && (
          <a
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-blue-400 hover:underline font-mono"
          >
            {(() => { try { return new URL(img.url).hostname; } catch { return 'source'; } })()}
          </a>
        )}
        {img.source_page && img.source_page !== img.url && (
          <a
            href={img.source_page}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-blue-300/60 hover:underline font-mono"
          >
            source page
          </a>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ── Gallery Card ────────────────────────────────────────────────── */

function GalleryCard({
  img,
  category,
  productId,
  onOpen,
  onDelete,
  onProcess,
  isProcessing,
}: {
  readonly img: GalleryImage;
  readonly category: string;
  readonly productId: string;
  readonly onOpen: () => void;
  readonly onDelete: (filename: string) => void;
  readonly onProcess: (filename: string) => void;
  readonly isProcessing: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const src = img.filename ? imageServeUrl(category, productId, img.filename) : '';
  const dims = formatDims(img.width, img.height);

  const passesQuality = img.quality_pass !== false; // undefined (old data) treated as pass

  return (
    <div
      className={`sf-surface-elevated rounded-lg border overflow-hidden flex flex-col ${passesQuality ? 'sf-border-soft' : 'border-red-400/50'}`}
      style={{ width: 160, opacity: passesQuality ? 1 : 0.6 }}
    >
      {/* Thumbnail — clickable */}
      <button
        onClick={onOpen}
        className="relative w-full h-28 flex items-center justify-center p-2 cursor-pointer hover:opacity-80 transition-opacity"
        style={{ backgroundColor: 'var(--sf-surface-bg)' }}
        title="Click to view full size"
      >
        {src && !errored ? (
          <img
            src={src}
            alt={img.alt_text || `${img.view} view`}
            className="max-w-full max-h-full object-contain"
            onError={() => setErrored(true)}
            loading="lazy"
          />
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wider sf-text-muted">
            {img.view}
          </span>
        )}
        {/* Run number badge — bottom-right */}
      </button>

      {/* Meta */}
      <div className="px-2.5 py-2 flex flex-col gap-1 border-t sf-border-soft">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider sf-text-muted">{img.view}</span>
          {!passesQuality && <Chip label="low" className="sf-chip-danger" />}
          {img.bg_removed === false && img.original_filename && <Chip label="RAW" className="sf-chip-neutral" />}
        </div>
        <span className="text-[8px] font-mono sf-text-subtle">
          {formatBytes(img.bytes)}
        </span>
        {dims && (
          <span className="text-[8px] font-mono sf-text-subtle">
            {dims}px
          </span>
        )}
        {img.url && (
          <a
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[8px] font-mono sf-text-link truncate hover:underline"
            title={img.url}
          >
            {(() => { try { return new URL(img.url).hostname; } catch { return 'source'; } })()}
          </a>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          {img.filename && !img.bg_removed && (
            <button
              onClick={(e) => { e.stopPropagation(); onProcess(img.filename); }}
              disabled={isProcessing}
              className="text-[9px] sf-btn-ghost px-1 py-0.5 rounded"
              style={{ color: 'var(--sf-accent, #4263eb)' }}
              title="Remove background with RMBG 2.0"
            >
              {isProcessing ? 'processing...' : 'process'}
            </button>
          )}
          {img.filename && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(img.filename); }}
              className="text-[9px] sf-btn-ghost px-1 py-0.5 rounded"
              style={{ color: 'var(--sf-danger, #ef4444)' }}
              title={`Delete ${img.filename}`}
            >
              delete
            </button>
          )}
        </div>
      </div>

      {/* Run number — bottom of card */}
      <div className="px-2.5 py-1 border-t sf-border-soft text-center">
        <span className="text-[8px] font-mono sf-text-muted">
          run {img.run_number}
        </span>
      </div>
    </div>
  );
}

/* ── Variant Row (lean — header + run button only) ───────────────── */

function VariantRow({
  variant,
  imageCount,
  progress,
  heroEnabled,
  loopBusy,
  onRunView,
  onRunHero,
  onLoop,
}: {
  readonly variant: VariantInfo;
  readonly imageCount: number;
  readonly progress: CarouselProgress | undefined;
  readonly heroEnabled: boolean;
  readonly loopBusy: boolean;
  readonly onRunView: () => void;
  readonly onRunHero: () => void;
  readonly onLoop: () => void;
}) {
  const progressLabel = progress
    ? `${progress.viewsFilled}/${progress.viewsTotal} views · ${progress.heroCount}/${progress.heroTarget} heroes`
    : null;

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 sf-surface-panel rounded-lg">
      <Chip
        label={variant.type === 'edition' ? 'ED' : 'CLR'}
        className={variant.type === 'edition' ? 'sf-chip-accent' : 'sf-chip-info'}
      />
      <span className="text-[13px] font-semibold sf-text-primary truncate min-w-0 flex-1">
        {variant.label}
      </span>
      {imageCount > 0 ? (
        <Chip label={`${imageCount} img`} className="sf-chip-success" />
      ) : (
        <span className="text-[10px] sf-text-muted italic">no images</span>
      )}
      {progressLabel && (
        <span className="text-[9px] sf-text-muted font-mono whitespace-nowrap">{progressLabel}</span>
      )}
      <div className="shrink-0 flex items-center gap-1">
        <button
          onClick={onRunView}
          className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-primary-button"
          title="Single view run"
        >
          View
        </button>
        {heroEnabled && (
          <button
            onClick={onRunHero}
            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-primary-button"
            title="Single hero run"
          >
            Hero
          </button>
        )}
        <button
          onClick={onLoop}
          disabled={loopBusy}
          className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed"
          title="Loop: views then heroes until carousel complete"
        >
          Loop
        </button>
      </div>
    </div>
  );
}

/* ── Run History helpers ────────────────────────────────────────── */

/** Resolve run mode from top-level or response blob (SQL path). */
function resolveRunMode(run: ProductImageFinderRun): 'view' | 'hero' | null {
  return run.mode || run.response?.mode || null;
}

/** Resolve loop_id from top-level or response blob. */
function resolveLoopId(run: ProductImageFinderRun): string | null {
  return run.loop_id || run.response?.loop_id || null;
}

/** Build the mode badge label: VIEW, HERO, LOOP VIEW, LOOP HERO. */
function buildModeBadge(run: ProductImageFinderRun): { label: string; className: string } | null {
  const mode = resolveRunMode(run);
  if (!mode) return null;
  const isLoop = Boolean(resolveLoopId(run));
  const label = isLoop ? `LOOP ${mode.toUpperCase()}` : mode.toUpperCase();
  const className = mode === 'hero' ? 'sf-chip-accent' : 'sf-chip-info';
  return { label, className };
}

interface RunGroup {
  type: 'single' | 'loop';
  loopId?: string;
  runs: ProductImageFinderRun[];
}

/** Group runs by loop_id. Non-loop runs become single-run groups. */
function groupRunsByLoop(runs: ProductImageFinderRun[]): RunGroup[] {
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

/* ── Run History Row ─────────────────────────────────────────────── */

function PifRunHistoryRow({
  run,
  hexMap,
  editions,
  onDelete,
}: {
  readonly run: ProductImageFinderRun;
  readonly hexMap: Map<string, string>;
  readonly editions: Record<string, { display_name?: string; colors?: string[] }>;
  readonly onDelete: (runNumber: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const images = run.selected?.images || [];
  const errors = run.response?.download_errors || [];
  const log = run.response?.discovery_log;
  const badge = buildModeBadge(run);

  // Resolve variant color atoms → hex for swatch (editions look up their combo)
  const variantKey = run.response?.variant_key || '';
  const variantLabel = run.response?.variant_label || run.response?.variant_key || '--';
  const colorAtoms = resolveVariantColorAtoms(variantKey, editions);
  const hexParts = colorAtoms.map(a => hexMap.get(a.trim()) || '');

  return (
    <div className="sf-surface-panel rounded-lg overflow-hidden">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none hover:opacity-80"
      >
        <span className="text-[10px] sf-text-muted shrink-0" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          {'\u25B6'}
        </span>
        <span className="text-[13px] font-mono font-bold text-[var(--sf-token-accent-strong)]">
          #{run.run_number}
        </span>
        <span className="font-mono text-[10px] sf-text-muted">{run.ran_at?.split('T')[0] ?? '--'}</span>
        <FinderRunTimestamp
          startedAt={run.started_at || run.response?.started_at}
          durationMs={run.duration_ms ?? run.response?.duration_ms}
        />
        {run.model && <Chip label={run.model} className="sf-chip-neutral" />}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] sf-text-primary font-medium"
          style={variantBadgeBgStyle(hexParts)}
        >
          <ColorSwatch hexParts={hexParts} />
          {variantLabel}
        </span>
        {badge && <Chip label={badge.label} className={badge.className} />}
        <div className="flex-1" />
        <Chip label={`${images.length} img`} className={images.length > 0 ? 'sf-chip-success' : 'sf-chip-neutral'} />
        {errors.length > 0 && <Chip label={`${errors.length} err`} className="sf-chip-danger" />}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(run.run_number); }}
          className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded sf-status-text-danger border sf-border-soft opacity-50 hover:opacity-100"
        >
          Del
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t sf-border-soft flex flex-col gap-3">
          {/* Download errors */}
          {errors.length > 0 && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-1">Download Errors</div>
              <div className="flex flex-col gap-1">
                {errors.map((e, i) => (
                  <div key={i} className="text-[10px] font-mono sf-status-text-danger">
                    {e.view}: {e.error} {e.url ? `(${e.url})` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discovery log */}
          {log && (log.urls_checked?.length > 0 || log.queries_run?.length > 0 || log.notes?.length > 0) && (
            <details className="sf-surface-panel border sf-border-soft rounded-md">
              <summary className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle">
                Discovery Log
              </summary>
              <div className="px-3 pb-3 flex flex-col gap-2">
                {log.queries_run?.length > 0 && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">Queries Run ({log.queries_run.length})</div>
                    <div className="flex flex-col gap-0.5">
                      {log.queries_run.map((q, i) => (
                        <span key={i} className="text-[10px] font-mono sf-text-subtle">{q}</span>
                      ))}
                    </div>
                  </div>
                )}
                {log.urls_checked?.length > 0 && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">URLs Checked ({log.urls_checked.length})</div>
                    <div className="flex flex-col gap-0.5">
                      {log.urls_checked.map((url, i) => (
                        <span key={i} className="text-[10px] font-mono sf-text-subtle truncate max-w-full" title={url}>
                          {url}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {log.notes?.length > 0 && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">Notes</div>
                    <div className="flex flex-col gap-0.5">
                      {log.notes.map((n, i) => (
                        <span key={i} className="text-[10px] sf-text-subtle">{n}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* System prompt, user message, LLM response */}
          <FinderRunPromptDetails
            systemPrompt={run.prompt?.system}
            userMessage={run.prompt?.user}
            response={run.response}
          />
        </div>
      )}
    </div>
  );
}

/* ── Loop Group (collapsible wrapper for loop runs) ──────────────── */

function PifLoopGroup({
  group,
  hexMap,
  editions,
  onDeleteRun,
}: {
  readonly group: RunGroup;
  readonly hexMap: Map<string, string>;
  readonly editions: Record<string, { display_name?: string; colors?: string[] }>;
  readonly onDeleteRun: (runNumber: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalImages = group.runs.reduce((sum, r) => sum + (r.selected?.images?.length || 0), 0);
  const totalErrors = group.runs.reduce((sum, r) => sum + (r.response?.download_errors?.length || 0), 0);
  const runNumbers = group.runs.map(r => r.run_number);
  const rangeLabel = runNumbers.length > 0
    ? `#${runNumbers[0]}\u2013#${runNumbers[runNumbers.length - 1]}`
    : '';
  const date = group.runs[0]?.ran_at?.split('T')[0] ?? '--';

  // Resolve variant from first run in the loop
  const firstRun = group.runs[0];
  const variantKey = firstRun?.response?.variant_key || '';
  const variantLabel = firstRun?.response?.variant_label || variantKey.replace(/^(color|edition):/, '') || '--';
  const colorAtoms = resolveVariantColorAtoms(variantKey, editions);
  const hexParts = colorAtoms.map(a => hexMap.get(a.trim()) || '');

  return (
    <div className="sf-surface-elevated rounded-lg overflow-hidden border sf-border-soft">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none hover:opacity-80"
      >
        <span className="text-[10px] sf-text-muted shrink-0" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          {'\u25B6'}
        </span>
        <span className="text-[13px] font-mono font-bold text-[var(--sf-token-accent-strong)]">
          {rangeLabel}
        </span>
        <span className="font-mono text-[10px] sf-text-muted">{date}</span>
        <FinderRunTimestamp
          startedAt={firstRun?.started_at || firstRun?.response?.started_at}
          durationMs={firstRun?.duration_ms ?? firstRun?.response?.duration_ms}
        />
        {firstRun?.model && <Chip label={firstRun.model} className="sf-chip-neutral" />}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] sf-text-primary font-medium"
          style={variantBadgeBgStyle(hexParts)}
        >
          <ColorSwatch hexParts={hexParts} />
          {variantLabel}
        </span>
        <Chip label={`LOOP \u00B7 ${group.runs.length} calls`} className="sf-chip-accent" />
        <div className="flex-1" />
        <Chip label={`${totalImages} img`} className={totalImages > 0 ? 'sf-chip-success' : 'sf-chip-neutral'} />
        {totalErrors > 0 && <Chip label={`${totalErrors} err`} className="sf-chip-danger" />}
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t sf-border-soft space-y-1.5">
          {group.runs.map((run) => (
            <PifRunHistoryRow
              key={run.run_number}
              run={run}
              hexMap={hexMap}
              editions={editions}
              onDelete={onDeleteRun}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Panel ──────────────────────────────────────────────────── */

interface ProductImageFinderPanelProps {
  productId: string;
  category: string;
}

export function ProductImageFinderPanel({ productId, category }: ProductImageFinderPanelProps) {
  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:pif:collapsed:${productId}`, true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [lightboxImg, setLightboxImg] = useState<GalleryImage | null>(null);
  const [expandedImageGroups, setExpandedImageGroups] = useState<Set<string>>(new Set());

  // LLM model for imageFinder phase (shared hook, parameterized by phase ID)
  const { model: resolvedModel, accessMode: resolvedAccessMode, modelDisplay } = useResolvedFinderModel('imageFinder');

  // Color registry for hex lookup in run history badges
  const { data: colorRegistry = [] } = useQuery<ColorRegistryEntry[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<ColorRegistryEntry[]>('/colors'),
  });
  const hexMap = useMemo(() => new Map(colorRegistry.map(c => [c.name, c.hex])), [colorRegistry]);

  // CEF data — gate dependency
  const { data: cefData, isError: cefError } = useColorEditionFinderQuery(category, productId);

  // Editions map for resolving edition variant_key → color atoms
  const editions = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sel = (cefData?.selected ?? cefData) as any;
    return (sel?.editions ?? sel?.edition_details ?? {}) as Record<string, { display_name?: string; colors?: string[] }>;
  }, [cefData]);

  // PIF data
  const { data: pifData, isLoading, isError } = useProductImageFinderQuery(category, productId);

  const deleteRunMut = useDeleteProductImageFinderRunMutation(category, productId);
  const deleteAllMut = useDeleteProductImageFinderAllMutation(category, productId);
  const deleteImageMut = useDeleteProductImageMutation(category, productId);
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
  const isRunning = useMemo(
    () => [...ops.values()].some((o) => o.type === 'pif' && o.productId === productId && o.status === 'running'),
    [ops, productId],
  );

  // Build variant list from CEF data
  const variants = useMemo(() => {
    if (cefError) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sel = (cefData?.selected ?? cefData) as any;
    if (!sel?.colors?.length) return [];
    return buildVariantList({
      colors: sel.colors,
      color_names: sel.color_names ?? sel.color_details,
      editions: sel.editions ?? sel.edition_details,
    });
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

  // Count images per variant from gallery (all runs), not pifData.selected
  // which only reflects the latest run's single-variant images.
  const variantImageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const img of galleryImages) {
      const key = img.variant_key || '';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [galleryImages]);

  // ── Fire-and-forget (each call is independent — safe to spam) ──
  const fire = useFireAndForget({ type: 'pif', category, productId });
  const pifRunUrl = `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  const pifLoopUrl = `${pifRunUrl}/loop`;

  const handleRunVariantView = useCallback((variantKey: string) => {
    fire(pifRunUrl, { variant_key: variantKey, mode: 'view' }, { subType: 'view', variantKey });
  }, [fire, pifRunUrl]);

  const handleRunVariantHero = useCallback((variantKey: string) => {
    fire(pifRunUrl, { variant_key: variantKey, mode: 'hero' }, { subType: 'hero', variantKey });
  }, [fire, pifRunUrl]);

  const handleLoopAll = useCallback(() => {
    for (const v of variants) {
      if (!loopingVariants.has(v.key)) {
        fire(pifLoopUrl, { variant_key: v.key }, { subType: 'loop', variantKey: v.key });
      }
    }
  }, [fire, pifLoopUrl, variants, loopingVariants]);

  const handleLoopVariant = useCallback((variantKey: string) => {
    if (!loopingVariants.has(variantKey)) {
      fire(pifLoopUrl, { variant_key: variantKey }, { subType: 'loop', variantKey });
    }
  }, [fire, pifLoopUrl, loopingVariants]);

  const heroEnabled = pifData?.carouselSettings?.heroEnabled ?? true;

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'run' && deleteTarget.runNumber) {
      deleteRunMut.mutate(deleteTarget.runNumber, { onSuccess: () => setDeleteTarget(null) });
    } else {
      deleteAllMut.mutate(undefined, { onSuccess: () => setDeleteTarget(null) });
    }
  }, [deleteTarget, deleteRunMut, deleteAllMut]);

  if (!productId || !category) return null;

  const hasCefData = Boolean(variants.length);
  const effectiveResult = isError ? null : pifData;
  const statusChip = deriveFinderStatusChip(effectiveResult ?? null);
  const cooldown = deriveCooldownState(effectiveResult ?? null);
  const imageCount = galleryImages.length;
  const runCount = effectiveResult?.run_count ?? 0;
  const runs = effectiveResult?.runs || [];

  // Aggregate carousel progress across all variants
  const carouselProgressMap = effectiveResult?.carouselProgress ?? {};
  const carouselAgg = useMemo(() => {
    const entries = Object.values(carouselProgressMap);
    if (entries.length === 0) return { viewsFilled: 0, viewsTotal: 0, heroCount: 0, heroTarget: 0, allComplete: false };
    const viewsFilled = entries.reduce((s, e) => s + e.viewsFilled, 0);
    const viewsTotal = entries.reduce((s, e) => s + e.viewsTotal, 0);
    const heroCount = entries.reduce((s, e) => s + e.heroCount, 0);
    const heroTarget = entries.reduce((s, e) => s + e.heroTarget, 0);
    const allComplete = entries.every((e) => e.viewsFilled >= e.viewsTotal && e.heroSatisfied);
    return { viewsFilled, viewsTotal, heroCount, heroTarget, allComplete };
  }, [carouselProgressMap]);

  const kpiCards: KpiCard[] = [
    { label: 'Images', value: String(imageCount), tone: 'accent' },
    { label: 'Variants', value: String(variants.length), tone: 'purple' },
    { label: 'Runs', value: String(runCount), tone: 'success' },
    {
      label: 'Carousel',
      value: carouselAgg.viewsTotal > 0 ? `${carouselAgg.viewsFilled}/${carouselAgg.viewsTotal}` : '--',
      tone: carouselAgg.allComplete ? 'success' : 'info',
    },
  ];

  const badgeProps = {
    accessMode: resolvedAccessMode,
    role: (resolvedModel?.useReasoning ? 'reasoning' : 'primary') as 'reasoning' | 'primary',
    thinking: resolvedModel?.thinking ?? false,
    webSearch: resolvedModel?.webSearch ?? false,
  };

  return (
    <div className="sf-surface-panel p-0 flex flex-col">
      {/* Header */}
      <FinderPanelHeader
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        title="Product Image Finder"
        tip="Finds and downloads high-resolution product images per color variant and edition. Requires CEF data."
        isRunning={isRunning}
        runDisabled={!hasCefData || (variants.length > 0 && variants.every((v) => loopingVariants.has(v.key)))}
        runLabel="Loop"
        onRun={handleLoopAll}
      >
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold tracking-[0.04em] sf-chip-purple border-[1.5px] border-current">
          <ModelBadgeGroup {...badgeProps} />
          {modelDisplay}
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

          {/* Cooldown Strip */}
          {runCount > 0 && <FinderCooldownStrip cooldown={cooldown} />}

          {/* All Images — grouped by variant, each group collapsible */}
          {imageGroups.length > 0 && (
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
                      if (expandedImageGroups.size === imageGroups.length) {
                        setExpandedImageGroups(new Set());
                      } else {
                        setExpandedImageGroups(new Set(imageGroups.map(g => g.key)));
                      }
                    }}
                    className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button border sf-border-soft opacity-60 hover:opacity-100"
                  >
                    {expandedImageGroups.size === imageGroups.length ? 'Collapse All' : 'Expand All'}
                  </button>
                </div>
              }
            >
              <div style={{ columns: 2, columnGap: '0.75rem' }}>
                {imageGroups.map(group => {
                  const isOpen = expandedImageGroups.has(group.key);
                  return (
                    <div key={group.key} className="break-inside-avoid mb-3 sf-surface-panel rounded-lg overflow-hidden">
                      <div
                        onClick={() => setExpandedImageGroups(prev => {
                          const next = new Set(prev);
                          if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                          return next;
                        })}
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none hover:opacity-80"
                      >
                        <span
                          className="text-[10px] sf-text-muted shrink-0"
                          style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                        >
                          {'\u25B6'}
                        </span>
                        <span className="text-[12px] font-semibold sf-text-primary truncate min-w-0 flex-1">
                          {group.label}
                        </span>
                        <Chip
                          label={group.type === 'edition' ? 'ED' : 'CLR'}
                          className={group.type === 'edition' ? 'sf-chip-accent' : 'sf-chip-info'}
                        />
                        <Chip label={`${group.images.length} img`} className="sf-chip-success" />
                      </div>
                      {isOpen && (
                        <div className="px-3 pb-3">
                          <div className="flex gap-2 flex-wrap">
                            {group.images.map((img, i) => (
                              <GalleryCard
                                key={`${img.run_number}-${img.variant_key}-${img.view}-${i}`}
                                img={img}
                                category={category}
                                productId={productId}
                                onOpen={() => setLightboxImg(img)}
                                onDelete={(filename) => deleteImageMut.mutate(filename)}
                                onProcess={handleProcessImage}
                                isProcessing={processingFilename === img.filename}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </FinderSectionCard>
          )}

          {/* Variants — collapsible, default closed */}
          <FinderSectionCard
            title="Variants"
            count={`${variants.length} total`}
            storeKey={`pif:variants:${productId}`}
          >
            <div style={{ columns: 2, columnGap: '0.375rem' }}>
              {variants.map((v) => (
                <div key={v.key} className="break-inside-avoid mb-1.5">
                  <VariantRow
                    variant={v}
                    imageCount={variantImageCounts.get(v.key) || 0}
                    progress={carouselProgressMap[v.key]}
                    heroEnabled={heroEnabled}
                    loopBusy={loopingVariants.has(v.key)}
                    onRunView={() => handleRunVariantView(v.key)}
                    onRunHero={() => handleRunVariantHero(v.key)}
                    onLoop={() => handleLoopVariant(v.key)}
                  />
                </div>
              ))}
            </div>
          </FinderSectionCard>

          {/* Run History — collapsible, default closed */}
          {runs.length > 0 && (
            <FinderSectionCard
              title="Run History"
              count={`${runs.length} run${runs.length !== 1 ? 's' : ''}`}
              storeKey={`pif:history:${productId}`}
              trailing={
                <button
                  onClick={() => setDeleteTarget({ kind: 'all', count: runCount })}
                  disabled={deleteAllMut.isPending}
                  className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Delete All
                </button>
              }
            >
              <div className="space-y-1.5">
                {groupRunsByLoop([...runs].reverse()).map((group, gi) => (
                  group.type === 'loop' ? (
                    <PifLoopGroup
                      key={group.loopId ?? gi}
                      group={group}
                      hexMap={hexMap}
                      editions={editions}
                      onDeleteRun={(rn) => setDeleteTarget({ kind: 'run', runNumber: rn })}
                    />
                  ) : (
                    <PifRunHistoryRow
                      key={group.runs[0].run_number}
                      run={group.runs[0]}
                      hexMap={hexMap}
                      editions={editions}
                      onDelete={(rn) => setDeleteTarget({ kind: 'run', runNumber: rn })}
                    />
                  )
                ))}
              </div>
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
          isPending={deleteRunMut.isPending || deleteAllMut.isPending}
          moduleLabel="PIF"
        />
      )}

      {/* Lightbox overlay */}
      {lightboxImg && (
        <ImageLightbox
          img={lightboxImg}
          src={lightboxImg.filename ? imageServeUrl(category, productId, lightboxImg.filename) : ''}
          category={category}
          productId={productId}
          onClose={() => setLightboxImg(null)}
        />
      )}
    </div>
  );
}
