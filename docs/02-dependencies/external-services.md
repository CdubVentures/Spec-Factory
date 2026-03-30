# External Services

> **Purpose:** List every verified third-party or out-of-process integration boundary and distinguish active runtime use from config-only surfaces.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md), [environment-and-config.md](./environment-and-config.md)
> **Last validated:** 2026-03-30

| Service | Purpose | Access method | Config surface | Live consumer paths | Failure behavior | Status |
|---------|---------|---------------|----------------|---------------------|------------------|--------|
| Amazon S3 | optional storage backend for input/output object access when `outputMode === 's3'` | AWS SDK | `src/shared/settingsRegistry.js`, `src/config.js` | `src/s3/storage.js` | storage calls fail at read/write time; local mode remains the default when S3 is not selected | optional |
| SearXNG | local search provider for discovery | HTTP plus Docker Compose control | `src/shared/settingsRegistry.js`, `src/config.js`, `tools/searxng/docker-compose.yml` | `src/app/api/processRuntime.js`, `src/app/api/routes/infra/searxngRoutes.js` | status/start endpoints return failure metadata when sidecar is missing or unhealthy | optional |
| Intel Graph helper API | local GraphQL helper on `http://localhost:8787/graphql` | HTTP proxy | route-local upstream in the proxy handler | `src/app/api/routes/infra/graphqlRoutes.js`, `src/api/intelGraphApi.js` | proxy returns upstream failure to caller | local optional |
| OpenAI-compatible providers | generic LLM transport for OpenAI-style APIs, Gemini OpenAI endpoint, DeepSeek, and local lab endpoints | HTTP | runtime keys plus provider registry JSON in `src/shared/settingsRegistry.js` | `src/core/llm/client/routing.js`, `src/core/llm/providers/openaiCompatible.js` | request-time failures surface to callers; routing may fall back if configured | optional |
| Anthropic | alternate LLM provider family | HTTP | runtime keys plus provider registry JSON in `src/shared/settingsRegistry.js` | `src/core/llm/client/routing.js`, `src/core/llm/providers/anthropic.js` | request-time failures surface to callers | optional |
| Local LLM lab endpoints | local provider bridges defined in the default provider registry (`localhost:5001`, `5002`, `5003`) | HTTP | default registry JSON in `src/shared/settingsRegistry.js` and persisted LLM policy values | `src/core/llm/client/routing.js`, `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | unavailable unless those local services are running | local optional |
| Docker engine | required only to control the local SearXNG stack from the runtime | CLI process execution | none | `src/app/api/processRuntime.js`, `tools/setup-core.mjs` | SearXNG remains unavailable when Docker is missing | optional |

## Important Current-State Notes

- The live source tree does not mount a storage-settings HTTP surface. S3 selection is a config/runtime concern, not a live GUI settings form in the current code.
- `src/api/bootstrap/createBootstrapEnvironment.js` initializes `runDataStorageState` as a disabled stub. Storage inventory routes still work, but the removed relocation/settings subsystem is not part of the live runtime surface.
- `GET /api/v1/llm-policy` and `GET /api/v1/indexing/llm-config` are unauthenticated and can expose secret-bearing fields when configured. Treat them as trusted-network-only surfaces.
- `providerType: "cortex"` still exists in provider-routing code, but `src/core/llm/client/routing.js` throws for Cortex dispatch. Do not treat Cortex as an active integration.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/s3/storage.js` | S3 versus local storage adapter selection |
| source | `src/api/bootstrap/createBootstrapEnvironment.js` | disabled `runDataStorageState` stub at bootstrap |
| source | `src/app/api/processRuntime.js` | Docker plus SearXNG control boundary |
| source | `src/app/api/routes/infra/graphqlRoutes.js` | local GraphQL proxy contract |
| source | `src/api/intelGraphApi.js` | local GraphQL helper server |
| source | `src/core/llm/client/routing.js` | provider-routing boundary and Cortex non-support |
| source | `src/core/llm/providers/openaiCompatible.js` | OpenAI-compatible provider transport |
| source | `src/core/llm/providers/anthropic.js` | Anthropic provider transport |
| source | `src/shared/settingsRegistry.js` | provider registry defaults and external-service config keys |
| source | `src/features/settings-authority/llmPolicyHandler.js` | secret-bearing `/llm-policy` response surface |
| source | `src/features/settings/api/configIndexingMetricsHandler.js` | secret-bearing `/indexing/llm-config` response surface |

## Related Documents

- [Environment and Config](./environment-and-config.md) - Maps each integration to its config surface.
- [Integration Boundaries](../06-references/integration-boundaries.md) - Details contracts and failure behavior at those boundaries.
- [Deployment](../05-operations/deployment.md) - Documents the local startup/build paths for these services.
