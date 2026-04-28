/**
 * Part 1 â€” the teaching. Static prose explaining the keyFinder pipeline end
 * to end, so an auditor reading the report understands the full context before
 * they evaluate per-key data blocks.
 *
 * Each section is { id, title, body, tables } where:
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
You are auditing every field in this category's keyFinder pipeline. Your deliverable is a set of strict Field Studio JSON patch files that a human owner can import directly. Be specific: exact JSON settings are infinitely more useful than "add better guidance here".

**Read order:** Part 1 (the system) -> Part 1a (Audit standard, the bar) -> Part 4 (enum inventory, biggest lever) -> Part 5 (component source mapping context) -> Part 6 (groups) -> Part 7 (per-key detail).

**Your response leads with downloadable JSON patch files**, then the top 5-10 must-fix items (the "Highest-risk corrections" block below). Then field-by-field rationale. Then category-level asks. Then flags/open questions.

**Downloadable JSON patch files come first.** At the very top of your response, provide one downloadable \`.json\` file per changed key, named \`<category>-<sort_order>-<field_key>.field-studio-patch.v1.json\`. The human will place these files in \`.workspace/reports/<category>/auditors-responses/\` and import the folder. If your interface cannot attach files, provide one fenced \`json\` block per file, preceded by its filename. Do not return a \`.txt\` change file.

Returned JSON must be strict and importable:

\`\`\`json
{
  "schema_version": "field-studio-patch.v1",
  "category": "<category>",
  "field_key": "<field_key>",
  "navigator_ordinal": 10,
  "verdict": "minor_revise",
  "patch": {
    "field_overrides": {
      "<field_key>": {
        "priority": {
          "required_level": "mandatory",
          "availability": "always",
          "difficulty": "medium"
        },
        "contract": {
          "type": "string",
          "shape": "scalar"
        },
        "enum": {
          "policy": "open_prefer_known",
          "source": "data_lists.<field_key>"
        },
        "ai_assist": {
          "variant_inventory_usage": {
            "enabled": false
          },
          "pif_priority_images": {
            "enabled": false
          },
          "reasoning_note": "Paste-ready extraction guidance."
        }
      }
    },
    "data_lists": [
      {
        "field": "<field_key>",
        "mode": "manual",
        "normalize": "lower_trim",
        "manual_values": []
      }
    ],
    "component_sources": [
      {
        "component_type": "sensor",
        "roles": {
          "properties": [
            {
              "field_key": "<field_key>",
              "variance_policy": "authoritative"
            }
          ]
        }
      }
    ]
  },
  "audit": {
    "sources_checked": [],
    "products_checked": [],
    "conclusion": "",
    "open_questions": []
  }
}
\`\`\`

JSON rules:
- Use \`schema_version: "field-studio-patch.v1"\` exactly.
- Use one file per changed key. Skip fields whose settings stay as-is; list those keep verdicts only in the prose report.
- \`patch\` may contain only \`field_overrides\`, \`data_lists\`, and \`component_sources\`.
- \`field_overrides\` may patch only its own \`field_key\`.
- \`data_lists\` rows must use the same \`field\` as \`field_key\`.
- \`component_sources\` rows must either define the component type itself or include the field in \`roles.properties\`.
- Omit unchanged setting paths entirely. \`null\` clears a setting. Arrays replace arrays. Objects deep-merge.
- Do not include comments, markdown, trailing commas, prose sentinels, or implementation notes inside JSON.

Mapping Studio guidance:
- Component Source Mapping belongs under \`patch.component_sources\`. Use it for component source/type, primary identifier role, maker role, aliases/name variants, reference URLs/links, component _link fields, and property variance. A component _link field should point to a manufacturer component page, datasheet/spec-sheet PDF, or authorized component distributor page; not eBay, forums, or pages that merely mention the component.
- Enum Data Lists belong under \`patch.data_lists\`. Return the final ordered canonical values when replacing a list; keep aliases/source phrases out of public chips.

Key Navigator guidance:
- Field contract, priority, evidence, enum policy, constraints, aliases, search_hints, and ai_assist belong under \`patch.field_overrides.<field_key>\`.
- Use \`ai_assist.variant_inventory_usage\` only when variant identity helps reject wrong-variant evidence without ambiguity.
- Use \`ai_assist.pif_priority_images\` only when default/base priority-view images add visual evidence value.
- Put final paste-ready prompt guidance in \`ai_assist.reasoning_note\`.

After the JSON files, include the markdown report shape below.

---

**Return format (markdown, mirror this shape exactly after the JSON files):**

\`\`\`markdown
# <Category> Key Finder Audit â€” Change Report

## Verdict

<one-paragraph overall opinion: which cells hold up, which don't, what's the single highest-leverage change>

## Coverage

- Fields audited: <N>
- Verdict distribution: Keep <n> Â· Minor revise <n> Â· Major revise <n> Â· Schema decision <n>
- Enums reviewed: <N> (of which <n> patternless / <n> suspicious)
- Component DBs reviewed: <N>

## Audit standard

<restate, in your own words, the standard you applied from Part 1a â€” so the reader can judge your judgment>

## References spot-checked

- <live manufacturer / standards / lab URLs you verified the highest-risk technical claims against>

## Highest-risk corrections

<5â€“10 bullets, most impactful first. Each: one field or category-level item, one sentence on what's wrong + what to do. These are the items the human owner would apply tonight if they only had 15 minutes.>

## Field-by-field patches

### <Group display name> (N keys)

#### \`<sort_order>-<field_key>\` â€” <Keep | Minor revise | Major revise | Schema decision>

- **Type / shape:** <type> Â· <scalar|list>
- **Priority / scheduling:** <required_level / availability / difficulty changes, or "none">
- **Search / routing:** <required_level / availability / difficulty verdict; whether the resolved model/search strength is enough to reproduce benchmark-depth values from public evidence>
- **Full contract:** <changes to required_level/availability/difficulty/type/shape/unit/rounding/list_rules/range/variance_policy/evidence, or "none">
- **Contract patch required?:** <yes/no. "No contract change" is valid when the current shape/policy/scheduling/evidence/consumer behavior are already correct.>
- **Consumer-surface impact:** <filter/list/snapshot/compare/metric/search/SEO/none; say exactly which downstream surfaces this key should power and any display-only or derived-value notes>
- **Unknown / n/a handling:** <how to distinguish true/false or yes/no, intentional n/a data, unknown_reason with no submitted value, and blank/omitted for this key>
- **Example bank:** <5-10 products or product classes used to calibrate this key; include happy path / edge / unknown / conflict / filter-risk coverage>
- **- Current guidance**
  > <verbatim current \`reasoning_note\`, or "(empty)">
- **+ Proposed guidance**
  > <new text â€” paste-ready. Use "(empty â€” keep)" if existing is fine and no guidance is needed.>
- **Enum:** <proposed delta â€” add / remove / rename â€” with rationale, or "keep">
  - **Pattern:** <proposed regex-like shape (e.g. \`<N> zone (rgb|led)\`), or "no pattern recommended">
- **Contract:** <changes to type/shape/unit/rounding/list_rules/range/variance_policy, or "none">
- **Aliases:** <additions, or "none">
- **Search hints:** <domain_hints / query_terms to add, or "none">
- **Cross-field constraints:** <additions or corrections, or "none">
- **Component relation:** <confirm / correct \`component.type\` and the matching \`component_sources[X].roles.properties[]\` list in field_studio_map>
- **Why:** <one sentence>

(repeat per field, grouped by Part 6's group order)

## Enum cleanup (category-wide)

<per enum with a change proposal: suspicious values to remove, values to rename, pattern to lock in, policy change>

## Component DB additions

<per component type in Part 5: entities missing, properties missing on existing entities, entity-level constraints like \`component_release_date <= product_release_date\`>

## Group audit (Part 6)

<per group: membership coherence, renames, splits, merges, misgrouped fields>

## Global fragment suggestions

<if any of Part 2's category-level fragments should get a per-category override>

## Flags + open questions

- <schema mismatches, ambiguous fields, reserved-key conflicts, anything you want the human owner to decide>
\`\`\`

---

**What's explicitly in scope:**

1. **Enum discipline is the single biggest lever.** Every non-numeric enum value becomes a filter chip on the consumer site â€” so value count and pattern consistency directly drive usability. Lead with this in your Highest-risk block.
2. **Pattern before policy.** An enum with a dominant structural signature (â‰¥70% of values conform, per Part 4) is usable even at 20+ values. Freeform enums fail at much lower counts.
3. **Target value counts (Part 1.6):** â‰¤10 healthy, 11â€“15 fine, 16â€“20 tolerable, 21â€“30 filter fatigue, 30+ broken. Call out where each enum sits now vs where it should sit.
4. **Guidance is last.** Confirm \`priority.required_level\`, \`priority.availability\`, \`priority.difficulty\`, \`contract.type\`, \`contract.shape\`, enum/filter behavior, evidence requirements, and example coverage before writing \`reasoning_note\`. The prompt can only execute perfectly after the field contract is correct.
5. **Contract changes with consequences stated.** When you propose changing \`required_level\`/\`availability\`/\`difficulty\`/\`type\`/\`shape\`/\`unit\`/\`rounding\`/\`list_rules\`/\`range\`/\`variance_policy\`/\`evidence\`, explain the extraction + filter-UI + routing consequence (Part 1.4â€“1.5 language).
6. **Extraction guidance (\`reasoning_note\`) is the final editable slot per key.** Keep it to Part 1.15's "FOR" scope â€” visual cues, semantic disambiguation, field-specific gotchas, rebrand rules, "don't confuse with X" anchors. Do NOT duplicate anything already rendered by the template slots in Part 2. If existing guidance duplicates slot content, propose shortening.
7. **Cross-field constraints are live prompt inputs.** Constraints authored as \`constraints\` DSL or structured \`cross_field_constraints\` render into the keyFinder prompt. Audit whether each relationship is correct, whether the target field is the right authority, and whether group membership should change because of the dependency.
8. **No contract change is a real verdict.** Do not invent schema edits just to leave a mark. If the current contract is correct, say "no contract change" and focus on the actual improvement: guidance, examples, aliases, enum cleanup, search hints, or a clean keep decision.
9. **Unknown and not-applicable are different.** Boolean is not automatically enough. Use yes/no or true/false only for factual two-state values. Never add \`unk\` to enum values: it is an internal LLM sentinel that should become status/unknown_reason with no submitted value. Use \`n/a\` as data only when not-applicable is deliberately stored or public; otherwise prefer blank/omitted.
10. **Search/routing is part of the contract.** \`required_level\`, \`availability\`, and \`difficulty\` decide publish blocking, scheduling, bundling priority, and model/search strength. Calibrate them against a category benchmark/example set: 5-10 representative products per key, with happy path, edge, unknown, conflict, and filter-risk coverage.
11. **Variant inventory context is a single on/off checkbox, not a prose field.** Enable it only when active variant identity facts such as colorway, edition, SKU, release date, or PIF image status add evidence-filter value for this key without making the answer more ambiguous. Most model-level keys are invariant across variants and should not need the table. List-valued or variant-varying keys need an explicit decision: product-wide union, exact-variant answer, base/default variant answer, or no submitted value with unknown_reason when sources do not separate variants.
12. **PIF Priority Images is also a single on/off checkbox.** Enable it only for visually answerable keys where the category's default/base priority-view images help the LLM see the trait. The images are supporting context, not exhaustive proof. If images are missing or not attachable, the prompt must say so explicitly. Default/base images cannot rule out edition-specific traits; put any product-scoped edition/list interpretation in \`reasoning_note\`.

**Out of scope â€” surface, don't decide:**

- Deleting fields outright (human product call).
- Changing which finder owns a reserved key (CEF / RDF / SKF ownership is architectural).
- Editing the 25-slot template itself.

**Quality bar for guidance rewrites:**

- **Paste-ready.** The \`+ Proposed guidance\` blockquote should be the exact string the human will copy into Field Studio. No "consider addingâ€¦" meta-text.
- **Specific.** "Extract the official manufacturer MPN for the exact variant; prefer brand SKU over retailer ASIN" beats "be more specific about SKU source".
- **Visual cues name the view â€” and for subtle calls, teach the judgment.** The Audit standard's "Visual-answerable fields" section grades fields as Tier A (direct), Tier B (subtle), or Tier C (non-visual). For Tier A, one sentence naming the view + feature is enough. For Tier B, write 2-4 sentences that define the visible feature precisely, give threshold or relative-measurement rules, and say when to return \`unk\`. This is where \`reasoning_note\` earns its keep. For Tier C, don't mention views at all; those are spec-sheet, datasheet, support-doc, component, or lab-measurement extractions.
- **Web search is expected.** You have live internet access. Use it to: calibrate enum values against 3â€“5 real products before proposing a canonical list; verify that a current industry term still means what you think (technologies get rebranded); and spot-check any technical claim in proposed guidance. Cite the sources you checked under "References spot-checked".
- **Evidence-grounded.** When a claim depends on an external fact (chip lineage, certification tier, firmware format), spot-check a live source and list it under "References spot-checked". Prefer manufacturer docs + standards bodies + instrumented review labs.
- **UNK-safe.** Proposed guidance must never weaken the honest-unk policy. "Default to No" is a smell; "return unk when evidence is absent" is correct.
`.trim();

const AUDIT_STANDARD_BODY = `
This is the bar you apply when judging every cell in Part 7. Read it, then read Part 7. If a rule doesn't clear these bars, propose a change.

**Full field contract authoring order:** validate \`priority.required_level\`, \`priority.availability\`, \`priority.difficulty\`, \`contract.type\`, \`contract.shape\`, \`unit\`, \`rounding\`, \`list_rules\`, \`range\`, enum/filter behavior, consumer-surface impact, unknown/not-applicable states, evidence/source requirements, and a 5-10 product example bank before writing guidance. Guidance last. The \`reasoning_note\` should express only the remaining extraction judgment the structured contract cannot express. "No contract change" is valid when the current contract already supports keyFinder, publisher, Field Studio, and the consumer site.

**Search / routing discipline:** \`required_level\`, \`availability\`, and \`difficulty\` are not labels; they are the extraction strategy. Mandatory means the site should try to publish the field for most products because the answer is buyer/site/benchmark useful and usually distinguishable from public/spec/visual/identity evidence; it is not restricted to lab-only measurements. Availability controls whether keyFinder searches this early and often enough. Difficulty controls the model/search strength needed after variant inventory, PIF images, aliases, and source hints are available: easy is direct public evidence or a visually obvious/default-context call, medium is normalization or light source comparison, hard is technical component reasoning, conflicts, aliases that change meaning, or source credibility, and very_hard is reserved for hidden or lab-grade fields such as proprietary internal component identities, instrumented latency/accuracy measurements, unresolved datasheet links, or deep technical component work. Do not mark a key hard just because the prose is subtle if the injected context makes the correct value direct.

**Example-bank discipline:** every key needs calibration examples before the prompt is trusted: common happy path, edge/rare value, unknown/absent evidence, conflict/ambiguity, and filter-risk cases. Use hand benchmark data when available; for brand-new categories, create the first bank from representative market products and carry the recipe forward.

**Variant inventory context discipline:** this is one checkbox per key. Enabling it lets the prompt receive the active CEF variant table plus deterministic evidence-filter guidance; disabling it omits that table entirely. Use it only when variant identity facts such as edition, SKU, release date, colorway, or PIF image status help the LLM reject wrong-variant evidence for the key. Do not enable it just because variants exist. Most technical/model-level fields are shared across the model family and get no value from variant rows. For list-valued or genuinely variant-varying keys, decide whether the expected answer is a product-wide union, an exact-variant value, a base/default variant value, or no submitted value with unknown_reason when public sources do not separate variants; put that field-specific interpretation in \`reasoning_note\`.

**PIF Priority Images discipline:** this is a separate one-checkbox visual-support tool. It uses the category's existing PIF priority-view settings and already-evaluated default/base images. Enable it for visually answerable keys only when those default/base views help decide the field. Do not enable it for non-visual spec-sheet fields. Missing or unattachable images are not evidence that a trait is absent. Because Key Finder remains product-scoped, write field-specific edition rules in \`reasoning_note\`: for yes/no fields, define whether one official edition with the visible trait makes the product-level answer yes; for list-like visual fields, define whether to include the variant/design forms found.

**Consumer-surface impact:** the site can render many shapes, but the audit still has to say what this key is for. For each key, decide whether it should power filters, hub/list columns, product snapshot/spec rows, comparison tables, metric/cards, search/SEO text, or none. Contract shape should support the intended surfaces without forcing the site to infer display semantics.

**Unknown / not-applicable discipline:** Boolean is not automatically enough. Use yes/no or true/false only when the field has two factual states and not-applicable is not a stored outcome. Never add \`unk\` to enum values, data lists, or published field values. \`unk\` is an LLM boundary sentinel: Key Finder should store status/unknown_reason for diagnostics and produce no submitted value. Use \`n/a\` only when not-applicable is intentionally stored or shown as a first-class value; otherwise prefer blank/omitted as no submitted value. Applicability is not the same as value: \`battery_hours\` should be numeric when hours are proven, and blank/omitted when the product has no battery/wired-only or credible sources do not prove the hours, unless the category explicitly wants a public \`n/a\` state. Do not remodel that as a boolean just because the first decision is "has a battery?"

**Visual-answerable fields â€” a spectrum, not a binary. Guidance pays off most in the middle.**

Fields decided from product photography fall on a spectrum. Treat each tier differently when authoring \`+ Proposed guidance\`:

**Tier A â€” direct visual.** Decidable from a single photo in seconds; the answer is a literal visible feature. Guidance is short: name the view + the feature.
- visible opening/perforation/port/vent present â€” priority view: visible yes/no.
- visible control/count field â€” count the clearly visible controls, ports, zones, or panels named by the key.
- basic symmetry/orientation field â€” compare the relevant visible left/right or front/back product sides.
- visible branding/edition marker â€” record only when the official image or source identity proves the field's class.

**Tier B â€” subtle visual. Judgment call that NEEDS real guidance.** This is where \`reasoning_note\` earns its keep. The reviewer's job is to write guidance that teaches how to make the subtle call â€” not just "look at the profile view." Describe the feature precisely, give thresholds or relative measurements, name reference products as calibration anchors when stable, and say when to \`unk\` rather than guess.

- proportional shape/location field â€” define the reference axis, the measurement point, and the threshold between buckets.
- contour/taper/flare field â€” say whether to judge the front, rear, side, or full visible face, and how to handle compound curves.
- intended-use/fit field â€” combine visual evidence with official positioning and return unk when the source does not prove the intended class.
- symmetry/orientation field with controls â€” require both visible geometry and functional/control evidence when the key's meaning depends on both.

**Tier C â€” not visual.** Text / spec-sheet / datasheet extraction. Visual guidance adds no value and can mislead â€” don't include a view instruction. Examples: component model, component maker, supported rates, maximum rating, internal controller, release date, connection method, battery life, firmware/support feature names.

**When writing a \`+ Proposed guidance\` blockquote:**

- Tier A fields â†’ one sentence naming the view + feature. Short.
- Tier B fields â†’ 2â€“4 sentences: name the view, define the visible feature precisely, give relative/threshold rules so the call is repeatable, name when to return \`unk\`. Optionally reference a stable, non-rebranding anchor product as a calibration example (avoid model-year-specific examples that age out).
- Tier C fields â†’ no view mention. Guidance focuses on source tiering, semantic disambiguation, or rebrand/alias rules.

**Web search is expected.** Reviewers have live internet access. When uncertain about a spec's meaning, an enum value's taxonomy, whether a feature is visually decidable, or what a current industry term refers to (e.g. "flawless sensor", "rapid trigger", "FRL"), search. When proposing enum values or patterns, validate against 3â€“5 real products so the proposal reflects market vocabulary, not an isolated example. Cite authoritative sources in the "References spot-checked" block for any technical claim in the guidance.

**Enum discipline (the biggest lever):**

- **Value count is a UX metric.** â‰¤10 healthy, 11â€“15 fine, 16â€“20 tolerable, 21â€“30 filter fatigue, 30+ broken. Any enum in the 21+ range is a high-priority cleanup target.
- **Pattern > free-form.** An open enum with â‰¥70% values matching a common structural signature (\`<N> zone (rgb|led)\`, \`<maker> <model>\`) scales gracefully; a free-form open enum doesn't.
- **Closed policy when finite.** If the set is small, stable, and every new value should be a human decision, \`policy: closed\` is right.
- **Canonical values are not aliases.** Enum values are the stored/user-facing options. Source phrases, retailer wording, SKU suffixes, and marketing names belong in aliases or guidance unless the user should actually see them as filter chips.
- **No garbage values.** Single-character entries, numeric-only strings in categorical enums, typos â€” flag them every time.

**Guidance (\`ai_assist.reasoning_note\`) discipline:**

- Keep guidance only when it prevents a likely extraction error the generic template (Part 2) doesn't already cover.
- Prefer product-specific evidence over brand/model heuristics.
- Never weaken the UNK policy. "Honest unk beats low-confidence guess" (Part 2, UNK_POLICY) wins against any "default to X when unsure" instruction.
- Avoid volatile examples (model-year-specific, single-product anecdotes, component-lineage rebrand trails that will age out).
- No duplication of slots rendered by the generic template: enum values, aliases, unit/rounding, source tiers, evidence contract, confidence rubric, etc. If the concept is already in Part 2, delete it from guidance.

**Contract discipline:**

- \`type\` and \`shape\` match the consumer surface rendering (Part 1.5). A string in a numeric context will render the wrong filter control.
- \`unit\` is storage contract, not label â€” numeric values stored unit-less, unit applied at render.
- \`rounding\` set whenever precision matters for equality comparison (index-level consistency).
- Numeric lists with meaningful order declare \`list_rules.sort\` (for example, highest-supported rates first).
- \`range\` set on numerics the LLM would otherwise fantasize about.

**Evidence discipline:**

- Identity-anchoring fields should usually have \`evidence.min_evidence_refs >= 2\` â€” two independent sources before accepting a value.
- \`tier_preference\` ordered from most authoritative to least (manufacturer â†’ instrumented lab â†’ review â†’ retailer).

**Component discipline:**

- A field that IS a component identity must have \`component.type\` set.
- A field that is a PROPERTY of a component must appear in the relevant component database entity's \`properties\`.
- Missing component DB entries for known real-world entities are component-data cleanup, not Field Studio setup. Report them outside the change file instead of asking the user to apply them as Mapping Studio/Key Navigator settings.
`.trim();

const PURPOSE_BODY = `
keyFinder is a universal, per-key field extractor. One LLM call per \`(product, field_key)\` pair. The call is tier-routed by each rule's \`difficulty\` knob, submits one candidate per key through the publisher gate, and is **product-scoped** â€” never per-variant.

Everything the LLM sees is composed from exactly three input sources:
- **The compiled field rule** â€” contract, enum, aliases, search hints, cross-field constraints, component relation, extraction guidance.
- **Global prompt fragments** â€” category-overridable text shared across finders: identity warning, evidence contract, source-tier strategy, confidence rubric, unk policy.
- **Runtime context** â€” product identity (brand/model/variant), already-resolved components + fields, prior-run discovery history.

This report shows the first two sources verbatim. Runtime slots are labeled as placeholders in Part 2. Each per-key block in Part 7 shows exactly what THAT key's contract, guidance, hints, and constraints would inject into the template.
`.trim();

const FIELD_ANATOMY_BODY = `
A compiled field rule is the single source of truth for everything the LLM is told about a field. Every per-key block in Part 7 is derived from it. Learn the shape:

- **Priority triple** â€” \`required_level\` (mandatory / non_mandatory), \`availability\` (always / sometimes / rare), \`difficulty\` (easy / medium / hard / very_hard). Required level drives scheduling. Availability drives bundling sort. Difficulty drives tier routing.
- **Contract** â€” \`type\`, \`shape\` (scalar / list), \`unit\`, \`rounding\`, \`list_rules\`, \`range\`. Defines the exact JSON primitive the LLM must emit.
- **Enum** â€” \`policy\` (closed / open_prefer_known / open), \`values\`, \`source\`. Defines the value vocabulary.
- **Aliases** â€” source-text synonyms the LLM is told to recognize and normalize before emitting.
- **Variance policy** â€” how to resolve variant-level disagreements (authoritative / upper_bound / lower_bound / majority_vote).
- **ai_assist.reasoning_note** â€” extraction guidance (free-form prose). The single editable slot per key that is NOT already covered by the generic template. See Part 1.13 for what this cell is FOR and NOT FOR.
- **search_hints** â€” \`domain_hints\` (preferred source domains) + \`query_terms\` (search queries). Injected into the prompt so the LLM's web search prioritizes those angles.
- **Cross-field constraints** â€” operators relating this field to another on the same product (\`lte\`, \`lt\`, \`gte\`, \`gt\`, \`eq\`, \`requires_when_value\`, \`requires_one_of\`).
- **Component relation** â€” \`component.type\` when this field IS the identity of a component OR is a property of one. Drives the \`PRODUCT_COMPONENTS\` block.
- **Evidence** â€” \`min_evidence_refs\`, \`tier_preference\`. Controls the evidence contract injected into the prompt.
`.trim();

const CONTRACT_VALUE_BODY = `
The contract is the LLM's behavioral spec. Each field below steers the output in a specific way; when it's blank, the LLM falls back to defaults that are almost always worse than the explicit choice:

- **\`type\`** â€” emits the right JSON primitive (string / number / boolean / date). Without it, the LLM tends to emit numbers as strings and dates as freeform text.
- **\`shape\`** (scalar / list) â€” unlocks list-level behavior (dedupe + sort) and informs the array vs singular JSON shape.
- **\`unit\`** â€” forces unit normalization. "55g" vs "55 oz" vs "0.12 lb" all collapse to the canonical stored unit. Numeric values on the consumer surface are stored WITHOUT the unit; the unit is applied at render time. Contract unit = storage contract, not label.
- **\`rounding\`** â€” controls decimal precision. Without it, \`128.0000001\` and \`128\` both survive and break equality comparisons in the index.
- **\`list_rules.{dedupe, sort}\`** â€” how the multi-value filter facets render on the site. Unsorted or duplicated lists show up as UI noise. For numeric lists where higher values are conventionally listed first, use descending sort.
- **\`range\`** â€” numeric bounds. The LLM stops guessing impossible out-of-range values.
- **\`enum.policy\`** â€” \`closed\` means "reject anything not listed", \`open_prefer_known\` means "accept new values but prefer these", \`open\` means "trust your evidence". Mismatched policy is the most common source of enum pollution.
- **\`enum.values\`** â€” the vocabulary. Each non-numeric value becomes a user-facing filter toggle on the website. Every extra value is a filter-UI cost. See Part 1.5 and 1.6.
- **\`aliases\`** â€” source-text synonyms. Without them, the LLM may emit the raw retailer wording instead of the canonical form.
- **\`variance_policy\`** â€” tells the LLM how to handle disagreements between sources for a product with multiple variants.

**Value format discipline (contract consequences):**

- **Pattern preservation** â€” values that encode structure (e.g. \`"3 zone (rgb)"\`) are rendered verbatim on the consumer surface. Don't post-process into components â€” the LLM must emit the pattern whole.
- **Delimiter convention for multi-token values** â€” combos inside a single value use \`+\` (e.g. \`"white+black"\`). Inter-value separators are the list shape; never embed a raw comma inside a single enum value (commas collide with URL multi-select serialization).
- **Units elided from numeric values** â€” a \`weight\` of 55 grams is stored as \`55\`, not \`"55g"\`. The contract \`unit\` field carries the label.
- **Descending numeric lists where order is meaningful** â€” highest-supported value first, declared on the rule via \`list_rules.sort\`.
`.trim();

const FILTER_UI_BODY = `
The contract's \`type\` + \`shape\` directly determines how the field renders as a consumer-facing filter. This is the universal rule â€” the same contract drives extraction AND the filter UI:

- **string + scalar** â€” single-select toggle group (one chip per enum value).
- **string + list** â€” multi-select toggle group (multiple chips selectable; product passes filter if any list item matches any selected chip).
- **number / integer (scalar or list)** â€” two-handle range slider with min/max computed at load time from the data. Numeric values NEVER become individual toggles, no matter how few unique values exist.
- **date** â€” two-handle range slider (MM/YYYY â€“ MM/YYYY format).
- **boolean** â€” yes/no checkbox only when the key has two factual states and not-applicable is not a stored outcome. Never include \`unk\` in an enum or data list; it is only the LLM no-proof sentinel and should resolve to no submitted value plus status/unknown_reason. If \`n/a\` is truly first-class, use \`yes\` / \`no\` / \`n/a\` or another contract that preserves not-applicability, but prefer blank/omitted when absence is clearer for reviewers and the site. For measured conditional fields such as \`battery_hours\`, keep the value contract numeric/date/string as appropriate and leave no submitted value when the measurement cannot apply or cannot be proven.
- **Pattern-valued strings** â€” rendered verbatim as chip text (e.g. \`"3 zone (rgb)"\` is shown exactly as that string in the filter). No tokenization, no parsing at render time.

**The show-more threshold + filter fatigue numbers (empirical):**

- The default UI reveals the first **10 chips** per attribute; the rest collapse under a "Show more" fold.
- Usability stays good through **~15 values**.
- **Fatigue starts at 20**. Scanning becomes work.
- **Serious pain at 30+**. Users give up on that filter entirely.
- These numbers turn \`enum.values.length\` into a product-usability metric the contract is directly responsible for.

**Why this matters to the auditor:** the \`lighting\` enum disciplined around \`N zone (rgb)\` / \`N zone (led)\` / \`none\` holds because every concrete value is a filter chip and the pattern keeps the set compact. An enum like \`colors\` with 75 free-form values is filter pollution â€” every color another chip, scroll past the fold several times.

**When an open enum has values that show similarity, locking in the pattern is the leverage move:**

1. Tighten the known-values list to match a pattern, leaving \`policy: open_prefer_known\` so new values are still accepted but pattern-conformant ones bubble to the top.
2. Document the pattern in \`ai_assist.reasoning_note\` so the LLM emits pattern-conformant values by default.
3. Flip \`policy: closed\` when the set is finite and every new value should be a human curation decision.
`.trim();

const ENUM_POLICY_BODY = `
Three policies govern how the LLM treats the enum values list:

- **\`closed\`** â€” only listed values are valid. The LLM should return a listed value only when evidence proves it; otherwise it should use the \`unk\` sentinel with \`unknown_reason\`, which produces no submitted value. Use when the set is small, finite, and well-understood.
- **\`open_prefer_known\`** â€” prefer listed values; accept new values if evidence supports them. The compiler marks new values as \`mark_needs_curation=true\` so a human decides whether to promote. Use when the set is stable but evolving.
- **\`open\`** â€” no canonical list; the LLM reports whatever the evidence says. Use when the space is too large to enumerate (e.g. chip model names) or when enumeration would prematurely constrain extraction.

**Pattern detection is the sweet spot.** Open enums with a dominant structural signature give you extensibility without filter chaos. When >=70% of known values share a signature (Part 4's pattern detector computes this), the enum is "patterned" â€” new values that conform get added cleanly, outliers get flagged as candidates for normalization or removal.

**Value-count discipline (refer to Part 1.5 for fatigue numbers):**

- **â‰¤ 10 values:** healthy. Everything visible by default.
- **11â€“15 values:** fine, first 10 visible + "Show more" fold.
- **16â€“20 values:** acceptable if values are meaningful; auditor should trim noise.
- **21â€“30 values:** filter fatigue. Either tighten the known list, induce a pattern so the LLM converges, or split into sub-enums.
- **30+ values:** the enum is out of control. Users will not scroll past the fold. This is the audit's single biggest improvement lever â€” consolidation here is high-value work.

**Pattern > value count.** An enum with 50 pattern-conformant values (all \`<N> <unit>\`) is easier to reason about than an enum with 20 free-form values.
`.trim();

const TIER_ROUTING_BODY = `
Every key's \`difficulty\` maps to one of five LLM bundles:

- **easy / medium / hard / very_hard** â€” per-category tier bundles in \`keyFinderTierSettingsJson\`.
- **fallback** â€” used when a tier is partially configured (empty model â†’ inherit whole fallback bundle).

Each bundle carries: \`model\`, \`useReasoning\`, \`reasoningModel\`, \`thinking\`, \`thinkingEffort\`, \`webSearch\`. A key marked \`difficulty: very_hard\` routes to a stronger model with reasoning + thinking + web search; \`easy\` routes to a smaller cheaper model. Part 3 lists the resolved bundles for the current category so auditors know which model each key actually hits.

Audit the priority triple as a search/routing contract:
- **\`required_level\`** decides publish pressure. \`mandatory\` means the site should try to publish the field for most products because it is buyer/site/benchmark useful and the answer is usually distinguishable from public/spec/visual/identity evidence: visible in product imagery, identifiable from variant identity, listed in spec sheets/docs, or generally present in credible public sources. It is not restricted to lab-only measurements. Missing proof still becomes unknown status with no submitted value. \`non_mandatory\` means useful enrichment that should not block publish.
- **\`availability\`** decides how early and often a field gets searched. \`always\` belongs on values credible sources usually expose, \`sometimes\` on uneven coverage, and \`rare\` on specialist values.
- **\`difficulty\`** decides model/search strength after variant inventory, PIF images, aliases, and source hints are available. \`easy\` = direct spec/photo/PIF/variant lookup or a straightforward canonical mapping. \`medium\` = available evidence but some normalization or light source comparison. \`hard\` = technical component reasoning, meaningful conflicts, aliases that change meaning, or source credibility calls. \`very_hard\` is reserved for hidden/lab-grade fields and deep technical identity work such as proprietary internal component identities, instrumented latency/accuracy measurements, unresolved datasheet links, or lab-only metrics.

For benchmarked categories, difficulty must be calibrated against benchmark-depth extraction, not shallow retailer-page availability. Use the category benchmark/example set as the quality target: the contract and guidance should explain how Key Finder can reproduce those values from public evidence without copying benchmark answers into the prompt.
`.trim();

const GROUPS_BODY = `
Field groups cluster semantically-related keys into named buckets. Authored in \`field_groups.json\`; mirrored on each rule as \`rule.group\` and \`rule.ui.group\`. Groups are a first-class organizational primitive â€” they drive behavior today and will drive more downstream.

**What groups do today:**

- **Bundling policy** â€” \`groupBundlingOnly=true\` restricts passengers to peers in the primary's group. A component-heavy primary should carry only fields that share the same evidence context. Groups with misplaced members waste bundling budget.
- **Co-discovery** â€” fields that share a spec-sheet section tend to share sources. When the LLM fetches a strong source for one field, the evidence often contains sibling field values from the same section. A well-grouped rule set lets a single search session resolve many members. Bad grouping means the same URL gets fetched multiple times across unrelated calls.
- **Reviewer orientation** â€” Field Studio groups keys in the sidebar so a human audit walks coherent sections instead of an alphabetic wall. The cognitive load of reviewing 80 keys depends heavily on whether they're grouped well.
- **Identity context** â€” identity-anchoring fields often cluster into one group so the reviewer can confirm the product's identity-critical spine in a single pass.

**What groups will do downstream (planned):**

- Consumer-facing product detail pages will render specs in group-named sections.
- Filter sidebar grouping will mirror these groups so the filter UI surfaces each cluster of attributes as a collapsible block.
- Per-group completeness scoring will drive publish-gate rules ("sensor group must be 100% complete to publish").
- Review workflows will key off group membership (someone reviews "all Sensor & Performance fields across the category" in one pass).

**What makes a GOOD group:**

- Fields that extract from the same evidence sources (same spec-sheet section, same review table).
- Fields that a filter user would check together (performance cluster, connectivity cluster).
- Fields a reviewer would evaluate back-to-back.
- A member count between ~3 and ~15 â€” small enough to hold in mind, large enough to justify the bucket.

**What makes a BAD group:**

- A "general" dumping ground with 10+ unrelated fields. Split it.
- Groups that drift into each other (Construction vs Dimensions â€” if reviewers always look at them together, consider merging).
- A single-field group. Usually the field belongs to an existing neighbor.
- A group named vaguely ("misc", "other", "extras") â€” if the name doesn't teach, the grouping isn't doing its job.

**Cross-group relationships** are expressed via \`cross_field_constraints\`: when one group's field depends on another group's field, the constraint surfaces both as a correctness rule and as a signal that the two groups are coupled â€” sometimes a sign one should move.
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

- \`lte\` / \`lt\` â€” "must be â‰¤ \`target\`" / "must be < \`target\`"
- \`gte\` / \`gt\` â€” "must be â‰¥ \`target\`" / "must be > \`target\`"
- \`eq\` â€” "must equal \`target\`"
- \`requires_when_value\` â€” "required when \`target\` = \"value\""
- \`requires_one_of\` â€” "requires one of: [targetsâ€¦]"

Compiled rules may store constraints as \`constraints\` string-DSL entries or as structured \`cross_field_constraints\` objects. The keyFinder renderer normalizes both forms into the same live prompt block. The auditor's job is to verify the relationship is correct and useful, not to re-report renderer plumbing.
`.trim();

const COMPONENT_RELATIONS_BODY = `
Two kinds of fields interact with components:

- **Component identity (parent)** â€” e.g. \`sensor\`, \`switch\`, \`encoder\`. The field's value IS the canonical component name. Its compiled rule has \`component.type\` set; the prompt gets a "This key IS the \`type\` component identity." pointer.
- **Component subfield** â€” a product field can belong to a component entity. The rule has \`component: null\` but appears as a property in the component database. When the parent identity is resolved on a product, the subfield values flow into the prompt as \`PRODUCT_COMPONENTS\` so the LLM doesn't re-extract them.

The component inventory in Part 5 is context for whether the Field Studio mapping is configured correctly. Do not ask for concrete component entity row edits in the Field Studio change file; report missing/stale component data separately.
`.trim();

const EVIDENCE_BODY = `
Four category-level global fragments teach the LLM the same discipline every finder uses. The report renders each one in full in Part 2 so the auditor can review current wording verbatim:

- **Evidence contract** â€” required \`supporting_evidence\` + \`evidence_kind\` structure, min_refs, per-rule override.
- **Evidence verification** â€” the LLM must FETCH each URL live and confirm it renders the claimed content before emitting.
- **Source tier strategy** â€” universal PRIMARY / INDEPENDENT / RETAILER / COMMUNITY tiering with per-tier trust rules.
- **Value confidence rubric** â€” 0â€“100 epistemic confidence scale, tier-independent (when to emit 95 vs 70 vs 40 vs unk).
- **Unk policy** â€” "honest unk beats low-confidence guess." When to return \`unk\` with a non-empty \`unknown_reason\` instead of paraphrasing.

These are per-category overridable via the Global Prompts editor. An auditor who spots a phrasing problem in, say, the evidence contract can fix it once for the whole category.
`.trim();

const RESERVED_KEYS_BODY = `
Not every field is routed through keyFinder. Some are owned by purpose-built finders and will be rejected before an LLM call if the auditor wires them up anyway:

- **\`colors\` / \`editions\`** â€” CEF (color/edition finder) owns these; variants + overrides handled separately.
- **\`release_date\`** â€” RDF (release-date finder) owns this.
- **\`sku\`** â€” SKF (SKU finder) owns this per-variant.
- **eg_defaults** keys â€” category-level defaults resolved at compile time; manual/LLM extraction is silenced.

The per-key block in Part 7 flags reserved keys clearly so an auditor does not spend time on a rule whose \`reasoning_note\` will never reach the live keyFinder.
`.trim();

const VARIANT_INVENTORY_CONTEXT_BODY = `
Variant Inventory Context is a single on/off checkbox in Key Navigator. There are no modes, profiles, or custom text fields. When enabled, Key Finder may receive \`VARIANT_INVENTORY\` and \`FIELD_IDENTITY_USAGE\`; when disabled, that context is omitted for the key.

**What the table contains:** active CEF variant identity joined by \`variant_id\` to facts such as variant key/label/type, color atoms, SKU, release date, and PIF image status. These facts are evidence filters, not Key Finder extraction targets. Key Finder must not extract or revise colors, editions, SKUs, or release dates through this checkbox.

**Enable only when it adds value without ambiguity:**
- The key's evidence is often variant-specific and the table helps reject wrong-color, wrong-edition, wrong-SKU, wrong-release, or sibling-variant sources.
- The key is list-valued or variant-varying and the reviewer can define whether the correct output is a product-wide union, exact-variant answer, base/default variant answer, or no submitted value with unknown_reason.
- Visual/design interpretation needs variant identity to avoid mistaking colorways or edition artwork for physical design changes.

**Leave disabled when:**
- The field is model-level and normally identical across every variant in the family, such as many scalar technical specs.
- Showing variant rows would encourage the LLM to split one invariant product answer into multiple variant answers.
- The key has no clear rule for union vs exact-variant vs base/default variant behavior.

Field-specific interpretation belongs in \`ai_assist.reasoning_note\`. Example for \`design\`: treat colorways, collaboration graphics, and edition artwork as non-design changes unless the physical shell, layout, construction, or included hardware differs.
`.trim();

const PIF_PRIORITY_IMAGES_BODY = `
PIF Priority Images is a separate single on/off checkbox in Key Navigator. There are no modes, profiles, or custom PIF guidance fields. When enabled, Key Finder uses the category's existing PIF priority-view settings and already-evaluated default/base variant images.

**What it injects:** the prompt receives \`PIF_PRIORITY_IMAGES\` plus attached 512px PNG thumbnails when available. Prompt preview still displays the normal preview URLs. If no image is available or the image cannot be attached, the prompt must explicitly say no attachable/evaluated PIF priority image is available instead of implying the trait is absent.

**Enable only when it adds visual value:**
- Direct visual keys where the category's priority views show the trait clearly.
- Subtle visual keys where the priority views support a repeatable judgment, but the real judgment still needs \`reasoning_note\`.
- Visual list fields where default/base images help but the reviewer also defines how edition-specific variants should be represented.

**Leave disabled when:**
- The key is a non-visual spec/source field such as component identity, supported rates, maximum ratings, internal controller, battery life, firmware, or compatibility.
- Default/base images would invite a false negative. Absence of a trait in default/base images is not proof the product family lacks it.
- The field needs edition-specific interpretation and the reviewer has not written that interpretation in \`reasoning_note\`.

Key Finder stays product-scoped. For yes/no fields, the reviewer must decide whether one official edition with the visible trait makes the product-level answer \`yes\`. For list-like visual fields, the reviewer may need to instruct the LLM to include the distinct variant/design forms found. Colors usually should not change the answer; editions might when they change shell, layout, material, included hardware, or other visible product facts.
`.trim();

const REASONING_NOTE_BODY = `
The generic template auto-renders ~13 slots for every key call. \`ai_assist.reasoning_note\` is the ONE slot the auditor edits. Getting its scope right is the audit's biggest lever.

**Use \`reasoning_note\` for:**
- Visual / photographic cues the LLM must apply when the field is decided from a product image.
- Semantic disambiguation between adjacent enum values.
- Field-specific gotchas that repeat across products (scroll-click â‰  middle button; sensor_brand follows the extracted sensor name, not the upstream fab).
- Rebrand / alias rules tied to extraction behavior (Razer Optical switch â†’ switch_brand=razer, not the upstream OEM).
- "Don't confuse with" anchors when two fields share surface vocabulary.
- Interpretation rules for ambiguous fields where a schema fix is out of scope.
- Field-specific instructions for interpreting variant evidence, such as design keys treating colorways/edition artwork as non-design changes unless physical shell/layout differs.

**Do NOT use \`reasoning_note\` for anything already rendered by another slot:**
- Enum values / aliases / type / shape / unit / rounding / list rules â€” rendered by \`PRIMARY_FIELD_CONTRACT\`.
- Preferred source domains / search terms â€” rendered by \`PRIMARY_SEARCH_HINTS\`.
- Source tier preference â€” rendered by \`SOURCE_TIER_STRATEGY\`.
- Evidence structure, min_refs, URL verification â€” rendered by \`EVIDENCE_CONTRACT\` + \`EVIDENCE_VERIFICATION\`.
- "Return unk when uncertain" policy â€” rendered by \`UNK_POLICY\`.
- 0â€“100 confidence rubric â€” rendered by \`VALUE_CONFIDENCE_GUIDANCE\`.
- Cross-field constraints â€” rendered by \`PRIMARY_CROSS_FIELD_CONSTRAINTS\`.
- Already-resolved component values â€” rendered by \`PRODUCT_COMPONENTS\`.
- Identity sibling-confusion warnings â€” rendered by \`IDENTITY_WARNING\`.
- Whether to inject the variant table â€” controlled by the separate Variant inventory context checkbox.
- Whether to attach default/base PIF priority images â€” controlled by the separate PIF Priority Images checkbox.
- Output JSON envelope â€” rendered by \`RETURN_JSON_SHAPE\`.

**Quick test before adding a sentence to a guidance cell:** if the concept is covered by a template slot in Part 2, delete the sentence. The generic template is authoritative â€” duplicating into guidance creates conflicting instructions that drift over time.
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
    { id: 'teach-tier', title: '7. Tier routing (difficulty â†’ model)', body: TIER_ROUTING_BODY },
    { id: 'teach-groups', title: '8. Field groups â€” why membership matters', body: GROUPS_BODY },
    { id: 'teach-bundling', title: '9. Bundling mechanics', body: BUNDLING_BODY },
    { id: 'teach-cross-field', title: '10. Cross-field constraints', body: CROSS_FIELD_BODY },
    { id: 'teach-component', title: '11. Component relations', body: COMPONENT_RELATIONS_BODY },
    { id: 'teach-evidence', title: '12. Evidence contract + source tiers + confidence + unk', body: EVIDENCE_BODY },
    { id: 'teach-reserved', title: '13. Reserved keys (owned by other finders)', body: RESERVED_KEYS_BODY },
    { id: 'teach-variant-inventory-context', title: '14. Variant inventory context checkbox', body: VARIANT_INVENTORY_CONTEXT_BODY },
    { id: 'teach-pif-priority-images', title: '15. PIF Priority Images checkbox', body: PIF_PRIORITY_IMAGES_BODY },
    { id: 'teach-reasoning-note', title: '16. What `reasoning_note` is FOR and NOT FOR', body: REASONING_NOTE_BODY },
  ];
}
