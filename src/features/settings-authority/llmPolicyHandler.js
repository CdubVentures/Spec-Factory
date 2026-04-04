// WHY: Dedicated endpoint for the composite LlmPolicy object.
// GET returns the assembled policy from live config.
// PUT receives a composite, disassembles to flat keys, persists, and applies.

import { assembleLlmPolicy, disassembleLlmPolicy, LLM_POLICY_FLAT_KEYS } from '../../core/llm/llmPolicySchema.js';
import { validateModelKeysAgainstRegistry } from '../../core/llm/llmModelValidation.js';
import { buildRegistryLookup } from '../../core/llm/routeResolver.js';
import { emitDataChange } from '../../core/events/dataChangeContract.js';
import { applyRuntimeSettingsToConfig } from './userSettingsService.js';

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

      // WHY: Apply to live config so subsequent reads see the new values.
      applyRuntimeSettingsToConfig(config, flatKeys);

      // WHY: Merge with existing persisted runtime to avoid wiping non-LLM keys.
      const userSettingsState = persistenceCtx.getUserSettingsState();
      const currentUserRuntime = (
        userSettingsState?.runtime && typeof userSettingsState.runtime === 'object'
      ) ? userSettingsState.runtime : {};

      const nextRuntimeSnapshot = { ...currentUserRuntime };
      for (const key of LLM_POLICY_FLAT_KEYS) {
        if (key in flatKeys) {
          nextRuntimeSnapshot[key] = flatKeys[key];
        }
      }

      // WHY: Prevent persisting an empty registry when the live config has a
      // non-empty one. An empty registry wipes model→provider routing, causing
      // api_key_present:false and blocking pipeline runs. This can happen when
      // the persistence context's initial state came from SQL with "[]" while
      // the config was correctly seeded from defaults during boot.
      if (
        nextRuntimeSnapshot.llmProviderRegistryJson === '[]'
        && typeof config.llmProviderRegistryJson === 'string'
        && config.llmProviderRegistryJson.length > 2
      ) {
        nextRuntimeSnapshot.llmProviderRegistryJson = config.llmProviderRegistryJson;
      }

      persistenceCtx.recordRouteWriteAttempt('runtime', 'llm-policy-route');
      try {
        await persistenceCtx.persistCanonicalSections({ runtime: nextRuntimeSnapshot });
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
