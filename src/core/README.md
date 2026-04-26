## Purpose
Own repo-wide infrastructure for config manifests, runtime artifact root resolution, and LLM provider/client/prompt plumbing.
This boundary is the canonical home for low-level configuration and model-routing mechanics consumed by higher-level domains.

## Public API (The Contract)
- No root `src/core/index.js` exists; consumers import specific entrypoints.
- `src/core/config/manifest.js`: `CONFIG_MANIFEST_VERSION`, `CONFIG_MANIFEST`, `CONFIG_MANIFEST_KEYS`, `CONFIG_MANIFEST_DEFAULTS`.
- `src/core/config/runtimeArtifactRoots.js`: `defaultLocalOutputRoot()`, `defaultIndexLabRoot()`.
- `src/core/llm/client/routing.js`: `resolveLlmRoute()`, `resolveLlmFallbackRoute()`, `hasLlmRouteApiKey()`, `hasAnyLlmApiKey()`, `llmRoutingSnapshot()`, `callLlmWithRouting()`.
- `src/core/llm/client/llmClient.js`: `getProviderHealth()`, `redactOpenAiError()`, `callLlmProvider()`.
- `src/core/llm/client/providerHealth.js`: `LlmProviderHealth`, `normalizeProviderBaseUrl()`.
- `src/core/llm/providers/index.js`: `selectLlmProvider()`.
- `src/core/llm/providers/{gemini,deepseek,openaiCompatible}.js`: provider request functions.
- `src/core/llm/prompts/{planner,extractor,validator}.js`: prompt builders.
- `src/core/events/eventRegistry.js`: `EVENT_REGISTRY`, `DOMAIN_QUERY_TEMPLATES`, `KNOWN_DATA_CHANGE_EVENTS`, `KNOWN_DATA_CHANGE_DOMAINS`.
- `src/core/events/dataChangeContract.js`: `createDataChangePayload`, `emitDataChange`, `isDataChangePayload`, `dataChangeMatchesCategory`, `DATA_CHANGE_EVENT_DOMAIN_MAP`, `DATA_CHANGE_EVENT_NAMES`.
- `src/core/events/dataPropagationCounters.js`: `resetDataPropagationCounters`, `recordDataChangeBroadcast`, `recordQueueCleanupOutcome`, `getDataPropagationCountersSnapshot`.
- `src/core/events/settingsPersistenceCounters.js`: `resetSettingsPersistenceCounters`, `recordSettingsWriteAttempt`, `recordSettingsWriteOutcome`, `recordSettingsStaleRead`, `recordSettingsMigration`, `getSettingsPersistenceCountersSnapshot`.
- `src/core/storage/storage.js`: `createStorage(config)`, `toPosixKey(...parts)`.

## Dependencies
- Allowed: Node built-ins, internal `src/core/**`, `src/billing/**`, `src/shared/**`, and existing low-level helpers in `src/utils/**`.
- Forbidden: feature internals, review/catalog/indexing domain logic, or UI-specific state.

## Domain Invariants
- Config manifest defaults are assembled from manifest group modules and exposed through the shim in `src/core/config/manifest.js`.
- Runtime artifact roots resolve deterministically from the local temp root plus fixed `output` and `indexlab` subpaths.
- Prompt builders stay pure; provider selection, HTTP concerns, and caching stay inside `src/core/llm/**`.
- Secrets and provider credentials must not leak out of this boundary through logs or higher-level contracts.
- `src/core/events/eventRegistry.js`: the SSOT for live-update event-to-domain and domain-to-query-template coverage.
- `src/core/events/dataChangeContract.js`: shared mutation broadcast infrastructure consumed by all features — not feature-specific.
