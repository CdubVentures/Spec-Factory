# Tab 5 — Search Results

**Purpose:** What did providers return, and what did we keep vs drop?

## Primary goal
Make retrieval legible: **total results → dedupe → keep/drop → why**.

---

## Story Mode layout

### A) Results overview bar
- Providers used
- Total results
- Unique URLs after dedupe
- Domains count
- Filtered count (safety/quality)

### B) Results table (DevTools-style)
Columns (customizable):
- Rank
- Title
- Snippet (truncated)
- Domain
- Provider
- Relevance score (bar)
- Decision: Keep / Maybe / Drop
- Reason (1 line)

### C) Score scatter plot (optional)
- X: rank (or provider rank)
- Y: relevance score
- Click dot → highlights table row

### D) Result detail drawer
- Full title/snippet with highlights
- URL open button
- Score breakdown (stacked bar)
- Dedupe group members
- “Why kept/dropped” explanation

---

## Debug Mode (advanced)
- Raw provider payloads (per provider)
- Canonicalization/dedupe keys
- Safety filter rationale objects

---

## Key visuals
- Score bars
- Scatter plot
- Dedupe accordion

---

## Empty/error states
- No results: show query list + suggestions (relax constraints, add synonyms)
- Provider failure: per-provider error cards
- Provider unavailable fallback: emit plan-only events with provider plan so Search Results still updates and run auto-stop can complete after Search Results loads.

---

## Actions
- Override decision (keep/drop)
- Add URL to “force fetch”
- Export results snapshot
