# 00-PRODUCT-GOAL.md — What IndexLab Is and What Success Looks Like

**This file must be read before any other documentation. It defines the purpose of everything else.**

---

## What IndexLab Does

IndexLab is an automated product specification crawler, parser, and extraction engine. It discovers web sources for a given product (manufacturer pages, retailer listings, review sites, spec databases, PDFs, support documents), fetches and parses them, extracts structured specification data using deterministic and LLM-assisted methods, and produces a complete, evidence-locked product JSON.

The output is a published product page on a consumer-facing review and comparison site. Every specification value shown to visitors must be accurate, sourced, and defensible.

---

## What A Completed Product Looks Like

A finished product JSON contains approximately **70 core spec fields** plus **17 score fields**, **9+ editorial fields**, and **media/commerce fields** covering:

- **Identity:** brand, model, baseModel, variant, SKU, release date, price range, colors
- **Physical:** weight, dimensions (length/width/height), material, coating, form factor, shape, hump position, front flare, thumb rest, grip styles, hand sizes
- **Connectivity:** connection type, wireless standard, Bluetooth, cable type, connectors (computer-side, mouse-side), paracord, wireless charging, battery life
- **Sensor:** model, brand, type, flawless status, DPI, IPS, acceleration, lift-off distance, motion sync, hardware acceleration, smoothing, polling rates, sensor latency
- **Switches:** model, brand, type, hot-swappable, debounce, click latency, click force
- **Buttons/Scroll:** side buttons, middle buttons, programmable count, tilt scroll, adjustable scroll, encoder
- **Memory/Software:** onboard memory, profile switching, NVIDIA Reflex support
- **Build:** feet material, honeycomb frame, silent clicks, adjustable weight, lighting, RGB
- **Scores:** overall, accuracy, response, quality, comfort, work, feet, and per-genre scores (FPS, MMO, MOBA, AARPG, RTS)
- **Editorial:** key takeaway, verdict, pros, cons, recommended games, subtitle
- **Media:** multi-color product images with view classifications, YouTube links
- **Commerce:** affiliate links per retailer per color variant

Every non-null value must include `source_url + evidence_quote + anchor/span`. Missing evidence means the field stays null, not guessed.

---

## Human Baseline — What We Actually Achieve By Hand

The following data comes from auditing **74 mouse products** (Acer through Corsair) that were manually populated by a human. This is the ground truth for what "done" looks like and where the real gaps are.

### Overall Numbers

| Metric | Value |
|--------|-------|
| Products audited | 74 (Acer 4, Alienware 5, Aorus 5, Asus 20, Cooler Master 8, Corsair 32) |
| Empty stubs (skeleton only, not worked) | ~7 (Asus GX1000, Harpe II Ace, Keris II Origin, Spatha X; CM MM730, MM731; partial Chakram X Core/Origin) |
| Truly worked products | ~65 |
| Core spec fields per product | 70 |
| Worked-product avg fill rate | **85–88%** (brand range: Acer 83%, Alienware 88%, Aorus 84%, Asus 88% excl stubs, CM 87% excl stubs, Corsair 85%) |
| Corsair first-half vs second-half fill | 84.1% → 86.3% (no fatigue — slight improvement) |
| Score fields fill rate | 87.8% (65/74 products scored) |
| Editorial fill rate (scored products) | 36–52% (verdict 52%, pros/cons 51%, keytakeaway 37%) |

### Field Difficulty Tiers (measured from 74 products)

These tiers define what a human can realistically populate and therefore what IndexLab should target.

#### TIER 1 — Always Findable (90%+ human fill) — 27 fields

IndexLab **MUST** match or exceed human fill rate on these. They come from manufacturer spec sheets, product pages, and retailer listings. If IndexLab can't get these, something is broken.

| Group | Fields |
|-------|--------|
| Identity | brand (100%), model (100%), baseModel (100%), category (100%) |
| Physical | weight (92%), lngth (92%), width (92%), height (92%), material (92%), form_factor (92%), shape (92%), hump (92%), front_flare (92%), thumb_rest (92%), grip (92%), hand_size (92%) |
| Connectivity | wireless_charging (92%) |
| Sensor | sensor_type (92%), polling_rate (92%), dpi (92%), ips (92%), acceleration (92%) |
| Switch | switch (91%), switch_type (91%), hot_swappable (92%) |
| Buttons | side_buttons (92%), middle_buttons (92%) |

#### TIER 2 — Usually Findable (70–89% human fill) — 31 fields

IndexLab **SHOULD** match human fill rate. These require checking multiple sources, cross-referencing spec sheets, or interpreting product descriptions. The 8% gap between Tier 1 and Tier 2 is mostly the ~8 stub products dragging down the percentage.

| Group | Fields |
|-------|--------|
| Identity | variant (74%), sku (89%), release_date (89%), price_range (89%), colors (89%) |
| Physical | coating (89%), design (89%), feet_material (89%), honeycomb_frame (89%), silent_clicks (89%), adjustable_weight (89%) |
| Connectivity | connection (89%), computer_side_connector (89%), bluetooth (89%), cable_type (89%), paracord (89%) |
| Sensor | sensor (89%), sensor_brand (88%), flawless_sensor (74%), lift (80%), lift_settings (78%), hardware_acceleration (73%), nvidia_reflex (86%) |
| Switch | switch_brand (86%) |
| Buttons | programmable_buttons (89%), tilt_scroll_wheel (89%), adjustable_scroll_wheel (89%) |
| Memory | onboard_memory (89%), profile_switching (89%) |
| Build | lighting (89%), rgb (89%) |

#### TIER 3 — Sometimes Findable (40–69% human fill) — 5 fields

IndexLab **stretch goals**. These are legitimately harder — some are contextual (battery_hours only applies to wireless; mouse_side_connector only applies to detachable cables) and some require deep review content.

| Field | Human Fill | Why It's Hard |
|-------|-----------|---------------|
| mouse_side_connector | 46% | Only applicable to mice with detachable cables; "n/a" for fixed-cable mice is correct |
| battery_hours | 46% | Only applicable to wireless mice; **92% fill when scoped to wireless-only** |
| motion_sync | 47% | Niche feature, not always disclosed by manufacturer |
| click_latency | 58% | Requires lab measurement data (rtings, techpowerup) — not on spec sheets |
| smoothing | 62% | Requires review-level testing to confirm |

#### TIER 4 — Rarely Findable (<40% human fill) — 6 fields

Human struggled with these too. IndexLab should **attempt** them but null is acceptable.

| Field | Human Fill | Why It's Hard |
|-------|-----------|---------------|
| mcu | 24% | Rarely disclosed; sometimes found in teardown reviews |
| debounce | 11% | Lab-only measurement; few sources publish it |
| click_force | 9% | Lab-only measurement; very few sources |
| sensor_latency | 8% | Lab-only measurement; rtings is primary source |
| encoder | 3% | Rarely disclosed even by manufacturers |
| encoder_brand | 3% | Same — teardown data only |

#### Context-Dependent Fields (not a gap — correctly conditional)

These fields appear as "low fill" but are actually correct:

| Field | Apparent Fill | Actual Context |
|-------|--------------|----------------|
| battery_hours | 46% overall | **92% for wireless mice** — the other 54% are wired mice where "n/a" is correct |
| mouse_side_connector | 46% overall | Higher when scoped to mice with detachable cables |
| discontinued | 0% | Editorial judgment call — not a spec field the system should extract |

### "unk" vs Empty vs Real — Deep Field Breakdown

For the hardest fields, the human explicitly marked unknowns as `"unk"` rather than leaving them empty. This is important context for IndexLab: `unk` means "I looked and couldn't find it", empty means "I haven't attempted this product yet."

| Field | Real Values | Marked "unk" | Empty/Missing |
|-------|------------|-------------|---------------|
| sensor_latency | 6 | 60 | 8 |
| debounce | 8 | 58 | 8 |
| click_latency | 43 | 23 | 8 |
| click_force | 7 | 59 | 8 |
| encoder | 2 | 0 | 72 |
| mcu | 18 | 50 | 6 |
| motion_sync | 35 | 31 | 8 |
| flawless_sensor | 55 | 13 | 6 |

The 8 "empty" entries across multiple fields correspond to the stub products.

---

## The Goal — Calibrated to Human Baseline

**20 products per day, matching or exceeding human fill rate per tier, with 95%+ factual accuracy on populated fields.**

Concrete targets:

| Tier | Human Baseline | IndexLab Target | Fields |
|------|---------------|----------------|--------|
| TIER 1 (Always Findable) | 92% | **95%+** | 27 fields — weight, dims, sensor specs, switch, buttons |
| TIER 2 (Usually Findable) | 85% | **88%+** | 31 fields — SKU, connectors, build features, sensor model |
| TIER 3 (Sometimes Findable) | 52% | **60%+** | 5 fields — click latency, motion sync, smoothing |
| TIER 4 (Rarely Findable) | 10% | **15%+** | 6 fields — debounce, click force, encoder, sensor latency |
| Scores | 88% | **N/A** | 17 fields — human editorial, not extracted |
| Editorial | 45% | **N/A** | 9+ fields — human-written content |

That means:

- Tier 1+2 fields (58 of 70): IndexLab must populate **90%+ of these** with correct values
- 95%+ of populated fields are factually correct (verified against source)
- Evidence-locked: every value is traceable to a specific source and quote
- Core facts (sensor, weight, dimensions, switch, DPI, polling rate) require Tier1/Tier2 sources or corroboration
- Deep claims (click latency, sensor latency, lift-off measurements) stored with methodology, confidence, and source count
- 20 products completed per day sustained over 7+ consecutive days
- Average run time under 8 minutes per product
- LLM cost under $0.50 per product
- System gets smarter over time: later products in a category need fewer searches than earlier ones

### What "Better Than Human" Looks Like

The human baseline has known weaknesses IndexLab should beat:

1. **Encoder data** — Humans left 97% of encoder fields empty. Teardown videos and detailed reviews (e.g., techpowerup) often contain this data. IndexLab should target 30%+ fill.
2. **Sensor latency / debounce / click force** — These exist on rtings.com and techpowerup for most products. The human marked them "unk" but the data is often there. IndexLab should target 40%+ where lab sources cover the product.
3. **Motion sync / smoothing** — Often disclosed in detailed reviews but not spec sheets. IndexLab with multi-source extraction should hit 70%+.
4. **Flawless sensor classification** — This can be deterministically derived from the sensor model name. IndexLab should achieve 98%+ via the component DB.

---

## Why This Is Hard

- Specs are spread across 5–15 different websites per product
- Manufacturer pages often lack deep specs (click latency, sensor latency, lift-off distance)
- Review sites use inconsistent terminology and units
- PDF manuals and spec sheets require parsing, not just fetching
- Some fields (click latency, sensor latency) only exist in lab measurement reports
- Products have variants (colors, wireless modes) that share most specs but differ on some
- Retailer listings are often incomplete or wrong
- Community sources (Reddit, forums) contain useful deep data but are not authoritative
- Sources go offline, rate-limit, require JavaScript rendering, or block crawlers

---

## Two-Phase Architecture — Collection vs Review

The system achieves this goal through two distinct phases:

**Phase A — Collection Pipeline (13 stages, current implementation focus).** The pipeline's only job is high-value extraction and storage. Search for sources, fetch pages, parse content, extract field values with evidence, and store per-source results. Every stage maximizes the volume and quality of collected evidence. No stage decides which value is "correct" — it collects everything it can find.

**Phase B — Review Phase (separate, implemented after collection pipeline).** A standalone process that runs independently after collection. It lays all collected per-source data side by side, compares values across sources, identifies the correct value for each field, flags conflicts and outliers, and decides whether another collection loop is needed. This is NOT part of the 13-stage pipeline.

The pipeline output is a set of per-source extraction records with evidence. The review phase output is the final consensus spec with provenance. The pipeline feeds the review phase, but they execute independently.

---

## Why Everything Else Exists

Every phase, every parsing surface, every test, every feature flag, every preset, every acceptance gate exists to serve this goal. If a piece of the system doesn't contribute to getting 20 accurate, evidence-locked products per day, it should be questioned.

- **SourceRegistry** exists so the system knows which sites have which specs
- **QueryCompiler** exists so searches target the right sources with the right operators
- **DomainHintResolver** exists so intent tokens like "manufacturer" and "lab" expand to real hosts
- **Core/Deep gates** exist so community data can't corrupt manufacturer facts
- **QueryIndex + URLIndex** exist so product 20 in a category needs half the searches of product 1
- **Visual pipeline** exists because some specs only appear in images or screenshots
- **Escalation ladder** exists because easy specs should be cheap and hard specs should only be expensive when justified
- **Component DB** exists so sensor → flawless_sensor, panel_type → subpixel_layout can be derived deterministically without searching

---

## How To Judge A Run

A run is good when:

1. Tier 1 fields are 95%+ populated with correct values
2. Tier 2 fields are 88%+ populated with correct values
3. Every populated field has evidence (source URL + quote)
4. Core facts match manufacturer specs exactly
5. Deep claims (Tier 3/4) show measurement methodology and confidence when populated
6. The run completed in under 8 minutes
7. The run cost less than $0.50 in LLM spend
8. The system learned something reusable (URLs indexed, query patterns recorded)

A run is bad when:

1. Fields are populated but wrong (worse than leaving them null)
2. Tier 1 fields are null despite evidence being trivially available on manufacturer pages
3. The system fetched 30 pages but only extracted from 3
4. The run timed out or stalled on a blocked host
5. The run spent $2 in LLM calls to fill 5 fields
6. The same queries were dispatched that were dispatched on the previous product in the same category
7. Context-dependent fields (battery_hours on wired mice) are populated with guessed values instead of left null

---

## Audit Methodology

The human baseline was measured on 2026-03-09 from 74 mouse product JSONs in `EG - TSX/src/content/data-products/mouse/` covering brands Acer through Corsair. Empty values were classified as: real value, "unk" (explicitly searched but not found), "n/a" (not applicable to product type), empty string (not yet attempted), or missing key. Fill rates use the definition: anything that is not null, undefined, empty string, "unk", "n/a", or empty array counts as "filled."
