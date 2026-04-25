import type { PromptPreviewRequestBody } from '../../indexing/api/promptPreviewTypes.ts';
import type { VariantInfo } from '../types.ts';

export type PifPromptPreviewMode = 'view' | 'hero' | 'loop' | 'view-eval' | 'hero-eval';

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

export function createPifLoopPromptPreviewState(
  variantKey: string,
  label = 'Loop',
): PifPromptPreviewState {
  return {
    variantKey,
    mode: 'loop',
    label,
  };
}
