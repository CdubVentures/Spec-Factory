// Module Settings Panel — settings for finder modules.
// Branches on settingsScope from the generated registry:
//   - 'global'   → renders directly, no category required
//   - 'category' → requires a selected category; falls back to a "select a category" hint
// Form bodies are delegated to FinderSettingsRenderer which reads the schema from
// FINDER_SETTINGS_REGISTRY. Adding a new finder = one entry in src/core/finder/finderModuleRegistry.js
// + regenerate; no edits here.

import { useUiStore } from '../../../stores/uiStore.ts';
import {
  MODULE_SETTINGS_SCOPE_BY_ID,
  type ModuleSettingsModuleId,
} from '../state/moduleSettingsSections.generated.ts';
import { FinderSettingsRenderer } from './FinderSettingsRenderer.tsx';

export function ModuleSettingsPanel({ moduleId }: { moduleId: ModuleSettingsModuleId }) {
  const category = useUiStore((s) => s.category);
  const scope = MODULE_SETTINGS_SCOPE_BY_ID[moduleId] ?? 'category';

  if (scope === 'category' && !category) {
    return (
      <p className="sf-text-caption sf-text-muted">
        Select a category to configure module settings.
      </p>
    );
  }

  return <FinderSettingsRenderer finderId={moduleId} category={category} />;
}
