# External Services

> **Purpose:** List the verified third-party or out-of-process integrations and distinguish active runtime boundaries from absent ones.
> **Prerequisites:** [environment-and-config.md](./environment-and-config.md)
> **Last validated:** 2026-04-04

## Integration Table

| Integration | Access path | Config source | Runtime owners | Current behavior |
|-------------|-------------|---------------|----------------|------------------|
| SearXNG sidecar | HTTP + Docker control | `src/shared/settingsRegistry.js`, `src/config.js`, `tools/searxng/docker-compose.yml` | `src/app/api/processRuntime.js`, `src/app/api/routes/infra/searxngRoutes.js` | optional local sidecar |
| Intel Graph helper API | `POST http://localhost:8787/graphql` | route-local upstream in proxy handler | `src/app/api/routes/infra/graphqlRoutes.js`, `src/app/api/intelGraphApi.js` | optional local helper |
| Provider-routed LLM APIs | HTTP | provider keys + registry JSON in `src/shared/settingsRegistry.js` | `src/core/llm/client/routing.js`, `src/core/llm/providers/index.js`, `src/core/llm/providers/openaiCompatible.js` | active, optional per provider |
| Local lab LLM endpoints | `http://localhost:5001/v1`, `:5002/v1`, `:5003/v1` | default provider registry JSON in `src/shared/settingsRegistry.js` | `src/core/llm/client/routing.js`, `tools/gui-react/src/features/llm-config/` | optional local lab mode |
| Docker engine | CLI process execution | none | `src/app/api/processRuntime.js` | required only for SearXNG start/stop flows |

## Service Details

### SearXNG

| Item | Value |
|------|-------|
| Sidecar files | `tools/searxng/docker-compose.yml` |
| Runtime control | `src/app/api/processRuntime.js` |
| Infra route family | `src/app/api/routes/infra/searxngRoutes.js` |
| Failure mode | status/start endpoints return failure metadata when Docker or the sidecar is unavailable |

### Intel Graph Helper API

| Item | Value |
|------|-------|
| Proxy route | `src/app/api/routes/infra/graphqlRoutes.js` |
| Upstream server | `src/app/api/intelGraphApi.js` |
| Upstream URL | `http://localhost:8787/graphql` |
| Failure mode | proxy returns `502` with `graphql_proxy_failed` when upstream calls fail |

### LLM Providers

| Item | Value |
|------|-------|
| Static provider metadata | `src/core/llm/providerMeta.js` |
| Route resolution | `src/core/llm/client/routing.js` |
| Provider dispatch table | `src/core/llm/providers/index.js` |
| Transport implementation | `src/core/llm/providers/openaiCompatible.js` |
| Known providers | `openai`, `deepseek`, `gemini`, `anthropic`, `chatmock` |

Current provider-routing fact:

- `src/core/llm/providers/index.js` maps all currently known providers to `requestOpenAICompatibleChatCompletion()` in `src/core/llm/providers/openaiCompatible.js`.
- `src/core/llm/client/routing.js` still throws if a registry entry resolves to `providerType === "cortex"`.

### Local Lab Endpoints

Default registry entries in `src/shared/settingsRegistry.js` include:

| Registry id | Base URL |
|-------------|----------|
| `lab-openai` | `http://localhost:5001/v1` |
| `lab-gemini` | `http://localhost:5002/v1` |
| `lab-claude` | `http://localhost:5003/v1` |

## Explicit Non-Integrations

- No verified cloud object-store integration in the current runtime. `/api/v1/storage/overview` reports `storage_backend: "local"` from `src/features/indexing/api/storageManagerRoutes.js`.
- No verified auth provider, OAuth client, or session store integration.
- No verified message queue, Redis, Kafka, SQS, or background-worker broker.

## Failure / Trust Notes

- The GUI server exposes secret-bearing config and LLM routes without verified auth middleware.
- The Intel Graph proxy assumes a local helper process on port `8787`; failures are surfaced directly to callers.
- LLM fallback routing is handled in `src/core/llm/client/routing.js`; provider failures can trigger fallback when configured.
- SearXNG availability depends on the local Docker environment and the sidecar container lifecycle.

## Read Next

- [Integration Boundaries](../06-references/integration-boundaries.md)
- [API Surface](../06-references/api-surface.md)
- [Known Issues](../05-operations/known-issues.md)

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/searxng/docker-compose.yml` | SearXNG sidecar presence |
| source | `src/app/api/processRuntime.js` | SearXNG/Docker lifecycle integration |
| source | `src/app/api/routes/infra/searxngRoutes.js` | SearXNG HTTP control surface |
| source | `src/app/api/routes/infra/graphqlRoutes.js` | Intel Graph proxy path and failure behavior |
| source | `src/app/api/intelGraphApi.js` | local Graph helper server contract |
| source | `src/core/llm/providerMeta.js` | known provider identities and base URLs |
| source | `src/core/llm/client/routing.js` | provider routing, fallback, and Cortex non-support |
| source | `src/core/llm/providers/index.js` | provider dispatch table |
| source | `src/core/llm/providers/openaiCompatible.js` | shared LLM transport implementation |
| source | `src/features/indexing/api/storageManagerRoutes.js` | local storage backend reporting |
| source | `src/shared/settingsRegistry.js` | default provider registry entries and external-service config keys |

## Related Documents

- [Environment and Config](./environment-and-config.md) - maps each integration to its config keys and mutable surfaces.
- [Integration Boundaries](../06-references/integration-boundaries.md) - expands these integrations into contract and failure-boundary detail.
- [API Surface](../06-references/api-surface.md) - lists the server endpoints that expose or control these integrations.
- [Known Issues](../05-operations/known-issues.md) - captures the currently known hazards around these integrations.
