import type { ModuleSettingsFormProps } from '../../types/moduleSettingsFormProps.ts';

export function CefSettingsForm(_: ModuleSettingsFormProps) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] sf-text-muted">
        Prompt templates are edited in LLM Config &rarr; Color &amp; Edition Finder.
      </p>
    </div>
  );
}
