# Publisher Evidence Gate Fix

**Status:** Scoped, pre-implementation
**Date:** 2026-04-17
**Driver:** CEF audit revealed the publisher never enforces Field Studio's `evidence.min_evidence_refs` — the gate is declared in `field_rules.json` but not implemented anywhere on the publish rail.

---

## Problem Statement

Field Studio declares per-field evidence contracts (`field_rules.json`):

```json
"colors": {
  "evidence": {
    "min_evidence_refs": 1,
    "required": true,
    "tier_preference": ["tier1", "tier2", "tier3"]
  }
}
```

`src/engine/runtimeGate.js` enforces these rules for the **indexing rail**. The **publisher rail** (`publishCandidate.js`, `publishManualOverride.js`) does not. Every field published via `submitCandidate → publishCandidate` ships without its Field Studio evidence contract being checked.

CEF makes the leak maximally visible: CEF runs capture URLs in `color_edition.json.runs[n].response.discovery_log.urls_checked` but those URLs never reach:
- the `field_candidates` row (schema has no evidence column)
- `product.json.candidates[]` entries
- the publisher (no gate to receive them anyway)

---

## Evidence Model

**Universal shape** — same across CEF + RDF (PIF is the exception; see below):

```js
evidence_refs: [
  { url: string, tier: string, confidence: number /* 0-100 */ }
]
```

Three fields. Publisher counts length (`min_evidence_refs`). `tier` is pure classification metadata (no publisher gate). `confidence` is **per-source** (0-100) — how sure the LLM is that THIS URL supports the claim. Distinct from candidate-level confidence (an overall run judgment).

**Shared module** — `src/core/finder/evidencePromptFragment.js` owns the full contract:
- `evidenceRefSchema` / `evidenceRefsSchema` (Zod)
- `EVIDENCE_PROMPT_FRAGMENT` / `buildEvidencePromptBlock({minEvidenceRefs})`

Feature schemas `import { evidenceRefsSchema }` directly — no local redefinition.

**PIF is the exception.** Product-image finder does NOT carry `evidence_refs`. Reasons:
- The image URL itself IS the evidence — no separate citation adds information
- Images don't flow through the publisher candidate gate (they write directly to `product_images.json` + SQL summary)
- `min_evidence_refs` has no field-rule entry for images, and no publisher rail to enforce against

So CEF and RDF prompts include the shared evidence fragment + schema field; PIF prompts + schema deliberately do not.

**Tier vocabulary** (6 values; taught via prompt, stored as string):
- `tier1` — manufacturer / brand-official / press release
- `tier2` — professional testing lab / review lab
- `tier3` — authorized retailer / marketplace
- `tier4` — community / forum / blog / user-generated
- `tier5` — specs aggregator / product database
- `other` — anything that doesn't fit the above

No runtime enum enforcement on tier string. The LLM classifies; we collect; we don't gate on tier.

---

## Storage (Dual-State, CLAUDE.md-aligned)

Two surfaces, one canonical source:

1. **JSON SSOT** — `product.json.candidates[n].metadata.evidence_refs`. Durable memory; survives DB deletion.
2. **SQL projection** — `field_candidate_evidence` relational table. Indexed read-side for tier/confidence queries.

```sql
CREATE TABLE field_candidate_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES field_candidates(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  tier TEXT NOT NULL,
  confidence REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_fce_candidate ON field_candidate_evidence(candidate_id);
CREATE INDEX idx_fce_tier ON field_candidate_evidence(tier);
```

Design notes:
- `candidate_id` FK only — variant scope derives through the candidate row's `variant_id`. One owner of variant linkage; no denormalization.
- `ON DELETE CASCADE` with `PRAGMA foreign_keys = ON` — evidence disappears automatically on candidate delete.
- **Rebuild contract** — `rebuildFieldCandidatesFromJson` re-populates both tables from JSON metadata. Deleted-DB rebuild is fully supported.
- **Projection points** — `submitCandidate` and `candidateReseed` both call `specDb.replaceFieldCandidateEvidence(candidateId, refs)` for atomic clear-then-insert on re-submit / rebuild.

Query example — tier1 evidence for a variant:
```sql
SELECT e.url, e.confidence
FROM field_candidate_evidence e
JOIN field_candidates c ON e.candidate_id = c.id
WHERE c.variant_id = ? AND e.tier = 'tier1'
ORDER BY e.confidence DESC;
```

---

## Knob Retirement

Both of these retire alongside the new evidence model:

- **`evidence.required`** — tautological. Anything submitted to the candidate gate was produced by some source. `required: true` ≡ `min_evidence_refs >= 1`.
- **`evidence.tier_preference`** — publisher doesn't enforce tier. Tier is metadata on each URL, never a gate input. Dead knob.

**Retirement scope:**
- Remove both fields from all `category_authority/*/\_generated/field_rules.json` via the compile step
- Remove any Field Studio GUI surfaces (per user confirmation neither exists in the frontend today)
- Delete code that reads `rule.evidence.required` or `rule.evidence.tier_preference`
- Single observable-behavior test per retirement (per CLAUDE.md: observable behavior, not source-text search)

---

## Phase 1 — Evidence Storage

### 1.1 `field_candidates` schema

Add column:
```sql
evidence_refs_json TEXT DEFAULT '[]'
```

Rebuild contract: column defaults to `'[]'` for legacy rows so rebuild-from-JSON remains idempotent.

### 1.2 `variants` table schema

Add column:
```sql
evidence_refs_json TEXT DEFAULT '[]'
```

**Why on variants too:** A variant is the durable entity; its evidence is the durable proof of existence. Variants survive candidate pruning (`stripVariantFromCandidates` removes CEF-source candidates on variant delete). Evidence must persist with the entity, not just the candidate.

### 1.3 `product.json.candidates[]` entry shape

Mirror SQL — each entry gets optional `evidence_refs: [{url, tier}, ...]`. Absent = empty array.

### 1.4 `color_edition.json` per-run variant evidence

Current: `discovery_log.urls_checked` is run-level, not per-variant.

New shape (additive):

```json
{
  "run_number": 3,
  "response": {
    "colors": [...],
    "editions": {...},
    "discovery_log": { "urls_checked": [...], "queries_run": [...] }
  },
  "variants_evidence": [
    { "variant_key": "color:black",       "evidence_refs": [{"url":"...","tier":"tier1"}] },
    { "variant_key": "edition:launch-ed", "evidence_refs": [{"url":"...","tier":"tier2"}] }
  ]
}
```

`discovery_log.urls_checked` stays as run-level feed-forward dedupe (prevents LLM from re-visiting). `variants_evidence` is the authoritative per-variant attribution.

---

## Phase 2 — Data Capture (LLM Contract)

### 2.1 Shared prompt fragment

**Location:** `src/core/finder/evidencePromptFragment.js` (finder-level shared module, no feature-to-feature dependency)

**Export:**
```js
export const EVIDENCE_PROMPT_FRAGMENT = `
For each discovery, cite at least {{MIN_EVIDENCE_REFS}} URL(s) as evidence_refs[]:
- url: the source URL
- tier: classify the source using one of these codes (no ranking, just classification):
    tier1 = manufacturer / brand-official / press release
    tier2 = professional testing lab / review lab
    tier3 = authorized retailer / marketplace
    tier4 = community / forum / blog / user-generated
    tier5 = specs aggregator / product database
    other = anything that doesn't fit the above
`;
```

**Single template variable:** `{{MIN_EVIDENCE_REFS}}`, resolved from `fieldRules[fieldKey].evidence.min_evidence_refs` at prompt-build time. Defaults to `1` if unset.

Each feature's prompt template gets a new `{{EVIDENCE_REQUIREMENTS}}` placeholder; the value is pre-rendered via the shared fragment.

### 2.2 Per-feature prompt + schema changes

**CEF** — `colorEditionLlmAdapter.js`, `colorEditionSchema.js`
- Inject `{{EVIDENCE_REQUIREMENTS}}` into `CEF_DISCOVERY_DEFAULT_TEMPLATE` AND the identity-check template
- Add `evidence_refs: z.array(z.object({url: z.string(), tier: z.string()})).default([])` per-color and per-edition in `colorEditionFinderResponseSchema`
- Route refs → `variant_registry[n].evidence_refs` → `variants_evidence[]` in color_edition.json → `sourceMeta.evidence_refs` for submitCandidate

**PIF** — **SKIPPED ENTIRELY (the exception).**
- No `{{EVIDENCE_REQUIREMENTS}}` in `PIF_VIEW_DEFAULT_TEMPLATE` or `PIF_HERO_DEFAULT_TEMPLATE`
- No `evidence_refs` field in `productImageFinderResponseSchema`
- `productImageLlmAdapter.js` deliberately does NOT import `buildEvidencePromptBlock` — marked with an explicit WHY comment
- Rationale: image URL is self-evident; PIF doesn't submit to the publisher; no `min_evidence_refs` rule exists for images

**RDF** — `releaseDateLlmAdapter.js` only (for this slice)
- Replace hardcoded evidence block (lines 75–89 in adapter) with `{{EVIDENCE_REQUIREMENTS}}` placeholder so tier vocabulary matches CEF/PIF
- Keep `releaseDateSchema.js` unchanged — RDF's existing `evidence[]` shape stays authoritative for this slice
- Schema simplification (`evidence` → `evidence_refs`, shape cleanup) deferred to a dedicated RDF cleanup slice; cascades through orchestrator + store + candidate routing and isn't blocking

**Eval / QA judge (`src/features/review/domain/qaJudge.js`)** — explicitly out of scope. Eval judges candidates; it doesn't discover values from URLs. No evidence citation applies.

### 2.3 CEF evidence flow through `colorEditionFinder.js`

After Gate 1 (palette) and Gate 2 (identity) pass:

- Each color/edition's `evidence_refs` → attached to corresponding entry in `merged.variant_registry[n].evidence_refs`
- Aggregated into `sourceMeta.evidence_refs` for each `submitCandidate` call
- Per-variant refs written to `color_edition.json.runs[n].variants_evidence[]`
- `specDb.variants.syncFromRegistry` propagates per-variant evidence into the variants table

---

## Phase 3 — Publisher Enforcement

### 3.1 `publishCandidate.js` — add evidence gate

Insert after confidence gate (currently at `publishCandidate.js:80-84`), before manual-override lock:

```js
const minRefs = fieldRule?.evidence?.min_evidence_refs ?? 0;
if (minRefs > 0) {
  const linkedSoFar = buildLinkedCandidates(specDb, productId, fieldKey, value, fieldRule);
  const totalRefs = linkedSoFar.reduce(
    (acc, row) => acc + (Array.isArray(row.evidence_refs) ? row.evidence_refs.length : 0),
    0
  );
  if (totalRefs < minRefs) {
    persistPublishResult(specDb, productId, fieldKey, serializeValue(value), {
      status: 'insufficient_evidence',
      required: minRefs,
      actual: totalRefs,
    });
    return { status: 'insufficient_evidence', required: minRefs, actual: totalRefs };
  }
}
```

Counting rule: sum of `evidence_refs.length` across all candidates linked to the same published value. A single candidate with enough refs OR multiple candidates collectively meeting the count both satisfy the gate.

### 3.2 Retire `evidence.required` + `evidence.tier_preference`

- Strip both fields from Field Studio compile output (`_generated/field_rules.json`)
- Remove any frontend surfaces if they exist
- Delete code branches that read either field
- One observable-behavior test per retirement confirming the field no longer participates in any gate decision

---

## CEF Open Question (Resolved)

**Question:** If evidence check fails for a CEF candidate, does `variants.syncFromRegistry + derivePublishedFromVariants` still run and write Write #2?

**Resolution: Per-variant gating (Option B).**

CEF enforces evidence **before variant registry update** (a new Gate 3), per-variant:

```
Gate 1 (palette)    → reject entire run if any color is unknown
Gate 2 (identity)   → reject entire run if mappings are invalid
Gate 3 (evidence)   → filter out colors/editions whose evidence_refs.length < min_evidence_refs
                     (partial pass: valid ones proceed, failing ones are dropped and logged)
```

**Why per-variant, not all-or-nothing:**
- Evidence is an entity-level concern — each color IS a distinct claim needing proof
- Dropping one uncited color shouldn't punish the other 4 that had citations
- Failing entries surface in the run log for reviewer visibility

**Consequence for the variants path:**
- Variants table receives only entries that passed Gate 3 — failed entries never enter the registry
- `derivePublishedFromVariants` can only publish what's in variants — so Write #2 naturally reflects the gate outcome
- A variant that failed Gate 3 is NOT created; no silent publish via the variant backdoor

### Interaction with the "skip publishCandidate for variant-backed fields" fix

These two fixes are complementary and both should ship:

| Fix | Scope |
|---|---|
| Publisher skips `publishCandidate` for `ownership: 'variant_registry'` fields | Eliminates Write #1 ghost write; only `derivePublishedFromVariants` writes `fields.colors/editions` |
| CEF Gate 3 enforces evidence per-variant | Prevents unevidenced variants from entering the registry |
| Publisher evidence gate | Enforces `min_evidence_refs` for NON-variant-backed fields (pipeline, manual override) |

CEF's colors/editions never reach the publisher evidence gate (publisher skips for variant-backed fields). CEF enforces its own evidence at Gate 3. Other fields (weight, sensor specs, etc.) go through publisher and hit the evidence gate there.

Same rule (`min_evidence_refs`), enforced at the appropriate boundary for each data model.

---

## Staging Order

Ship in small independent slices, each additive or flag-gated so prior behavior is preserved until the next slice flips the gate.

1. **Prompt injection + response schemas** — add shared fragment + `{{EVIDENCE_REQUIREMENTS}}` to CEF, PIF, RDF templates; extend response schemas to accept `evidence_refs` (default empty). LLM starts returning evidence; responses log to existing `runs[n].response` JSON for inspection. No storage routing, no gate.
2. **Schema additions (SQL)** — add `evidence_refs_json` columns to `field_candidates` and `variants`. Default empty array. No behavior change.
3. **Data routing** — wire evidence from LLM response → candidate row, variants row, `color_edition.json.variants_evidence[]`. Rebuild paths updated.
4. **Publisher evidence gate** — enforcement in `publishCandidate.js`, behind a config flag defaulting to warn-only. Flip to enforce after backfill is verified on at least one product.
5. **CEF Gate 3** — per-variant evidence filter before variant registry update.
6. **Retirement** — strip `evidence.required` + `evidence.tier_preference`, delete code, observable-behavior tests.

---

## Testing Strategy

### New contract tests (per CLAUDE.md: behavior over implementation)

- `publishCandidate rejects value whose linked candidates carry fewer than min_evidence_refs evidence entries`
- `publishCandidate succeeds when linked candidates collectively meet min_evidence_refs`
- `publishCandidate ignores evidence gate when field rule's min_evidence_refs is 0 or unset`
- CEF: `LLM response with no evidence_refs for a color drops that color from variant registry`
- CEF: `evidence_refs flow from LLM → candidate row → variants row → color_edition.json variants_evidence`
- CEF: `variant delete preserves evidence_refs on remaining variants`
- PIF: `productImageFinderResponseSchema does NOT add evidence_refs to image records (PIF exception)`
- RDF: `evidence_refs shape matches {url, tier} (migrated from legacy shape)`
- Shared fragment: `EVIDENCE_PROMPT_FRAGMENT substitutes MIN_EVIDENCE_REFS correctly`
- Retirement: `evidence.required no longer participates in any gate decision`
- Retirement: `evidence.tier_preference no longer participates in any gate decision`

### Characterization tests before refactor

- Golden-master: current `color_edition.json` shape (lock existing runs)
- Golden-master: current `field_candidates` row shape (lock `metadata_json`)
- Golden-master: current publisher response shapes for `publishCandidate`
- Golden-master: current RDF `evidence[]` shape (before rename to evidence_refs)

### Rebuild contract

- `field_candidates` with `evidence_refs_json` must rebuild from `product.json.candidates[].evidence_refs`
- `variants` with `evidence_refs_json` must rebuild from `color_edition.json.runs[n].variants_evidence[]`
- Legacy rows without evidence data rebuild with empty arrays — no crash, no backfill required at rebuild time

---

## Out of Scope (for this doc)

- **Skipping `publishCandidate` for variant-backed fields** — tracked separately. Complementary but independent plan.
- **Eval / QA judge prompts** — judges don't discover values from URLs. No evidence citation applies.
- **Manual override evidence shape** — not defined here. Review workflow owns this.
- **GUI changes to the candidate drawer** — rendering evidence refs, filtering by evidence status, surfacing Gate 3 drops. Separate UI plan.
- **Backfill of legacy runs** with evidence — one-time audit/script, not part of the code path.
- **Pipeline (indexing) evidence shape** — the indexing rail has snippet-based provenance via runtimeGate. Aligning shape with finders is a separate question.

---

## Open Items (non-blocking)

- Decide whether to enforce URL *uniqueness* per candidate (prevent the LLM from padding with duplicate URLs). Lean: yes, at Gate 3 in CEF; no, at publisher (too expensive to dedupe globally).
- Decide logging format for Gate 3 drops in the CEF run record — structured `rejections[]` with `reason_code: 'insufficient_evidence'` is the natural fit.
