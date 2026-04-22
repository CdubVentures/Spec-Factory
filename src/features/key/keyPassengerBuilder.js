/**
 * Key Finder — passenger builder.
 *
 * Shared helper used by BOTH the live runner (keyFinder.js) and the preview
 * compiler (keyFinderPreviewPrompt.js). Extracting this ensures preview and
 * run resolve passengers identically — any drift would mean the preview lies.
 *
 * Pure function: no side effects, no I/O. specDb is only read (resolved-field
 * lookup). Returns the ordered passenger array as produced by packBundle.
 */

import { isReservedFieldKey } from '../../core/finder/finderExclusions.js';
import { packBundle } from './keyBundler.js';

export function buildPassengers({ primary, engineRules, specDb, productId, settings }) {
  if (!settings?.bundlingEnabled) return [];
  const primaryGroup = primary?.fieldRule?.group || '';
  if (!primaryGroup && settings.groupBundlingOnly) return [];

  const peerCandidates = [];
  for (const [fk, rule] of Object.entries(engineRules || {})) {
    if (!rule || fk === primary.fieldKey) continue;
    if (isReservedFieldKey(fk)) continue; // never bundle CEF/PIF/RDF/SKF-owned peers
    if (settings.groupBundlingOnly && rule.group !== primaryGroup) continue;
    peerCandidates.push({ fieldKey: fk, fieldRule: rule });
  }

  const resolvedFieldKeys = new Set();
  if (typeof specDb?.getResolvedFieldCandidate === 'function') {
    for (const c of peerCandidates) {
      if (specDb.getResolvedFieldCandidate(productId, c.fieldKey)) {
        resolvedFieldKeys.add(c.fieldKey);
      }
    }
  }

  const { passengers } = packBundle({
    primary,
    candidates: peerCandidates,
    resolvedFieldKeys,
    settings,
  });
  return passengers;
}
