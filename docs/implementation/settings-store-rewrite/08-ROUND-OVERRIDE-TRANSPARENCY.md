# Plan 08: Round Override Transparency & Propagation Consumers

## Goal
Make roundConfigBuilder return explicit patches with reasons. Verify all downstream propagation consumers read from effective config.

## Depends On
Plan 03 (roundOverridable flag in registry)

## Blocks
Plan 10 (drift prevention)

---

## Sub-Plan 8A: Round Override Patches

### File: `src/runner/roundConfigBuilder.js` (~585 LOC)

#### Current Interface
```javascript
export function buildRoundConfig(baseConfig, { round, ... }) {
  const next = { ...baseConfig };
  // ... 200 lines of silent mutation ...
  return next;
}
```

#### New Interface
```javascript
export function buildRoundConfig(baseConfig, { round, ... }) {
  const next = { ...baseConfig };
  const patches = [];
  // ... same logic, but every mutation records a patch ...
  return { config: next, patches };
}
```

#### Patch Recording Pattern
```javascript
// BEFORE
next.preferHttpFetcher = true;

// AFTER
if (next.preferHttpFetcher !== true) {
  patches.push({
    key: 'preferHttpFetcher',
    originalValue: next.preferHttpFetcher,
    effectiveValue: true,
    source: 'round_0_fast',
    reason: 'Fast profile forces HTTP fetcher for speed',
  });
}
next.preferHttpFetcher = true;
```

#### Round Override Validation
```javascript
import { deriveRoundOverridableSet } from '../shared/settingsRegistryDerivations.js';
const ROUND_OVERRIDABLE = deriveRoundOverridableSet(RUNTIME_SETTINGS_REGISTRY);

// At the end of buildRoundConfig:
for (const patch of patches) {
  if (!ROUND_OVERRIDABLE.has(patch.key)) {
    throw new Error(`Round override touched non-overridable key: ${patch.key}`);
  }
}
```

#### Complete Override Inventory (from audit)

**Round 0 (Fast Profile) — ~20 overrides:**
- preferHttpFetcher → true
- autoScrollEnabled → false
- autoScrollPasses → 0
- postLoadWaitMs → min(current, 0)
- pageGotoTimeoutMs → min(current, 12000)
- pageNetworkIdleTimeoutMs → min(current, 1500)
- endpointSignalLimit → min(current, 24)
- endpointSuggestionLimit → min(current, 8)
- endpointNetworkScanLimit → min(current, 400)
- hypothesisAutoFollowupRounds → 0
- hypothesisFollowupUrlsPerRound → min(current, 8)
- maxRunSeconds → min(current, 180)
- maxUrlsPerProduct → min(current, 12)
- maxCandidateUrls → min(current, 20)
- maxPagesPerDomain → min(current, 2)
- discoveryMaxQueries → min(current, 4)
- discoveryMaxDiscovered → min(current, 60)
- perHostMinDelayMs → min(current, 150)

**Round 2+ (Thorough Profile) — ~25 overrides:**
- autoScrollEnabled → true
- autoScrollPasses → max(current, 3)
- autoScrollDelayMs → max(current, 1200)
- pageGotoTimeoutMs → max(current, 45000)
- pageNetworkIdleTimeoutMs → max(current, 15000)
- postLoadWaitMs → max(current, 10000)
- maxJsonBytes → max(current, 6000000)
- maxRunSeconds → max(current, 3600)
- preferHttpFetcher → false
- maxNetworkResponsesPerPage → max(current, 2500)
- maxGraphqlReplays → max(current, 20)
- maxHypothesisItems → max(current, 120)
- hypothesisAutoFollowupRounds → max(current, 2)
- hypothesisFollowupUrlsPerRound → max(current, 24)
- maxUrlsPerProduct → max(current, 220)
- maxCandidateUrls → max(current, 280)
- maxPagesPerDomain → max(current, 8)
- endpointNetworkScanLimit → max(current, 1800)
- endpointSignalLimit → max(current, 120)
- endpointSuggestionLimit → max(current, 36)
- discoveryEnabled → true
- fetchCandidateSources → true
- discoveryMaxQueries → max(current, 24)
- discoveryMaxDiscovered → max(current, 300)

**Effort-Based Boosts (round > 0 with contract effort):**
- discoveryMaxQueries += queryBoost
- maxUrlsPerProduct += urlBoost
- maxCandidateUrls += candidateBoost

**Discovery Toggle (based on missingRequired/Expected counts):**
- discoveryEnabled → true/false
- fetchCandidateSources → true/false
- searchEngines → provider or ''

### File: `src/runner/runUntilComplete.js`

Update to consume new return shape:
```javascript
// BEFORE
const roundConfig = buildRoundConfig(baseConfig, roundContext);

// AFTER
const { config: roundConfig, patches } = buildRoundConfig(baseConfig, roundContext);
// Log patches to run events
if (patches.length > 0) {
  emitEvent({ type: 'round_config_overrides', round, patches });
}
```

### New File: `src/runner/roundOverrideAudit.js`

```javascript
/**
 * Format round override patches into a human-readable summary.
 * Used by run summary builder and RuntimeOps UI.
 */
export function formatRoundOverrideReport(patches) {
  return patches.map(p =>
    `${p.key}: ${p.originalValue} → ${p.effectiveValue} (${p.reason})`
  ).join('\n');
}

/**
 * Summarize patches by source category.
 */
export function summarizePatches(patches) {
  const bySource = {};
  for (const p of patches) {
    bySource[p.source] = (bySource[p.source] || 0) + 1;
  }
  return bySource;
}
```

---

## Sub-Plan 8B: Propagation Consumer Verification

### `src/pipeline/seams/initializeIndexingResume.js`
- Reads: indexingResumeMode, indexingResumeMaxAgeHours, indexingResumeSeedLimit, indexingResumePersistLimit
- Verify: These come from effective config, not raw env
- These are NOT round-overridable — they should be stable across rounds

### `src/features/indexing/orchestration/bootstrap/runFetchSchedulerDrain.js`
- Reads: fetchSchedulerInternalsMap (defaultDelayMs, defaultConcurrency, retryWaitMs)
- Verify: Does NOT read fetchSchedulerFallbackWaitMs (dead knob)
- Verify: Reads from config object, not process.env

### `src/features/indexing/search/searchProviders.js`
- Reads: searchEngines, searxngBaseUrl, searxngMinQueryIntervalMs
- Verify: searchEngines is round-overridable (changes per round)
- Verify: Uses normalized value from config

### `src/features/indexing/search/searchGoogle.js`
- Reads: googleSearchTimeoutMs, googleSearchMinQueryIntervalMs, googleSearchMaxRetries, etc.
- Verify: All from config, not env

---

## Test File to Create

### `test/contracts/roundOverrideTransparency.test.js`

```
Test Group A: Patch Recording
- A1: Round 0 produces exactly 18 patches for fast profile
- A2: Round 2 produces exactly 25 patches for thorough profile
- A3: Each patch has key, originalValue, effectiveValue, source, reason
- A4: No patch has undefined originalValue or effectiveValue
- A5: Patches include reason strings (not empty)

Test Group B: Override Bounds
- B1: No override touches a key without roundOverridable: true in registry
- B2: Adding an override for a non-overridable key throws

Test Group C: Return Shape
- C1: buildRoundConfig returns { config, patches }
- C2: config object has same shape as before
- C3: patches is an array

Test Group D: Specific Overrides
- D1: Round 0 sets preferHttpFetcher to true
- D2: Round 0 caps maxRunSeconds to 180
- D3: Round 2 sets pageGotoTimeoutMs to at least 45000
- D4: Effort boost increases discoveryMaxQueries proportionally
- D5: Discovery disabled when missingRequired=0 and missingExpected=0
```

---

## Execution Steps

1. Add roundOverridable to registry entries (Plan 03)
2. Modify buildRoundConfig to return { config, patches }
3. Update runUntilComplete.js to consume new shape
4. Create roundOverrideAudit.js
5. Write round override transparency tests
6. Verify propagation consumers (read-only check)
7. Run full test suite

## Estimated Effort
~4 hours. buildRoundConfig refactor is mechanical but needs careful patch recording.

## Rollback
Revert buildRoundConfig return shape. Update runUntilComplete.js to destructure old way.
