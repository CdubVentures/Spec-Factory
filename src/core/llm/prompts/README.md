# src/core/llm/prompts/

## Purpose

Universal prompt fragments shared across finders (CEF, PIF, RDF, and future) and the category-audit report. Single source of truth for text that every finder sends to the LLM: identity warning, siblings exclusion, evidence contract, value confidence rubric, discovery history header, and pure field-rule to prompt-text renderers.

## Public API (The Contract)

- `buildIdentityWarning({ familyModelCount, ambiguityLevel, brand, model, siblingModels, fieldDomainNoun }) -> string` - returns a leading-newline block with tier-appropriate warning plus optional siblings line. Empty means no warning.
- `buildSiblingsLine({ siblingModels, fieldDomainNoun }) -> string` - returns empty string when no siblings, otherwise the rendered exclusion line.
- `buildCategoryContext(category) -> string` - returns the globally editable category identity line (`categoryContext`) or empty when category is missing.
- `GLOBAL_PROMPTS` - registry object keyed by `GLOBAL_PROMPT_KEYS`. Each entry: `{ label, description, appliesTo, variables, defaultTemplate }`.
- `GLOBAL_PROMPT_KEYS` - frozen list of all valid keys.
- `resolveGlobalPrompt(key) -> string` - returns user override from `globalPromptStore` if non-empty, else `defaultTemplate`. Throws on unknown key.
- `getGlobalPrompts()` - returns current in-memory snapshot (frozen).
- `setGlobalPromptsSnapshot(value)` - replaces in-memory snapshot. Test fixture; production code should go through `writeGlobalPromptsPatch`.
- `loadGlobalPromptsSync({ settingsRoot?, appDb? })` - when `appDb` is supplied, reads the `global-prompts` settings section first; if SQL is empty, rebuilds it from JSON and populates the snapshot. Without `appDb`, reads JSON as first-boot fallback.
- `writeGlobalPromptsPatch(patch, { settingsRoot?, appDb? })` - when `appDb` is supplied, writes SQL first, mirrors JSON, then refreshes the snapshot. `null` removes the key. Without `appDb`, writes JSON fallback only.
- `GLOBAL_PROMPTS_FILENAME` - `'global-prompts.json'`.
- `GLOBAL_PROMPTS_SETTINGS_SECTION` - `'global-prompts'`.
- `fieldRuleRenderers.js` - pure field-rule to prompt-text renderers, consumed by key finder, category-audit, and future indexing-audit:
  - `buildPrimaryKeyHeaderBlock(fieldKey, fieldRule) -> string`
  - `buildFieldGuidanceBlock(fieldRule) -> string`
  - `buildFieldContractBlock(fieldRule) -> string`
  - `buildSearchHintsBlock(fieldRule, { searchHintsInjectionEnabled }) -> string`
  - `buildCrossFieldConstraintsBlock(fieldRule) -> string`
  - `joinList(list, max?)` / `resolveDisplayName(fieldKey, fieldRule)`

Prompt renderer notes:
- `resolvePromptFieldRule(fieldRule, { knownValues?, fieldKey? })` enriches sourced enum contracts (`data_lists.*`) with compiled `knownValues.enums` before rendering.
- `buildCrossFieldConstraintsBlock(fieldRule)` renders both `cross_field_constraints` and compiled `constraints` DSL strings such as `sensor_date <= release_date`.

## Dependencies

Allowed: `src/core/llm/resolvePromptTemplate.js`, `src/core/config/runtimeArtifactRoots.js`, injected appDb settings interface, `node:fs`, `node:path`.

Forbidden: direct imports from `src/features/` and anything from `src/core/finder/`. Finder fragments import from here, not the reverse.

## Domain Invariants

- Adding a new global prompt means editing exactly one file: `globalPromptRegistry.js`. Consumers resolve by key.
- `resolveGlobalPrompt` falls back to `defaultTemplate` on empty or whitespace-only overrides. Never returns an empty string from the registry itself.
- Identity warning is a function of `familyModelCount` and `ambiguityLevel` only. `familyModelCount <= 1` always forces the easy tier regardless of `ambiguityLevel`.
- `fieldDomainNoun` is the only per-finder variable. CEF passes `"colors or editions"`, PIF passes `"product images"`, RDF passes `"release dates"`. Future finders pick their own noun.
- appDb settings section `global-prompts` is the runtime source when appDb exists; `.workspace/global/global-prompts.json` is the durable mirror/rebuild fallback. Defaults live in code and travel with the repo.
