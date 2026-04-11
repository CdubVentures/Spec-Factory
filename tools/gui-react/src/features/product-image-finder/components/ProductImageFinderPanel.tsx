/**
 * Product Image Finder Panel — Indexing Lab embedded panel.
 *
 * Mirrors the CEF panel pattern: collapsible header, Run Now button,
 * status chip, image previews, and run history.
 */

import { useMemo, useState, useCallback } from 'react';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { useOperationsStore } from '../../../stores/operationsStore.ts';
import {
  useProductImageFinderQuery,
  useProductImageFinderRunMutation,
  useDeleteProductImageFinderAllMutation,
} from '../api/productImageFinderQueries.ts';
import type { ProductImageEntry, ProductImageFinderRun } from '../types.ts';

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Image Card ──────────────────────────────────────────────────── */

function ImageCard({ image }: { image: ProductImageEntry }) {
  return (
    <div className="sf-card p-3 rounded space-y-2">
      <div className="flex items-center justify-between">
        <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>
          {image.view}
        </span>
        <Chip label={formatBytes(image.bytes)} className="sf-chip-neutral" />
      </div>
      <div className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
        {image.filename}
      </div>
      {image.source_page && (
        <a
          href={image.source_page}
          target="_blank"
          rel="noopener noreferrer"
          className="sf-text-caption underline"
          style={{ color: 'var(--sf-link)' }}
        >
          source page
        </a>
      )}
    </div>
  );
}

/* ── Run History Row ─────────────────────────────────────────────── */

function RunRow({ run }: { run: ProductImageFinderRun }) {
  const [expanded, setExpanded] = useState(false);
  const imageCount = run.selected?.images?.length ?? 0;
  const errorCount = run.response?.download_errors?.length ?? 0;

  return (
    <div className="sf-card rounded">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center gap-3"
      >
        <span className="sf-text-caption font-mono" style={{ color: 'var(--sf-muted)' }}>
          #{run.run_number}
        </span>
        <span className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
          {formatDate(run.ran_at)}
        </span>
        <Chip label={run.model} className="sf-chip-neutral" />
        <Chip label={`${imageCount} img`} className={imageCount > 0 ? 'sf-chip-success' : 'sf-chip-warning'} />
        {errorCount > 0 && <Chip label={`${errorCount} err`} className="sf-chip-danger" />}
        {run.fallback_used && <Chip label="fallback" className="sf-chip-warning" />}
        <span className="ml-auto sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {run.selected?.images?.map((img) => (
            <ImageCard key={img.view} image={img} />
          ))}
          {run.response?.download_errors?.map((err, i) => (
            <div key={i} className="sf-callout sf-callout-danger px-2 py-1 rounded sf-text-caption">
              {err.view}: {err.error}
            </div>
          ))}
          {run.response?.discovery_log?.notes?.length > 0 && (
            <div className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
              {run.response.discovery_log.notes.map((n, i) => <div key={i}>{n}</div>)}
            </div>
          )}
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
  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:pif:collapsed:${category}`, true);
  const { data, isLoading, error } = useProductImageFinderQuery(category, productId);
  const runMutation = useProductImageFinderRunMutation(category, productId);
  const deleteAllMutation = useDeleteProductImageFinderAllMutation(category, productId);

  const activeOps = useOperationsStore((s) => s.operations);
  const isRunning = useMemo(() =>
    [...activeOps.values()].some((op) => op.type === 'pif' && op.productId === productId && op.status === 'running'),
  [activeOps, productId]);

  const handleRun = useCallback(() => {
    if (!isRunning && !runMutation.isPending) runMutation.mutate();
  }, [isRunning, runMutation]);

  const handleDeleteAll = useCallback(() => {
    if (confirm('Delete all PIF data for this product?')) deleteAllMutation.mutate();
  }, [deleteAllMutation]);

  if (!productId) return null;

  const imageCount = data?.selected?.images?.length ?? 0;
  const runCount = data?.run_count ?? 0;
  const onCooldown = data?.on_cooldown ?? false;

  return (
    <div className="sf-card rounded overflow-hidden">
      {/* Header */}
      <button
        onClick={toggleCollapsed}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--sf-surface-border)' }}
      >
        <span className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
        <span className="sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>
          Product Image Finder
        </span>
        <Chip label="PIF" className="sf-chip-info" />
        <Tip text="Finds and downloads official product identity images for configured view angles." />
        {imageCount > 0 && (
          <Chip label={`${imageCount} images`} className="sf-chip-success" />
        )}
        {runCount > 0 && (
          <Chip label={`${runCount} run${runCount !== 1 ? 's' : ''}`} className="sf-chip-neutral" />
        )}
        {onCooldown && (
          <Chip label="cooldown" className="sf-chip-warning" />
        )}
        {isRunning && <Spinner className="h-4 w-4" />}
      </button>

      {!collapsed && (
        <div className="px-4 py-3 space-y-4">
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRun}
              disabled={isRunning || runMutation.isPending}
              className="rounded sf-primary-button px-3 py-1.5 sf-text-label font-semibold disabled:opacity-50"
            >
              {isRunning ? 'Running...' : 'Run Now'}
            </button>
            {runCount > 0 && (
              <button
                onClick={handleDeleteAll}
                disabled={deleteAllMutation.isPending}
                className="rounded sf-danger-button px-3 py-1.5 sf-text-label disabled:opacity-50"
              >
                Reset All
              </button>
            )}
            {runMutation.isError && (
              <span className="sf-text-caption sf-status-text-danger">
                {String(runMutation.error)}
              </span>
            )}
          </div>

          {isLoading && <Spinner />}
          {error && (
            <div className="sf-callout sf-callout-danger px-3 py-2 sf-text-caption">
              {String(error)}
            </div>
          )}

          {/* Current images */}
          {data?.selected?.images && data.selected.images.length > 0 && (
            <div className="space-y-2">
              <div className="sf-text-caption font-semibold" style={{ color: 'var(--sf-muted)' }}>
                Current Images
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.selected.images.map((img) => (
                  <ImageCard key={img.view} image={img} />
                ))}
              </div>
            </div>
          )}

          {/* Run history */}
          {data?.runs && data.runs.length > 0 && (
            <div className="space-y-2">
              <div className="sf-text-caption font-semibold" style={{ color: 'var(--sf-muted)' }}>
                Run History
              </div>
              <div className="space-y-1">
                {[...data.runs].reverse().map((run) => (
                  <RunRow key={run.run_number} run={run} />
                ))}
              </div>
            </div>
          )}

          {!isLoading && !error && imageCount === 0 && runCount === 0 && (
            <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
              No images discovered yet. Click "Run Now" to find product identity images.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
