export function filterResumeSeedUrls({
  urls = [],
  frontierDb = null,
  resumeCooldownSkippedUrls = new Set(),
  logger = null,
  seedKind = 'resume_pending_seed',
} = {}) {
  return (Array.isArray(urls) ? urls : [])
    .map((url) => String(url || '').trim())
    .filter(Boolean)
    .filter((url) => {
      const cooldownDecision = frontierDb?.shouldSkipUrl?.(url) || { skip: false };
      if (!cooldownDecision.skip) {
        return true;
      }
      resumeCooldownSkippedUrls.add(url);
      logger?.info?.('indexing_resume_seed_skipped', {
        url,
        seed_kind: String(seedKind || '').trim() || 'resume_pending_seed',
        skip_reason: cooldownDecision.reason || 'frontier_cooldown',
        next_retry_ts: cooldownDecision.next_retry_ts || null
      });
      return false;
    });
}
