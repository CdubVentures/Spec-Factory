export const STUDIO_NUMERIC_KNOB_BOUNDS = {
  contractRoundingDecimals: { min: 0, max: 6, fallback: 0 },
  evidenceMinRefs: { min: 0, max: 10, fallback: 0 },
  componentMatch: { min: 0, max: 1 },
} as const;

export const STUDIO_COMPONENT_MATCH_DEFAULTS = {
  fuzzyThreshold: 0.75,
  nameWeight: 0.4,
  autoAcceptScore: 0.95,
  flagReviewScore: 0.65,
  propertyWeight: 0.6,
} as const;
