# Tab 7 — LLM SERP Triage & Rerank

**Purpose:** How did we interpret SERPs and pick winners?

## Primary goal
Explain per query: **kept these, dropped those, and here’s why.**

---

## Story Mode layout

### A) Query accordion
Per query:
- Provider SERP snapshot summary
- Dedupe summary
- Final kept URLs count

### B) Triage lanes (Kanban)
Columns:
- KEEP
- MAYBE
- DROP

Each card:
- Title + domain
- Snippet highlight
- Score bar
- 1-line rationale

### C) Score decomposition toggle
Per result stacked bars:
- base relevance
- tier boost
- identity match
- penalties (stale/low-quality/etc.)

### D) SERP detail drawer
- Full snippet + highlights
- Explanation
- Links to Search Results and URL Predictor entries

---

## Debug Mode (advanced)
- Full reranker breakdown fields
- Safety flags raw
- LLM prompt/response (if used)

---

## Key visuals
- Kanban lanes
- Stacked score bars
- Per-query score histogram (optional)

---

## Empty/error states
- SERP missing: provider failure explanation + retry
- All dropped: summarize “why everything dropped” + suggested query edits

---

## Actions
- Override keep/drop
- Promote MAYBE → KEEP
- Export triage decisions
