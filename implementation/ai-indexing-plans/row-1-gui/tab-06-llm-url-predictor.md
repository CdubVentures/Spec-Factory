# Tab 6 — LLM URL Predictor

**Purpose:** Which URLs should we fetch next?

## Primary goal
Show selection logic: **these URLs maximize NeedSet coverage under budget/risk.**

---

## Story Mode layout

### A) Budget & constraints header
- Remaining fetch slots
- Host pacing status
- Known blocks/cooldowns affecting choices

### B) URL candidates table
Columns:
- URL + domain
- Predicted payoff (0–100)
- Predicted target coverage (chips)
- Risk flags: paywall / forum / blocked-risk / low-quality
- Decision: Fetch now / Later / Skip
- Why (1 line)

### C) Coverage heatmap (URLs × target fields)
- Cell intensity = predicted evidence strength
- Makes tradeoffs instantly visible

### D) Fetch timeline / waterfall (once executed)
- queued → started → completed/failed
- per-URL duration + error codes

---

## Debug Mode (advanced)
- Prompt viewer + Raw JSON toggle
- Model params + token/cost
- Cached predictor hits / heuristics

---

## Key visuals
- Payoff bars
- Coverage heatmap
- Waterfall timeline

---

## Empty/error states
- No candidates: explain “nothing viable” + link back to Search Results
- Budget exhausted: show next-best URLs queued for later

---

## Actions
- Force fetch URL
- Defer domain
- Export URL selection
