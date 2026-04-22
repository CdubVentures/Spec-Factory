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
You are auditing every field in this category's keyFinder pipeline. Read Part 1 first — it teaches the system. Then walk Part 4 (enum inventory), Part 5 (component DB), and Part 7 (per-key detail blocks) and return a change-report that covers every key plus category-level cleanups.

**The single biggest lever in this audit is enum discipline.** Every non-numeric value becomes a filter chip on the consumer surface. Value count and pattern consistency directly drive usability (Part 1.5 has the empirical fatigue thresholds). Start with Part 4, triage every open enum by value count + pattern coverage, and only then walk the per-key detail blocks. Numeric ranges, dates, and booleans render as sliders / checkboxes — they don't carry the same filter-chip cost, so their contract review is second priority.

**What to return, per field key (even if "no change"):**

1. **Enum values + policy + pattern** — **lead with this.** If the enum has suspicious values, redundant entries, or inconsistent shape, propose:
   - New canonical value list (or the delta: add / remove / rename).
   - A pattern the LLM should emit (e.g. \`<N> zone (<rgb|led>)\`, \`<maker> <model>\`). Document the pattern in \`reasoning_note\` and trim known values to conform.
   - Policy (\`closed\` / \`open_prefer_known\` / \`open\`) with rationale.
   - Target value count per the fatigue thresholds in Part 1.6: ≤10 healthy, 11–15 fine, 16–20 tolerable, 21–30 filter fatigue, 30+ broken. Where the current enum sits, and where it should sit.
2. **Contract changes** — if \`type\`, \`shape\`, \`unit\`, \`rounding\`, \`list_rules\`, \`range\`, or \`variance_policy\` should change, say what and why. Explain the extraction + filter-UI consequence (Part 1.4–1.5). Don't forget the value-format discipline rules in Part 1.4 (pattern preservation, descending numeric lists, units elided).
3. **Extraction guidance (\`ai_assist.reasoning_note\`)** — propose new text or edits. Keep to Part 1.14's "FOR" scope: visual cues, semantic disambiguation between adjacent enum values, field-specific gotchas, rebrand/alias rules, "don't confuse with X" anchors. Do NOT duplicate anything already rendered by the template slots in Part 2. If the existing \`reasoning_note\` is strong, say "keep as-is" and state why. If an enum pattern was proposed in (1), document that pattern here so the LLM emits conformant values.
4. **Aliases** — synonyms the LLM should recognize in source text before normalizing. Add only high-signal aliases; avoid marketing noise.
5. **Search hints** — missing authoritative \`domain_hints\` or \`query_terms\` for this field.
6. **Cross-field constraints** — relations between this field and others (\`lte\`, \`gte\`, \`eq\`, \`requires_when_value\`, \`requires_one_of\`). Reminder: the live renderer currently reads \`cross_field_constraints\` (object shape), but compiled rules store \`constraints\` as string DSL — flag any constraint that exists but isn't reaching the LLM.
7. **Component relation** — if this field IS a component identity or belongs to one, confirm or correct the \`component.type\` / \`component.match.property_keys\` wiring.

**Category-level asks (return once, not per key):**

- **Group audit (Part 6)** — for each group, answer:
  - Is the membership coherent? Which field should move out, which should move in?
  - Does the group name accurately describe the set? Propose a rename if not.
  - Are there candidate splits (groups larger than ~15 fields, or that contain obviously different clusters) or merges (two groups reviewers always look at together)?
  - Is there a "general" dumping ground that should be decomposed?
  - Are the member difficulties coherent (a group of identity anchors should be mostly \`hard\` / \`very_hard\`, not \`easy\`)?
  - Are there implicit cross-group couplings (via \`cross_field_constraints\`) that suggest a restructure?
- **Component DB additions** — for each component type in Part 5, flag missing entities (sensors / switches / encoders / materials this category should know about), missing properties on existing entities, and entity-level constraints (e.g. \`sensor_date <= release_date\`).
- **Enum cleanup** — for each enum in Part 4, flag suspicious values and recommend whether to tighten values, lock policy, or document a pattern.
- **Global fragment tweaks** — if any of the category-level fragments in Part 2 (identity warning, evidence contract, source-tier strategy, confidence rubric, unk policy) have wording that drifts from this category's reality, propose a per-category override text.
- **Reserved-key conflicts** — if a rule in this doc is listed as owned by CEF / RDF / SKF (see Part 1.13), note that its guidance will never reach the live keyFinder.

**Return format (markdown):**

\`\`\`markdown
# <Category> Key Finder Audit — Change Report

## Per-key changes

### \`<field_key>\` (<display_name>)
- **Verdict:** <keep-as-is | minor revise | major revise | retire>
- **Guidance (\`reasoning_note\`):** <new text, or "keep as-is">
  - **Why:** <one-sentence rationale>
- **Contract:** <changes or "none">
- **Enum:** <changes or "none">
  - **Pattern:** <proposed regex-like shape, or "no pattern recommended">
- **Aliases to add:** <list or "none">
- **Search hints to add:** <list or "none">
- **Cross-field constraints:** <list or "none">
- **Component relation:** <confirm / correct>

(repeat for every field in Part 7)

## Enum cleanup (category-wide)
...

## Component DB additions
...

## Global fragment suggestions
...

## Flags + open questions
- <anything you noticed that the human owner should decide — schema mismatches, ambiguous fields, missing finder coverage>
\`\`\`

**Out of scope — surface, don't decide:**
- Deleting fields outright (requires human product call).
- Changing which finder owns a reserved key (CEF / RDF / SKF ownership is architectural).
- Adding or removing field groups.
- Editing the 25-slot template itself.

When you return, the human owner will apply whatever they agree with into the Field Studio authoring surface, recompile, and regenerate this report for the next iteration. Be specific — exact strings to paste in are infinitely more useful than "add better guidance here".
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
