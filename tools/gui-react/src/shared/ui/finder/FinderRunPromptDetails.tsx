/**
 * FinderRunPromptDetails — shared expandable sections for system prompt,
 * user message, and LLM response in finder run history.
 *
 * Universal across all finder modules.
 */

interface FinderRunPromptDetailsProps {
  /** Serialized system prompt string */
  systemPrompt?: string;
  /** Serialized user message (string or JSON) */
  userMessage?: string;
  /** Raw LLM response object (will be JSON-stringified) */
  response?: unknown;
}

export function FinderRunPromptDetails({ systemPrompt, userMessage, response }: FinderRunPromptDetailsProps) {
  const hasAny = systemPrompt || userMessage || response;
  if (!hasAny) return null;

  return (
    <div className="flex flex-col gap-2">
      {systemPrompt && (
        <details className="sf-surface-panel border sf-border-soft rounded-md">
          <summary className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle">
            System Prompt
          </summary>
          <pre className="px-3 pb-3 text-[10px] font-mono sf-text-subtle whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
            {systemPrompt}
          </pre>
        </details>
      )}
      {userMessage && (
        <details className="sf-surface-panel border sf-border-soft rounded-md">
          <summary className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle">
            User Message
          </summary>
          <pre className="px-3 pb-3 text-[10px] font-mono sf-text-subtle whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
            {userMessage}
          </pre>
        </details>
      )}
      {response != null && (
        <details className="sf-surface-panel border sf-border-soft rounded-md">
          <summary className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle">
            LLM Response
          </summary>
          <pre className="px-3 pb-3 text-[10px] font-mono sf-text-subtle whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
            {String(typeof response === 'string' ? response : JSON.stringify(response, null, 2))}
          </pre>
        </details>
      )}
    </div>
  );
}
