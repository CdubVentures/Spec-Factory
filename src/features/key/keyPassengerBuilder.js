/**
 * Key Finder — passenger builder.
 *
 * Shared helper used by BOTH the live runner (keyFinder.js) and the preview
 * compiler (keyFinderPreviewPrompt.js). Extracting this ensures preview and
 * run resolve passengers identically — any drift would mean the preview lies.
 *
 * Reads specDb (resolved-field, top-candidate) + the in-flight registry
 * (hard-block on busy primaries, per-tier passenger caps). Does NOT mutate
 * the registry — that lifecycle lives in keyFinder.js (primary + selected
 * passengers) so preview stays side-effect-free.
 */

import { isReservedFieldKey } from '../../core/finder/finderExclusions.js';
import { packBundle } from './keyBundler.js';
import { isConcreteEvidence } from './keyConcreteEvidence.js';
import { isPrimary as registryIsPrimary, count as registryCount } from '../../core/operations/keyFinderRegistry.js';
import { isDedicatedComponentKey } from './componentKeyContracts.js';

const CAP_KNOB_BY_TIER = Object.freeze({
  easy: 'bundlingOverlapCapEasy',
  medium: 'bundlingOverlapCapMedium',
  hard: 'bundlingOverlapCapHard',
  very_hard: 'bundlingOverlapCapVeryHard',
});

function capForTier(settings, tier) {
  const knob = CAP_KNOB_BY_TIER[tier];
  if (!knob) return Infinity;
  const raw = Number(settings[knob]);
  if (!Number.isFinite(raw) || raw < 0) return Infinity;
  // very_hard: 0 means uncapped. Other tiers: 0 means "never pack".
  if (tier === 'very_hard' && raw === 0) return Infinity;
  return raw;
}

export function buildPassengers({ primary, engineRules, specDb, productId, settings, familySize = undefined, variantCount = undefined }) {
  if (!settings?.bundlingEnabled) return [];
  if (isDedicatedComponentKey(primary?.fieldKey, primary?.fieldRule)) return [];
  const primaryGroup = primary?.fieldRule?.group || '';
  if (!primaryGroup && settings.groupBundlingOnly) return [];

  const peerCandidates = [];
  for (const [fk, rule] of Object.entries(engineRules || {})) {
    if (!rule || fk === primary.fieldKey) continue;
    if (isReservedFieldKey(fk)) continue; // never bundle CEF/PIF/RDF/SKF-owned peers
    if (isDedicatedComponentKey(fk, rule)) continue;
    if (settings.groupBundlingOnly && rule.group !== primaryGroup) continue;
    // Stamp the peer's live passenger-ride count so packBundle's sort can
    // round-robin within a same-tier group (peer with fewer rides packs first).
    // Without this, the alphabetical first key in a tier hogs every slot until
    // it hits its cap — e.g., one hard peer at asPassenger=4 while four others
    // sit at 0.
    const rides = registryCount(productId, fk).asPassenger;
    peerCandidates.push({ fieldKey: fk, fieldRule: rule, currentRides: rides });
  }

  // Peer eligibility gate — applies to BOTH Run and Loop so the /summary
  // bundle_preview is always consistent with what would actually pack.
  //
  // Contract (per user spec 2026-04-23):
  //   - When BOTH exclude knobs > 0 (concrete gate ACTIVE): a peer is
  //     dropped ONLY when its bucket publishes under the stricter concrete
  //     thresholds. Published-but-not-concrete peers stay in the pool so
  //     bundling accumulates more evidence toward the concrete bar. That's
  //     the "below either threshold, peers keep retrying" rule.
  //   - When EITHER knob is 0 (concrete gate DISABLED): fall back to legacy
  //     behavior — every published peer is dropped unconditionally.
  //
  // Same gate fires for Run and Loop → next-bundle preview matches both.
  const excludeConf = Number(settings.passengerExcludeAtConfidence) || 0;
  const excludeEvd = Number(settings.passengerExcludeMinEvidence) || 0;
  const concreteGateActive = excludeConf > 0 && excludeEvd > 0;
  const resolvedFieldKeys = new Set();
  if (concreteGateActive) {
    for (const c of peerCandidates) {
      if (isConcreteEvidence({
        specDb, productId,
        fieldKey: c.fieldKey, fieldRule: c.fieldRule,
        excludeConf, excludeEvd,
      })) {
        resolvedFieldKeys.add(c.fieldKey);
      }
    }
  } else if (typeof specDb?.getResolvedFieldCandidate === 'function') {
    for (const c of peerCandidates) {
      if (specDb.getResolvedFieldCandidate(productId, c.fieldKey)) {
        resolvedFieldKeys.add(c.fieldKey);
      }
    }
  }

  // §6.2 hard-block on busy primaries + §6.3 per-tier overlap caps. Registry
  // lookups are in-memory O(1). Cap-skipping plus the existing mandatory-first
  // sort yields reverse-fallback automatically — harder tiers pick up the
  // slack when easier tiers saturate.
  for (const c of peerCandidates) {
    if (resolvedFieldKeys.has(c.fieldKey)) continue;
    if (registryIsPrimary(productId, c.fieldKey)) {
      resolvedFieldKeys.add(c.fieldKey);
      continue;
    }
    const cap = capForTier(settings, c.fieldRule.difficulty);
    if (registryCount(productId, c.fieldKey).asPassenger >= cap) {
      resolvedFieldKeys.add(c.fieldKey);
    }
  }

  const { passengers } = packBundle({
    primary,
    candidates: peerCandidates,
    resolvedFieldKeys,
    settings,
    familySize: familySize ?? variantCount ?? 1,
  });
  return passengers;
}
