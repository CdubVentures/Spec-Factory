/**
 * Centralized path resolution for category_authority/ filesystem.
 *
 * WHY: category_authority paths must use these helpers instead of raw path.join().
 * This module is the SSOT for path layout — if the directory structure changes,
 * only this file needs updating.
 */

import path from 'node:path';

export function resolveHelperRoot(config = {}) {
  return path.resolve(config.categoryAuthorityRoot || 'category_authority');
}

export function resolveCategoryRoot(category, config = {}) {
  return path.join(resolveHelperRoot(config), category);
}

export function resolveGeneratedRoot(category, config = {}) {
  return path.join(resolveHelperRoot(config), category, '_generated');
}

export function resolveControlPlaneRoot(category, config = {}) {
  return path.join(resolveHelperRoot(config), category, '_control_plane');
}

export function resolveOverridesRoot(category, config = {}) {
  return path.join(resolveHelperRoot(config), category, '_overrides');
}

export function resolveComponentOverridesRoot(category, config = {}) {
  return path.join(resolveHelperRoot(config), category, '_overrides', 'components');
}
