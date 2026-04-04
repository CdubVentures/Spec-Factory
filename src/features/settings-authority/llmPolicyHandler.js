// WHY: Dedicated endpoint for the composite LlmPolicy object.
// GET returns the assembled policy from live config.
// PUT receives a composite, disassembles to flat keys, persists via queued
// patch merge, and applies to live config inside the queue's critical section.

import { assembleLlmPolicy, disassembleLlmPolicy, LLM_POLICY_FLAT_KEYS } from '../../core/llm/llmPolicySchema.js';
import { validateModelKeysAgainstRegistry } from '../../core/llm/llmModelValidation.js';
import { buildRegistryLookup } from '../../core/llm/routeResolver.js';
import { emitDataChange } from '../../core/events/dataChangeContract.js';

export function createLlmPolicyHandler({
  jsonRes,
  readJsonBody,
  config,
  broadcastWs,
  persistenceCtx,
}) {
  return async function handleLlmPolicy(parts, params, method, req, res) {
    if (parts[0] !== 'llm-policy') return false;

    if (method === 'GET') {
      const policy = assembleLlmPolicy(config);
      return jsonRes(res, 200, { ok: true, policy });
    }

    if (method === 'PUT' || method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const flatKeys = disassembleLlmPolicy(body);
      const hasIncomingProviderRegistry = Object.prototype.hasOwnProperty.call(body || {}, 'providerRegistry');
      const registryLookup = hasIncomingProviderRegistry
        ? buildRegistryLookup(body?.providerRegistry || [])
        : config._registryLookup;

      // WHY: Reject model IDs that don't exist in the provider registry.
      // Empty strings are allowed (fallbacks can be unset). When the request
      // includes a provider registry, validate against that incoming registry
      // rather than the server's cached lookup so GET -> PUT round-trips stay valid.
      const invalidModels = validateModelKeysAgainstRegistry(flatKeys, registryLookup);
      if (invalidModels.length > 0) {
        const rejected = Object.fromEntries(invalidModels.map((m) => [m.key, m.value]));
        return jsonRes(res, 422, { ok: false, error: 'invalid_model', rejected });
      }

      // WHY: Build patch from only the LLM policy flat keys. The queued
      // mergeRuntimePatch reads current SQL state inside the lock, merges
      // this patch on top, validates, and UPSERTs — eliminating the stale-base
      // and two-writer race conditions (SET-001, SET-002).
      const flatPatch = {};
      for (const key of LLM_POLICY_FLAT_KEYS) {
        if (key in flatKeys) {
          flatPatch[key] = flatKeys[key];
        }
      }

      persistenceCtx.recordRouteWriteAttempt('runtime', 'llm-policy-route');
      try {
        await persistenceCtx.mergeRuntimePatch(flatPatch, { emptyRegistryGuard: true });
        persistenceCtx.recordRouteWriteOutcome('runtime', 'llm-policy-route', true);
      } catch {
        persistenceCtx.recordRouteWriteOutcome('runtime', 'llm-policy-route', false, 'llm_policy_persist_failed');
        return jsonRes(res, 500, { ok: false, error: 'llm_policy_persist_failed' });
      }

      emitDataChange({
        broadcastWs,
        event: 'runtime-settings-updated',
        meta: { source: 'llm-policy' },
      });
      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: { section: 'runtime', source: 'llm-policy' },
      });

      const policy = assembleLlmPolicy(config);
      return jsonRes(res, 200, { ok: true, policy });
    }

    return false;
  };
}
