/**
 * PromptPreviewModal — read-only overlay showing a compiled prompt.
 *
 * Used by CEF in Phase 1; reused by PIF (Loop/Eval sub-tabs), RDF, and SKU.
 * Copies the overlay + card structure from FinderDeleteConfirmModal.
 * Closes on backdrop click, escape key, or header X.
 */

import { useEffect } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Spinner } from '../feedback/Spinner.tsx';
import { PromptPreviewView } from './PromptPreviewView.tsx';
import type { PromptPreviewResponse } from '../../../features/indexing/api/promptPreviewTypes.ts';

interface PromptPreviewModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly query: UseQueryResult<PromptPreviewResponse>;
  readonly title: string;
  readonly subtitle?: string;
  readonly storageKeyPrefix: string;
}

export function PromptPreviewModal({ open, onClose, query, title, subtitle, storageKeyPrefix }: PromptPreviewModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
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
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
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
  if (!data || data.prompts.length === 0) {
    return (
      <div className="sf-text-caption sf-text-muted p-4 text-center">
        No prompt was compiled.
      </div>
    );
  }

  // Phase 1 — CEF has exactly one prompt. Phase 2's Loop/Eval will pass
  // prompts.length > 1 and render sub-tabs here; PR-time we render the first.
  return <PromptPreviewView prompt={data.prompts[0]} storageKeyPrefix={storageKeyPrefix} />;
}
