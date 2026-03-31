export { compileCategoryFieldStudio, validateFieldStudioMap, loadFieldStudioMap, saveFieldStudioMap } from './categoryCompile.js';

// WHY: category_authority paths must use owner's exported helpers
export {
  resolveHelperRoot,
  resolveCategoryRoot,
  resolveGeneratedRoot,
  resolveControlPlaneRoot,
  resolveOverridesRoot,
  resolveComponentOverridesRoot
} from './compilePaths.js';
