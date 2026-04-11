// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

// WHY: Derived from src/core/finder/finderModuleRegistry.js
// Indexing Lab auto-renders panels from this registry. Zero manual imports.

import { lazy } from 'react';

export const FINDER_PANELS = [
  {
    id: 'colorEditionFinder',
    component: lazy(() => import('../../color-edition-finder/components/ColorEditionFinderPanel.tsx').then(m => ({ default: m.ColorEditionFinderPanel }))),
  },
  {
    id: 'productImageFinder',
    component: lazy(() => import('../../product-image-finder/components/ProductImageFinderPanel.tsx').then(m => ({ default: m.ProductImageFinderPanel }))),
  },
] as const;
