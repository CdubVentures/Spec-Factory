/**
 * useResolvedPipelineModels — batched resolver for all five indexing-lab
 * phases rendered in the Pipeline panel's header model strip.
 *
 * Composes useResolvedFinderModel once per phase. Fixed hook order is required
 * by React rules-of-hooks.
 */

import { useResolvedFinderModel } from '../../../shared/ui/finder/useResolvedFinderModel.ts';
import type { ResolvedFinderModel } from '../../../shared/ui/finder/useResolvedFinderModel.ts';

export interface PipelinePhaseModels {
  readonly cef: ResolvedFinderModel;
  readonly pif: ResolvedFinderModel;
  readonly rdf: ResolvedFinderModel;
  readonly sku: ResolvedFinderModel;
  readonly keyFinder: ResolvedFinderModel;
}

export function useResolvedPipelineModels(): PipelinePhaseModels {
  const cef = useResolvedFinderModel('colorFinder');
  const pif = useResolvedFinderModel('imageFinder');
  const rdf = useResolvedFinderModel('releaseDateFinder');
  const sku = useResolvedFinderModel('skuFinder');
  const keyFinder = useResolvedFinderModel('keyFinder');
  return { cef, pif, rdf, sku, keyFinder };
}
