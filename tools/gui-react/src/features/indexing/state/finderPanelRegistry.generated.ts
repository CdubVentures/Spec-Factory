// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

// WHY: Derived from src/core/finder/finderModuleRegistry.js
// Indexing Lab auto-renders panels from this registry. Zero manual imports.

import { lazy } from 'react';

export const FINDER_PANELS = [
  {
    id: 'colorEditionFinder',
    label: 'CEF',
    moduleClass: 'variantGenerator',
    scopeLevel: 'product',
    routePrefix: 'color-edition-finder',
    component: lazy(() => import('../../color-edition-finder/components/ColorEditionFinderPanel.tsx').then(m => ({ default: m.ColorEditionFinderPanel }))),
  },
  {
    id: 'productImageFinder',
    label: 'PIF',
    moduleClass: 'variantArtifactProducer',
    scopeLevel: 'variant+mode',
    routePrefix: 'product-image-finder',
    component: lazy(() => import('../../product-image-finder/components/ProductImageFinderPanel.tsx').then(m => ({ default: m.ProductImageFinderPanel }))),
  },
  {
    id: 'releaseDateFinder',
    label: 'RDF',
    moduleClass: 'variantFieldProducer',
    scopeLevel: 'variant',
    routePrefix: 'release-date-finder',
    component: lazy(() => import('../../release-date-finder/components/ReleaseDateFinderPanel.tsx').then(m => ({ default: m.ReleaseDateFinderPanel }))),
  },
] as const;
