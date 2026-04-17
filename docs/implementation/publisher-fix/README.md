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

Evidence shape is source-type-specific; count is universal.

| Source type | Evidence shape |
|---|---|
| **Feature** (CEF, future finders) | URLs the LLM cited/consulted per discovered value |
| **Pipeline** (indexing/snippet extraction) | Saved artifacts: screenshot paths, PDF paths, JSON metadata, snippet refs with tier |
| **Review / manual override** | Reviewer identity + reason (+ optional proof URL) |

All stored as a tagged-object array. Publisher counts length; each source type owns its shape.

Tagged-object examples:
```js
{ type: 'url', value: 'https://razer.com/viper-v3' }                // feature
{ type: 'artifact', path: '.workspace/runs/.../screen.png' }         // pipeline
{ type: 'snippet', snippet_id: 'abc123', url: '...', tier: 'tier1' } // pipeline
{ type: 'manual', reviewer: 'chris', reason: '...', proof_url? }     // override
```

---

## Knob Retirement: `evidence.required`

**Retire.** Anything submitted to the candidate gate was produced by some source; `required: true` is tautological. The real knob is `min_evidence_refs` (how many proofs must be attached). `required: true` ≡ `min_evidence_refs >= 1`.

Retirement scope:
- Remove `evidence.required` from all `category_authority/*/\_generated/field_rules.json` via the compile step
- Remove the toggle from Field Studio GUI surfaces (it does not exist in the frontend today per user)
- Delete any code that reads `rule.evidence.required`
- One-time retirement test (per CLAUDE.md rule: observable behavior, not source-text search)

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

Mirror SQL — each entry gets optional `evidence_refs: [...]`. Absent = empty array.

### 1.4 `color_edition.json` per-run variant evidence

Current: `discovery_log.urls_checked` is run-level, not per-variant.

New shape (additive, behind variants array):

```json
{
  "run_number": 3,
  "response": {
    "colors": [...],
    "editions": {...},
    "discovery_log": { "urls_checked": [...], "queries_run": [...] }
  },
  "variants_evidence": [
    { "variant_key": "color:black",      "evidence_refs": [{"type":"url","value":"..."}] },
    { "variant_key": "edition:launch-ed", "evidence_refs": [{"type":"url","value":"..."}] }
  ]
}
```

`discovery_log.urls_checked` stays as the run-level feed-forward dedupe (prevents LLM from re-visiting). `variants_evidence` is the authoritative per-variant attribution used to rebuild variants from JSON.

---

## Phase 2 — CEF Data Capture (LLM Contract)

### 2.1 Prompt change (`colorEditionLlmAdapter.js`)

Inject `min_evidence_refs` into the prompt, resolved from `fieldRules.colors.evidence.min_evidence_refs` at prompt-build time. If unset or zero, no requirement is stated.

Prompt text (draft):
> For every color and every edition you identify, you MUST cite at least {min_evidence_refs} official URLs that verify the color/edition exists on THIS specific product. Attach URLs per-discovery under `evidence_refs`. Do not share a URL across discoveries unless it genuinely documents each one.

### 2.2 Response schema (`colorEditionSchema.js`)

Current:
```js
colors: z.array(z.string())
editions: z.record(z.object({ colors: z.array(z.string()), ... }))
```

Extended:
```js
colors: z.array(z.object({
  value: z.string(),
  evidence_refs: z.array(z.object({
    type: z.literal('url'),
    value: z.string().url()
  })).default([])
}))
editions: z.record(z.object({
  colors: z.array(z.string()),
  evidence_refs: z.array(z.object({
    type: z.literal('url'),
    value: z.string().url()
  })).default([]),
  // ... existing fields
}))
```

### 2.3 Evidence flow through `colorEditionFinder.js`

After Gate 1 (palette) and Gate 2 (identity) pass, evidence routing:

- Each color/edition's `evidence_refs` → attached to the corresponding entry in `merged.variant_registry[n].evidence_refs`
- Aggregated into `sourceMeta.evidence_refs` for each `submitCandidate` call (so the candidate row carries the union of all colors'/editions' refs for that run)
- Per-variant refs written to `color_edition.json.runs[n].variants_evidence[]`
- `specDb.variants.syncFromRegistry` propagates per-variant evidence into the variants table

---

## Phase 3 — Publisher Enforcement

### 3.1 `publishCandidate.js` — add evidence gate

Insert after confidence gate (currently at `publishCandidate.js:80-84`), before manual-override lock:

```js
const ruleEvidence = fieldRule?.evidence || {};
const minRefs = typeof ruleEvidence.min_evidence_refs === 'number'
  ? ruleEvidence.min_evidence_refs
  : 0;

if (minRefs > 0) {
  // Count refs across this candidate + previously-linked candidates for the same value
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

Counting rule: sum of `evidence_refs.length` across all candidates linked to the same published value (so a single candidate with enough refs OR multiple candidates collectively meeting the count both satisfy the gate).

### 3.2 `tier_preference` (Phase 3b follow-up)

Tier classification of URLs is not implemented in this phase. When it lands:
- Publisher counts tier-matching refs first
- Falls back to lower-tier refs with a `tier_downgrade` tag on the write
- No change to the count rule

Out of scope for first merge.

### 3.3 Retire `evidence.required`

- Strip `required` from Field Studio compile output (`_generated/field_rules.json`)
- Remove any remaining frontend surfaces
- Delete code branches that read `rule.evidence.required`
- Single observable-behavior test confirming the field no longer participates in any gate decision

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
- `derivePublishedFromVariants` can only publish what's in variants — so Write #2 naturally reflects the gate outcome without additional plumbing
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

Ship in small independent slices, each with its own plan + tests. Each slice is additive or flag-gated so prior behavior is preserved until the next slice flips the gate.

1. **Schema additions** — add `evidence_refs_json` columns to `field_candidates` and `variants`. Default empty array. No behavior change.
2. **CEF data capture** — LLM prompt + schema + `colorEditionFinder.js` routing. Evidence is captured, stored, rebuilt. **No gate yet.** User verifies runs attach evidence correctly.
3. **Publisher evidence gate** — enforcement in `publishCandidate.js`, behind a config flag defaulting to warn-only. Flip to enforce after backfill is verified on at least one product.
4. **CEF Gate 3** — per-variant evidence filter before variant registry update.
5. **Retirement of `evidence.required`** — strip from field rules, delete code, one observable-behavior test.

---

## Testing Strategy

### New contract tests (per CLAUDE.md: behavior over implementation)

- `publishCandidate rejects value whose linked candidates carry fewer than min_evidence_refs evidence entries`
- `publishCandidate succeeds when linked candidates collectively meet min_evidence_refs`
- `publishCandidate ignores evidence gate when field rule's min_evidence_refs is 0 or unset`
- CEF: `LLM response with no evidence_refs for a color drops that color from variant registry`
- CEF: `evidence_refs flow from LLM → candidate row → variants row → color_edition.json variants_evidence`
- CEF: `variant delete preserves evidence_refs on remaining variants`
- Retirement: `evidence.required no longer participates in any gate decision` (observable; single test)

### Characterization tests before refactor

- Golden-master: current `color_edition.json` shape (lock existing runs)
- Golden-master: current `field_candidates` row shape (lock `metadata_json`)
- Golden-master: current publisher response shapes for `publishCandidate`

### Rebuild contract

- `field_candidates` with `evidence_refs_json` must rebuild from `product.json.candidates[].evidence_refs`
- `variants` with `evidence_refs_json` must rebuild from `color_edition.json.runs[n].variants_evidence[]`
- Legacy rows without evidence data rebuild with empty arrays — no crash, no backfill required at rebuild time

---

## Out of Scope (for this doc)

- **Skipping `publishCandidate` for variant-backed fields** — tracked separately. Complementary but independent plan. Referenced above for interaction.
- **Tier classification of URLs** (`tier1`/`tier2`/`tier3` mapping) — Phase 3b follow-up; requires a domain classification service not yet built.
- **Manual override evidence shape** — not defined here. Review workflow owns this.
- **GUI changes to the candidate drawer** — rendering evidence refs, filtering by evidence status, surfacing Gate 3 drops. Separate UI plan.
- **Backfill of legacy runs** with evidence — a one-time audit/script, not part of the code path. Out of scope.

---

## Open Items (non-blocking)

- Decide per-source-type evidence shape contract at the schema level (vs freeform JSON). Current plan is freeform — source type tags own their shape. Tighter validation can be layered in later.
- Decide whether the evidence gate should also enforce URL *uniqueness* per candidate (prevent the LLM from padding with duplicate URLs). Lean: yes, at Gate 3 in CEF; no, at publisher (too expensive to dedupe globally).
- Decide logging format for Gate 3 drops in the CEF run record — structured `rejections[]` with `reason_code: 'insufficient_evidence'` is the natural fit.
