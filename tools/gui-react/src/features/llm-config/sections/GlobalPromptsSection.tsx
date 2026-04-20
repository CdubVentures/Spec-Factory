import { memo, useCallback } from 'react';
import { PromptTemplateEditor } from '../../../shared/ui/prompt-template/PromptTemplateEditor.tsx';
import { useGlobalPromptsAuthority } from '../state/useGlobalPromptsAuthority.ts';
import type { GlobalPromptEntry, GlobalPromptVariable } from '../api/globalPromptsApi.ts';

function formatAppliesTo(appliesTo: readonly string[]): string {
  if (appliesTo.length === 0) return '';
  const labels = appliesTo.map((s) => s.toUpperCase()).join(' + ');
  return `Applies to: ${labels}`;
}

interface GlobalPromptEditorCardProps {
  readonly promptKey: string;
  readonly entry: GlobalPromptEntry;
  readonly isSaving: boolean;
  readonly onSave: (key: string, value: string) => void;
  readonly onReset: (key: string) => void;
}

const GlobalPromptEditorCard = memo(function GlobalPromptEditorCard({
  promptKey,
  entry,
  isSaving,
  onSave,
  onReset,
}: GlobalPromptEditorCardProps) {
  const handleSave = useCallback((value: string) => onSave(promptKey, value), [onSave, promptKey]);
  const handleReset = useCallback(() => onReset(promptKey), [onReset, promptKey]);
  const variables: readonly GlobalPromptVariable[] = entry.variables ?? [];
  const templateVariables = variables.map((v) => ({
    name: v.name,
    description: v.description ?? '',
    required: v.required ?? false,
  }));

  return (
    <div className="space-y-1 pt-3 first:pt-0 border-t first:border-t-0" style={{ borderColor: 'var(--sf-border)' }}>
      <div className="sf-text-caption" style={{ color: 'var(--sf-muted)', opacity: 0.85 }}>
        {entry.description} {formatAppliesTo(entry.appliesTo)}
      </div>
      <PromptTemplateEditor
        label={entry.label}
        defaultTemplate={entry.defaultTemplate}
        currentOverride={entry.override}
        variables={templateVariables}
        onSave={handleSave}
        onReset={handleReset}
        isLoading={isSaving}
      />
    </div>
  );
});

export const GlobalPromptsSection = memo(function GlobalPromptsSection() {
  const { snapshot, isLoading, isSaving, setOverride, clearOverride } = useGlobalPromptsAuthority();

  if (isLoading || !snapshot) {
    return (
      <div className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
        Loading global prompts…
      </div>
    );
  }

  const keys = snapshot.keys ?? [];
  if (keys.length === 0) {
    return (
      <div className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
        No global prompts registered.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sf-text-caption" style={{ color: 'var(--sf-muted)', opacity: 0.85 }}>
        Shared prompt fragments for CEF, RDF, and PIF. Evidence/confidence apply to CEF + RDF only — PIF is the documented exception. Per-category discovery templates remain in each finder&apos;s settings.
      </div>
      {keys.map((key) => {
        const entry = snapshot.prompts[key];
        if (!entry) return null;
        return (
          <GlobalPromptEditorCard
            key={key}
            promptKey={key}
            entry={entry}
            isSaving={isSaving}
            onSave={setOverride}
            onReset={clearOverride}
          />
        );
      })}
    </div>
  );
});
