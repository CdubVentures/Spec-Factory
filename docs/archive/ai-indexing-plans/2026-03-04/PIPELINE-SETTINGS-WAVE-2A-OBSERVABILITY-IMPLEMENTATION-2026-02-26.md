# Pipeline Settings Wave 2A Observability Implementation - 2026-02-26

## Scope
Wave 2 backend knob surfacing slice for runtime observability controls.

## Knobs implemented end-to-end
1. `runtimeTraceEnabled`
2. `runtimeTraceFetchRing`
3. `runtimeTraceLlmRing`
4. `runtimeTraceLlmPayloads`
5. `eventsJsonWrite`
6. `authoritySnapshotEnabled`

## Wiring status
- Defaults added in shared settings defaults (`SETTINGS_DEFAULTS.runtime`).
- Runtime settings contract updated:
  - `RUNTIME_SETTINGS_KEYS`
  - `RUNTIME_SETTINGS_ROUTE_GET` mappings
  - `RUNTIME_SETTINGS_ROUTE_PUT` mappings and range validation
- Runtime serializer/hydration path updated:
  - `runtimeSettingsDomain.ts` input contract, bindings, payload serializer
  - `runtimeSettingsAuthority.ts` numeric fallback baseline for ring-size keys
- Pipeline Settings UI updated:
  - Runtime Flow `Run Setup` now includes an **Observability and Trace** panel
  - Controls: toggles + ring-size numeric inputs
- Indexing run payload updated to carry all six keys.
- Process start env override bridge updated (`/process/start` route):
  - `RUNTIME_TRACE_ENABLED`
  - `RUNTIME_TRACE_FETCH_RING`
  - `RUNTIME_TRACE_LLM_RING`
  - `RUNTIME_TRACE_LLM_PAYLOADS`
  - `EVENTS_JSON_WRITE`
  - `AUTHORITY_SNAPSHOT_ENABLED`

## Validation
- New wiring test:
  - `test/runtimeObservabilityKnobWiring.test.js`
- Updated coverage tests:
  - `test/runtimeSettingsApi.test.js`
  - `test/runtimeSettingsPipelineFlowWiring.test.js`
- Regression checks executed and passing:
  - runtime contract parity/snapshot/key matrix suites
  - convergence/source-strategy authority suites
  - AST knob inventory snapshot gate
  - GUI build (`npm --prefix tools/gui-react run build`)

## Remaining work after Wave 2A
- Continue Wave 2 backend knob surfacing for:
  - Search provider endpoints and rescue policy knobs
  - Fetch/frontier cooldown and repair knobs
  - Parsing and OCR backend knobs not yet in GUI
  - Output/drift and advanced mode knobs
- Keep using the hierarchy plan CSV as source for next slices.
