# Plan 02: Characterization Tests — Lock Down Current Behavior

## Goal
Before any refactor, capture exact current behavior with golden-master tests. These are the safety net for everything that follows.

## Depends On
Plan 01 (needs audit matrix to know what to test)

## Blocks
Plans 03-10 (all changes must not break these tests)

---

## Test Files to Create

### File 1: `test/contracts/settingsPropagationCharacterization.test.js`

#### Test Group A: processStartLaunchPlan Golden Master
```
Contract: Given a full RuntimeSettings payload with ALL 209 keys populated,
buildProcessStartLaunchPlan() produces exactly these env vars.

Tests:
- A1: All 42 direct-launch keys appear in envOverrides with correct UPPER_SNAKE_CASE names
- A2: All non-direct-launch keys are ABSENT from envOverrides
- A3: Boolean values produce 'true'/'false' strings
- A4: Integer values are clamped within documented ranges
- A5: JSON object values are validated and re-serialized
- A6: CLI args include category, productId, runId, searchEngines
- A7: dynamicFetchPolicyMapJson validation rejects invalid JSON
- A8: Missing optional fields produce no env var (not empty string)
```

#### Test Group B: buildIndexingRunStartPayload Golden Master
```
Contract: Given runtimeSettingsPayload + parsedValues + runControlPayload,
buildIndexingRunStartPayload() produces exactly these fields.

Tests:
- B1: Output includes all sub-payload fields from runtime, llm, learning, ocr, discovery, model
- B2: Numeric fields have min enforcement applied
- B3: Boolean fields pass through correctly
- B4: String fields are trimmed
- B5: discoveryEnabled is hardcoded to true in discovery sub-payload
- B6: runProfile is hardcoded to 'standard' in model sub-payload
- B7: Missing optional fields produce empty string, not undefined
```

#### Test Group C: loadConfigWithUserSettings Golden Master
```
Contract: Given a known user-settings.json and known env vars,
loadConfigWithUserSettings() produces exact config shape.

Tests:
- C1: User settings override env-derived values for all RUNTIME_KEYS_TO_PERSIST
- C2: Phase overrides are re-resolved after user settings applied
- C3: Dual keys are synced (both partners updated)
- C4: Missing user-settings.json falls back gracefully (no crash)
- C5: Config includes all keys from configBuilder + all keys from user settings
```

#### Test Group D: buildRoundConfig Golden Master
```
Contract: Given baseConfig and round context, buildRoundConfig() produces exact overrides.

Tests:
- D1: Round 0 (fast): preferHttpFetcher=true, autoScrollEnabled=false, maxRunSeconds≤180, etc.
- D2: Round 1: intermediate caps applied
- D3: Round 2+ (thorough): pageGotoTimeoutMs≥45000, maxUrlsPerProduct≥220, etc.
- D4: Contract effort boosts discovery/url/candidate caps
- D5: Discovery disabled when missingRequired=0 and missingExpected=0
- D6: Search provider selection respects searxng readiness
```

#### Test Group E: applyRuntimeSettingsToConfig Behavior
```
Tests:
- E1: Applies all RUNTIME_KEYS_TO_PERSIST from user settings to config
- E2: Dual-key partners are updated when one key changes
- E3: Phase overrides re-resolved when llmPhaseOverridesJson changes
- E4: Phase overrides re-resolved when llmModelPlan changes
- E5: Phase overrides re-resolved when llmModelReasoning changes
- E6: Unknown keys in user settings are ignored (no crash)
```

### File 2: `test/contracts/settingsRegistryCompleteness.test.js`

```
Tests:
- R1: Every registry key has a unique key value
- R2: Every registry key has a valid type (string, int, float, bool, enum, csv_enum)
- R3: Every int/float entry has min and max (or is exempt)
- R4: Every enum/csv_enum entry has allowed array
- R5: No registry key has both readOnly=true and appears in PUT route contract
- R6: Every cfgKey alias maps to a valid config key
- R7: No two entries share the same cfgKey
- R8: Secret entries include: anthropicApiKey, deepseekApiKey, geminiApiKey, openaiApiKey, llmPlanApiKey, eloSupabaseAnonKey
- R9: ReadOnly entries include: awsRegion, s3Bucket
- R10: DefaultsOnly entries include: discoveryEnabled, daemonGracefulShutdownTimeoutMs, runtimeAutoSaveEnabled
- R11: Derived defaults match registry defaults for all non-routeOnly entries
- R12: Derived clamping ranges match registry min/max for all int entries
- R13: Derived option values match registry allowed for all enum/csv_enum entries
```

### File 3: `tools/gui-react/src/features/pipeline-settings/state/__tests__/settingsPayloadCompleteness.test.ts`

```
Tests:
- P1: Every non-secret, non-readOnly, non-defaultsOnly registry key appears in collectRuntimeSettingsPayload() output
- P2: Every field in buildIndexingRunStartPayload() output exists in the registry (no orphan fields)
- P3: Payload round-trip: serialize → deserialize preserves all values
- P4: Integer fields in payload respect registry min/max bounds
- P5: Enum fields in payload respect registry allowed values
```

---

## Test Infrastructure Needed

### Golden Master Factory
```javascript
// test/support/settingsGoldenMasterFactory.js
export function buildFullRegistryPayload(registry) {
  // Builds a payload with every registry key set to a non-default test value
  // Returns: { payload, expected }
}
```

### Known User Settings Fixture
```javascript
// test/support/knownUserSettingsFixture.js
export function buildKnownUserSettings() {
  // Returns a user-settings.json content with known values for all sections
}
```

---

## Execution Steps

1. Create test support factories
2. Write golden-master tests for processStartLaunchPlan
3. Write golden-master tests for buildIndexingRunStartPayload
4. Write golden-master tests for loadConfigWithUserSettings
5. Write golden-master tests for buildRoundConfig
6. Write registry completeness tests
7. Write GUI payload completeness tests (TypeScript)
8. Run all tests — they MUST pass against current code
9. Commit characterization tests
10. These tests become the safety net for all subsequent plans

## Estimated Effort
~3-4 hours. Tests must be comprehensive enough to catch any regression.

## Rollback
Tests only — revert the test files if they cause issues.
