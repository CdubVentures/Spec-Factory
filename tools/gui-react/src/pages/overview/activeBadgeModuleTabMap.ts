import type { IndexLabLinkTabId } from './indexLabLinkAction.ts';

// WHY: Worker mini-badges in ActiveAndSelectedRow use the operations module
// ids (see features/operations/components/moduleIcons.tsx). The Overview
// column deep-links use the IndexingPage tab ids. This pure map bridges the
// two. `pipeline` has no dedicated finder tab — it IS the IndexingPage
// default tab — so it returns null and stays a non-link span.
const MODULE_TO_TAB: Readonly<Record<string, IndexLabLinkTabId>> = {
  cef: 'colorEditionFinder',
  pif: 'productImageFinder',
  rdf: 'releaseDateFinder',
  skf: 'skuFinder',
  kf: 'keyFinder',
};

export function resolveModuleTabId(moduleId: string): IndexLabLinkTabId | null {
  return MODULE_TO_TAB[moduleId] ?? null;
}
