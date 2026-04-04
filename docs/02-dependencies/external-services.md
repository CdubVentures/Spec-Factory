# External Services

> **Purpose:** List every verified third-party or out-of-process integration boundary and distinguish active runtime use from config-only surfaces.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md), [environment-and-config.md](./environment-and-config.md)
> **Last validated:** 2026-03-31

| Service | Purpose | Access method | Config surface | Live consumer paths | Failure behavior | Status |
|---------|---------|---------------|----------------|---------------------|------------------|--------|
| SearXNG | local search provider for discovery | HTTP plus Docker Compose control | `src/shared/settingsRegistry.js`, `src/config.js`, `tools/searxng/docker-compose.yml` | `src/app/api/processRuntime.js`, `src/app/api/routes/infra/searxngRoutes.js` | status/start endpoints return failure metadata when sidecar is missing or unhealthy | optional |
| Intel Graph helper API | local GraphQL helper on `http://localhost:8787/graphql` | HTTP proxy | route-local upstream in the proxy handler | `src/app/api/routes/infra/graphqlRoutes.js`, `src/api/intelGraphApi.js` | proxy returns upstream failure to caller | local optional |
| Provider-routed LLM endpoints | OpenAI-compatible, Anthropic, Gemini, DeepSeek, and local lab model endpoints depending on provider registry config | HTTP | runtime keys plus provider registry JSON in `src/shared/settingsRegistry.js` and `src/core/llm/providerMeta.js` | `src/core/llm/client/routing.js`, `src/core/llm/providers/index.js`, `src/core/llm/providers/openaiCompatible.js` | request-time failures surface to callers; routing may fall back if configured | optional |
| Local LLM lab endpoints | local provider bridges defined in the default provider registry (`localhost:5001`, `5002`, `5003`) | HTTP | default registry JSON in `src/shared/settingsRegistry.js` and persisted LLM policy values | `src/core/llm/client/routing.js`, `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | unavailable unless those local services are running | local optional |
| Docker engine | required only to control the local SearXNG stack from the runtime | CLI process execution | none | `src/app/api/processRuntime.js`, `tools/setup-core.mjs` | SearXNG remains unavailable when Docker is missing | optional |

## Important Current-State Notes

- `src/features/indexing/api/storageManagerRoutes.js` currently reports `storage_backend: "local"` and `backend_detail.root_path = indexLabRoot` for the `/storage/*` inventory surface. That reporting path does not read a writable storage-state settings layer.
- `GET /api/v1/runtime-settings`, `GET /api/v1/llm-policy`, and `GET /api/v1/indexing/llm-config` are unauthenticated and can expose secret-bearing fields when configured. Treat them as trusted-network-only surfaces.
- All currently wired provider dispatch goes through `src/core/llm/providers/index.js` to `src/core/llm/providers/openaiCompatible.js`, including provider types such as `anthropic`.
- `providerType: "cortex"` still exists in provider-routing code, but `src/core/llm/client/routing.js` throws for Cortex dispatch. Do not treat Cortex as an active integration.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/core/storage/storage.js` | local filesystem storage adapter |
| source | `src/features/indexing/api/storageManagerRoutes.js` | `/storage/*` inventory surface reports local backend metadata |
| source | `src/app/api/processRuntime.js` | Docker plus SearXNG control boundary |
| source | `src/app/api/routes/infra/graphqlRoutes.js` | local GraphQL proxy contract |
| source | `src/api/intelGraphApi.js` | local GraphQL helper server |
| source | `src/core/llm/client/routing.js` | provider-routing boundary and Cortex non-support |
| source | `src/core/llm/providers/index.js` | provider dispatch table |
| source | `src/core/llm/providers/openaiCompatible.js` | current transport implementation |
| source | `src/core/llm/providerMeta.js` | provider metadata and base URLs |
| source | `src/shared/settingsRegistry.js` | provider registry defaults and external-service config keys |
| source | `src/features/settings/api/configRuntimeSettingsHandler.js` | secret-bearing `/runtime-settings` response surface |
| source | `src/features/settings-authority/llmPolicyHandler.js` | secret-bearing `/llm-policy` response surface |
| source | `src/features/settings/api/configIndexingMetricsHandler.js` | secret-bearing `/indexing/llm-config` response surface |

## Related Documents

- [Environment and Config](./environment-and-config.md) - Maps each integration to its config surface.
- [Integration Boundaries](../06-references/integration-boundaries.md) - Details contracts and failure behavior at those boundaries.
- [Deployment](../05-operations/deployment.md) - Documents the local startup/build paths for these services.
