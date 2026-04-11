// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

// WHY: Derived from src/core/finder/finderModuleRegistry.js
// Pipeline Settings auto-renders module sections from this registry.

export const MODULE_SETTINGS_SECTIONS = [
  {
    id: 'module-cef' as const,
    moduleId: 'colorEditionFinder',
    label: 'Color & Edition Finder',
    subtitle: 'CEF module settings',
    tip: 'Per-category settings for the Color & Edition Finder discovery module.',
    group: 'modules',
  },
  {
    id: 'module-pif' as const,
    moduleId: 'productImageFinder',
    label: 'Product Image Finder',
    subtitle: 'PIF module settings',
    tip: 'Per-category settings for the Product Image Finder: view angles and image quality.',
    group: 'modules',
  },
] as const;

export type ModuleSettingsSectionId = typeof MODULE_SETTINGS_SECTIONS[number]['id'];
