// Module Settings Panel — per-category settings for finder modules.
// Delegates to FinderSettingsRenderer which reads FINDER_SETTINGS_REGISTRY
// (generated from the backend FINDER_MODULES registry). Adding a new finder =
// one entry in src/core/finder/finderModuleRegistry.js + regenerate. No edits here.

import { useUiStore } from '../../../stores/uiStore.ts';
import type { ModuleSettingsModuleId } from '../state/moduleSettingsSections.generated.ts';
import { FinderSettingsRenderer } from './FinderSettingsRenderer.tsx';

export function ModuleSettingsPanel({ moduleId }: { moduleId: ModuleSettingsModuleId }) {
  const category = useUiStore((s) => s.category);

  if (!category) {
    return (
      <p className="sf-text-caption sf-text-muted">
        Select a category to configure module settings.
      </p>
    );
  }

  return <FinderSettingsRenderer finderId={moduleId} category={category} />;
}
