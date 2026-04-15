/**
 * FinderRunPromptDetails — shared expandable sections for system prompt,
 * user message, and LLM response in finder run history.
 *
 * Universal across all finder modules. Each section's open/closed state
 * is persisted via usePersistedToggle when storageKeyPrefix is provided.
 */

import { usePersistedToggle } from '../../../stores/collapseStore.ts';

interface FinderRunPromptDetailsProps {
  /** Serialized system prompt string */
  systemPrompt?: string;
  /** Serialized user message (string or JSON) */
  userMessage?: string;
  /** Raw LLM response object (will be JSON-stringified) */
  response?: unknown;
  /** Storage key prefix for persisting open/closed state per section */
  storageKeyPrefix: string;
}

const SUMMARY_CLS = 'w-full px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle flex items-center gap-1 text-left';
const PRE_CLS = 'px-3 pb-3 text-[10px] font-mono sf-text-subtle whitespace-pre-wrap break-words max-h-64 overflow-y-auto';
const PANEL_CLS = 'sf-surface-panel border sf-border-soft rounded-md';

export function FinderRunPromptDetails({ systemPrompt, userMessage, response, storageKeyPrefix }: FinderRunPromptDetailsProps) {
  const hasAny = systemPrompt || userMessage || response;
  if (!hasAny) return null;

  return (
    <div className="flex flex-col gap-2">
      {systemPrompt && (
        <ToggleSection storageKey={`${storageKeyPrefix}:system`} label="System Prompt">
          <pre className={PRE_CLS}>{systemPrompt}</pre>
        </ToggleSection>
      )}
      {userMessage && (
        <ToggleSection storageKey={`${storageKeyPrefix}:user`} label="User Message">
          <pre className={PRE_CLS}>{userMessage}</pre>
        </ToggleSection>
      )}
      {response != null && (
        <ToggleSection storageKey={`${storageKeyPrefix}:response`} label="LLM Response">
          <pre className={PRE_CLS}>
            {String(typeof response === 'string' ? response : JSON.stringify(response, null, 2))}
          </pre>
        </ToggleSection>
      )}
    </div>
  );
}

function ToggleSection({ storageKey, label, children }: { storageKey: string; label: string; children: React.ReactNode }) {
  const [open, toggleOpen] = usePersistedToggle(storageKey, false);
  return (
    <div className={PANEL_CLS}>
      <button type="button" onClick={toggleOpen} className={SUMMARY_CLS}>
        <span className="inline-block transition-transform text-[8px]" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>&#9656;</span>
        {label}
      </button>
      {open && children}
    </div>
  );
}
