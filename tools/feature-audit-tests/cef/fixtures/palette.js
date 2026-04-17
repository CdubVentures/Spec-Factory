// Re-exports the canonical color palette in the shape AppDb.listColors() returns.
// Mirrors src/features/color-registry/colorRegistrySeed.js so the audit tool
// stays in sync with the real palette without duplicating data.

import { EG_DEFAULT_COLORS } from '../../../../src/features/color-registry/colorRegistrySeed.js';

export const AUDIT_PALETTE = EG_DEFAULT_COLORS.map((c) => ({
  name: c.name,
  hex: c.hex,
  css_var: `--color-${c.name}`,
}));
