// Endpoint for user-editable global prompt fragments. appDb is the runtime
// source when available; JSON remains a rebuild mirror and first-boot fallback.

import { z } from 'zod';
import {
  GLOBAL_PROMPT_KEYS,
  GLOBAL_PROMPTS,
} from '../../core/llm/prompts/globalPromptRegistry.js';
import {
  getGlobalPrompts,
  loadGlobalPromptsSync,
  writeGlobalPromptsPatch,
} from '../../core/llm/prompts/globalPromptStore.js';
import { emitDataChange } from '../../core/events/dataChangeContract.js';

const patchShape = Object.fromEntries(
  GLOBAL_PROMPT_KEYS.map((key) => [key, z.union([z.string(), z.null()]).optional()]),
);
const GLOBAL_PROMPTS_PATCH_SCHEMA = z.object(patchShape).strict();

function buildSnapshot({ appDb = null, settingsRoot = null } = {}) {
  if (appDb) loadGlobalPromptsSync({ appDb, settingsRoot });
  const overrides = getGlobalPrompts();
  const prompts = {};
  for (const key of GLOBAL_PROMPT_KEYS) {
    const entry = GLOBAL_PROMPTS[key];
    prompts[key] = {
      label: entry.label,
      description: entry.description,
      appliesTo: entry.appliesTo,
      variables: entry.variables,
      defaultTemplate: entry.defaultTemplate,
      override: typeof overrides[key] === 'string' ? overrides[key] : '',
    };
  }
  return { keys: [...GLOBAL_PROMPT_KEYS], prompts };
}

export function createGlobalPromptsHandler({
  jsonRes,
  readJsonBody,
  broadcastWs,
  appDb = null,
  settingsRoot = null,
} = {}) {
  return async function handleGlobalPrompts(parts, params, method, req, res) {
    if (parts[0] !== 'llm-policy' || parts[1] !== 'global-prompts') return false;

    if (method === 'GET') {
      return jsonRes(res, 200, { ok: true, ...buildSnapshot({ appDb, settingsRoot }) });
    }

    if (method === 'PUT' || method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const parsed = GLOBAL_PROMPTS_PATCH_SCHEMA.safeParse(body);
      if (!parsed.success) {
        return jsonRes(res, 422, {
          ok: false,
          error: 'invalid_global_prompts_patch',
          issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        });
      }

      try {
        await writeGlobalPromptsPatch(parsed.data, { appDb, settingsRoot });
      } catch {
        return jsonRes(res, 500, { ok: false, error: 'global_prompts_persist_failed' });
      }

      emitDataChange({
        broadcastWs,
        event: 'user-settings-updated',
        domains: ['settings'],
        meta: { section: 'global-prompts', source: 'global-prompts' },
      });

      return jsonRes(res, 200, { ok: true, ...buildSnapshot({ appDb, settingsRoot }) });
    }

    return false;
  };
}
