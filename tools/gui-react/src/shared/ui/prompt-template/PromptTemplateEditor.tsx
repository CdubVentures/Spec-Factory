import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Variable definition from the backend template registry. */
export interface TemplateVariableDef {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  /**
   * Optional grouping hint:
   * - 'global-fragment' — value is injected from a shared prompt fragment
   *   (identity warning, siblings exclusion, evidence contract, confidence
   *   rubric, discovery history header). Editable from the Global Prompts
   *   section under Discovery.
   * - 'deterministic' — value is a runtime-supplied string (product fields,
   *   computed context strings, per-category config).
   * Undefined = render in the single legacy "Template Variables" section.
   */
  readonly category?: 'global-fragment' | 'deterministic';
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
  /**
   * Hide the inline variable reference panel. Callers can render it
   * separately via <VariableReferencePanels variables={...}/> when the
   * panel needs to appear after another UI block (e.g. PIF's per-view
   * discovery prompts between the editor and the panel).
   */
  readonly hideVariablesPanel?: boolean;
  /**
   * Hide the inline user-message injection panel. Callers can render it
   * separately via <UserMessageInjectionPanel info={...}/> when the
   * canonical column order is prompt → extras → variables → user message
   * → schema (per-phase panels in LLM Config).
   */
  readonly hideUserMessagePanel?: boolean;
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
  hideVariablesPanel = false,
  hideUserMessagePanel = false,
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

      {/* Variable reference panel(s) — split into Global Fragments + Deterministic
          when any variable carries a category, otherwise single panel.
          Suppressed when the caller needs to render the panel externally
          (e.g. after a per-view discovery prompts block). */}
      {variables.length > 0 && !hideVariablesPanel && <VariableReferencePanels variables={variables} />}

      {/* User message injection info (read-only context).
          Suppressed when the caller renders it externally to enforce the
          canonical column order (prompt → extras → variables → user message → schema). */}
      {!hideUserMessagePanel && userMessageInfo && userMessageInfo.length > 0 && (
        <UserMessageInjectionPanel info={userMessageInfo} />
      )}
    </div>
  );
});

/* ── User message injection panel ──────────────────────────────────── */

interface UserMessageInjectionPanelProps {
  readonly info: readonly UserMessageInjection[];
}

export function UserMessageInjectionPanel({ info }: UserMessageInjectionPanelProps) {
  if (info.length === 0) return null;
  return (
    <details className="group">
      <summary className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted cursor-pointer select-none hover:opacity-80">
        User Message Injection ({info.length} fields)
      </summary>
      <div className="mt-1.5 rounded sf-pre-block p-2.5 space-y-1">
        <div className="text-[10px] sf-text-muted mb-1.5">
          These fields are injected into the <strong>user message</strong> (not the system prompt). They are not editable here.
        </div>
        {info.map((entry) => (
          <div key={entry.field} className="flex gap-2 text-[11px] font-mono leading-relaxed">
            <span className="shrink-0 font-bold sf-text-muted">{entry.field}</span>
            <span className="sf-text-muted">{entry.description}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

/* ── Variable reference panels ───────────────────────────────────────
 * If any variable carries a `category`, render two collapsible groups:
 *   1. Global Fragments — values sourced from the Global Prompts registry.
 *   2. Deterministic — runtime-computed strings (brand, model, config).
 * Otherwise render a single legacy "Template Variables" panel.
 */

interface VariableRowProps {
  readonly variable: TemplateVariableDef;
}

const VariableRow = memo(function VariableRow({ variable }: VariableRowProps) {
  return (
    <div className="flex gap-2 text-[11px] font-mono leading-relaxed">
      <span className="shrink-0 font-bold" style={{ color: 'var(--sf-accent)' }}>
        {`{{${variable.name}}}`}
      </span>
      <span className="sf-text-muted">
        {variable.description}
        {variable.required && <span className="ml-1 font-bold" style={{ color: 'var(--sf-warning-text, #fbbf24)' }}>*</span>}
      </span>
    </div>
  );
});

interface VariableGroupProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly variables: readonly TemplateVariableDef[];
  readonly defaultOpen?: boolean;
}

function VariableGroup({ title, subtitle, variables, defaultOpen = false }: VariableGroupProps) {
  if (variables.length === 0) return null;
  return (
    <details className="group" open={defaultOpen}>
      <summary className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted cursor-pointer select-none hover:opacity-80">
        {title} ({variables.length})
      </summary>
      <div className="mt-1.5 rounded sf-pre-block p-2.5 space-y-1">
        {subtitle && (
          <div className="text-[10px] sf-text-muted mb-1.5">{subtitle}</div>
        )}
        {variables.map((v) => <VariableRow key={v.name} variable={v} />)}
        {variables.some((v) => v.required) && (
          <div className="text-[10px] sf-text-muted mt-1">
            <span className="font-bold" style={{ color: 'var(--sf-warning-text, #fbbf24)' }}>*</span> = required (removing will show a warning)
          </div>
        )}
      </div>
    </details>
  );
}

interface VariableReferencePanelsProps {
  readonly variables: readonly TemplateVariableDef[];
}

export function VariableReferencePanels({ variables }: VariableReferencePanelsProps) {
  const hasCategory = variables.some((v) => v.category !== undefined);
  if (!hasCategory) {
    return (
      <VariableGroup title="Template Variables" variables={variables} />
    );
  }
  const globalFragments = variables.filter((v) => v.category === 'global-fragment');
  const deterministic = variables.filter((v) => v.category === 'deterministic');
  const uncategorized = variables.filter((v) => v.category === undefined);
  return (
    <div className="space-y-1.5">
      <VariableGroup
        title="Global Template Variables"
        subtitle="Values sourced from the Global Prompts registry — edit centrally under Discovery → Global Prompts."
        variables={globalFragments}
        defaultOpen
      />
      <VariableGroup
        title="Deterministic Variables"
        subtitle="Runtime-supplied strings (product fields, computed context, per-category config). Read-only here; they come from the code path that invokes this prompt."
        variables={deterministic}
      />
      {uncategorized.length > 0 && (
        <VariableGroup title="Other Variables" variables={uncategorized} />
      )}
    </div>
  );
}
