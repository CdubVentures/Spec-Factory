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
  FinderSectionCard,
  useResolvedFinderModel,
  deriveCooldownState,
  deriveFinderStatusChip,
  formatAtomLabel,
} from '../../../shared/ui/finder/index.ts';
import type { KpiCard, DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { useOperationsStore } from '../../../stores/operationsStore.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import { useColorEditionFinderQuery } from '../../color-edition-finder/api/colorEditionFinderQueries.ts';
import {
  useProductImageFinderQuery,
  useProductImageFinderRunMutation,
  useDeleteProductImageFinderAllMutation,
  useDeleteProductImageFinderRunMutation,
  useDeleteProductImageMutation,
} from '../api/productImageFinderQueries.ts';
import type { ProductImageEntry, ProductImageFinderRun, VariantInfo } from '../types.ts';

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

/** Group gallery images by variant key, preserving variant order from CEF. */
function groupImagesByVariant(images: GalleryImage[], variants: VariantInfo[]): ImageGroup[] {
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
      groups.push({ key: v.key, label: v.label, type: v.type, images: imgs });
    }
  }
  for (const [key, imgs] of imageMap) {
    if (!variants.some(v => v.key === key) && imgs.length > 0) {
      const label = imgs[0].variant_label || formatAtomLabel(key.replace(/^(color|edition):/, ''));
      groups.push({ key, label, type: key.startsWith('edition:') ? 'edition' : 'color', images: imgs });
    }
  }
  return groups;
}

/* ── Lightbox (portaled to document.body) ────────────────────────── */

function ImageLightbox({
  img,
  src,
  onClose,
}: {
  readonly img: GalleryImage;
  readonly src: string;
  readonly onClose: () => void;
}) {
  const dims = formatDims(img.width, img.height);

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

      {/* Image */}
      <div className="flex-1 flex items-center justify-center w-full p-8" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={img.alt_text || `${img.view} view`}
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* Info bar */}
      <div
        className="w-full px-6 py-3 flex items-center gap-4 flex-wrap justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Chip label={`Run #${img.run_number}`} className="sf-chip-info" />
        <Chip label={img.view} className="sf-chip-neutral" />
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
}: {
  readonly img: GalleryImage;
  readonly category: string;
  readonly productId: string;
  readonly onOpen: () => void;
  readonly onDelete: (filename: string) => void;
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
        className="w-full h-28 flex items-center justify-center p-2 cursor-pointer hover:opacity-80 transition-opacity"
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
      </button>

      {/* Meta */}
      <div className="px-2.5 py-2 flex flex-col gap-1 border-t sf-border-soft">
        <div className="flex items-center gap-1.5">
          <Chip label={`#${img.run_number}`} className="sf-chip-info" />
          <span className="text-[9px] font-bold uppercase tracking-wider sf-text-muted">{img.view}</span>
          {!passesQuality && <Chip label="low" className="sf-chip-danger" />}
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
        {img.filename && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(img.filename); }}
            className="mt-0.5 text-[9px] sf-btn-ghost px-1 py-0.5 rounded self-start"
            style={{ color: 'var(--sf-danger, #ef4444)' }}
            title={`Delete ${img.filename}`}
          >
            delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Variant Row (lean — header + run button only) ───────────────── */

function VariantRow({
  variant,
  imageCount,
  onRun,
}: {
  readonly variant: VariantInfo;
  readonly imageCount: number;
  readonly onRun: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 sf-surface-panel rounded-lg">
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
      <button
        onClick={onRun}
        className="shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded sf-primary-button"
      >
        Run
      </button>
    </div>
  );
}

/* ── Run History Row ─────────────────────────────────────────────── */

function PifRunHistoryRow({
  run,
  onDelete,
}: {
  readonly run: ProductImageFinderRun;
  readonly onDelete: (runNumber: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const images = run.selected?.images || [];
  const errors = run.response?.download_errors || [];
  const log = run.response?.discovery_log;

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
        {run.model && <Chip label={run.model} className="sf-chip-neutral" />}
        <span className="text-[10px] sf-text-subtle">
          {run.response?.variant_label || run.response?.variant_key || '--'}
        </span>
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

  // CEF data — gate dependency
  const { data: cefData, isError: cefError } = useColorEditionFinderQuery(category, productId);

  // PIF data
  const { data: pifData, isLoading, isError } = useProductImageFinderQuery(category, productId);
  const runMutation = useProductImageFinderRunMutation(category, productId);
  const deleteRunMut = useDeleteProductImageFinderRunMutation(category, productId);
  const deleteAllMut = useDeleteProductImageFinderAllMutation(category, productId);
  const deleteImageMut = useDeleteProductImageMutation(category, productId);

  // Operations tracker
  const ops = useOperationsStore((s) => s.operations);
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

  // Images grouped by variant (preserves CEF variant order)
  const imageGroups = useMemo(
    () => groupImagesByVariant(galleryImages, variants),
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

  const handleRunAll = useCallback(() => {
    if (variants.length > 0) runMutation.mutate({});
  }, [runMutation, variants.length]);

  const handleRunVariant = useCallback((variantKey: string) => {
    runMutation.mutate({ variant_key: variantKey });
  }, [runMutation]);

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

  const kpiCards: KpiCard[] = [
    { label: 'Images', value: String(imageCount), tone: 'accent' },
    { label: 'Variants', value: String(variants.length), tone: 'purple' },
    { label: 'Runs', value: String(runCount), tone: 'success' },
    {
      label: 'Cooldown',
      value: cooldown.onCooldown ? `${cooldown.daysRemaining}d` : runCount > 0 ? 'Ready' : '--',
      tone: 'info',
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
        chipLabel="PIF"
        chipClass="sf-chip-info"
        statusChip={statusChip}
        tip="Finds and downloads high-resolution product images per color variant and edition. Requires CEF data."
        isRunning={isRunning}
        runDisabled={!hasCefData}
        runLabel={hasCefData ? `Run All (${variants.length})` : 'Run All'}
        onRun={handleRunAll}
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
                        <div className="px-3 pb-3 flex gap-2 flex-wrap">
                          {group.images.map((img, i) => (
                            <GalleryCard
                              key={`${img.run_number}-${img.variant_key}-${img.view}-${i}`}
                              img={img}
                              category={category}
                              productId={productId}
                              onOpen={() => setLightboxImg(img)}
                              onDelete={(filename) => deleteImageMut.mutate(filename)}
                            />
                          ))}
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
                    onRun={() => handleRunVariant(v.key)}
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
                {[...runs].reverse().map((run) => (
                  <PifRunHistoryRow
                    key={run.run_number}
                    run={run}
                    onDelete={(rn) => setDeleteTarget({ kind: 'run', runNumber: rn })}
                  />
                ))}
              </div>
            </FinderSectionCard>
          )}

          {/* Error display */}
          {runMutation.isError && (
            <div className="sf-callout sf-callout-danger px-3 py-2 rounded sf-text-caption">
              {String(runMutation.error)}
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
          onClose={() => setLightboxImg(null)}
        />
      )}
    </div>
  );
}
