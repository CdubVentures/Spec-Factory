# Tab 2 — Search Profile

**Purpose:** How are we going to search? (queries, targets, constraints)

## Primary goal
Make query intent + coverage obvious: **Do we have the right queries for the needs?**

---

## Story Mode layout

### A) Coverage overview (top)
- Need → # queries planned (mini matrix)
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
- Per-alias “disable” toggle (prevent noisy searches)

### D) Query detail drawer
- Query rationale (plain English)
- Needs covered (chips)
- “Edit query” inline + re-run (admin)

---

## Debug Mode (advanced)
- Planner prompt/response (if planner used)
- Raw structured SearchProfile artifact
- Effective runtime knobs (model, max tokens, temp)

---

## Key visuals
- Needs × Queries coverage heatmap
- Query lifecycle timeline: planned → sent → received

---

## Empty/error states
- No queries: “SearchProfile not generated” + regenerate/import template
- Too many queries: redundancy hints + merge suggestions

---

## Actions
- Approve / disable queries
- Add query manually
- Export SearchProfile
