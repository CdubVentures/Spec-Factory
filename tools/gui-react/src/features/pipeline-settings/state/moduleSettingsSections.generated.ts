// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

// WHY: Derived from src/core/finder/finderModuleRegistry.js
// Pipeline Settings auto-renders module sections + form components from this registry.

import { lazy, type ComponentType } from 'react';
import type { ModuleSettingsFormProps } from '../types/moduleSettingsFormProps.ts';

export const MODULE_SETTINGS_SECTIONS = [
  {
    id: 'module-cef' as const,
    moduleId: 'colorEditionFinder',
    label: 'Color & Edition Finder',
    subtitle: 'CEF module settings',
    tip: 'Per-category settings for the Color & Edition Finder discovery module.',
    iconName: 'palette' as const,
    group: 'modules',
  },
  {
    id: 'module-pif' as const,
    moduleId: 'productImageFinder',
    label: 'Product Image Finder',
    subtitle: 'PIF module settings',
    tip: 'Per-category settings for the Product Image Finder: view angles and image quality.',
    iconName: 'image' as const,
    group: 'modules',
  },
] as const;

export const MODULE_IDS = ['colorEditionFinder', 'productImageFinder'] as const;
export type ModuleSettingsModuleId = typeof MODULE_IDS[number];

export const MODULE_SETTINGS_FORMS: Record<ModuleSettingsModuleId, ComponentType<ModuleSettingsFormProps>> = {
  'colorEditionFinder': lazy(() => import('../../pipeline-settings/components/forms/CefSettingsForm.tsx').then((mod) => ({ default: mod.CefSettingsForm }))),
  'productImageFinder': lazy(() => import('../../pipeline-settings/components/forms/PifSettingsForm.tsx').then((mod) => ({ default: mod.PifSettingsForm }))),
};

export type ModuleSettingsSectionId = typeof MODULE_SETTINGS_SECTIONS[number]['id'];
