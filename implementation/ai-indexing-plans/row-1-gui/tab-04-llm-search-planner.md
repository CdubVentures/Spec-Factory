# Tab 4 — LLM Search Planner

**Purpose:** What’s the step-by-step plan to satisfy the NeedSet?

## Primary goal
Explain the plan like a storyboard: **first X, then Y, until stop condition Z.**

---

## Story Mode layout

### A) Plan storyboard (vertical stepper)
Each step card:
- Step goal (plain English)
- Inputs used (needs + brand decision)
- Queries generated/selected (links to Search Profile)
- Expected outputs (target fields)
- Stop condition

### B) “Why this plan?” summary
- 5–8 bullets: rationale, constraints, best-expected sources

### C) Plan diff (multi-round)
- Added/removed steps
- Query changes + why
- Budget changes (fetch/LLM)

### D) Step detail drawer
- Step constraints (domains, filters)
- “Done” signals
- Risk notes (paywall likelihood, low-quality SERPs)

---

## Debug Mode (advanced)
- Full prompt + structured plan output
- Alternative plans (if any)
- Token/cost/timing

---

## Key visuals
- Stepper with status markers
- Mini dependency view: steps → needs

---

## Empty/error states
- Planner disabled: show deterministic fallback plan
- Planner failure: last error + retry with smaller context

---

## Actions
- Approve plan
- Force skip step
- Export plan to MD/JSON
