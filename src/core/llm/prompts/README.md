# src/core/llm/prompts/

## Purpose

Universal prompt fragments shared across finders (CEF, PIF, RDF, and future). Single source of truth for text that every finder sends to the LLM: identity warning, siblings exclusion, evidence contract, value confidence rubric, discovery history header.

## Public API (The Contract)

- `buildIdentityWarning({ familyModelCount, ambiguityLevel, brand, model, siblingModels, fieldDomainNoun }) → string` — returns a leading-newline block with tier-appropriate warning + optional siblings line. Empty = no warning (never emitted for unknown products).
- `buildSiblingsLine({ siblingModels, fieldDomainNoun }) → string` — returns empty string when no siblings, otherwise the rendered exclusion line.
- `GLOBAL_PROMPTS` — registry object keyed by `GLOBAL_PROMPT_KEYS`. Each entry: `{ label, description, appliesTo, variables, defaultTemplate }`.
- `GLOBAL_PROMPT_KEYS` — frozen list of all valid keys.
- `resolveGlobalPrompt(key) → string` — returns user override (from `globalPromptStore`) if non-empty, else `defaultTemplate`. Throws on unknown key.
- `getGlobalPrompts()` — returns current in-memory snapshot (frozen).
- `setGlobalPromptsSnapshot(value)` — replaces in-memory snapshot (test fixture; production code should go through `writeGlobalPromptsPatch`).
- `loadGlobalPromptsSync({ settingsRoot? })` — reads from disk, populates snapshot. Called at bootstrap.
- `writeGlobalPromptsPatch(patch, { settingsRoot? })` — merges patch into disk file + refreshes snapshot. `null` value in patch removes the key.
- `GLOBAL_PROMPTS_FILENAME` — `'global-prompts.json'`.

## Dependencies

Allowed: `src/core/llm/resolvePromptTemplate.js`, `src/core/config/runtimeArtifactRoots.js`, `node:fs`, `node:path`. Forbidden: anything from `src/features/`, anything from `src/core/finder/` (fragments flow the other way — finder fragments import from here, not vice versa).

## Domain Invariants

- Adding a new global prompt means editing exactly one file: `globalPromptRegistry.js`. Consumers resolve by key.
- `resolveGlobalPrompt` falls back to `defaultTemplate` on empty/whitespace-only overrides. Never returns an empty string from the registry itself.
- Identity warning is a function of `familyModelCount` and `ambiguityLevel` only. `familyModelCount ≤ 1` always forces the "easy" tier regardless of `ambiguityLevel`.
- `fieldDomainNoun` is the only per-finder variable. CEF passes `"colors or editions"`, PIF passes `"product images"`, RDF passes `"release dates"`. Future finders pick their own noun.
- Disk storage (`.workspace/global/global-prompts.json`) holds only user overrides — defaults live in code and travel with the repo.
