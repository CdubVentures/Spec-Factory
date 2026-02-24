# Tab 1 — NeedSet

**Purpose:** What do we still need, and why?

## Primary goal
Let a brand-new user understand **what the system is trying to prove next** and **what is blocking progress**.

---

## Story Mode layout

### A) Run header (sticky)
- Run ID, Product (brand/model), Current stage  
- Elapsed time, Cost/Tokens (total + this stage)  
- Status chip: Not started / Running / Done / Warning / Blocked

### B) NeedSet summary (hero card)
- Progress: `satisfied_needs / total_needs`
- Top 5 unsatisfied needs (ranked by NeedScore)
- Warnings: `identity_conflict`, `stale_evidence`, `missing_official_source`

### C) Needs table (main)
Columns:
- Need (friendly name)
- NeedScore (0–100) + bar
- Why needed (1–2 sentences)
- Identity state chip: locked / provisional / conflict / unlocked
- Freshness badge (age + decay indicator)
- Evidence count
- Next action: Search / Fetch / Ask user / Defer

### D) Need detail drawer (click any row)
- **Why this score?** (stacked breakdown)
  - base importance
  - identity bonus/penalty
  - freshness decay
  - conflict penalties
- **What would satisfy this need?**
  - required evidence types (official spec page, PDF datasheet, etc.)
  - minimum citation requirements
- Jump links: *Show planned queries* → Search Profile, *Show sources* → Search Results

### E) “What changed since last round?” (diff)
- NeedScore deltas with short explanations
- Newly satisfied needs + the evidence that satisfied them

---

## Debug Mode (advanced)
- Raw NeedSet artifact
- Full lineage timestamps + score component math
- Event log slice filtered to NeedSet events

---

## Key visuals
- Progress ring (satisfied vs remaining)
- Score bars in table
- Optional need-group view: Identity / Specs / Media / Lifecycle

---

## Empty/error states
- NeedSet empty: “No needs generated” + likely causes + re-run
- identity_conflict banner: “resolve identity first” + shortcut

---

## Actions
- Pin a need as **must-satisfy**
- Add manual need (admin)
- Export NeedSet snapshot (audit)
