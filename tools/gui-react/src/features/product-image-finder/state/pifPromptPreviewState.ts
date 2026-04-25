import type { PromptPreviewRequestBody } from '../../indexing/api/promptPreviewTypes.ts';
import type { VariantInfo } from '../types.ts';

/**
 * One mode per discovery pool. The backend derives `run_scope_key` from these
 * (see src/features/product-image/runScope.js):
 *   - 'view' (no body.view) → priority-view pool
 *   - 'view' (with body.view) → view:<focus> pool
 *   - 'hero' → standalone hero pool
 *   - 'loop-view' → loop-view pool (representative iteration)
 *   - 'loop-hero' → loop-hero pool
 *   - 'view-eval' / 'hero-eval' → eval previews (orthogonal to discovery pools)
 */
export type PifPromptPreviewMode =
  | 'view'
  | 'hero'
  | 'loop-view'
  | 'loop-hero'
  | 'view-eval'
  | 'hero-eval';

export interface PifPromptPreviewState {
  readonly variantKey: string;
  readonly mode: PifPromptPreviewMode;
  readonly view?: string;
  readonly label?: string;
}

export function createPifPromptPreviewBody(
  state: PifPromptPreviewState | null,
): PromptPreviewRequestBody {
  if (!state?.variantKey) return {};
  return {
    variant_key: state.variantKey,
    mode: state.mode,
    ...(state.view ? { view: state.view } : {}),
  };
}

export function createPifHeaderPromptPreviewState(
  variants: readonly VariantInfo[],
): PifPromptPreviewState | null {
  const firstVariant = variants.find((variant) => variant.key);
  if (!firstVariant) return null;
  return {
    variantKey: firstVariant.key,
    mode: 'view',
    label: firstVariant.label ? `Priority View - ${firstVariant.label}` : 'Priority View',
  };
}

export function createPifPriorityViewPreviewState(
  variantKey: string,
  label = 'Priority View Run',
): PifPromptPreviewState {
  return { variantKey, mode: 'view', label };
}

export function createPifIndividualViewPreviewState(
  variantKey: string,
  view: string,
  label?: string,
): PifPromptPreviewState {
  return {
    variantKey,
    mode: 'view',
    view,
    label: label ?? `${view} Individual View Run`,
  };
}

export function createPifStandaloneHeroPreviewState(
  variantKey: string,
  label = 'Hero Run',
): PifPromptPreviewState {
  return { variantKey, mode: 'hero', label };
}

export function createPifLoopViewPreviewState(
  variantKey: string,
  label = 'Loop View iteration',
): PifPromptPreviewState {
  return { variantKey, mode: 'loop-view', label };
}

export function createPifLoopHeroPreviewState(
  variantKey: string,
  label = 'Loop Hero iteration',
): PifPromptPreviewState {
  return { variantKey, mode: 'loop-hero', label };
}
