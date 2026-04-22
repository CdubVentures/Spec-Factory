# Mouse Keys Extraction Guidance Audit
**Answer:** I do **not** agree with every extraction-guidance cell as written. I agree with the intent of many cells, but I recommend trimming duplicated contract/search-hint content, removing stale hardcoded component facts, and fixing several semantic errors before patching `ai_assist.reasoning_note`.

**Source audited:** `mouse-keys-matrix.html` — Extraction guidance / `reasoning_note` column.

**Scope:** This audits only the guidance text, not the full proposed required/availability/difficulty changes, except where those proposals affect guidance semantics.

**Diff convention:**

- `+` = add, replace, or keep with this change.
- `-` = remove, soften, or move out of `reasoning_note`.
- `Why` = reason for the recommendation.

## Summary
- Source rows audited: **80**.
- Minor revise: **46**
- Major revise: **28**
- Schema decision: **2**
- Keep/deprecate: **2**
- Keep: **2**

### Highest-risk corrections
- **`form_factor`**: do not mark a symmetrical shell as `ambidextrous` unless the control layout is actually left/right usable; the current Viper V3 Pro example is unsafe.
- **`sensor_latency_*`**: replace “click-to-cursor” with movement-to-cursor/sensor-path latency; click latency is a separate field.
- **`sensor_type`**: remove Microsoft BlueTrack from laser examples.
- **`height`**: do not add estimated feet thickness to published dimensions.
- **`computer_side_connector`**: decide whether the field is cable connector or dongle connector; current wording mixes both.
- **`sensor`, `ips`, `acceleration`, `motion_sync`, `flawless_sensor`**: move hardcoded component facts/rebrand lineages into component DB/search hints.
- **`nvidia_reflex`**: rename/split to avoid conflating Reflex SDK with Reflex Latency Analyzer mouse compatibility.

## References spot-checked
The audit primarily uses the uploaded matrix text. I also spot-checked high-risk technical claims and current terminology against these sources as of 2026-04-22:

- [NVIDIA Reflex SDK docs](https://developer.nvidia.com/performance-rendering-tools/reflex)
- [NVIDIA Reflex compatible products](https://www.nvidia.com/en-us/geforce/technologies/reflex/supported-products/)
- [notronalds Reflex Latency Analyzer Mouse Database](https://github.com/notronalds/Reflex-Latency-Analyzer-Mouse-Database)
- [RTINGS click latency methodology](https://www.rtings.com/mouse/tests/control/latency)
- [RTINGS sensor latency methodology](https://www.rtings.com/mouse/tests/control/sensor-latency)
- [RTINGS comfort/grip methodology](https://www.rtings.com/mouse/tests/design/ergonomics)
- [RTINGS shape methodology](https://www.rtings.com/mouse/tests/design/shape)
- [Logitech HERO 2 sensor](https://www.logitechg.com/en-us/discover/technology/hero-2-sensor)
- [Logitech G HUB HERO 2 guide](https://www.logitechg.com/en-us/software/guides/hero-2-sensor)
- [Logitech LIGHTFORCE switches](https://www.logitechg.com/en-us/discover/technology/lightforce)
- [Logitech LIGHTFORCE support note](https://support.logi.com/hc/en-001/articles/16237236344727-What-is-the-difference-between-Hybrid-and-optical-only-mode-of-the-LIGHTFORCE-switch)
- [Razer Focus Pro sensor](https://www.razer.com/technology/razer-focus-pro-sensor)
- [Razer mouse technologies / Focus Pro 45K](https://www.razer.com/technology/mice)
- [Razer scroll wheel technologies](https://www.razer.com/technology/razer-scroll-wheels)
- [EloShapes encoders browse](https://www.eloshapes.com/mouse/encoders/browse)
- [sensor.fyi information](https://sensor.fyi/info/)
- [sensor.fyi sensors](https://sensor.fyi/sensors/)
- [Nordic gaming applications reference](https://www.nordicsemi.com/Applications/Gaming)
- [Nordic nRF52840 gaming mouse example](https://www.nordicsemi.com/Nordic-news/2022/02/G-Wolves-uses-nRF52840-in-The-Hati-ACE-computer-peripherals)
- [FCC ID search](https://www.fcc.gov/oet/ea/fccid)

## Field-by-field audit

### General 9 keys

#### `colors` — Minor revise
- **Type / shape:** list · string
- `+` **Change:** Keep the colorway/SKU idea, but explicitly normalize to the site color taxonomy and reserve marketing names for evidence or variant metadata. Add: shell/base colors first; accents count only when the official SKU name makes the accent material.
- `-` **Change:** Remove list-format instructions such as comma handling and `color+color` if those are already handled by the field contract. Remove any implication that every tiny accent becomes a facet.
- **Why:** The guidance is useful visually, but it can cause facet pollution and duplicates contract/list-shape rules.

#### `editions` — Minor revise
- **Type / shape:** list · string
- `+` **Change:** Add a rule for officially named edition SKUs: if the brand markets “White Edition” as a named edition but it is only a colorway, store the color in `colors` and preserve the edition name only in title/variant metadata unless there is a true limited/collab/anniversary release.
- `-` **Change:** Soften the absolute “White Edition is NOT an edition” wording because some brands use “Edition” in official product names even when the extraction field should still treat it as a colorway.
- **Why:** The semantic distinction is right, but the guidance should separate official naming from the filter meaning.

#### `sku` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Prefer official MPN/model number and add support for variant-specific official SKUs when the product has no stable base SKU. State that the chosen value must be the SKU for the exact product/variant being extracted.
- `-` **Change:** Remove the hard rule that the field “holds the base SKU” for products with variants; that can erase the actual SKU for color/region/bundle variants.
- **Why:** Manufacturer SKU practice varies; forcing a base SKU may reduce exact-product identity.

#### `release_date` — Major revise
- **Type / shape:** scalar · date
- `+` **Change:** Use the exact brand announcement/launch date when available. If only month/year is available, either use the system’s partial-date convention or record the first day only with an explicit evidence note that it is month-level precision.
- `-` **Change:** Remove “If only month known → `MM/01/YYYY`” as an unconditional rule unless the date contract requires artificial day padding.
- **Why:** Padding a partial date as the first day of a month can create false precision.

#### `design` — Major revise
- **Type / shape:** list · string
- `+` **Change:** Define the field as high-level product/design intent only after the enum is cleaned; use it to distinguish shell concepts such as solid shell, perforated shell, MMO, productivity, ultralight, etc.
- `-` **Change:** Remove the raw enum list and “tournament/lightweight/standard” examples from `reasoning_note`; enum values belong in the field contract and “tournament” is marketing-heavy.
- **Why:** The current text repeats enum policy and mixes design taxonomy with marketing tags.

#### `discontinued` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Add “yes” when the brand explicitly marks EOL/discontinued/archived or all official first-party product pages are replaced by support-only pages. Use retailer status only as weak evidence.
- `-` **Change:** Soften “removed from their own shop = yes”; many active products leave a direct shop temporarily or move to region-specific retail.
- **Why:** Shop availability is not the same as product discontinuation.

#### `price_range` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Clarify whether this field is a raw launch MSRP, an MSRP bucket, or a display range. If it means MSRP, consider renaming or documenting it as `launch_msrp_usd`.
- `-` **Change:** Remove “US MSRP at launch, no currency symbol” if the field remains named `price_range` and typed as string; that wording conflicts with a range/bucket concept. Also remove “last known MSRP before EOL” if launch MSRP is the intended value.
- **Why:** The guidance defines a different field than the key name suggests.

#### `lighting` — Major revise
- **Type / shape:** list · string
- `+` **Change:** Keep the zone-count rule, but define a canonical split: `lighting` should describe zones/effects, while `rgb` should be derived or retired. Replace “per-key” with mouse-appropriate wording such as “per-zone” or “per-LED addressable.”
- `-` **Change:** Remove keyboard-specific “per-key” terminology and the `(rgb)/(led)` suffix if `rgb` stays as the canonical color-configurability boolean.
- **Why:** The guidance correctly spots overlap with `rgb`, but it needs a schema decision and mouse-specific terms.

#### `rgb` — Schema decision
- **Type / shape:** scalar · boolean
- `+` **Change:** Make `rgb` a computed shortcut from `lighting` or a simple yes/no filter: yes only for user-configurable multi-color lighting; no for fixed single-color LEDs; `n/a` or no-lighting as defined by contract.
- `-` **Change:** Remove the schema-decision sentence from per-field guidance once the decision is made; `reasoning_note` should not say “keep one as canonical.”
- **Why:** This field is redundant with `lighting`; extraction guidance should reflect the chosen ownership, not debate it.

### Sensor & Performance 21 keys

#### `sensor` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Keep “chip/model only” and suffix preservation. Move rebrand aliases into the component alias table or search hints. Add: use the brand-published sensor name as the primary value unless the brand explicitly names an upstream PixArt/other part.
- `-` **Change:** Remove the long “verified lineage” paragraph from `reasoning_note`; it is too specific, will age quickly, and several equivalences are contested or implementation-dependent.
- **Why:** The guidance should teach extraction semantics, not hardcode a living rebrand database.

#### `sensor_brand` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Define as “brand attached to the published sensor name.” Add: if the value is `PAW3395`, brand is PixArt; if the value is `Razer Focus Pro`, brand is Razer; if both are shown, choose the brand that owns the extracted `sensor` value.
- `-` **Change:** Remove or shorten repeated examples once aliases are stored centrally.
- **Why:** The rule is strong, but examples should not become the only mapping source.

#### `sensor_type` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Use the sensor database or explicit manufacturer language. For modern gaming mice with a known optical sensor, `optical` is safe; otherwise leave unknown rather than guess.
- `-` **Change:** Remove “Microsoft BlueTrack” from laser examples; BlueTrack is a blue-light optical tracking technology, not a laser sensor. Also remove the “~99%” claim from guidance.
- **Why:** The current examples can misclassify older productivity sensors and rely on a base-rate shortcut.

#### `sensor_link` — Major revise
- **Type / shape:** scalar · url
- `+` **Change:** Say: link an official page for the extracted sensor name when one exists; for brand-rebranded sensors, prefer the brand’s sensor-technology page or the exact product spec page.
- `-` **Change:** Move exact URL patterns and domain lists to `search_hints`; remove “leave empty rather than link distributor/review listing” if the field contract already governs source tiering.
- **Why:** URL patterns are search configuration, not reasoning guidance.

#### `sensor_date` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Derive from the resolved sensor component only when the component database has a sourced release/announcement date. If not, keep unknown or use the earliest reliable manufacturer announcement.
- `-` **Change:** Remove “PixArt chips are dated on the product-detail page” as a universal claim; vendor pages are inconsistent and some sensor release dates are inferred from first product launches.
- **Why:** A sensor date is a component attribute, not something every mouse page will support.

#### `flawless_sensor` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Define the classification narrowly: no measurable hardware acceleration, prediction/angle snapping, problematic smoothing, jitter, or spin-out under rated use. Derive from a maintained sensor/mouse classification source, not from marketing alone.
- `-` **Change:** Remove the hardcoded list of flawless sensors and the “Original HERO” caveat from guidance; store those as component facts or source notes if verified.
- **Why:** Hardcoded sensor lists become stale and “flawless” is a community classification, not a single datasheet field.

#### `dpi` — Minor revise
- **Type / shape:** scalar · number
- `+` **Change:** Keep “advertised maximum, not step list.” Add that CPI/DPI are treated as equivalent display terms and that software-interpolated values should be flagged if the source distinguishes native vs boosted DPI.
- `-` **Change:** Remove the casual “wireless vs wired max usually match” sentence; it does not change extraction behavior.
- **Why:** The core rule is good; tightening removes nonessential assumptions.

#### `ips` — Major revise
- **Type / shape:** scalar · number
- `+` **Change:** Extract the rated max IPS from the exact resolved sensor or product spec, and avoid hardcoding typical values in guidance. Let the component DB carry PAW/HERO/Focus numbers.
- `-` **Change:** Remove the example values from `reasoning_note`; at least HERO 2 has changed in current Logitech documentation, and Razer/PixArt values vary by generation.
- **Why:** Current numbers are living component data, not stable field semantics.

#### `acceleration` — Major revise
- **Type / shape:** list · number
- `+` **Change:** Extract rated max acceleration in G from the exact sensor/product spec and let the component table supply known values.
- `-` **Change:** Remove the PAW/HERO/Razer hardcoded examples from guidance.
- **Why:** The concept is right, but values vary by sensor revision and firmware generation.

#### `hardware_acceleration` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Explicitly distinguish sensor/firmware hardware acceleration from OS pointer acceleration or optional software curves. Add a cross-field rule: if `flawless_sensor=yes` and no contrary evidence, this is normally no.
- `-` **Change:** Remove “nearly always no” as a direct fill shortcut.
- **Why:** The semantic disambiguation is useful, but base-rate shortcuts can hide exceptions.

#### `polling_rate` — Minor revise
- **Type / shape:** list · number
- `+` **Change:** List unique firmware-exposed report rates and preserve mode-specific evidence when wired/wireless/Bluetooth differ. If the schema only stores one list, include all supported rates rather than only the highest per mode.
- `-` **Change:** Remove “use the higher of the two as the list max” unless the contract explicitly asks for only maximum polling rate.
- **Why:** The field is a list; mode-specific maxima should not be collapsed without schema support.

#### `lift` — Minor revise
- **Type / shape:** list · mixed_number_range
- `+` **Change:** Keep LOD rules for fixed/list/range. Add: use manufacturer/software settings or lab measurement; when derived from sensor, verify the mouse firmware exposes the same lower bound.
- `-` **Change:** Remove specific PAW3950/PAW3395 floor values from guidance.
- **Why:** Sensor capability and mouse firmware settings are not always identical.

#### `lift_settings` — Minor revise
- **Type / shape:** list · string
- `+` **Change:** Define the semantic classes after the enum decision: fixed-low, fixed-high, adjustable. Tie thresholds to the contract, not free text.
- `-` **Change:** Remove the raw enum list from `reasoning_note` if the contract already renders allowed values.
- **Why:** Good disambiguation, but it repeats enum content.

#### `smoothing` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Derive from tested sensor behavior or a trusted sensor classification source. If component DB says flawless/no smoothing, fill no with component evidence.
- `-` **Change:** Remove “All flawless sensors: no” as an unsupported absolute unless encoded as a cross-field constraint.
- **Why:** Smoothing can be sensor-level, firmware-level, or DPI-dependent; the rule should be evidence-backed.

#### `motion_sync` — Major revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Mark yes only when the brand/software explicitly advertises Motion Sync, Frame Sync, or equivalent sensor-frame/poll synchronization for that exact model. Describe the feature generically as aligning sensor reports with polling cadence.
- `-` **Change:** Remove claims that Razer enables it by default, Logitech exposes it on HERO-class mice, or that it adds “~1ms”; these vary by implementation and polling rate.
- **Why:** The field is feature-exposure, not underlying sensor potential. Current sources use different branding and latency effects are implementation-dependent.

#### `nvidia_reflex` — Major revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Rename to `nvidia_reflex_analyzer` or split SDK support from Reflex Latency Analyzer mouse compatibility. Mark yes when official NVIDIA list, brand claims, or a reliable RLA test/database verifies Analyzer compatibility; otherwise unknown.
- `-` **Change:** Replace “official list is not authoritative” with “official list is authoritative for certification but may not be exhaustive.” Remove “mark no only when tested-and-failed” unless `unk` policy explicitly supports that for all absent evidence.
- **Why:** NVIDIA Reflex SDK and Analyzer mouse compatibility are different concepts; the current wording is correct to warn about them but too adversarial and under-specified.

#### `shift_latency` — Minor revise
- **Type / shape:** scalar · number
- `+` **Change:** Keep as lab-only/rare and define it as DPI-shift engagement latency. Add: use only named lab methodology or the same source family used for latency fields.
- `-` **Change:** Move the RTINGS URL out of guidance into search hints; remove “typical values” unless maintained in a benchmark glossary.
- **Why:** The extraction concept is fine; source URLs and typical ranges are not field semantics.

#### `sensor_latency` — Keep/deprecate
- **Type / shape:** scalar · number
- `+` **Change:** Keep the deprecation note and add a migration rule: do not fill this legacy field when per-mode fields exist unless backfilling old records.
- `-` **Change:** Remove it from active extraction tasks if the schema can retire it.
- **Why:** The guidance is directionally correct: a legacy aggregate latency field invites inconsistent data.

#### `sensor_latency_wired` — Major revise
- **Type / shape:** scalar · number
- `+` **Change:** Define as movement-to-cursor/sensor-path latency in wired mode using a lab methodology. Keep “do not derive from polling rate.”
- `-` **Change:** Remove “click-to-cursor”; that is click latency, not sensor latency.
- **Why:** The current wording confuses two different latency measurements.

#### `sensor_latency_wireless` — Major revise
- **Type / shape:** scalar · number
- `+` **Change:** Define as 2.4GHz dongle movement-to-cursor/sensor latency. Use `n/a` only when the mouse has no 2.4GHz mode.
- `-` **Change:** Remove “total sensor latency” if it implies click latency, and remove typical deltas unless a benchmark source is named.
- **Why:** The key is mode-specific sensor latency; measured deltas vary widely across firmware and test rigs.

#### `sensor_latency_bluetooth` — Major revise
- **Type / shape:** scalar · number
- `+` **Change:** Define as Bluetooth movement-to-cursor/sensor latency using a lab methodology. Use `n/a` for mice without Bluetooth.
- `-` **Change:** Remove the fixed “4–15ms” range from guidance.
- **Why:** Bluetooth latency varies by implementation and host stack; ranges belong in benchmark analysis, not extraction rules.

### Switches 13 keys

#### `switch` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Keep exact switch model/generation and “brand verbatim when generic.” Add: specify this is the main left/right click switch unless a separate field exists for wheel/side-button switches.
- `-` **Change:** Remove “Difficulty is hard...” from `reasoning_note`; priority/difficulty rationale belongs in the priority block, not extraction guidance.
- **Why:** The semantic rule is useful, but the difficulty explanation is metadata, not extraction instruction.

#### `switch_brand` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Keep the rebrand rule and add: brand should match the extracted switch name, not the PCB assembler or upstream manufacturer unless the source names that manufacturer.
- `-` **Change:** Remove unverifiable upstream claims such as who makes a specific rebranded switch unless the component DB has sourced evidence.
- **Why:** Brand ownership of rebranded switches can be opaque and can change by revision.

#### `switch_type` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Keep the actuation taxonomy but move the allowed values into the enum contract. Add: classify only from known switch model, brand description, or teardown, not from marketing adjectives alone.
- `-` **Change:** Remove the inline “four possibilities” list from guidance if the contract already renders allowed values.
- **Why:** The classification is important, but repeating enum values contradicts the matrix’s own generic-prompt coverage rules.

#### `switches_link` — Major revise
- **Type / shape:** scalar · url
- `+` **Change:** Say: link an official switch technology page or manufacturer product/datasheet page for the extracted switch model when available.
- `-` **Change:** Move all URL patterns/domains to `search_hints`; remove “skip reseller/review listing” if source-tier policy already handles it.
- **Why:** This guidance is mostly search configuration, not field-specific semantics.

#### `hot_swappable` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Keep “no desoldering” as the core rule. Add: yes requires socketed/user-serviceable switches documented by brand, manual, or teardown.
- `-` **Change:** Soften “if the brand doesn’t call it out, it’s no”; some niche/budget mice may be socketed but poorly documented.
- **Why:** The value can be verified by teardown even when marketing is silent.

#### `click_force` — Minor revise
- **Type / shape:** scalar · number
- `+` **Change:** Use switch datasheet or lab measurement in gf/cN, tied to the exact switch model and switch generation.
- `-` **Change:** Remove common switch-force examples from guidance; store them in the switch component database.
- **Why:** Examples are helpful today but make the guidance brittle and duplicate component facts.

#### `click_latency` — Keep/deprecate
- **Type / shape:** scalar · number
- `+` **Change:** Keep legacy/deprecated status and add a migration rule to use per-mode latency fields for new data.
- `-` **Change:** Remove as active extraction guidance where per-mode keys exist.
- **Why:** Single-value click latency hides connection-mode differences.

#### `debounce` — Minor revise
- **Type / shape:** scalar · number
- `+` **Change:** Use only explicit software/device setting, manual/firmware documentation, or lab measurement. Treat “0ms debounce” marketing as a claim that still needs context.
- `-` **Change:** Remove brand-specific speculation about which software exposes fixed values unless it is moved to search hints and kept current.
- **Why:** Debounce is firmware-specific and often unpublished; inferring from switch type is unsafe.

#### `silent_clicks` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Mark yes when the brand markets silent/quiet/sound-reduced switches for the exact model, or a lab threshold is defined and met.
- `-` **Change:** Remove the product list and “default no for mainstream gaming” as hard fill rules.
- **Why:** The concept is correct, but product examples and base-rate defaults will age.

#### `click_latency_wired` — Minor revise
- **Type / shape:** scalar · number
- `+` **Change:** Keep wired click-to-register latency and lab-only evidence. Add: use comparable full-device measurements, not switch datasheet debounce or browser tests.
- `-` **Change:** Move the exact RTINGS methodology details/URL to search hints or methodology docs if guidance needs to stay source-neutral.
- **Why:** The methodology note is useful, but the extraction rule should not bind to one lab unless that is the project standard.

#### `click_latency_wireless` — Minor revise
- **Type / shape:** scalar · number
- `+` **Change:** Define as 2.4GHz dongle click-to-register latency for the exact wireless mode tested.
- `-` **Change:** Remove the “typical 0.3–2ms above wired” range from guidance.
- **Why:** Mode deltas vary and should not influence extraction.

#### `click_latency_bluetooth` — Minor revise
- **Type / shape:** scalar · number
- `+` **Change:** Define as Bluetooth click-to-register latency for the exact Bluetooth mode tested.
- `-` **Change:** Remove the “usually 4–15ms” range from guidance.
- **Why:** Ranges are benchmark context, not extraction semantics.

### Buttons & Features 8 keys

#### `programmable_buttons` — Minor revise
- **Type / shape:** scalar · integer
- `+` **Change:** Count physical controls that can be remapped in official software or onboard firmware. Specify whether L/R click, scroll click, side buttons, wheel tilt, and top buttons are included by the field contract.
- `-` **Change:** Remove the unconditional inclusion list if the contract defines button counting; “sniper” should count only if it is remappable and physical.
- **Why:** Different brands count “programmable buttons” differently, so the project needs one count convention.

#### `side_buttons` — Minor revise
- **Type / shape:** scalar · integer
- `+` **Change:** Keep thumb/side-panel rule. Add modular-panel and ambidextrous handling: count the target SKU’s installed or included side buttons, not optional accessory panels unless the field contract says to count maximum configuration.
- `-` **Change:** Remove “sniper/DPI-shift if on top is middle” from this field if another field handles top buttons; keep only side-panel inclusion/exclusion here.
- **Why:** Side-button counts can vary by modular configuration and exact SKU.

#### `middle_buttons` — Minor revise
- **Type / shape:** scalar · integer
- `+` **Change:** Keep top-shell non-wheel-button definition. Add: count wheel-adjacent mode/DPI/profile buttons only when they are physical buttons separate from scroll click.
- `-` **Change:** Remove or move scroll-wheel tilt exclusion if wheel tilt has its own field and cross-field constraints cover it.
- **Why:** The rule is sound; it just needs exact physical-button boundaries.

#### `onboard_memory` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Yes when profiles/settings persist on the mouse without driver software. Add: onboard DPI-only storage is not enough unless the contract intentionally treats it as onboard memory.
- `-` **Change:** Remove “near-universal on post-2020 gaming mice” as a fill shortcut.
- **Why:** Presence is common but not universal, and the scope of stored settings matters.

#### `onboard_memory_value` — Minor revise
- **Type / shape:** scalar · integer
- `+` **Change:** Record number of onboard profile slots. If firmware lets the user import/save variable slots, use the maximum official onboard slots.
- `-` **Change:** Remove “often undisclosed” from guidance; that is availability rationale.
- **Why:** Good extraction rule; availability commentary is not needed in `reasoning_note`.

#### `profile_switching` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Yes if the mouse can switch onboard profiles without desktop software, using a physical button, assigned onboard command, or documented firmware hotkey.
- `-` **Change:** Soften “software-only profile change = no” to “no unless the software writes a profile-switch command to onboard controls.”
- **Why:** Some devices require software only for setup, but profile cycling works onboard afterward.

#### `adjustable_scroll_wheel` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Keep toggleable ratchet/free-spin definition. Add that the mode can be physical, automatic, or software-configurable if it changes wheel resistance/scroll behavior on the device.
- `-` **Change:** Move long brand-term examples to search hints, or shorten them to one or two canonical examples.
- **Why:** The field-specific gotcha is useful; brand examples can age.

#### `tilt_scroll_wheel` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Yes only when lateral wheel clicks/horizontal-scroll tilt are confirmed by specs, manual, or clear review/photo evidence.
- `-` **Change:** Remove “visible lateral clearance” as sufficient evidence; photos can show clearance without functional tilt.
- **Why:** Visual cues are helpful but can create false positives.

### Encoder 3 keys

#### `encoder` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Use exact encoder model from teardown, component database, or manufacturer evidence. If only a generic encoder is identified by source, record that generic value according to component DB policy.
- `-` **Change:** Remove TTC/Kailh quality notes, torque/lifespan examples, and “premium/mid-tier” claims from guidance.
- **Why:** Those are component attributes and buyer-evaluation comments, not extraction semantics.

#### `encoder_brand` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Derive from the resolved encoder model; if encoder is unknown, brand is unknown.
- `-` **Change:** No deletion needed beyond avoiding a brand guess when the encoder value is generic or inferred.
- **Why:** The current rule is concise and mostly correct.

#### `encoder_link` — Minor revise
- **Type / shape:** scalar · url
- `+` **Change:** Link the exact manufacturer product page/datasheet when it exists; otherwise leave blank.
- `-` **Change:** Remove “rarely available” commentary if it is only availability rationale.
- **Why:** The extraction rule is valid, but the rarity explanation belongs in priority metadata.

### Connectivity 9 keys

#### `connection` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Define `hybrid` as support for two or more operating connection modes among wired, 2.4GHz dongle, Bluetooth, or other proprietary wireless mode.
- `-` **Change:** Remove brand-marketing examples after the enum contract/search hints cover aliases like tri-mode.
- **Why:** The current guidance is correct but repeats alias handling.

#### `connectivity` — Minor revise
- **Type / shape:** list · string
- `+` **Change:** List actual wireless protocols/modes supported, collapsing marketing names to canonical protocol values. Add: do not label proprietary 2.4GHz RF as Wi-Fi unless the product truly uses Wi-Fi.
- `-` **Change:** Remove polluted enum variants from guidance and clean them in the enum source instead.
- **Why:** The field needs protocol normalization; enum cleanup should not live in reasoning notes.

#### `bluetooth` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Yes when the mouse offers Bluetooth HID/LE/Classic as a usable host connection mode for computers/tablets/phones.
- `-` **Change:** Remove “phone-only fallback counts yes” unless the product is usable as a normal Bluetooth HID mouse; a configuration-only phone link should not count.
- **Why:** Bluetooth should mean a first-class pointing-device connection, not any phone radio feature.

#### `wireless_charging` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Yes for cable-free power transfer such as Qi, Powerplay, HyperFlux, or equivalent charging mats/docks. Add: exclude ordinary USB charging docks or pogo-pin cradles unless they use wireless induction.
- `-` **Change:** Remove `n/a` for wired-only if the field’s boolean contract does not support `n/a`; use the global sentinel policy instead.
- **Why:** Charging docks can be wired contacts, not wireless charging.

#### `cable_type` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Classify the outer jacket of the included data/charge cable; use brand spec, manual, or clear photo.
- `-` **Change:** Remove purely visual classification as the only path; brand language can be stronger evidence than photos.
- **Why:** Visual cues are useful, but cable materials are often specified directly.

#### `paracord` — Schema decision
- **Type / shape:** scalar · boolean
- `+` **Change:** Retire it or compute it from `cable_type == paracord`. If retained, define it strictly as a boolean shortcut derived from cable type.
- `-` **Change:** Remove independent extraction guidance for this field after the schema decision.
- **Why:** It duplicates `cable_type` and will drift if extracted independently.

#### `computer_side_connector` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Clarify target object: if this is a cable field, use the computer end of the included wired/charge/data cable. Create a separate `dongle_connector` field if the wireless dongle plug type matters.
- `-` **Change:** Remove “For wireless: the dongle’s plug type” unless the schema intentionally defines this key as dongle connector for wireless mice.
- **Why:** A wireless dongle connector and a cable’s computer-side connector are different hardware facts.

#### `mouse_side_connector` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Use the port on the mouse for the included data/charge cable; `n/a` only when there is no physical data/charge port.
- `-` **Change:** Remove “Micro-B is only on older or budget mice” as a value shortcut.
- **Why:** The rule is sound; the age/budget comment is unnecessary and may become stale.

#### `battery_hours` — Major revise
- **Type / shape:** scalar · number
- `+` **Change:** Define a standard condition. Recommended: highest manufacturer-advertised battery life for the primary wireless gaming mode at 1000Hz with RGB off, while preserving source wording in evidence. If Bluetooth-only value is higher, do not use it unless the contract says “maximum any mode.”
- `-` **Change:** Remove the contradictory pair “use 1000Hz value” and “use the highest advertised figure” unless “highest at 1000Hz/RGB-off” is the exact rule.
- **Why:** Battery life can differ by polling rate, RGB, Bluetooth, dongle mode, and power mode; the current wording can pick inconsistent values.

### Construction 6 keys

#### `material` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Keep primary external shell/body material and “not coating/feet.” Add: distinguish structural magnesium/carbon-fiber/metal shell from metal-colored or metallized plastic.
- `-` **Change:** Remove enum values from guidance after material is removed from component DB and the enum contract is fixed.
- **Why:** The field-specific gotcha is good; enum/component policy belongs elsewhere.

#### `coating` — Minor revise
- **Type / shape:** list · string
- `+` **Change:** Define whether coating covers top shell only or all hand-contact surfaces. If all contact surfaces are intended, list top finish and side grip material separately with region evidence.
- `-` **Change:** Remove “top-shell finish” if the guidance then says to include rubberized side grips; those two scopes conflict.
- **Why:** The current cell mixes top-only and whole-contact-surface semantics.

#### `feet_material` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Use stock feet only. Record material and grade when explicitly stated by brand or reliable teardown/review.
- `-` **Change:** Remove “PTFE is 99%” and aftermarket commentary from extraction guidance.
- **Why:** Base-rate statements can bias extraction; stock-vs-aftermarket is the important distinction.

#### `honeycomb_frame` — Minor revise
- **Type / shape:** scalar · boolean
- `+` **Change:** Yes for visible structural/perforation holes intended for weight reduction on top, sides, or bottom shell.
- `-` **Change:** Remove the “sensor cooling” rationale unless the product source explicitly says vents are for cooling; small vents should be excluded simply because they are not weight-relief shell perforations.
- **Why:** Good visual rule, but the cooling explanation is speculative.

#### `adjustable_weight` — Keep
- **Type / shape:** scalar · boolean
- `+` **Change:** Keep the user-removable/addable weight definition. Add: include magnetic pucks/cartridges/weight trays only when the user can change them after purchase.
- `-` **Change:** No substantive deletion needed; just avoid repeating examples if the contract already has aliases.
- **Why:** This guidance cleanly distinguishes adjustable weights from SKU-level weight variants.

#### `weight` — Minor revise
- **Type / shape:** scalar · number
- `+` **Change:** Report mouse weight without cable and without dongle/receiver unless the source explicitly includes accessories. For adjustable-weight mice, use the lightest official usable configuration and note if measured review conflicts.
- `-` **Change:** Remove the hard “verify ±2g” and “~95%” claim unless backed by the project’s measured workbook analysis.
- **Why:** The cable-excluded rule is important; unsupported accuracy statistics should not be in guidance.

### Ergonomics 7 keys

#### `shape` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Use top-down and side photos plus product ergonomics language. Define `symmetrical` by silhouette, `ergonomic` by hand-specific sculpting, and reserve `asymmetrical` only if the enum really needs a non-ergonomic asymmetry bucket.
- `-` **Change:** Remove long named examples that can be wrong or drift by model generation; especially avoid using ambiguous examples to define rare categories.
- **Why:** The core visual distinction is useful, but examples are brittle and some categories overlap.

#### `form_factor` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Define handedness by usable control layout and sold SKU: `ambidextrous` should require true left/right usability or mirrored/removable side-button support, not just a symmetrical shell.
- `-` **Change:** Remove “Razer Viper V3 Pro = ambidextrous”; it has a symmetrical shell but right-handed side-button layout. Move left-hand examples to search hints or a maintained alias list.
- **Why:** This is an important correction: shape symmetry does not equal ambidextrous form factor.

#### `grip` — Minor revise
- **Type / shape:** list · string
- `+` **Change:** Use independent comfort databases/reviews when available; otherwise infer from length, width, height, hump position, slope, and button reach with lower confidence.
- `-` **Change:** Remove rigid length-only heuristics and the typo `lngth`; soften “most mice support claw.”
- **Why:** Grip suitability is multi-factor and hand-size-dependent.

#### `hand_size` — Major revise
- **Type / shape:** list · string
- `+` **Change:** Derive from a comfort database or a rule that considers length, width, height, grip style, and hand length/width. If using size classes, document the class definitions in the contract.
- `-` **Change:** Remove length-only mapping thresholds as the sole rule.
- **Why:** Mouse width and height often change fit as much as length; one-dimensional thresholds will misclassify shapes.

#### `hump` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Keep the three-zone apex definition and choose one enum schema. If using legacy 2-axis values, document them separately and consistently.
- `-` **Change:** Remove contradictory examples that list Zowie EC in both middle/back categories; move model examples to a maintained reference list.
- **Why:** The concept is excellent, but inconsistent examples undermine the extractor.

#### `front_flare` — Minor revise
- **Type / shape:** scalar · string
- `+` **Change:** Define with a measurable comparison such as front-width vs grip/mid-width and a tolerance band for flat. Use photos or shape databases.
- `-` **Change:** Remove “if uncertain default flat”; use unknown or lower confidence when evidence is ambiguous.
- **Why:** Defaulting creates systematic bias toward the majority class.

#### `thumb_rest` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Define `yes` as a dedicated thumb support shelf or pronounced thumb cradle below side buttons, not merely an ergonomic side curve. Add a distinction from `finger rest` if the schema has one.
- `-` **Change:** Remove or revise examples such as Glorious Model D and Zowie EC unless a maintained reference confirms them; remove “left/right silhouette differs materially” because many ergonomic mice differ without having a thumb rest.
- **Why:** This field is visually valuable but currently conflates ergonomic sculpting, thumb grooves, side-button humps, and true thumb rests.

### Dimensions 3 keys

#### `lngth` — Minor revise
- **Type / shape:** scalar · number
- `+` **Change:** Keep rear-to-front-tip definition and legacy-key warning. Add: use the same measurement convention consistently across brand and review sources.
- `-` **Change:** Remove “prefer review-measured when delta >0.3mm” unless the project has adopted that threshold globally.
- **Why:** The measurement definition is strong; the arbitrary threshold may create source inconsistency.

#### `width` — Keep
- **Type / shape:** scalar · number
- `+` **Change:** Keep maximum-width rule. Add: if a source gives grip width and maximum width separately, choose maximum width and cite the source label.
- `-` **Change:** No substantive deletion needed.
- **Why:** This is clear and directly resolves a common spec-sheet ambiguity.

#### `height` — Major revise
- **Type / shape:** scalar · number
- `+` **Change:** Use published or measured maximum height according to the project source policy, and note whether feet are included when the source states it.
- `-` **Change:** Remove “add 0.6–1mm for feet if the number looks low”; extraction should not invent adjusted dimensions.
- **Why:** Manual correction creates unsourced values and breaks evidence traceability.

### Electronics 2 keys

#### `mcu` — Major revise
- **Type / shape:** scalar · string
- `+` **Change:** Keep “exact MCU part number; never infer.” Move FCC/teardown/Nordic examples into search hints. Add: use internal photos only when the chip marking is legible and tied to the exact model/revision.
- `-` **Change:** Remove “Nordic dominates” and individual YouTube/channel recommendations from `reasoning_note`.
- **Why:** The field is teardown-only and source-sensitive; guidance should not embed a source directory or market-share claim.

#### `mcu_link` — Major revise
- **Type / shape:** scalar · url
- `+` **Change:** Link the manufacturer product page for the exact MCU part when known; otherwise leave blank.
- `-` **Change:** Move URL patterns and distributor-preference rules to search hints/source-tier docs.
- **Why:** Like other link fields, this is search configuration more than reasoning guidance.

## Implementation notes
1. Patch `reasoning_note` only with field-specific semantics: visual cues, disambiguation, gotchas, and “do not confuse with” rules.
2. Move URL patterns, domain lists, source tier preferences, allowed enum values, and alias lists into `search_hints`, enum contracts, component alias tables, or cross-field constraints.
3. Move all sensor/switch/encoder/MCU fact tables into component databases with source metadata. Do not hardcode living specs in `reasoning_note`.
4. Resolve schema-overlap fields before patching guidance: `rgb` vs `lighting`, `paracord` vs `cable_type`, and `nvidia_reflex` vs `nvidia_reflex_analyzer`.
5. For visual ergonomic fields, consider maintaining a small validated example set outside prompt guidance so examples can be updated without rewriting every field rule.
