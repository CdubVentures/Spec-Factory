/**
 * Stage 06 SERP Triage — Reject Auditor
 *
 * Phase 1: audit metadata infrastructure.
 * Samples hard-dropped and soft-excluded candidates for false-negative tracking.
 *
 * Future phases:
 *   Phase 2: shadow-fetch reject validation
 *   Phase 3: learn from reject outcomes
 */

/**
 * Sample candidates from hard drops and soft exclusions for audit.
 *
 * @param {object} options
 * @param {Array} options.hardDrops — hard-dropped candidates
 * @param {Array} options.notSelected — soft-excluded candidates (scored but below quota)
 * @param {number} [options.sampleSize=3] — max samples per category
 * @param {object} [options.logger]
 * @returns {Array} AuditSample[]
 */
export function sampleRejectAudit({
  hardDrops,
  notSelected,
  sampleSize = 3,
} = {}) {
  const samples = [];
  const drops = Array.isArray(hardDrops) ? hardDrops : [];
  const excluded = Array.isArray(notSelected) ? notSelected : [];

  // Sample hard drops — prefer boundary cases (cooldown > shell > other)
  const dropPriority = { url_cooldown: 3, video_platform: 3, utility_shell: 2, invalid_protocol: 1, denied_host: 0, invalid_url: 0 };
  const sortedDrops = [...drops].sort(
    (a, b) => (dropPriority[b.hard_drop_reason] || 1) - (dropPriority[a.hard_drop_reason] || 1)
  );
  for (let i = 0; i < Math.min(sampleSize, sortedDrops.length); i++) {
    const drop = sortedDrops[i];
    samples.push({
      url: String(drop.url || ''),
      source: 'hard_drop',
      reason: String(drop.hard_drop_reason || ''),
      identity_prelim: null,
      host_trust_class: null,
      score: null,
      lane: null,
    });
  }

  // Sample soft exclusions — prefer highest scores that just missed quota
  const sortedExcluded = [...excluded].sort((a, b) => (b.score || 0) - (a.score || 0));
  for (let i = 0; i < Math.min(sampleSize, sortedExcluded.length); i++) {
    const item = sortedExcluded[i];
    samples.push({
      url: String(item.url || ''),
      source: 'soft_exclude',
      reason: 'below_quota_cutoff',
      identity_prelim: String(item.identity_prelim || ''),
      host_trust_class: String(item.host_trust_class || ''),
      score: Number(item.score || 0),
      lane: Number(item.primary_lane || 0),
    });
  }

  return samples;
}

/**
 * Build the audit trail record for serp_explorer.
 *
 * @param {object} options
 * @param {Array} options.auditSamples — from sampleRejectAudit
 * @param {Array} options.hardDrops
 * @param {Array} options.notSelected
 * @param {Array} options.selected
 * @returns {object} AuditTrailRecord
 */
export function buildAuditTrail({
  auditSamples = [],
  hardDrops = [],
  notSelected = [],
  selected = [],
} = {}) {
  const drops = Array.isArray(hardDrops) ? hardDrops : [];
  const excluded = Array.isArray(notSelected) ? notSelected : [];
  const samps = Array.isArray(auditSamples) ? auditSamples : [];

  return {
    hard_drop_sample: samps.filter((s) => s.source === 'hard_drop'),
    soft_exclude_sample: samps.filter((s) => s.source === 'soft_exclude'),
    hard_drop_total: drops.length,
    soft_exclude_total: excluded.length,
  };
}
