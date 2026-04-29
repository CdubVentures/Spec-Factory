/**
 * PromptPreviewModal — read-only overlay showing a compiled prompt.
 *
 * Used by CEF in Phase 1; reused by PIF (Loop/Eval sub-tabs), RDF, and SKU.
 * Copies the overlay + card structure from FinderDeleteConfirmModal.
 * Closes on backdrop click, escape key, or header X.
 */

import { useEffect, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { PromptPreviewView } from './PromptPreviewView.tsx';
import { PromptPreviewList } from './PromptPreviewList.tsx';
import type { PromptPreviewResponse } from '../../../features/indexing/api/promptPreviewTypes.ts';

interface PromptPreviewModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly query: UseQueryResult<PromptPreviewResponse>;
  readonly title: string;
  readonly subtitle?: string;
  readonly storageKeyPrefix: string;
  /** Optional slot rendered in the header between the title block and Close
   *  button — callers use it to inject a mode toggle (Run ↔ Loop for keyFinder).
   *  Omit for finders that don't need a mode selector. */
  readonly headerSlot?: ReactNode;
}

const PROMPT_PREVIEW_SECTIONS = [
  { id: 'system', label: 'SYSTEM' },
  { id: 'user', label: 'USER' },
  { id: 'response', label: 'RESPONSE' },
] as const;
const PROMPT_PREVIEW_LINES = ['primary', 'secondary', 'tertiary'] as const;

export function PromptPreviewLoadingSkeleton() {
  return (
    <div
      className="space-y-3"
      data-testid="prompt-preview-loading-skeleton"
      data-region="prompt-preview-loading-shell"
      aria-busy="true"
    >
      <span className="sr-only">Loading prompt preview</span>
      {PROMPT_PREVIEW_SECTIONS.map((section) => (
        <section
          key={section.id}
          className="rounded border sf-border-soft sf-surface-elevated p-3 space-y-2"
          data-region="prompt-preview-loading-section"
          data-skeleton-section={section.id}
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted">
              {section.label}
            </div>
            <span className="sf-shimmer inline-block h-5 w-12 rounded sf-icon-button" aria-hidden="true" />
          </div>
          {PROMPT_PREVIEW_LINES.map((line) => (
            <div key={`${section.id}-${line}`} data-region="prompt-preview-loading-line">
              <span
                className="sf-shimmer block h-3.5 w-full rounded-sm font-mono"
                aria-hidden="true"
              />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function PromptPreviewModal({ open, onClose, query, title, subtitle, storageKeyPrefix, headerSlot }: PromptPreviewModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sf-overlay-muted fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sf-surface-panel rounded-lg shadow-xl p-6 max-w-3xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${storageKeyPrefix}-title`}
      >
        <header className="flex items-start justify-between gap-4 pb-3 border-b sf-border-soft">
          <div>
            <h3 id={`${storageKeyPrefix}-title`} className="text-sm font-bold sf-text-primary">{title}</h3>
            {subtitle ? <p className="sf-text-caption sf-text-muted mt-0.5">{subtitle}</p> : null}
          </div>
          {headerSlot}
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-[11px] font-semibold rounded sf-icon-button"
            title="Close"
            aria-label="Close preview"
          >
            Close
          </button>
        </header>

        <div className="mt-3 flex-1 overflow-y-auto">
          <PromptPreviewModalBody query={query} storageKeyPrefix={storageKeyPrefix} />
        </div>

        <p className="pt-3 mt-3 border-t sf-border-soft sf-text-caption sf-text-muted text-center">
          Read-only preview of the exact prompt the next run would send. Close this and click <strong>Run Now</strong> to dispatch.
        </p>
      </div>
    </div>
  );
}

function PromptPreviewModalBody({
  query,
  storageKeyPrefix,
}: {
  readonly query: UseQueryResult<PromptPreviewResponse>;
  readonly storageKeyPrefix: string;
}) {
  if (query.isLoading || (query.isFetching && !query.data)) {
    return <PromptPreviewLoadingSkeleton />;
  }

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : String(query.error);
    return (
      <div className="sf-status sf-status-danger p-3 text-sm">
        Failed to compile prompt preview: {message}
      </div>
    );
  }

  const data = query.data;
  if (!data) {
    return (
      <div className="sf-text-caption sf-text-muted p-4 text-center">
        No prompt was compiled.
      </div>
    );
  }

  if (data.prompts.length === 0) {
    const notes = data.notes ?? [];
    return (
      <div className="sf-text-caption sf-text-muted p-4 text-center space-y-1">
        {notes.length > 0
          ? notes.map((n, i) => <p key={i}>{n}</p>)
          : <p>No prompt was compiled.</p>}
      </div>
    );
  }

  if (data.prompts.length === 1) {
    return <PromptPreviewView prompt={data.prompts[0]} storageKeyPrefix={storageKeyPrefix} />;
  }

  return (
    <PromptPreviewList
      prompts={data.prompts}
      storageKeyPrefix={storageKeyPrefix}
      tabPersistKey={`${storageKeyPrefix}:tab`}
    />
  );
}
