import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Variable definition from the backend template registry. */
export interface TemplateVariableDef {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
}

/** Describes data injected via the user message (not editable, informational only). */
export interface UserMessageInjection {
  readonly field: string;
  readonly description: string;
}

interface PromptTemplateEditorProps {
  /** Display label above the editor. */
  readonly label: string;
  /** Default template text (from code). */
  readonly defaultTemplate: string;
  /** Current override from settings. Empty string = use default. */
  readonly currentOverride: string;
  /** Variable definitions for the reference panel. */
  readonly variables: readonly TemplateVariableDef[];
  /** Called when the user saves a custom template. */
  readonly onSave: (value: string) => void;
  /** Called when the user resets to default. */
  readonly onReset: () => void;
  /** Disable editing while loading. */
  readonly isLoading?: boolean;
  /** Read-only info about what gets injected into the user message (not the system prompt). */
  readonly userMessageInfo?: readonly UserMessageInjection[];
}

/** Regex matching {{VARIABLE_NAME}} tokens. */
const VAR_PATTERN = /\{\{(\w+)\}\}/g;

/** Find required variables missing from the current draft. */
function findMissingRequired(text: string, variables: readonly TemplateVariableDef[]): string[] {
  const present = new Set<string>();
  for (const match of text.matchAll(VAR_PATTERN)) present.add(match[1]);
  return variables.filter(v => v.required && !present.has(v.name)).map(v => v.name);
}

/**
 * Editable prompt template with variable reference panel.
 *
 * Follows the same UX pattern as CategoryViewPromptTabs:
 * - Local draft state (no flicker while typing)
 * - Auto-save on blur
 * - Save/Reset buttons
 * - "Customized" badge when override is active
 * - Validation warning for missing required variables
 */
export const PromptTemplateEditor = memo(function PromptTemplateEditor({
  label,
  defaultTemplate,
  currentOverride,
  variables,
  onSave,
  onReset,
  isLoading = false,
  userMessageInfo,
}: PromptTemplateEditorProps) {
  const displayValue = currentOverride || defaultTemplate;
  const isOverridden = currentOverride.length > 0;

  const [draft, setDraft] = useState(displayValue);
  const prevDisplayRef = useRef(displayValue);

  // Sync draft when external value changes (e.g. after save round-trip or category switch)
  useEffect(() => {
    if (prevDisplayRef.current !== displayValue) {
      prevDisplayRef.current = displayValue;
      setDraft(displayValue);
    }
  }, [displayValue]);

  const isDirty = draft.trim() !== displayValue.trim();

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed === defaultTemplate.trim()) {
      onSave(''); // Clear override — matches default
    } else {
      onSave(trimmed);
    }
  }, [draft, defaultTemplate, onSave]);

  const handleReset = useCallback(() => {
    onReset();
    setDraft(defaultTemplate);
  }, [defaultTemplate, onReset]);

  const missingRequired = findMissingRequired(draft, variables);

  // WHY: Auto-size textarea to full content height — no scrolling inside the editor.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(autoResize, [draft, autoResize]);

  return (
    <div className="space-y-2">
      {/* Header row: label + badge */}
      <div className="flex items-center gap-2">
        <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted">{label}</div>
        {isOverridden && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded sf-chip-accent">
            Customized
          </span>
        )}
      </div>

      {/* Editable textarea — full content height, no scroll */}
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        disabled={isLoading}
        spellCheck={false}
        className="w-full sf-pre-block sf-text-caption font-mono rounded p-3 whitespace-pre-wrap leading-relaxed resize-none overflow-hidden"
        style={{ minHeight: '120px' }}
      />

      {/* Missing required variables warning */}
      {missingRequired.length > 0 && (
        <div className="px-3 py-2 rounded text-[11px] font-medium" style={{ background: 'var(--sf-warning-bg, #3a2e00)', color: 'var(--sf-warning-text, #fbbf24)' }}>
          Missing required variable{missingRequired.length > 1 ? 's' : ''}: {missingRequired.map(v => `{{${v}}}`).join(', ')}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {isDirty && (
          <button
            onClick={handleSave}
            className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded sf-primary-button cursor-pointer"
          >
            Save
          </button>
        )}
        {isOverridden && (
          <button
            onClick={handleReset}
            className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded sf-btn-ghost sf-text-muted cursor-pointer hover:opacity-80"
          >
            Reset to Default
          </button>
        )}
      </div>

      {/* Variable reference panel */}
      {variables.length > 0 && (
        <details className="group">
          <summary className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted cursor-pointer select-none hover:opacity-80">
            Template Variables ({variables.length})
          </summary>
          <div className="mt-1.5 rounded sf-pre-block p-2.5 space-y-1">
            {variables.map((v) => (
              <div key={v.name} className="flex gap-2 text-[11px] font-mono leading-relaxed">
                <span className="shrink-0 font-bold" style={{ color: 'var(--sf-accent)' }}>
                  {`{{${v.name}}}`}
                </span>
                <span className="sf-text-muted">
                  {v.description}
                  {v.required && <span className="ml-1 font-bold" style={{ color: 'var(--sf-warning-text, #fbbf24)' }}>*</span>}
                </span>
              </div>
            ))}
            <div className="text-[10px] sf-text-muted mt-1">
              <span className="font-bold" style={{ color: 'var(--sf-warning-text, #fbbf24)' }}>*</span> = required (removing will show a warning)
            </div>
          </div>
        </details>
      )}

      {/* User message injection info (read-only context) */}
      {userMessageInfo && userMessageInfo.length > 0 && (
        <details className="group">
          <summary className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted cursor-pointer select-none hover:opacity-80">
            User Message Injection ({userMessageInfo.length} fields)
          </summary>
          <div className="mt-1.5 rounded sf-pre-block p-2.5 space-y-1">
            <div className="text-[10px] sf-text-muted mb-1.5">
              These fields are injected into the <strong>user message</strong> (not the system prompt). They are not editable here.
            </div>
            {userMessageInfo.map((info) => (
              <div key={info.field} className="flex gap-2 text-[11px] font-mono leading-relaxed">
                <span className="shrink-0 font-bold sf-text-muted">{info.field}</span>
                <span className="sf-text-muted">{info.description}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
});
