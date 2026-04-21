/**
 * PromptPreviewList — sub-tab switcher over a list of compiled prompts.
 *
 * Used by PromptPreviewModal when the backend returns multiple prompts
 * (PIF Loop → one per view + hero; Eval → one per view with candidates).
 *
 * Renders a horizontal tab strip (one tab per prompt.label) + the active
 * PromptPreviewView below. When the active prompt has an `images` sidecar,
 * a compact image-summary card shows above the prompt blocks.
 */

import { usePersistedTab } from '../../../stores/tabStore.ts';
import { PromptPreviewView } from './PromptPreviewView.tsx';
import type { PromptPreviewPrompt } from '../../../features/indexing/api/promptPreviewTypes.ts';

interface PromptPreviewListProps {
  readonly prompts: readonly PromptPreviewPrompt[];
  readonly storageKeyPrefix: string;
  readonly tabPersistKey: string;
}

export function PromptPreviewList({ prompts, storageKeyPrefix, tabPersistKey }: PromptPreviewListProps) {
  const labels = prompts.map((p) => p.label);
  const defaultLabel = labels[0] ?? '';
  const [activeLabel, setActiveLabel] = usePersistedTab<string>(tabPersistKey, defaultLabel, { validValues: labels });
  const active = prompts.find((p) => p.label === activeLabel) ?? prompts[0];
  if (!active) return null;

  return (
    <div className="flex flex-col gap-3">
      <nav role="tablist" aria-label="Prompt variants" className="flex flex-wrap items-center gap-1 border-b sf-border-soft pb-2">
        {prompts.map((p) => {
          const selected = p.label === active.label;
          return (
            <button
              key={p.label}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveLabel(p.label)}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded ${selected ? 'sf-primary-button' : 'sf-icon-button'}`}
            >
              {p.label}
            </button>
          );
        })}
      </nav>

      {active.images && active.images.length > 0 ? (
        <section className="sf-surface-panel border sf-border-soft rounded-md p-3 space-y-1">
          <header className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted">
            Image candidates ({active.images.length})
          </header>
          <ul className="font-mono text-[11px] sf-text-subtle space-y-0.5 max-h-32 overflow-y-auto">
            {active.images.map((img, i) => (
              <li key={`${img.url}-${i}`}>
                {img.url}
                {typeof img.thumb_base64_size === 'number'
                  ? <span className="sf-text-muted"> — {Math.round(img.thumb_base64_size / 1024)}KB</span>
                  : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PromptPreviewView prompt={active} storageKeyPrefix={`${storageKeyPrefix}:${active.label}`} />
    </div>
  );
}
