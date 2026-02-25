# Plan — Domain Hint Resolver, Source Policy, and Query Selection QA (v2.1)

Owner: Chris (Spec Factory)

Last updated: 2026-02-25

This is an updated, execution-ready revision of v2 that incorporates the small deltas needed to make the upgrade plan and v2 land cleanly together.

---

## 0) Executive summary

### Problem
`domain_hints[]` are currently treated as usable only when they “look like a host” (contain `.`). That silently discards valid intent tokens (`retailer`, `lab`, `database`, `manufacturer`, etc.), causing:
- Domain panel stuck at `0/Y` despite valid intent.
- Low host coverage and low pass diversity.
- Weak/accidental top-1 query selection.

### Fix (v2.1)
Introduce a deterministic compile step:

**DomainHintResolver → EffectiveHostPlan**

…and use it as the sole input to query building + scoring + UI explain.

### What makes it production-grade
v2.1 adds the handful of details that prevent regressions in the real world:
- **Public-suffix aware host parsing** (URL-safe; not “contains dot”).
- **SourceRegistry/HostPolicy as schema-validated config**, including `connector_only` + `blocked_in_search`.
- **HostHealth gating as a constraint ladder** (default downrank, not hard exclude).
- **ProviderCapabilities + QueryCompiler** (compile operators per provider; golden tests).
- **Core vs Deep acceptance gates** so broader source coverage doesn’t reduce accuracy.

---

## 1) Goals

1) **No silent drops**: every hint token becomes either:
   - resolved host(s), or
   - tier expansion, or
   - content intent(s), or
   - explicit unresolved warning.

2) **Explainable top-1 query**: show why #1 beat #2/#3 with score breakdown + constraints.

3) **Pass diversity by construction**: enforce host-group budgets in Pass 1.

4) **Operationally safe**: versioned registry, CI schema validation, feature flags, reversible rollout.

---

## 2) Definitions

### 2.1 Typed hint classes
- **Explicit host hints**: tokens that parse as host/domain.
- **Tier tokens**: expand to hosts via SourceRegistry (`manufacturer`, `retailer`, `lab`, `database`, `community`).
- **Content intents**: query modifiers (`manual`, `support`, `pdf`, `datasheet`, `drivers`, `firmware`, `specsheet`).
- **Unresolved tokens**: everything else (must surface in UI/logs).

### 2.2 EffectiveHostPlan (truth object)
Every run produces:
- `manufacturer_hosts[]`
- `tier_hosts: { retailer[], lab[], database[], community[] }`
- `explicit_hosts[]`
- `content_intents[]`
- `unresolved_tokens[]`
- `host_groups[]`
- `host_health: {host -> {budget_score, cooldown_s, blocked_reason}}`
- `provider_caps: {provider -> {...}}`
- `policy: {host -> {authority, content_types, doc_kinds, preferred_paths, max_qps, requires_js, connector_only, blocked_in_search}}`
- `explain[]`

---

## 3) SourceRegistry + HostPolicy (required)

Replace flat tier lists with a schema-validated registry.

Minimum per-host metadata:
- `tier` and `authority`
- `content_types` and `doc_kinds`
- `preferred_paths`
- `max_qps` / pacing hints
- `requires_js` / `known_issues`
- `field_affinity[]`
- **new:** `connector_only` (never plan site queries)
- **new:** `blocked_in_search` (avoid planning search)

Why the new flags matter:
- Some sites are best handled by connectors.
- Some sites are index-hostile; planning `site:` queries wastes passes.

---

## 4) ProviderCapabilities + QueryCompiler (required)

Different providers support different operators. Add a compiler layer:

Input: logical query plan (`terms`, `host_pref`, `hard_site`, `filetype_pref`, `time_pref`, etc.)

Output: provider-specific query strings and modifiers.

Requirements:
- Compile `site:` only when supported.
- Compile `filetype:` only when supported.
- Fall back to lexical “soft constraints” when not.
- Add golden tests per provider to prevent drift.

---

## 5) HostHealth gating (constraint ladder)

Host health comes from Phase 04/05 signals.

Default ladder:
1) **Downrank** hosts in cooldown.
2) **Exclude** only when blocked or severe cooldown.
3) **Relax** constraints automatically if yield is low/zero.

This prevents v2 from choosing “best host” that is not runnable.

---

## 6) Core vs Deep acceptance gates (required for accuracy)

As v2 increases source diversity, gate correctness:

- **Core fact fields**: require Tier1/Tier2 or corroboration.
- **Deep fields**: allow methodology-grade lab sources, but store as claims.
- **Community**: never overwrite core facts.

---

## 7) Implementation steps (minimal critical path)

### Step 0 — Ship SourceRegistry schema + loader
- `config/source_registry.(json|yaml)`
- schema validation in CI

### Step 1 — DomainHintResolver → EffectiveHostPlan
- public-suffix aware host parsing
- tier expansion
- intent mapping
- unresolved token surfacing

### Step 2 — ProviderCapabilities + QueryCompiler
- capability map
- compiler
- golden tests

### Step 3 — QueryBuilder integration
- replace dot-only host logic
- generate logical query plans from host groups + intents
- compile per provider

### Step 4 — Scoring updates
Add penalties/boosts:
- NeedSet coverage
- field affinity alignment
- diversity penalty
- HostHealth penalty
- operator risk penalty

### Step 5 — UI panels
- unresolved token list
- host plan explain
- host health snapshot
- query journey score breakdown

---

## 8) What must land alongside v2.1

**Must ship together:**
- SourceRegistry + HostPolicy
- ProviderCapabilities + QueryCompiler
- Core vs Deep acceptance gates

**Strongly recommended:**
- QueryIndex + URLIndex (to measure and compound)

---


---

## 8.1 Optional: Local downloaded AI helpers (Qwen3 / Qwen2.5-VL)

This system can benefit from **downloaded/local models** as *bounded helpers* (never as the final authority). They should be **feature-flagged**, **schema-constrained**, and **unable to introduce new hosts**.

### Where local AI helps (high value)
**Text helper (Qwen3 class):**
- **Unresolved token classification**: map tokens like `retailer`, `lab`, `database`, `community` (or odd brand abbreviations) into **typed hints** *only if they match allowed enums*.
- **Query diversification**: generate *safe* synonyms for doc intents (`manual`, `datasheet`, `firmware`) without inventing hosts.
- **Large-doc routing**: given a long PDF/manual, propose which pages/chunks likely contain target fields (routes to the parser/LLM that does the evidence-locked extraction).

**Vision helper (Qwen2.5-VL class):**
- **Phase 08 screenshot QA/triage**: identify whether a captured page likely contains a spec table / “Tech Specs” section / model number region, so you can prioritize parsing passes.
- **Variant disambiguation (bounded)**: only to *suggest* “this looks like color/edition X” when the page explicitly shows it; never publish a variant claim without text evidence.

### Hard guardrails (non-negotiable)
- Output **must** validate against JSON schema (no freeform).
- Local AI **may not** add hosts, domains, or URLs. It can only:
  - classify tokens into existing enums
  - propose query terms (no `site:` targets)
  - propose doc chunk/page ranges
- Local AI outputs are **advisory**; the pipeline must still enforce:
  - Core vs Deep gates
  - Evidence quotes + anchors
  - Deterministic scoring as the floor

### Integration points (minimal)
- `DomainHintResolver`: optional step after parsing tokens → `local_classify_hint_tokens()` → emits `hint_suggestions[]` (bounded, schema).
- `QueryCompiler`: optional `local_expand_intents()` → emits `safe_synonyms[]` per intent (bounded).
- `EvidencePack`: optional `local_vlm_tag_screenshot()` → emits `tags[]` used for prioritization only.

### Feature flags / env
- `LOCAL_AI_ENABLED=false`
- `LOCAL_TEXT_MODEL=qwen3` (example)
- `LOCAL_VLM_MODEL=qwen2.5-vl` (example)
- `LOCAL_AI_ENDPOINT=http://127.0.0.1:8000`
- `LOCAL_AI_TIMEOUT_MS=8000`
- `LOCAL_AI_MAX_CONCURRENT=1` (queue it; don’t stall crawlers)

### Acceptance checks
- With `LOCAL_AI_ENABLED=false`, behavior is identical to v2.1 baseline.
- With enabled, all suggestions are schema-valid, bounded, and explainable (log reasons + source token).
- No new hosts/domains appear due to local AI output.


## 9) Acceptance criteria

- Tier tokens always resolve to hosts or appear in `unresolved_tokens`.
- Domain panel never stuck at `0/Y` when registry has matching tiers.
- Pass 1 always includes N distinct host_groups.
- Query journey explains top-1 selection.
- HostHealth prevents selecting blocked/cooldown hosts (or logs explicit override reason).
- Core facts cannot be overwritten by community sources.

---

## Appendix — SourceRegistry example

```json
{
  "host": "support.example.com",
  "tier": "manufacturer",
  "authority": 0.95,
  "content_types": ["html", "pdf"],
  "doc_kinds": ["support", "manual", "drivers"],
  "preferred_paths": ["/support", "/downloads", "/manuals"],
  "max_qps": 0.2,
  "requires_js": false,
  "known_issues": [],
  "field_affinity": ["drivers", "firmware", "manual_url"],
  "connector_only": false,
  "blocked_in_search": false
}
```
