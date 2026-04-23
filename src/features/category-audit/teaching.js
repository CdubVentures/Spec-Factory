/**
 * Part 1 — the teaching. Static prose explaining the keyFinder pipeline end
 * to end, so an auditor reading the report understands the full context before
 * they evaluate per-key data blocks.
 *
 * Each section is { id, title, body, tables? } where:
 *   - id:     DOM-safe anchor
 *   - title:  heading text
 *   - body:   markdown-ish string (paragraphs, "- " bullets, `code`)
 *   - tables: optional structured rows (headers, rows)
 *
 * Keep sections short, information-dense, and opinionated. The auditor uses
 * these to form a mental model; skim-readable beats comprehensive.
 */

import { KEY_FINDER_VARIABLES } from '../key/keyFinderPromptContract.js';

const AUDITOR_TASK_BODY = `
You are auditing every field in this category's keyFinder pipeline. Your deliverable is a Change Report that a human owner can apply directly into Field Studio. Be specific: exact strings to paste are infinitely more useful than "add better guidance here".

**Read order:** Part 1 (the system) → Part 1a (Audit standard, the bar) → Part 4 (enum inventory — biggest lever) → Part 5 (component DB) → Part 6 (groups) → Part 7 (per-key detail).

**Your response leads with the top 5–10 must-fix items** (the "Highest-risk corrections" block below). Then field-by-field patches. Then category-level asks. Then flags/open questions.

---

**Return format (markdown — mirror this shape exactly):**

\`\`\`markdown
# <Category> Key Finder Audit — Change Report

## Verdict

<one-paragraph overall opinion: which cells hold up, which don't, what's the single highest-leverage change>

## Coverage

- Fields audited: <N>
- Verdict distribution: Keep <n> · Minor revise <n> · Major revise <n> · Schema decision <n>
- Enums reviewed: <N> (of which <n> patternless / <n> suspicious)
- Component DBs reviewed: <N>

## Audit standard

<restate, in your own words, the standard you applied from Part 1a — so the reader can judge your judgment>

## References spot-checked

- <live manufacturer / standards / lab URLs you verified the highest-risk technical claims against>

## Highest-risk corrections

<5–10 bullets, most impactful first. Each: one field or category-level item, one sentence on what's wrong + what to do. These are the items the human owner would apply tonight if they only had 15 minutes.>

## Field-by-field patches

### <Group display name> (N keys)

#### \`<field_key>\` — <Keep | Minor revise | Major revise | Schema decision>

- **Type / shape:** <type> · <scalar|list>
- **- Current guidance**
  > <verbatim current \`reasoning_note\`, or "(empty)">
- **+ Proposed guidance**
  > <new text — paste-ready. Use "(empty — keep)" if existing is fine and no guidance is needed.>
- **Enum:** <proposed delta — add / remove / rename — with rationale, or "keep">
  - **Pattern:** <proposed regex-like shape (e.g. \`<N> zone (rgb|led)\`), or "no pattern recommended">
- **Contract:** <changes to type/shape/unit/rounding/list_rules/range/variance_policy, or "none">
- **Aliases:** <additions, or "none">
- **Search hints:** <domain_hints / query_terms to add, or "none">
- **Cross-field constraints:** <additions or corrections, or "none">
- **Component relation:** <confirm / correct \`component.type\` / \`component.match.property_keys\`>
- **Why:** <one sentence>

(repeat per field, grouped by Part 6's group order)

## Enum cleanup (category-wide)

<per enum with a change proposal: suspicious values to remove, values to rename, pattern to lock in, policy change>

## Component DB additions

<per component type in Part 5: entities missing, properties missing on existing entities, entity-level constraints like \`sensor_date <= release_date\`>

## Group audit (Part 6)

<per group: membership coherence, renames, splits, merges, misgrouped fields>

## Global fragment suggestions

<if any of Part 2's category-level fragments should get a per-category override>

## Flags + open questions

- <schema mismatches, ambiguous fields, reserved-key conflicts, anything you want the human owner to decide>
\`\`\`

---

**What's explicitly in scope:**

1. **Enum discipline is the single biggest lever.** Every non-numeric enum value becomes a filter chip on the consumer site — so value count and pattern consistency directly drive usability. Lead with this in your Highest-risk block.
2. **Pattern before policy.** An enum with a dominant structural signature (≥70% of values conform, per Part 4) is usable even at 20+ values. Freeform enums fail at much lower counts.
3. **Target value counts (Part 1.6):** ≤10 healthy, 11–15 fine, 16–20 tolerable, 21–30 filter fatigue, 30+ broken. Call out where each enum sits now vs where it should sit.
4. **Extraction guidance (\`reasoning_note\`) is the single editable slot per key.** Keep it to Part 1.14's "FOR" scope — visual cues, semantic disambiguation, field-specific gotchas, rebrand rules, "don't confuse with X" anchors. Do NOT duplicate anything already rendered by the template slots in Part 2. If existing guidance duplicates slot content, propose shortening.
5. **Contract changes with consequences stated.** When you propose changing \`type\`/\`shape\`/\`unit\`/\`rounding\`/\`list_rules\`/\`range\`/\`variance_policy\`, explain the extraction + filter-UI consequence (Part 1.4–1.5 language).
6. **Cross-field constraints alias mismatch (one-time flag, not per key).** The keyFinder renderer currently reads \`cross_field_constraints\` but compiled rules store \`constraints\` — flag this at the category level once in your "Flags" section with the list of fields that have unreachable constraints. Do NOT repeat on every field.

**Out of scope — surface, don't decide:**

- Deleting fields outright (human product call).
- Changing which finder owns a reserved key (CEF / RDF / SKF ownership is architectural).
- Editing the 25-slot template itself.

**Quality bar for guidance rewrites:**

- **Paste-ready.** The \`+ Proposed guidance\` blockquote should be the exact string the human will copy into Field Studio. No "consider adding…" meta-text.
- **Specific.** "Extract the official manufacturer MPN for the exact variant; prefer brand SKU over retailer ASIN" beats "be more specific about SKU source".
- **Visual cues name the view — and for subtle calls, teach the judgment.** The Audit standard's "Visual-answerable fields" section grades fields as Tier A (direct), Tier B (subtle), or Tier C (non-visual). For Tier A, one sentence naming the view + feature is enough. For Tier B — hump position, front_flare, grip, form_factor ambidextrous call — write 2–4 sentences that define the visible feature precisely, give threshold or relative-measurement rules, and say when to return \`unk\`. This is where \`reasoning_note\` earns its keep. For Tier C (sensor / dpi / mcu / sensor_date etc.), don't mention views at all; those are spec-sheet extractions.
- **Web search is expected.** You have live internet access. Use it to: calibrate enum values against 3–5 real products before proposing a canonical list; verify that a current industry term still means what you think (technologies get rebranded); and spot-check any technical claim in proposed guidance. Cite the sources you checked under "References spot-checked".
- **Evidence-grounded.** When a claim depends on an external fact (chip lineage, certification tier, firmware format), spot-check a live source and list it under "References spot-checked". Prefer manufacturer docs + standards bodies + instrumented review labs.
- **UNK-safe.** Proposed guidance must never weaken the honest-unk policy. "Default to No" is a smell; "return unk when evidence is absent" is correct.
`.trim();

const AUDIT_STANDARD_BODY = `
This is the bar you apply when judging every cell in Part 7. Read it, then read Part 7. If a rule doesn't clear these bars, propose a change.

**Visual-answerable fields — a spectrum, not a binary. Guidance pays off most in the middle.**

Fields decided from product photography fall on a spectrum. Treat each tier differently when authoring \`+ Proposed guidance\`:

**Tier A — direct visual.** Decidable from a single photo in seconds; the answer is a literal visible feature. Guidance is short: name the view + the feature.
- \`honeycomb_frame\` — top-down shell: holes visible? yes/no.
- \`lighting\` zone count — lit-mode marketing photo: count independently-controllable zones.
- \`shape\` (symmetrical / asymmetrical) — top-down silhouette: mirror along the centerline or not.
- \`side_buttons\` count — left-profile: count buttons on the thumb side.
- \`thumb_rest\` — side profile: is there a dedicated shelf extending below the main shell, or is the grip face continuous with the shell?

**Tier B — subtle visual. Judgment call that NEEDS real guidance.** This is where \`reasoning_note\` earns its keep. The reviewer's job is to write guidance that teaches how to make the subtle call — not just "look at the profile view." Describe the feature precisely, give thresholds or relative measurements, name reference products as calibration anchors when stable, and say when to \`unk\` rather than guess.

- \`hump\` position (back / mid / front) — left-profile. The apex of the top ridge relative to the shell length from front edge to rear edge. Example of better guidance: *"Measure apex along the dorsal ridge from the click-panel front edge to the shell rear edge. Back = apex in rear third (typical ergonomic shape). Mid = apex centered (typical ambidextrous). Front = apex forward of centerline (rare; aggressive claw shape). If the shell has a plateau rather than a point, pick the segment that contains the plateau center. Return unk when no clean profile photo is available."* That's guidance a subtle call can actually rely on.
- \`front_flare\` — profile or 3/4 view. Whether the shell face above the click panels tapers inward, stays parallel, or flares outward. Subtle because many shells have compound curves; guidance should say whether to judge at the tip, mid-shell, or across the full face.
- \`grip\` (palm / claw / fingertip) — biased by shape + length. Rarely decidable from a single photo alone; marketing ergonomics diagrams help but are partial. Guidance should instruct the reviewer to combine length + hump + rear-hump steepness and say when to return unk rather than picking one.
- \`form_factor\` — ambidextrous requires BOTH shape symmetry AND usable buttons on both sides; a symmetrical shell with right-only buttons is still right-handed. Subtle enough to be a common error.

**Tier C — not visual.** Text / spec-sheet / datasheet extraction. Visual guidance adds no value and can mislead — don't include a view instruction. Examples: \`sensor\`, \`sensor_brand\`, \`sensor_type\`, \`polling_rate\`, \`dpi\`, \`mcu\`, \`sensor_date\`, \`connection\`, \`battery_hours\`.

**When writing a \`+ Proposed guidance\` blockquote:**

- Tier A fields → one sentence naming the view + feature. Short.
- Tier B fields → 2–4 sentences: name the view, define the visible feature precisely, give relative/threshold rules so the call is repeatable, name when to return \`unk\`. Optionally reference a stable, non-rebranding anchor product as a calibration example (avoid model-year-specific examples that age out).
- Tier C fields → no view mention. Guidance focuses on source tiering, semantic disambiguation, or rebrand/alias rules.

**Web search is expected.** Reviewers have live internet access. When uncertain about a spec's meaning, an enum value's taxonomy, whether a feature is visually decidable, or what a current industry term refers to (e.g. "flawless sensor", "rapid trigger", "FRL"), search. When proposing enum values or patterns, validate against 3–5 real products so the proposal reflects market vocabulary, not an isolated example. Cite authoritative sources in the "References spot-checked" block for any technical claim in the guidance.

**Enum discipline (the biggest lever):**

- **Value count is a UX metric.** ≤10 healthy, 11–15 fine, 16–20 tolerable, 21–30 filter fatigue, 30+ broken. Any enum in the 21+ range is a high-priority cleanup target.
- **Pattern > free-form.** An open enum with ≥70% values matching a common structural signature (\`<N> zone (rgb|led)\`, \`<maker> <model>\`) scales gracefully; a free-form open enum doesn't.
- **Closed policy when finite.** If the set is small, stable, and every new value should be a human decision, \`policy: closed\` is right.
- **No garbage values.** Single-character entries, numeric-only strings in categorical enums, typos — flag them every time.

**Guidance (\`ai_assist.reasoning_note\`) discipline:**

- Keep guidance only when it prevents a likely extraction error the generic template (Part 2) doesn't already cover.
- Prefer product-specific evidence over brand/model heuristics.
- Never weaken the UNK policy. "Honest unk beats low-confidence guess" (Part 2, UNK_POLICY) wins against any "default to X when unsure" instruction.
- Avoid volatile examples (model-year-specific, single-product anecdotes, component-lineage rebrand trails that will age out).
- No duplication of slots rendered by the generic template: enum values, aliases, unit/rounding, source tiers, evidence contract, confidence rubric, etc. If the concept is already in Part 2, delete it from guidance.

**Contract discipline:**

- \`type\` and \`shape\` match the consumer surface rendering (Part 1.5). A string in a numeric context will render the wrong filter control.
- \`unit\` is storage contract, not label — numeric values stored unit-less, unit applied at render.
- \`rounding\` set whenever precision matters for equality comparison (index-level consistency).
- Numeric lists with meaningful order declare \`list_rules.sort\` (e.g. \`polling_rate\` descending).
- \`range\` set on numerics the LLM would otherwise fantasize about.

**Evidence discipline:**

- Identity-anchoring fields (sensor, switch, form_factor, material) should have \`evidence.min_evidence_refs ≥ 2\` — two independent sources before accepting a value.
- \`tier_preference\` ordered from most authoritative to least (manufacturer → instrumented lab → review → retailer).

**Component discipline:**

- A field that IS a component identity (\`sensor\`, \`switch\`, \`encoder\`) must have \`component.type\` set.
- A field that is a PROPERTY of a component (\`dpi\`, \`ips\`, \`acceleration\`) must appear in the relevant \`component_db/<type>.json\` entity's \`properties\`.
- Missing component DB entries for known real-world entities are a high-priority cleanup.
`.trim();

const PURPOSE_BODY = `
keyFinder is a universal, per-key field extractor. One LLM call per \`(product, field_key)\` pair. The call is tier-routed by each rule's \`difficulty\` knob, submits one candidate per key through the publisher gate, and is **product-scoped** — never per-variant.

Everything the LLM sees is composed from exactly three input sources:
- **The compiled field rule** — contract, enum, aliases, search hints, cross-field constraints, component relation, extraction guidance.
- **Global prompt fragments** — category-overridable text shared across finders: identity warning, evidence contract, source-tier strategy, confidence rubric, unk policy.
- **Runtime context** — product identity (brand/model/variant), already-resolved components + fields, prior-run discovery history.

This report shows the first two sources verbatim. Runtime slots are labeled as placeholders in Part 2. Each per-key block in Part 7 shows exactly what THAT key's contract, guidance, hints, and constraints would inject into the template.
`.trim();

const FIELD_ANATOMY_BODY = `
A compiled field rule is the single source of truth for everything the LLM is told about a field. Every per-key block in Part 7 is derived from it. Learn the shape:

- **Priority triple** — \`required_level\` (mandatory / non_mandatory), \`availability\` (always / sometimes / rare), \`difficulty\` (easy / medium / hard / very_hard). Required level drives scheduling. Availability drives bundling sort. Difficulty drives tier routing.
- **Contract** — \`type\`, \`shape\` (scalar / list), \`unit\`, \`rounding\`, \`list_rules\`, \`range\`. Defines the exact JSON primitive the LLM must emit.
- **Enum** — \`policy\` (closed / open_prefer_known / open), \`values\`, \`source\`. Defines the value vocabulary.
- **Aliases** — source-text synonyms the LLM is told to recognize and normalize before emitting.
- **Variance policy** — how to resolve variant-level disagreements (authoritative / upper_bound / lower_bound / majority_vote).
- **ai_assist.reasoning_note** — extraction guidance (free-form prose). The single editable slot per key that is NOT already covered by the generic template. See Part 1.13 for what this cell is FOR and NOT FOR.
- **search_hints** — \`domain_hints\` (preferred source domains) + \`query_terms\` (search queries). Injected into the prompt so the LLM's web search prioritizes those angles.
- **Cross-field constraints** — operators relating this field to another on the same product (\`lte\`, \`lt\`, \`gte\`, \`gt\`, \`eq\`, \`requires_when_value\`, \`requires_one_of\`).
- **Component relation** — \`component.type\` when this field IS the identity of a component (sensor, switch, encoder) OR is a property of one. Drives the \`PRODUCT_COMPONENTS\` block.
- **Evidence** — \`min_evidence_refs\`, \`tier_preference\`. Controls the evidence contract injected into the prompt.
`.trim();

const CONTRACT_VALUE_BODY = `
The contract is the LLM's behavioral spec. Each field below steers the output in a specific way; when it's blank, the LLM falls back to defaults that are almost always worse than the explicit choice:

- **\`type\`** — emits the right JSON primitive (string / number / boolean / date). Without it, the LLM tends to emit numbers as strings and dates as freeform text.
- **\`shape\`** (scalar / list) — unlocks list-level behavior (dedupe + sort) and informs the array vs singular JSON shape.
- **\`unit\`** — forces unit normalization. "55g" vs "55 oz" vs "0.12 lb" all collapse to the canonical stored unit. Numeric values on the consumer surface are stored WITHOUT the unit; the unit is applied at render time. Contract unit = storage contract, not label.
- **\`rounding\`** — controls decimal precision. Without it, \`128.0000001\` and \`128\` both survive and break equality comparisons in the index.
- **\`list_rules.{dedupe, sort}\`** — how the multi-value filter facets render on the site. Unsorted or duplicated lists show up as UI noise. For numeric lists (e.g. \`polling_rate\`), descending sort is the consumer-side convention (\`[1000, 500, 250, 125]\`).
- **\`range\`** — numeric bounds. The LLM stops guessing \`dpi=1,000,000\`.
- **\`enum.policy\`** — \`closed\` means "reject anything not listed", \`open_prefer_known\` means "accept new values but prefer these", \`open\` means "trust your evidence". Mismatched policy is the most common source of enum pollution.
- **\`enum.values\`** — the vocabulary. Each non-numeric value becomes a user-facing filter toggle on the website. Every extra value is a filter-UI cost. See Part 1.5 and 1.6.
- **\`aliases\`** — source-text synonyms. Without them, the LLM may emit the raw retailer wording instead of the canonical form.
- **\`variance_policy\`** — tells the LLM how to handle disagreements between sources for a product with multiple variants.

**Value format discipline (contract consequences):**

- **Pattern preservation** — values that encode structure (e.g. \`"3 zone (rgb)"\`) are rendered verbatim on the consumer surface. Don't post-process into components — the LLM must emit the pattern whole.
- **Delimiter convention for multi-token values** — combos inside a single value use \`+\` (e.g. \`"white+black"\`). Inter-value separators are the list shape; never embed a raw comma inside a single enum value (commas collide with URL multi-select serialization).
- **Units elided from numeric values** — a \`weight\` of 55 grams is stored as \`55\`, not \`"55g"\`. The contract \`unit\` field carries the label.
- **Descending numeric lists where order is meaningful** — \`polling_rate: [8000, 4000, 2000, 1000]\`, highest first. Declared on the rule via \`list_rules.sort\`.
`.trim();

const FILTER_UI_BODY = `
The contract's \`type\` + \`shape\` directly determines how the field renders as a consumer-facing filter. This is the universal rule — the same contract drives extraction AND the filter UI:

- **string + scalar** — single-select toggle group (one chip per enum value).
- **string + list** — multi-select toggle group (multiple chips selectable; product passes filter if any list item matches any selected chip).
- **number / integer (scalar or list)** — two-handle range slider with min/max computed at load time from the data. Numeric values NEVER become individual toggles, no matter how few unique values exist.
- **date** — two-handle range slider (MM/YYYY – MM/YYYY format).
- **boolean** — yes/no checkbox (with an implicit "unk" bucket when the value is unknown).
- **Pattern-valued strings** — rendered verbatim as chip text (e.g. \`"3 zone (rgb)"\` is shown exactly as that string in the filter). No tokenization, no parsing at render time.

**The show-more threshold + filter fatigue numbers (empirical):**

- The default UI reveals the first **10 chips** per attribute; the rest collapse under a "Show more" fold.
- Usability stays good through **~15 values**.
- **Fatigue starts at 20**. Scanning becomes work.
- **Serious pain at 30+**. Users give up on that filter entirely.
- These numbers turn \`enum.values.length\` into a product-usability metric the contract is directly responsible for.

**Why this matters to the auditor:** the \`lighting\` enum disciplined around \`N zone (rgb)\` / \`N zone (led)\` / \`none\` holds because every concrete value is a filter chip and the pattern keeps the set compact. An enum like \`colors\` with 75 free-form values is filter pollution — every color another chip, scroll past the fold several times.

**When an open enum has values that show similarity, locking in the pattern is the leverage move:**

1. Tighten the known-values list to match a pattern, leaving \`policy: open_prefer_known\` so new values are still accepted but pattern-conformant ones bubble to the top.
2. Document the pattern in \`ai_assist.reasoning_note\` so the LLM emits pattern-conformant values by default.
3. Flip \`policy: closed\` when the set is finite and every new value should be a human curation decision.
`.trim();

const ENUM_POLICY_BODY = `
Three policies govern how the LLM treats the enum values list:

- **\`closed\`** — only listed values are valid. The LLM must pick one; unknown becomes \`unk\` with an \`unknown_reason\`. Use when the set is small, finite, and well-understood (e.g. mouse \`sensor_type\` = optical / laser).
- **\`open_prefer_known\`** — prefer listed values; accept new values if evidence supports them. The compiler marks new values as \`mark_needs_curation=true\` so a human decides whether to promote. Use when the set is stable but evolving.
- **\`open\`** — no canonical list; the LLM reports whatever the evidence says. Use when the space is too large to enumerate (e.g. chip model names) or when enumeration would prematurely constrain extraction.

**Pattern detection is the sweet spot.** Open enums with a dominant structural signature give you extensibility without filter chaos. When ≥70% of known values share a signature (Part 4's pattern detector computes this), the enum is "patterned" — new values that conform get added cleanly, outliers get flagged as candidates for normalization or removal. \`N zone (rgb)\` / \`N zone (led)\` / \`none\` is the canonical example.

**Value-count discipline (refer to Part 1.5 for fatigue numbers):**

- **≤ 10 values:** healthy. Everything visible by default.
- **11–15 values:** fine, first 10 visible + "Show more" fold.
- **16–20 values:** acceptable if values are meaningful; auditor should trim noise.
- **21–30 values:** filter fatigue. Either tighten the known list, induce a pattern so the LLM converges, or split into sub-enums.
- **30+ values:** the enum is out of control. Users will not scroll past the fold. This is the audit's single biggest improvement lever — consolidation here is high-value work.

**Pattern > value count.** An enum with 50 pattern-conformant values (all \`<N> <unit>\`) is easier to reason about than an enum with 20 free-form values.
`.trim();

const TIER_ROUTING_BODY = `
Every key's \`difficulty\` maps to one of five LLM bundles:

- **easy / medium / hard / very_hard** — per-category tier bundles in \`keyFinderTierSettingsJson\`.
- **fallback** — used when a tier is partially configured (empty model → inherit whole fallback bundle).

Each bundle carries: \`model\`, \`useReasoning\`, \`reasoningModel\`, \`thinking\`, \`thinkingEffort\`, \`webSearch\`. A key marked \`difficulty: very_hard\` routes to a stronger model with reasoning + thinking + web search; \`easy\` routes to a smaller cheaper model. Part 3 lists the resolved bundles for the current category so auditors know which model each key actually hits.
`.trim();

const GROUPS_BODY = `
Field groups cluster semantically-related keys into named buckets (General, Sensor & Performance, Switches, Buttons, Connectivity, Construction, Ergonomics, Dimensions, Electronics, etc.). Authored in \`field_groups.json\`; mirrored on each rule as \`rule.group\` and \`rule.ui.group\`. Groups are a first-class organizational primitive — they drive behavior today and will drive more downstream.

**What groups do today:**

- **Bundling policy** — \`groupBundlingOnly=true\` restricts passengers to peers in the primary's group. A sensor-heavy primary will only carry other sensor_performance passengers. Groups with misplaced members waste bundling budget.
- **Co-discovery** — fields that share a spec-sheet section tend to share sources. When the LLM fetches a review page for \`dpi\`, the evidence usually contains \`ips\`, \`acceleration\`, \`polling_rate\`. A well-grouped rule set lets a single search session resolve many members. Bad grouping means the same URL gets fetched multiple times across unrelated calls.
- **Reviewer orientation** — Field Studio groups keys in the sidebar so a human audit walks coherent sections instead of an alphabetic wall. The cognitive load of reviewing 80 keys depends heavily on whether they're grouped well.
- **Identity context** — identity-anchoring fields (sensor, switch, form_factor, material) often cluster into one group so the reviewer can confirm the product's identity-critical spine in a single pass.

**What groups will do downstream (planned):**

- Consumer-facing product detail pages will render specs in group-named sections.
- Filter sidebar grouping will mirror these groups so the filter UI surfaces each cluster of attributes as a collapsible block.
- Per-group completeness scoring will drive publish-gate rules ("sensor group must be 100% complete to publish").
- Review workflows will key off group membership (someone reviews "all Sensor & Performance fields across the category" in one pass).

**What makes a GOOD group:**

- Fields that extract from the same evidence sources (same spec-sheet section, same review table).
- Fields that a filter user would check together (performance cluster, connectivity cluster).
- Fields a reviewer would evaluate back-to-back.
- A member count between ~3 and ~15 — small enough to hold in mind, large enough to justify the bucket.

**What makes a BAD group:**

- A "general" dumping ground with 10+ unrelated fields. Split it.
- Groups that drift into each other (Construction vs Dimensions — if reviewers always look at them together, consider merging).
- A single-field group. Usually the field belongs to an existing neighbor.
- A group named vaguely ("misc", "other", "extras") — if the name doesn't teach, the grouping isn't doing its job.

**Cross-group relationships** are expressed via \`cross_field_constraints\`: when one group's field depends on another group's field (e.g. \`sensor_date <= release_date\` spans sensor_performance and general), the constraint surfaces both as a correctness rule and as a signal that the two groups are coupled — sometimes a sign one should move.
`.trim();

const BUNDLING_BODY = `
keyFinder can issue one LLM call that extracts a primary key PLUS several passenger keys that ride along without adding to the budget:

- **Primary owns the budget.** Only the primary's difficulty determines tier + attempt budget.
- **Passengers ride free.** Each passenger's difficulty adds a raw passenger cost; the packer greedily fills up to \`bundlingPoolPerPrimary[primary.difficulty]\`.
- **Difficulty policy** controls which peers are eligible: \`less_or_equal\` / \`same_only\` / \`any_but_very_hard\` / \`any_but_hard_very_hard\`.
- **Per-tier overlap caps** prevent the same passenger from riding with too many primaries in flight.

Bundling improves call efficiency but it's additive to the work this report exists for. The per-key block in Part 7 describes each key as if it were the primary for a solo call.
`.trim();

const CROSS_FIELD_BODY = `
Cross-field constraints relate one field's value to another on the same product. Supported operators and how they render in the prompt:

- \`lte\` / \`lt\` — "must be ≤ \`target\`" / "must be < \`target\`"
- \`gte\` / \`gt\` — "must be ≥ \`target\`" / "must be > \`target\`"
- \`eq\` — "must equal \`target\`"
- \`requires_when_value\` — "required when \`target\` = \"value\""
- \`requires_one_of\` — "requires one of: [targets…]"

**Known alias mismatch (audit signal):** the compiled rule stores constraints under \`constraints\` as string-DSL entries (e.g. \`"sensor_date <= release_date"\`). The keyFinder renderer reads \`cross_field_constraints\` (object shape). As a result, the cross-field block in live prompts is currently always empty even when constraints are defined. The per-key block in Part 7 shows both — what's defined in the rule AND what the renderer emits — so the auditor can see the gap.
`.trim();

const COMPONENT_RELATIONS_BODY = `
Two kinds of fields interact with components:

- **Component identity (parent)** — e.g. \`sensor\`, \`switch\`, \`encoder\`. The field's value IS the canonical component name. Its compiled rule has \`component.type\` set; the prompt gets a "This key IS the \`type\` component identity." pointer.
- **Component subfield** — e.g. \`dpi\`, \`ips\`, \`acceleration\` belong to the \`sensor\` component. The rule has \`component: null\` but appears as a property in \`component_db/<type>.json\`. When the parent identity is resolved on a product, the subfield values flow into the prompt as \`PRODUCT_COMPONENTS\` so the LLM doesn't re-extract them.

The component inventory in Part 5 lists, per type, the known entities + their properties + which fields are identities vs subfields. Auditing a component-typed field without looking at its component_db row is leaving signal on the table.
`.trim();

const EVIDENCE_BODY = `
Four category-level global fragments teach the LLM the same discipline every finder uses. The report renders each one in full in Part 2 so the auditor can review current wording verbatim:

- **Evidence contract** — required \`supporting_evidence\` + \`evidence_kind\` structure, min_refs, per-rule override.
- **Evidence verification** — the LLM must FETCH each URL live and confirm it renders the claimed content before emitting.
- **Source tier strategy** — universal PRIMARY / INDEPENDENT / RETAILER / COMMUNITY tiering with per-tier trust rules.
- **Value confidence rubric** — 0–100 epistemic confidence scale, tier-independent (when to emit 95 vs 70 vs 40 vs unk).
- **Unk policy** — "honest unk beats low-confidence guess." When to return \`unk\` with a non-empty \`unknown_reason\` instead of paraphrasing.

These are per-category overridable via the Global Prompts editor. An auditor who spots a phrasing problem in, say, the evidence contract can fix it once for the whole category.
`.trim();

const RESERVED_KEYS_BODY = `
Not every field is routed through keyFinder. Some are owned by purpose-built finders and will be rejected before an LLM call if the auditor wires them up anyway:

- **\`colors\` / \`editions\`** — CEF (color/edition finder) owns these; variants + overrides handled separately.
- **\`release_date\`** — RDF (release-date finder) owns this.
- **\`sku\`** — SKF (SKU finder) owns this per-variant.
- **eg_defaults** keys — category-level defaults resolved at compile time; manual/LLM extraction is silenced.

The per-key block in Part 7 flags reserved keys clearly so an auditor does not spend time on a rule whose \`reasoning_note\` will never reach the live keyFinder.
`.trim();

const REASONING_NOTE_BODY = `
The generic template auto-renders ~13 slots for every key call. \`ai_assist.reasoning_note\` is the ONE slot the auditor edits. Getting its scope right is the audit's biggest lever.

**Use \`reasoning_note\` for:**
- Visual / photographic cues the LLM must apply when the field is decided from a product image.
- Semantic disambiguation between adjacent enum values (palm vs claw grip, symmetrical shape vs ambidextrous form factor).
- Field-specific gotchas that repeat across products (scroll-click ≠ middle button; sensor_brand follows the extracted sensor name, not the upstream fab).
- Rebrand / alias rules tied to extraction behavior (Razer Optical switch → switch_brand=razer, not the upstream OEM).
- "Don't confuse with" anchors when two fields share surface vocabulary.
- Interpretation rules for ambiguous fields where a schema fix is out of scope.

**Do NOT use \`reasoning_note\` for anything already rendered by another slot:**
- Enum values / aliases / type / shape / unit / rounding / list rules — rendered by \`PRIMARY_FIELD_CONTRACT\`.
- Preferred source domains / search terms — rendered by \`PRIMARY_SEARCH_HINTS\`.
- Source tier preference — rendered by \`SOURCE_TIER_STRATEGY\`.
- Evidence structure, min_refs, URL verification — rendered by \`EVIDENCE_CONTRACT\` + \`EVIDENCE_VERIFICATION\`.
- "Return unk when uncertain" policy — rendered by \`UNK_POLICY\`.
- 0–100 confidence rubric — rendered by \`VALUE_CONFIDENCE_GUIDANCE\`.
- Cross-field constraints — rendered by \`PRIMARY_CROSS_FIELD_CONSTRAINTS\`.
- Already-resolved component values — rendered by \`PRODUCT_COMPONENTS\`.
- Identity sibling-confusion warnings — rendered by \`IDENTITY_WARNING\`.
- Output JSON envelope — rendered by \`RETURN_JSON_SHAPE\`.

**Quick test before adding a sentence to a guidance cell:** if the concept is covered by a template slot in Part 2, delete the sentence. The generic template is authoritative — duplicating into guidance creates conflicting instructions that drift over time.
`.trim();

export function buildTemplateSkeletonTable() {
  return {
    headers: ['Slot', 'Category', 'Description'],
    rows: KEY_FINDER_VARIABLES.map((v) => [
      `{{${v.name}}}`,
      v.category,
      v.description,
    ]),
  };
}

export function composeAuditorTask() {
  return { id: 'auditor-task', title: 'Auditor task (read this first)', body: AUDITOR_TASK_BODY };
}

export function composeAuditStandard() {
  return { id: 'audit-standard', title: 'Audit standard (the bar you apply)', body: AUDIT_STANDARD_BODY };
}

export function composeTeachingSections() {
  return [
    { id: 'teach-purpose', title: '1. Purpose + scope', body: PURPOSE_BODY },
    {
      id: 'teach-skeleton',
      title: '2. Prompt template skeleton',
      body: 'The keyFinder prompt is a fixed template with 25 labeled slots. Each slot is either field-rule-driven, global-fragment-driven, or runtime-computed. The table below is auto-generated from `KEY_FINDER_VARIABLES` (the contract file) so it stays accurate as new slots are added.',
      tables: [buildTemplateSkeletonTable()],
    },
    { id: 'teach-field-rule', title: '3. Field rule anatomy', body: FIELD_ANATOMY_BODY },
    { id: 'teach-contract-value', title: '4. The value of each contract field', body: CONTRACT_VALUE_BODY },
    { id: 'teach-filter-ui', title: '5. Filter UI contract (toggles / range / date / checkbox)', body: FILTER_UI_BODY },
    { id: 'teach-enum-policy', title: '6. Enum policies (closed / open_prefer_known / open)', body: ENUM_POLICY_BODY },
    { id: 'teach-tier', title: '7. Tier routing (difficulty → model)', body: TIER_ROUTING_BODY },
    { id: 'teach-groups', title: '8. Field groups — why membership matters', body: GROUPS_BODY },
    { id: 'teach-bundling', title: '9. Bundling mechanics', body: BUNDLING_BODY },
    { id: 'teach-cross-field', title: '10. Cross-field constraints', body: CROSS_FIELD_BODY },
    { id: 'teach-component', title: '11. Component relations', body: COMPONENT_RELATIONS_BODY },
    { id: 'teach-evidence', title: '12. Evidence contract + source tiers + confidence + unk', body: EVIDENCE_BODY },
    { id: 'teach-reserved', title: '13. Reserved keys (owned by other finders)', body: RESERVED_KEYS_BODY },
    { id: 'teach-reasoning-note', title: '14. What `reasoning_note` is FOR and NOT FOR', body: REASONING_NOTE_BODY },
  ];
}
