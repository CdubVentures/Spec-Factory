// Module Settings Panel — per-category settings for finder modules.
// Resolves the form component from MODULE_SETTINGS_FORMS (registry-driven).
// Adding a new finder = one entry in src/core/finder/finderModuleRegistry.js
// + one form file conforming to ModuleSettingsFormProps. No edits here.

import { Suspense, useCallback } from 'react';
import { useUiStore } from '../../../stores/uiStore.ts';
import { useModuleSettingsAuthority } from '../state/moduleSettingsAuthority.ts';
import { MODULE_SETTINGS_FORMS } from '../state/moduleSettingsSections.generated.ts';

export function ModuleSettingsPanel({ moduleId }: { moduleId: string }) {
  const category = useUiStore((s) => s.category);
  const { settings, isLoading, isSaving, saveSetting } = useModuleSettingsAuthority({ category, moduleId });
  const handleSave = useCallback((key: string, value: string) => {
    saveSetting(key, value);
  }, [saveSetting]);

  if (!category) {
    return (
      <p className="sf-text-caption sf-text-muted">
        Select a category to configure module settings.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="sf-text-caption sf-text-muted">
        Loading settings...
      </p>
    );
  }

  const Form = MODULE_SETTINGS_FORMS[moduleId];
  if (!Form) {
    return (
      <p className="sf-text-caption sf-text-muted">
        No settings form registered for "{moduleId}".
      </p>
    );
  }

  return (
    <Suspense fallback={<p className="sf-text-caption sf-text-muted">Loading form...</p>}>
      <Form settings={settings} category={category} isSaving={isSaving} onSave={handleSave} />
    </Suspense>
  );
}
