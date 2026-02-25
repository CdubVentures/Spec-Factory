# Tab 3 - Search Profile

**Purpose:** How are we going to search? (queries, targets, constraints)

## Primary goal
Make query intent + coverage obvious: **Do we have the right queries for the needs?**

---

## Story Mode layout

### A) Coverage overview (top)
- Need â†’ # queries planned (mini matrix)
- Highlight gaps: needs with 0 queries
- Coverage score summary

### B) Query plan table (main)
Columns:
- Query (rendered text)
- Target fields (chips)
- Strategy tag: Deterministic / LLM-planned
- Constraints: site:, language, region, time window
- Status: planned / sent / results received
- Results count (once returned)

### C) Entities & aliases panel
- Canonical brand/model + aliases
- Alias source: deterministic / learned / LLM
- Per-alias â€œdisableâ€ toggle (prevent noisy searches)

### D) Query detail drawer
- Query rationale (plain English)
- Needs covered (chips)
- â€œEdit queryâ€ inline + re-run (admin)

---

## Debug Mode (advanced)
- Planner prompt/response (if planner used)
- Raw structured SearchProfile artifact
- Effective runtime knobs (model, max tokens, temp)

---

## Key visuals
- Needs Ã— Queries coverage heatmap
- Query lifecycle timeline: planned â†’ sent â†’ received

---

## Empty/error states
- No queries: â€œSearchProfile not generatedâ€ + regenerate/import template
- Too many queries: redundancy hints + merge suggestions

---

## Actions
- Approve / disable queries
- Add query manually
- Export SearchProfile

---

## IDX gate implementation note
- Runtime + UI handling for prefetch IDX gates is documented in:
  - `implementation/ai-indexing-plans/row-1-gui/idx-gates-runbook.md`
