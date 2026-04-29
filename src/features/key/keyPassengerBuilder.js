/**
 * Key Finder passenger builder.
 *
 * Shared helper used by both the live runner and prompt preview. It computes
 * bundle passengers without mutating the in-flight registry.
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
  if (tier === 'very_hard' && raw === 0) return Infinity;
  return raw;
}

function buildPeerCandidates({ engineRules, productId }) {
  const peerCandidates = [];
  for (const [fk, rule] of Object.entries(engineRules || {})) {
    if (!rule) continue;
    if (isReservedFieldKey(fk)) continue;
    if (isDedicatedComponentKey(fk, rule)) continue;
    const rides = registryCount(productId, fk).asPassenger;
    peerCandidates.push({ fieldKey: fk, fieldRule: rule, currentRides: rides });
  }
  return peerCandidates;
}

function buildResolvedFieldKeySet({ peerCandidates, specDb, productId, settings }) {
  const excludeConf = Number(settings.passengerExcludeAtConfidence) || 0;
  const excludeEvd = Number(settings.passengerExcludeMinEvidence) || 0;
  const concreteGateActive = excludeConf > 0 && excludeEvd > 0;
  const resolvedFieldKeys = new Set();

  if (concreteGateActive) {
    for (const c of peerCandidates) {
      if (isConcreteEvidence({
        specDb,
        productId,
        fieldKey: c.fieldKey,
        fieldRule: c.fieldRule,
        excludeConf,
        excludeEvd,
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

  for (const c of peerCandidates) {
    if (resolvedFieldKeys.has(c.fieldKey)) continue;
    if (registryIsPrimary(productId, c.fieldKey)) {
      resolvedFieldKeys.add(c.fieldKey);
      continue;
    }
    const cap = capForTier(settings, c.fieldRule.difficulty);
    if (c.currentRides >= cap) {
      resolvedFieldKeys.add(c.fieldKey);
    }
  }

  return resolvedFieldKeys;
}

export function createPassengerResolver({ engineRules, specDb, productId, settings }) {
  const peerCandidates = settings?.bundlingEnabled
    ? buildPeerCandidates({ engineRules, productId })
    : [];
  const resolvedFieldKeys = settings?.bundlingEnabled
    ? buildResolvedFieldKeySet({ peerCandidates, specDb, productId, settings })
    : new Set();

  return function resolvePassengers({ primary, familySize = undefined, variantCount = undefined }) {
    if (!settings?.bundlingEnabled) return [];
    if (isDedicatedComponentKey(primary?.fieldKey, primary?.fieldRule)) return [];
    const primaryGroup = primary?.fieldRule?.group || '';
    if (!primaryGroup && settings.groupBundlingOnly) return [];

    const candidates = settings.groupBundlingOnly
      ? peerCandidates.filter((c) => c.fieldRule.group === primaryGroup)
      : peerCandidates;

    const { passengers } = packBundle({
      primary,
      candidates,
      resolvedFieldKeys,
      settings,
      familySize: familySize ?? variantCount ?? 1,
    });
    return passengers;
  };
}

export function buildPassengers({
  primary,
  engineRules,
  specDb,
  productId,
  settings,
  familySize = undefined,
  variantCount = undefined,
}) {
  if (!settings?.bundlingEnabled) return [];
  if (isDedicatedComponentKey(primary?.fieldKey, primary?.fieldRule)) return [];
  const primaryGroup = primary?.fieldRule?.group || '';
  if (!primaryGroup && settings.groupBundlingOnly) return [];
  const scopedEngineRules = Object.fromEntries(
    Object.entries(engineRules || {})
      .filter(([fk, rule]) => fk !== primary?.fieldKey && (!settings.groupBundlingOnly || rule?.group === primaryGroup)),
  );
  const resolvePassengers = createPassengerResolver({
    engineRules: scopedEngineRules,
    specDb,
    productId,
    settings,
  });
  return resolvePassengers({ primary, familySize, variantCount });
}
