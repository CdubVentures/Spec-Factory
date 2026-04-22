/**
 * PromptPreviewView — read-only renderer for a single compiled prompt.
 *
 * Shown inside PromptPreviewModal. Five independent collapsible sections
 * (Model / System / User / Schema / Notes), each with copy-to-clipboard
 * on content blocks. Reuses the sf-* token surface and the ToggleSection
 * chevron pattern used by FinderRunPromptDetails.
 */

import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { CopyButton } from '../button/CopyButton.tsx';
import type { PromptPreviewPrompt } from '../../../features/indexing/api/promptPreviewTypes.ts';

interface PromptPreviewViewProps {
  readonly prompt: PromptPreviewPrompt;
  readonly storageKeyPrefix: string;
}

const SUMMARY_CLS = 'w-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle flex items-center gap-2 text-left';
const PRE_CLS = 'px-3 pb-3 text-[11px] font-mono sf-text-subtle whitespace-pre-wrap break-words max-h-96 overflow-y-auto';
const PANEL_CLS = 'sf-surface-panel border sf-border-soft rounded-md';

export function PromptPreviewView({ prompt, storageKeyPrefix }: PromptPreviewViewProps) {
  const { model, notes, schema } = prompt;
  const schemaSerialized = serializeSchema(schema);
  const hasNotes = notes.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <ToggleSection storageKey={`${storageKeyPrefix}:model`} label="Model" defaultOpen>
        <div className={PRE_CLS}>
          <div>id: {model.id}</div>
          {model.thinking_effort ? <div>thinking_effort: {model.thinking_effort}</div> : null}
          <div>web_search: {String(model.web_search)}</div>
          <div>json_strict: {String(model.json_strict)}</div>
        </div>
      </ToggleSection>

      <ToggleSection storageKey={`${storageKeyPrefix}:system`} label="System Prompt" defaultOpen copyText={prompt.system}>
        <pre className={PRE_CLS}>{prompt.system}</pre>
      </ToggleSection>

      <ToggleSection storageKey={`${storageKeyPrefix}:user`} label="User Message" defaultOpen copyText={prompt.user}>
        <pre className={PRE_CLS}>{prompt.user}</pre>
      </ToggleSection>

      <ToggleSection storageKey={`${storageKeyPrefix}:schema`} label="Response Schema" copyText={schemaSerialized}>
        <pre className={PRE_CLS}>{schemaSerialized}</pre>
      </ToggleSection>

      {hasNotes ? (
        <ToggleSection storageKey={`${storageKeyPrefix}:notes`} label="Notes" defaultOpen>
          <ul className="px-5 pb-3 text-[11px] sf-text-muted list-disc space-y-1">
            {notes.map((note, i) => <li key={i}>{note}</li>)}
          </ul>
        </ToggleSection>
      ) : null}
    </div>
  );
}

function serializeSchema(schema: unknown): string {
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return String(schema);
  }
}

interface ToggleSectionProps {
  readonly storageKey: string;
  readonly label: string;
  readonly children: React.ReactNode;
  readonly defaultOpen?: boolean;
  readonly copyText?: string;
}

function ToggleSection({ storageKey, label, children, defaultOpen = false, copyText }: ToggleSectionProps) {
  const [open, toggleOpen] = usePersistedToggle(storageKey, defaultOpen);
  return (
    <div className={PANEL_CLS}>
      <div className="flex items-center justify-between">
        <button type="button" onClick={toggleOpen} className={SUMMARY_CLS}>
          <span className={`inline-block transition-transform duration-150 text-[8px] ${open ? 'rotate-90' : ''}`}>&#9656;</span>
          {label}
        </button>
        {open && copyText ? (
          <CopyButton
            text={copyText}
            className="mr-3 px-2 py-0.5 text-[10px] font-semibold rounded sf-icon-button"
          />
        ) : null}
      </div>
      {open && children}
    </div>
  );
}

