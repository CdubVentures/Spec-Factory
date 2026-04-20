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
    moduleType: 'cef',
    phase: 'colorFinder',
    component: lazy(() => import('../../color-edition-finder/components/ColorEditionFinderPanel.tsx').then(m => ({ default: m.ColorEditionFinderPanel }))),
  },
  {
    id: 'productImageFinder',
    label: 'PIF',
    moduleClass: 'variantArtifactProducer',
    scopeLevel: 'variant+mode',
    routePrefix: 'product-image-finder',
    moduleType: 'pif',
    phase: 'imageFinder',
    component: lazy(() => import('../../product-image-finder/components/ProductImageFinderPanel.tsx').then(m => ({ default: m.ProductImageFinderPanel }))),
  },
  {
    id: 'releaseDateFinder',
    label: 'RDF',
    moduleClass: 'variantFieldProducer',
    scopeLevel: 'variant',
    routePrefix: 'release-date-finder',
    moduleType: 'rdf',
    phase: 'releaseDateFinder',
    valueKey: 'release_date',
    panelTitle: 'Release Date Finder',
    panelTip: 'Discovers per-variant first-availability release dates via web search. Candidates flow through the publisher gate.',
    valueLabelPlural: 'Release Dates',
    component: lazy(() => import('../../release-date-finder/components/ReleaseDateFinderPanel.tsx').then(m => ({ default: m.ReleaseDateFinderPanel }))),
  },
] as const;
