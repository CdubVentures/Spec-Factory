const IDENTITY_GATED_FIELDS = new Set([
  'brand', 'model', 'variant', 'sku', 'base_model',
  'mpn', 'gtin', 'upc', 'ean', 'asin'
]);

export function isIdentityGatedField(field) {
  const token = String(field || '').trim().toLowerCase();
  if (!token) return false;
  return IDENTITY_GATED_FIELDS.has(token);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function resolveIdentityLabel(identity) {
  if (!identity || typeof identity !== 'object') return 'unknown';
  const matched = Boolean(identity.match);
  const score = Number(identity.score) || 0;
  const criticalConflicts = Array.isArray(identity.criticalConflicts)
    ? identity.criticalConflicts
    : [];
  if (matched) return 'matched';
  if (criticalConflicts.length > 0) return 'different';
  if (score >= 0.4) return 'possible';
  return 'different';
}

export function applyIdentityGateToCandidates(candidates, identity) {
  if (!Array.isArray(candidates)) return [];
  if (candidates.length === 0) return [];

  const label = resolveIdentityLabel(identity);
  const matchScore = (identity && typeof identity === 'object')
    ? clamp01(Number(identity.score) || 0) : 0;

  return candidates.map((candidate) => ({
    ...candidate,
    identity_label: label,
    identity_confidence: matchScore,
  }));
}
