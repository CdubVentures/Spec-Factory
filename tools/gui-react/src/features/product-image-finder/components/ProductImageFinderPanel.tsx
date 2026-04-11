/**
 * Product Image Finder Panel — Indexing Lab embedded panel.
 *
 * Built from shared finder components (same visual language as CEF).
 * Gate: requires CEF data before PIF can run.
 * Shows variant grid with per-variant run buttons + Run All.
 */

import { useMemo, useCallback, useState } from 'react';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import {
  FinderPanelHeader,
  FinderKpiCard,
  FinderCooldownStrip,
  FinderPanelFooter,
  FinderDeleteConfirmModal,
  deriveCooldownState,
  deriveFinderStatusChip,
} from '../../../shared/ui/finder/index.ts';
import type { KpiCard, DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { useOperationsStore } from '../../../stores/operationsStore.ts';
import { useColorEditionFinderQuery } from '../../color-edition-finder/api/colorEditionFinderQueries.ts';
import {
  useProductImageFinderQuery,
  useProductImageFinderRunMutation,
  useDeleteProductImageFinderAllMutation,
  useDeleteProductImageFinderRunMutation,
} from '../api/productImageFinderQueries.ts';
import type { ProductImageEntry, VariantInfo } from '../types.ts';

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildVariantList(cefData: {
  colors?: string[];
  color_names?: Record<string, string>;
  editions?: Record<string, { display_name?: string; colors?: string[] }>;
}): VariantInfo[] {
  const colors = cefData.colors || [];
  const colorNames = cefData.color_names || {};
  const editions = cefData.editions || {};
  const variants: VariantInfo[] = [];

  for (const atom of colors) {
    variants.push({ key: `color:${atom}`, label: colorNames[atom] || atom, type: 'color' });
  }
  for (const [slug, ed] of Object.entries(editions)) {
    variants.push({ key: `edition:${slug}`, label: ed.display_name || slug, type: 'edition' });
  }
  return variants;
}

/* ── Variant Row ─────────────────────────────────────────────────── */

function VariantRow({
  variant,
  images,
  isRunning,
  onRun,
}: {
  variant: VariantInfo;
  images: ProductImageEntry[];
  isRunning: boolean;
  onRun: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 sf-surface-elevated rounded-lg">
      {/* Type chip */}
      <Chip
        label={variant.type === 'edition' ? 'ED' : 'CLR'}
        className={variant.type === 'edition' ? 'sf-chip-accent' : 'sf-chip-info'}
      />

      {/* Variant label */}
      <span className="text-[13px] font-semibold sf-text-primary truncate min-w-0 flex-1">
        {variant.label}
      </span>

      {/* Image indicators */}
      <div className="flex gap-2 shrink-0">
        {images.length > 0 ? images.map((img) => (
          <div key={img.view} className="flex flex-col items-center">
            <div
              className="w-16 h-12 rounded border flex items-center justify-center overflow-hidden"
              style={{ borderColor: 'var(--sf-surface-border)', backgroundColor: 'var(--sf-surface-bg)' }}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider sf-text-muted">
                {img.view}
              </span>
            </div>
            <span className="text-[8px] font-mono sf-text-muted mt-0.5">{formatBytes(img.bytes)}</span>
          </div>
        )) : (
          <span className="text-[10px] sf-text-muted italic">no images</span>
        )}
      </div>

      {/* Per-variant run */}
      <button
        onClick={onRun}
        disabled={isRunning}
        className="shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded sf-primary-button disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isRunning ? <Spinner className="h-3 w-3" /> : 'Run'}
      </button>
    </div>
  );
}

/* ── Main Panel ──────────────────────────────────────────────────── */

interface ProductImageFinderPanelProps {
  productId: string;
  category: string;
}

export function ProductImageFinderPanel({ productId, category }: ProductImageFinderPanelProps) {
  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:pif:collapsed:${category}`, true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // CEF data — gate dependency
  const { data: cefData } = useColorEditionFinderQuery(category, productId);

  // PIF data
  const { data: pifData, isLoading, isError } = useProductImageFinderQuery(category, productId);
  const runMutation = useProductImageFinderRunMutation(category, productId);
  const deleteRunMut = useDeleteProductImageFinderRunMutation(category, productId);
  const deleteAllMut = useDeleteProductImageFinderAllMutation(category, productId);

  // Operations tracker
  const ops = useOperationsStore((s) => s.operations);
  const isRunning = useMemo(
    () => [...ops.values()].some((o) => o.type === 'pif' && o.productId === productId && o.status === 'running'),
    [ops, productId],
  );

  // Build variant list from CEF data
  const variants = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sel = (cefData?.selected ?? cefData) as any;
    if (!sel?.colors?.length) return [];
    return buildVariantList({
      colors: sel.colors,
      color_names: sel.color_names ?? sel.color_details,
      editions: sel.editions ?? sel.edition_details,
    });
  }, [cefData]);

  // Group downloaded images by variant_key
  const imagesByVariant = useMemo(() => {
    const map = new Map<string, ProductImageEntry[]>();
    for (const img of (pifData?.selected?.images || [])) {
      const key = img.variant_key || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(img);
    }
    return map;
  }, [pifData]);

  const handleRunAll = useCallback(() => {
    if (!isRunning) runMutation.mutate({});
  }, [isRunning, runMutation]);

  const handleRunVariant = useCallback((variantKey: string) => {
    if (!isRunning) runMutation.mutate({ variant_key: variantKey });
  }, [isRunning, runMutation]);

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
  const imageCount = effectiveResult?.selected?.images?.length ?? 0;
  const runCount = effectiveResult?.run_count ?? 0;

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
        tip="Finds and downloads official product identity images per color variant and edition. Requires CEF data."
        isRunning={isRunning}
        runLabel={hasCefData ? `Run All (${variants.length})` : 'Run All'}
        onRun={handleRunAll}
      />

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

          {/* Variant Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted">
                Variants <span className="font-mono sf-text-subtle">{variants.length} total</span>
              </div>
              {runCount > 0 && (
                <button
                  onClick={() => setDeleteTarget({ kind: 'all', count: runCount })}
                  disabled={deleteAllMut.isPending}
                  className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Delete All
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {variants.map((v) => (
                <VariantRow
                  key={v.key}
                  variant={v}
                  images={imagesByVariant.get(v.key) || []}
                  isRunning={isRunning}
                  onRun={() => handleRunVariant(v.key)}
                />
              ))}
            </div>
          </div>

          {/* Error display */}
          {runMutation.isError && (
            <div className="sf-callout sf-callout-danger px-3 py-2 rounded sf-text-caption">
              {String(runMutation.error)}
            </div>
          )}

          {/* Footer */}
          <FinderPanelFooter lastRanAt={effectiveResult?.last_ran_at} runCount={runCount} />
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
    </div>
  );
}
