/**
 * KeyPromptSlideover — horizontal slide-over showing one run's prompt + response.
 *
 * Reuses FinderRunPromptDetails (already used by CEF / PIF / RDF / SKU). Pulls
 * data via the existing GET /key-finder/:cat/:pid?field_key=X endpoint, picks
 * the run by runNumber (defaults to latest).
 */

import { memo, useEffect, useMemo, useState } from 'react';
import { FinderRunPromptDetails } from '../../../shared/ui/finder/FinderRunPromptDetails.tsx';
import { useKeyFinderPromptQuery } from '../api/keyFinderQueries.ts';
import type { KeyHistoryRun } from '../types.ts';

interface KeyPromptSlideoverProps {
  readonly open: boolean;
  readonly category: string;
  readonly productId: string;
  readonly fieldKey: string;
  readonly onClose: () => void;
  readonly onRerun?: (fieldKey: string) => void;
}

export const KeyPromptSlideover = memo(function KeyPromptSlideover({
  open,
  category,
  productId,
  fieldKey,
  onClose,
  onRerun,
}: KeyPromptSlideoverProps) {
  const { data, isLoading } = useKeyFinderPromptQuery({
    category, productId, fieldKey, enabled: open,
  });

  const runs: readonly KeyHistoryRun[] = useMemo(
    () => (data?.runs ? [...data.runs].sort((a, b) => b.run_number - a.run_number) : []),
    [data?.runs],
  );

  const [selectedRunNumber, setSelectedRunNumber] = useState<number | null>(null);
  useEffect(() => {
    if (!open) { setSelectedRunNumber(null); return; }
    if (runs.length > 0) setSelectedRunNumber((cur) => cur ?? runs[0].run_number);
  }, [open, runs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const selectedRun = runs.find((r) => r.run_number === selectedRunNumber) || runs[0] || null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(20,24,40,0.42)' }}
      onClick={onClose}
      role="presentation"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-[72%] max-w-[1100px] sf-surface shadow-2xl flex flex-col border-l sf-border"
        style={{ animation: 'slideIn .18s ease-out' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <header className="px-5 py-3.5 border-b sf-border-soft sf-surface-soft flex items-center gap-3">
          <strong className="text-[14px] font-mono sf-text-primary">{fieldKey}</strong>
          {selectedRun && (
            <span className="text-[11.5px] sf-text-muted">
              · run #{selectedRun.run_number} · {selectedRun.ran_at}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {runs.length > 1 && (
              <select
                value={selectedRunNumber ?? ''}
                onChange={(e) => setSelectedRunNumber(Number(e.target.value))}
                className="px-2 py-1 text-[11.5px] rounded border sf-input"
              >
                {runs.map((r) => (
                  <option key={r.run_number} value={r.run_number}>
                    Run #{r.run_number} · {r.ran_at}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="px-2 py-1 text-[11.5px] font-semibold rounded sf-icon-button"
            >
              Close
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="sf-text-muted text-[13px] text-center py-10">Loading prompt…</div>
          )}
          {!isLoading && !selectedRun && (
            <div className="sf-text-muted text-[13px] text-center py-10">
              No runs yet for this key. Run it first to see the prompt.
            </div>
          )}
          {selectedRun && (
            <FinderRunPromptDetails
              systemPrompt={selectedRun.prompt?.system}
              userMessage={selectedRun.prompt?.user}
              response={selectedRun.response}
              storageKeyPrefix={`key-finder:prompt:${fieldKey}:${selectedRun.run_number}`}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t sf-border-soft sf-surface-soft flex items-center justify-end gap-2">
          <button
            onClick={() => { if (onRerun) onRerun(fieldKey); }}
            className="px-3 py-1 text-[11.5px] font-semibold rounded sf-primary-button"
          >
            ▶ Re-run with same prompt
          </button>
        </footer>
      </aside>
    </div>
  );
});
