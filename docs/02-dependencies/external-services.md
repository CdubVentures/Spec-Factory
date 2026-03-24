# External Services

> **Purpose:** List every verified third-party or out-of-process integration boundary and distinguish active runtime use from config-only surfaces.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md), [environment-and-config.md](./environment-and-config.md)
> **Last validated:** 2026-03-23

| Service | Purpose | Access method | Config surface | Live consumer paths | Failure behavior | Status |
|---------|---------|---------------|----------------|---------------------|------------------|--------|
| AWS S3 | optional input/output and run-data storage | AWS SDK | `src/core/config/manifest/storageGroup.js`, `.env.example` | `src/s3/storage.js`, `src/api/guiServer.js`, `src/api/services/runDataRelocationService.js` | falls back to local-only behavior when bucket/creds are absent or output mode is local | active optional |
| SearXNG | local search provider for discovery | HTTP + Docker Compose control | `SEARXNG_*` manifest keys | `src/app/api/routes/infra/searxngRoutes.js`, `src/app/api/processRuntime.js`, `tools/searxng/docker-compose.yml` | status endpoints report unready/unavailable; indexing can use other providers when configured | active optional |
| GraphQL backend on `localhost:8787` | proxied GraphQL surface exposed through `/api/v1/graphql` | HTTP proxy | hardcoded local upstream in route | `src/app/api/routes/infra/graphqlRoutes.js` | proxy route returns upstream failure to caller | active local-only |
| Structured metadata sidecar | optional structured metadata extraction (extraction pipeline deleted in rework) | HTTP | `STRUCTURED_METADATA_EXTRUCT_*` keys | formerly `src/features/indexing/extraction/structuredMetadataClient.js`; config keys remain | client falls back when disabled/unreachable | config-only (extraction deleted) |
| EloShapes Supabase | external enrichment source (`src/adapters/` directory deleted in pipeline rework) | spawned Python helper + HTTP against Supabase REST endpoint | `ELO_SUPABASE_*` keys | formerly `src/adapters/eloShapesAdapter.js`; config keys remain in manifest | adapter skips when endpoint/key are missing | config-only (adapter deleted) |
| OpenAI-compatible LLM endpoint | primary sync LLM routing base | HTTP | `LLM_*`, `OPENAI_*` keys | `src/config.js`, `src/core/llm/client/routing.js`, `src/core/llm/providers/openaiCompatible.js` | routing falls back to configured alternatives when enabled | active optional |
| Gemini via OpenAI-compatible endpoint | default configured model/provider family in shared defaults | HTTP | runtime settings + `LLM_*` keys | `src/config.js`, `src/shared/settingsDefaults.js` | behaves as configured provider; fails at request time if creds/base URL are invalid | active optional |
| Anthropic | alternate LLM provider | HTTP | `ANTHROPIC_API_KEY` | `src/config.js`, `src/core/config/manifest/llmGroup.js` | unavailable unless configured | active optional |
| DeepSeek | alternate LLM provider | HTTP | `DEEPSEEK_*` keys | `src/config.js`, `src/core/config/manifest/llmGroup.js` | provider inference and token defaults change when configured | active optional |
| Cortex | optional async/specialized LLM control plane | HTTP | `CORTEX_*` keys | `src/config.js`, `src/core/llm/cortex/*.js`, `src/app/api/processRuntime.js` | status/ensure/start logic reports unavailable state | active optional |
| Docker engine | required only to launch local SearXNG stack from the GUI/runtime | CLI process execution | none | `src/app/api/processRuntime.js`, `tools/setup-core.mjs` | SearXNG status remains unavailable when Docker is missing | active optional |
| Image processor URL | manifest/config surface only; no audited runtime consumer under `src/` | none verified | `IMAGE_PROCESSOR_URL` | `src/core/config/manifest/miscGroup.js` only | no live effect confirmed during audit | config-only |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/s3/storage.js` | S3 storage abstraction exists in the live runtime |
| source | `src/app/api/processRuntime.js` | Docker/SearXNG process control and status probing |
| source | `src/app/api/routes/infra/graphqlRoutes.js` | Local GraphQL proxy route exists |
| source | formerly `src/adapters/eloShapesAdapter.js` | adapter directory deleted in pipeline rework; config keys remain |
| source | formerly `src/features/indexing/extraction/structuredMetadataClient.js` | extraction pipeline deleted in pipeline rework; config keys remain |
| source | `src/features/crawl/index.js` | new crawl module replaces extraction pipeline |

## Related Documents

- [Environment and Config](./environment-and-config.md) - Maps each integration to its config surface.
- [Integration Boundaries](../06-references/integration-boundaries.md) - Details contracts and failure modes at those boundaries.
- [Deployment](../05-operations/deployment.md) - Documents local startup/build behavior for these auxiliary services.
