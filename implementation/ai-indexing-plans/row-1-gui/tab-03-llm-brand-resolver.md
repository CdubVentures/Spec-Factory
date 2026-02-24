# Tab 3 — LLM Brand Resolver

**Purpose:** Who/what entity is this?

## Primary goal
Show the chosen canonical brand/manufacturer, confidence, and alternatives—so a newbie never wonders “are we on the right thing?”

---

## Story Mode layout

### A) Canonical brand card (hero)
- Canonical name
- Confidence gauge
- Suggested official domains (if any)
- “Why we believe this” (2–4 bullets)

### B) Candidate brands table
Columns:
- Candidate name
- Confidence (bar)
- Supporting evidence (links to Search Results)
- Disambiguation note (1–2 lines)

### C) Disambiguation helper (only if confidence < threshold)
- “We’re not sure” banner
- One recommended user question (multiple-choice)
- Impact preview: queries/domains that would change

### D) Candidate evidence drawer
- Evidence snippets with highlights
- Source URLs list
- Actions: Promote to canonical / Add alias / Lock for run

---

## Debug Mode (advanced)
- Prompt viewer (System / Context / Task / Output format)
- Response viewer (rendered + Raw JSON toggle)
- Token/cost/timing breakdown

---

## Key visuals
- Confidence gauge
- Candidate comparison bars

---

## Empty/error states
- No candidates: show “brand resolution skipped” + likely reason
- Conflicting evidence: conflict banner + require user decision

---

## Actions
- Lock canonical brand
- Add alias
- Export resolver decision
