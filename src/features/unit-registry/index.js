// WHY: Public API for the unit-registry feature.
// Manages canonical units, synonyms, and conversion formulas.
// Consumed by: validator (checkUnit), Studio (contract.unit dropdown), UI page.

export { registerUnitRegistryRoutes } from './api/unitRegistryRoutes.js';
