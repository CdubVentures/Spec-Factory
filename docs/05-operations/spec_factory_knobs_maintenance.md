# Spec Factory — Knobs Maintenance Log

## Active Knob Counts (as of 2026-03-16)

| Section | Count |
|---------|-------|
| `convergence` (consensus/retrieval weights) | 15 |
| `runtime` (pipeline behavior) | 336 |
| `storage` (output destination) | 7 |
| `ui` (autosave/studio toggles) | 6 |
| **Total settingsDefaults** | **364** |
| Config manifest (env key registry) | 475 |

## Retired Knobs

### Wave 1: Dead Convergence Loop + Legacy Knobs (removed 2026-03-15)

The 13-phase convergence loop was removed and replaced by the collect-then-refine architecture. Convergence loop knobs, needset cap knobs, lane concurrency knobs, and legacy fallback model knobs were retired because they controlled loop behavior that no longer exists.

Removed convergence keys include: `convergenceMaxRounds`, `convergenceNoProgressLimit`, `convergenceMaxLowQualityRounds`, `convergenceLowQualityConfidence`, `convergenceMaxDispatchQueries`, `convergenceMaxTargetFields`, `needsetEvidenceDecayDays`, `needsetEvidenceDecayFloor`, `needsetCapIdentityLocked`, `needsetCapIdentityProvisional`, `needsetCapIdentityConflict`, `needsetCapIdentityUnlocked`, `serpTriageEnabled`, `laneConcurrencySearch`, `laneConcurrencyFetch`, `laneConcurrencyParse`, `laneConcurrencyLlm`, `profile`, and others.

### Wave 2: Aggressive / Uber Mode Knobs (16 keys, removed 2026-03-16)

Aggressive mode (12 knobs) and uber-aggressive mode (4 knobs) were escalation ladders for the old convergence pipeline. Both modes were already hardcoded `true` at runtime — the toggles were cosmetic. This removal bakes the always-on behavior as permanent defaults and eliminates the "mode" concept entirely.

**Aggressive (12 removed):**
- `aggressiveModeEnabled` (bool, was `true`)
- `aggressiveConfidenceThreshold` (float, baked at `0.85`)
- `aggressiveMaxSearchQueries` (int, baked at `5`)
- `aggressiveEvidenceAuditEnabled` (bool, baked at `true`)
- `aggressiveEvidenceAuditBatchSize` (int, baked at `60`)
- `aggressiveMaxTimePerProductMs` (int, baked at `600000`)
- `aggressiveThoroughFromRound` (int, baked at `2`)
- `aggressiveRound1MaxUrls` (int, baked at `90`)
- `aggressiveRound1MaxCandidateUrls` (int, baked at `120`)
- `aggressiveLlmTargetMaxFields` (int, baked at `110`)
- `aggressiveLlmDiscoveryPasses` (int, baked at `3`)
- `aggressiveLlmDiscoveryQueryCap` (int, baked at `24`)

**Uber (4 removed):**
- `uberAggressiveEnabled` (bool, was `true`)
- `uberMaxRounds` (int, baked at `8` — original default was `6`, but `Math.max(8, ...)` always resolved to `8`)
- `uberMaxUrlsPerProduct` (int, baked at `25`)
- `uberMaxUrlsPerDomain` (int, baked at `6`)

**Also removed from manifest but not from settingsDefaults (pre-existing dead entries):**
- `AGGRESSIVE_LLM_MAX_CALLS_PER_ROUND` (was in miscGroup only)
- `AGGRESSIVE_LLM_MAX_CALLS_PER_PRODUCT_TOTAL` (was in miscGroup only)

**Rationale:** IndexLab Master Rollout Plan, Section 7 — "What Was Removed".

### Surfaces cleaned per wave

| Surface | Wave 1 | Wave 2 (16 knobs) |
|---------|--------|--------------------|
| `settingsDefaults.js` | convergence + runtime keys | 16 keys |
| `config.js` | parseEnv + validation | 16 parseEnv + 1 validation rule + 1 env fallback |
| `settingsKeyMap.js` | map entries | 16 map entries (9 int, 1 float, 3 bool) |
| `runtimeSettingsRoutePut.js` | range entries | 16 range entries (9 int, 1 float, 3 bool) |
| `manifest/miscGroup.js` | manifest entries | 18 manifest entries (14 aggressive + 4 uber) |
| GUI state (7 TS files) | keys per file | 16 keys per file |
| GUI section TSX | section removal | full aggressive group removed |
| GUI registry | step options | aggressive sub-step + 4 labels removed |
| Backend behavioral (7 files) | loop removal | mode checks → unconditional, config reads → constants |
| Passthrough/wiring (8 files) | param removal | `uberAggressiveMode` removed from all signatures |
| Tests | fixture updates | 10+ test files, disabled-mode tests removed |
