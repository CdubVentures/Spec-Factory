# Tab 8 — LLM Domain (Domain Health & Selection)

**Purpose:** Which domains are safe/healthy to use, and what’s blocked/cooling down?

## Primary goal
Make host-level constraints visible: **which domains can we rely on, and what risks exist?**

---

## Story Mode layout

### A) Domain health dashboard (table)
Columns:
- Domain
- Role: official / secondary / unknown
- Host budget score
- Cooldown remaining
- Recent success rate
- Avg latency
- Notes (403 last run, slow, etc.)

### B) Domain → Needs dependency map
- Domains (rows) × needs/fields (cols)
- Highlights what’s at risk if a domain is blocked

### C) Recommended actions panel
- Alternate domains to try
- Query adjustments (site: changes)
- “Use cached evidence” suggestions (if allowed)
- “Enqueue repair” (if supported)

### D) Domain detail drawer
- Recent outcomes (last N)
- Cooldown reason codes
- Suggested pacing changes

---

## Debug Mode (advanced)
- Raw checklist payload
- Repair queue events + dedupe keys
- Worker/queue linkage

---

## Key visuals
- Health score bars
- Cooldown timer chip
- Dependency heatmap

---

## Empty/error states
- No domains yet: “no results” + link back to Search Results
- Heavy cooldown cluster: recommended alternates

---

## Actions
- Pin domain as preferred
- Blocklist domain
- Export domain health snapshot
