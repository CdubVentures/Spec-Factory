# Tab 2 - LLM Brand Resolver

**Purpose:** Who/what entity is this?

## Primary goal
Show the chosen canonical brand/manufacturer, confidence, and alternativesâ€”so a newbie never wonders â€œare we on the right thing?â€

---

## Story Mode layout

### A) Canonical brand card (hero)
- Canonical name
- Confidence gauge
- Suggested official domains (if any)
- â€œWhy we believe thisâ€ (2â€“4 bullets)

### B) Candidate brands table
Columns:
- Candidate name
- Confidence (bar)
- Supporting evidence (links to Search Results)
- Disambiguation note (1â€“2 lines)

### C) Disambiguation helper (only if confidence < threshold)
- â€œWeâ€™re not sureâ€ banner
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
- No candidates: show â€œbrand resolution skippedâ€ + likely reason
- Conflicting evidence: conflict banner + require user decision

---

## Actions
- Lock canonical brand
- Add alias
- Export resolver decision
