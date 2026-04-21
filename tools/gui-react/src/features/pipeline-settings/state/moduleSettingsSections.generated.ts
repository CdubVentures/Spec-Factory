// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

// WHY: Derived from src/core/finder/finderModuleRegistry.js
// Pipeline Settings auto-renders module sections from this registry.
// Form bodies are rendered by <FinderSettingsRenderer /> driven by finderSettingsRegistry.generated.ts.

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
  {
    id: 'module-rdf' as const,
    moduleId: 'releaseDateFinder',
    label: 'Release Date Finder',
    subtitle: 'RDF module settings',
    tip: 'Per-category settings for the Release Date Finder: per-variant discovery of first-availability dates.',
    iconName: 'calendar' as const,
    group: 'modules',
  },
  {
    id: 'module-skf' as const,
    moduleId: 'skuFinder',
    label: 'SKU Finder',
    subtitle: 'SKF module settings',
    tip: 'Per-category settings for the SKU Finder: per-variant discovery of manufacturer part numbers (MPNs).',
    iconName: 'hash' as const,
    group: 'modules',
  },
  {
    id: 'module-kf' as const,
    moduleId: 'keyFinder',
    label: 'Key Finder',
    subtitle: 'KF module settings',
    tip: 'Per-category budget scoring, bundling, and discovery-history toggles for the universal Key Finder.',
    iconName: 'key' as const,
    group: 'modules',
  },
] as const;

export const MODULE_IDS = ['colorEditionFinder', 'productImageFinder', 'releaseDateFinder', 'skuFinder', 'keyFinder'] as const;
export type ModuleSettingsModuleId = typeof MODULE_IDS[number];

export type ModuleSettingsSectionId = typeof MODULE_SETTINGS_SECTIONS[number]['id'];
