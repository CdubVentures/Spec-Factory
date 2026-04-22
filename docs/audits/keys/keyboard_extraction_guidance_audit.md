# Keyboard Extraction Guidance Audit

Generated: 2026-04-22

## Verdict

I **do not agree with every extraction guidance cell**. I agree with the overall principle from the source audit: per-key guidance should only add field-specific pitfalls that the generic prompt cannot express. However, several cells use brittle brand examples, over-broad defaults, or conflate neighboring concepts.

### Coverage

- Authored extraction guidance cells audited: **76**
- Recommended changes: **40**
- Kept as-is: **36**
- Empty guidance cells reviewed separately: **30**; I agree they can stay empty unless schema/enum changes land.

### Audit standard

- Keep guidance only when it prevents a likely extraction error.
- Prefer product-specific evidence over brand/model heuristics.
- Avoid defaults that weaken the UNK policy.
- Avoid examples that are volatile, model-year-specific, or not true for the cited product.
- Keep derived-field guidance only when source fields are reliable and the derivation does not hide ambiguity.

## External spot-check sources used

These were used to sanity-check the highest-risk factual guidance, especially around GTIN formats, QMK flashing, HE/analog features, polling, SOCD, and current software/product examples.

- [GS1 US — GTIN structures](https://www.gs1us.org/upcs-barcodes-prefixes/what-is-a-gtin)
- [QMK — flashing / firmware formats](https://docs.qmk.fm/flashing)
- [Wooting 80HE — true 8 kHz polling and analog features](https://wooting.io/wooting-80he)
- [Razer Huntsman V3 Pro — Rapid Trigger, Snap Tap, adjustable actuation](https://www.razer.com/gaming-keyboards/razer-huntsman-v3-pro)
- [Razer Huntsman V3 Pro 8KHz — true 8000 Hz HyperPolling](https://www.razer.com/gaming-keyboards/razer-huntsman-v3-pro-8khz)
- [SteelSeries Apex Pro Gen 3 — OmniPoint 3.0 / 40 levels](https://steelseries.com/gaming-keyboards/apex-pro-gen-3)
- [Wooting SOCD implementation](https://wooting.io/post/socd-our-implementation-of-snap-tap)
- [Wooting Wootility 4.7.2 changelog — Rappy Snappy vs Snappy Tappy](https://wooting.io/wootility/changelogs/4.7.2)
- [Keychron Q1 HE — adjustable actuation / Launcher](https://www.keychron.com/products/keychron-q1-he-qmk-wireless-custom-keyboard)

## Recommended `-` / `+` patches

### N1. `firmware_updateable` — change

**Group:** Features  
**Priority:** P3  
**Source table:** Missing Keys

**- Current guidance**

> qmk_via_support ≠ No ⇒ firmware_updateable = Yes . Otherwise Yes requires a downloadable .bin / .hex / .uf2 on the mfg support page — "firmware update via software" alone can mean macro-only updates, not MCU firmware.

**+ Proposed guidance**

> QMK support with a documented flash path, upstream firmware build, or manufacturer firmware download is evidence of `Yes`. VIA-only/configurator support is not automatically `Yes` unless the board exposes firmware flashing or a firmware package. Accept `.bin` / `.hex` / `.uf2` files or a signed vendor updater/release note; "firmware update via software" must explicitly update keyboard/MCU firmware, not just profiles/macros.

**Why**

The current rule treats any non-No `qmk_via_support` as firmware-updateable. VIA configurability and firmware flashability are related but not identical; QMK can be built/flashed, while VIA-only support may only prove configuration.

### N2. `wireless_range_m` — change

**Group:** Connectivity  
**Priority:** P3  
**Source table:** Missing Keys

**- Current guidance**

> Null for wired. "Long-range" marketing phrase without a number ≠ evidence; return unk. Separate spec usually exists per radio — take the longer of BT / 2.4GHz.

**+ Proposed guidance**

> Null for wired-only products. Marketing terms such as "long-range" without a numeric distance ⇒ `unk`. If Bluetooth and 2.4 GHz have separate ranges and this scalar is explicitly defined as maximum wireless range, record the longer advertised number; otherwise prefer a per-radio field/note or return `unk` rather than averaging or inventing.

**Why**

Taking the longer BT/2.4 GHz value is only correct if the field semantics are “maximum advertised wireless range.” Without that definition it can hide material radio differences.

### N3. `screen_display` — change

**Group:** Features  
**Priority:** P3  
**Source table:** Missing Keys

**- Current guidance**

> "Display" here means a secondary info panel (LCD/OLED/E-ink), not per-key keycap screens. Default None .

**+ Proposed guidance**

> "Display" means a secondary information panel on the keyboard (LCD/OLED/E-ink or equivalent dashboard panel), not per-key keycap screens and not a simple status LED strip unless the enum explicitly allows it. Use `None` only when product photos/specs provide enough evidence that no such panel exists; otherwise return `unk`.

**Why**

A hard default of `None` can violate the UNK policy when evidence is missing. Absence should be evidenced by photos/specs, not guessed.

### 7. `sku` — change

**Group:** Identity  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Distinct from MPN. Amazon ASIN, Newegg Item#, Best Buy SKU, mfg-direct SKU all valid — prefer mfg-direct . Record exactly one.

**+ Proposed guidance**

> Distinct from MPN/GTIN. Prefer a manufacturer/direct-store SKU. Retailer IDs are valid only when the source labels them as SKU/item number for the exact variant; ASIN is an Amazon catalog identifier, so record it only if the schema intentionally treats retailer catalog IDs as SKU. Record exactly one and preserve source-specific casing.

**Why**

The current text over-accepts ASIN as SKU. ASIN can be useful, but it is not generically the same identifier class as a manufacturer SKU.

### 8. `gtin` — change

**Group:** Identity  
**Priority:** P3  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> 12-digit UPC or 13-digit EAN/GTIN with final check digit. Numerically validate the check digit before returning — a wrong digit resolves to unrelated products on gtin-lookup databases. Mfg pages don't list GTINs; retailer "Product Details" blocks or the physical box do.

**+ Proposed guidance**

> Accept valid GTIN-8/12/13/14 if the schema allows; UPC-A = GTIN-12 and EAN-13 = GTIN-13. Numerically validate the check digit before returning. Prefer manufacturer, GS1, retailer product-details, or package evidence; do not assume manufacturers never publish GTINs.

**Why**

GTIN has four structures, not only UPC-12/EAN-13. The blanket claim that manufacturer pages do not list GTINs is too broad.

### 9. `form_factor` — change

**Group:** Layout  
**Priority:** P0  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Marketing word "compact" is ambiguous — use key_count : 61→60%, 68→65%, 84→75%, 87→TKL (also "80%"), 96/98→96%, 104/105→Full-size. 1800 Compact = 96% with a separated nav cluster (rare — e.g. Leopold FC980, Keychron Q5). TKL and "80%" are the same; keep the TKL (80%) token.

**+ Proposed guidance**

> Use `key_count` as a clue, not the sole determinant. Confirm with the physical layout: 60/65/75/TKL/96/1800/full-size can overlap by region and nav-cluster design. Treat TKL and 80% as the same token if the enum says so. Keep 1800 Compact distinct from generic 96% when the enum provides both, because it preserves a numpad/navigation-arrangement difference.

**Why**

The current mapping is too deterministic and partially collapses 1800/96% distinctions that are useful in keyboard filtering.

### 10. `layout` — change

**Group:** Layout  
**Priority:** P1  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Physical shape, not ANSI/ISO. Low-profile boards ⇒ Low-profile ; split-ergo ⇒ Split ; grid ⇒ Ortholinear ; Alice/"Boomerang" ⇒ Alice ; otherwise Standard .

**+ Proposed guidance**

> Physical shape, not ANSI/ISO. Use `Low-profile` only when the board’s chassis/switch/keycap stack is marketed as low-profile; `Split` for separated halves; `Ortholinear` for grid; `Alice`/`Arisu`/`Boomerang` for angled split-staggered layouts. Use `Standard` only when photos/specs confirm a conventional staggered unibody layout; otherwise return `unk`.

**Why**

The current “otherwise Standard” fallback can become a silent guess when there is no visual/layout evidence.

### 12. `key_count` — change

**Group:** Layout  
**Priority:** P0  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> ISO variants add one key vs ANSI (split right-Shift). If mfg publishes one number, prefer matching the selected layout_standard .

**+ Proposed guidance**

> ISO commonly adds one key versus ANSI via the extra key next to the shortened left Shift and ISO Enter area; compact layouts can vary. If a manufacturer publishes multiple counts, use the count matching the selected `layout_standard`/region. If only one count is published for a multi-region SKU, do not silently apply it to other layout standards unless the source confirms.

**Why**

The current note says ISO adds a key because of split right Shift, which is not the core ANSI-vs-ISO distinction.

### 13. `numpad` — change

**Group:** Layout  
**Priority:** P0  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Detached = numpad ships as a physically separate module (Mountain Everest MAX, Asus ROG Azoth Extreme). Not interchangeable with "No".

**+ Proposed guidance**

> `Detached` = numpad ships as a physically separate module or detachable side module (e.g., Mountain Everest Max / ASUS ROG Claymore-style designs). Not interchangeable with `No`. Do not cite 75% boards with media/OLED modules as detached numpads.

**Why**

The current ASUS ROG Azoth Extreme example is not a detached-numpad example; using it would teach the finder the wrong visual pattern.

### 21. `actuation_distance` — change

**Group:** Switch  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> HE/magnetic boards: record the factory-default actuation point (typ. 1.5 mm on Wooting, 2.0 mm on Keychron HE, 1.0 mm on Razer Huntsman V3 "Gen 2"). Adjustable range lives in adjustable_actuation_min/max .

**+ Proposed guidance**

> For adjustable HE/magnetic/analog-optical boards, record the factory-default actuation point only when explicitly published or shown in default-profile documentation. If the source only gives an adjustable range, leave `actuation_distance` `unk` and populate `adjustable_actuation_min/max` instead. Do not hard-code brand “typical” defaults across model years.

**Why**

The hard-coded Wooting/Keychron/Razer defaults are brittle and in at least some cases not supported by the product pages; ranges and defaults are different fields.

### 22. `bottom_out_force` — change

**Group:** Switch  
**Priority:** P3  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Don't infer from actuation force — ratio is per-switch (MX Red 45→75, MX Black 60→85, MX Brown 45→55, MX Blue 50→60, MX Speed Silver 45→80). Use the component DB first; for switches outside the DB, only record if the source states it numerically.

**+ Proposed guidance**

> Do not infer from actuation/operating force; bottom-out ratios vary by switch and are often absent from official specs. Use the component DB only when the exact switch revision is matched; for switches outside the DB, record only a stated numeric bottom-out/end force.

**Why**

The example ratios are risky and some are debatable by source/revision. The durable guidance is “exact switch match or explicit numeric source.”

### 25. `switch_output_type` — change

**Group:** Switch  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Digital = default for non-HE. Analog = continuous HID value reported per key (Wooting raw analog). Adjustable Actuation = digital output with configurable trigger point but no continuous output (Razer Huntsman V3, SteelSeries Apex Pro). Wooting can do both — record Analog .

**+ Proposed guidance**

> `Digital` = binary keystroke output. `Analog` = continuous per-key value or gamepad/analog HID output explicitly supported. `Adjustable Actuation` = configurable trigger point that still outputs a binary key event. Do not infer `Analog` merely from Hall-effect/magnetic/optical sensing or “analog switch” branding; require an output claim.

**Why**

The current text uses brand examples as if all Razer/SteelSeries products lack analog output. The extraction rule should test output behavior, not switch marketing or brand.

### 28. `switch_compatibility` — change

**Group:** Switch  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> "MX-compatible" excludes optical (Razer, Wooting old), HE/magnetic, and Topre — don't assume cross-type. Gateron "universal" sockets (Keychron K Pro series) accept both MX-style and optical; those boards explicitly advertise the cross-compat.

**+ Proposed guidance**

> “MX-compatible” here means MX-style electrical/PCB switch compatibility, not merely MX keycap-stem compatibility. Optical, Hall-effect/magnetic, Topre, and proprietary low-profile sockets are separate unless the manufacturer explicitly advertises cross-compatibility. Do not assume a Keychron/Gateron socket is universal without a source.

**Why**

The current Keychron/Gateron universal-socket example is too broad and likely to cause false cross-type compatibility.

### 29. `actuation_adjustment_step` — change

**Group:** Switch  
**Priority:** P4  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> HE/magnetic only. Known values: Wooting 0.1 mm, Keychron HE 0.1 mm, Razer Huntsman V3 0.1 mm, SteelSeries Apex Pro Gen 3 0.05 mm. "Adjustable" with no number ⇒ unk.

**+ Proposed guidance**

> Position-sensing switches only. Record a step only when the source gives a numeric increment/resolution (often 0.1 mm; some firmware may expose different UI increments). If the source only says “adjustable” or gives a range, return `unk` for step.

**Why**

The listed known values are brittle, and the SteelSeries Gen 3 0.05 mm value conflicts with the “40 levels across 0.1–4.0 mm” style of official description.

### 33. `keycap_profile` — change

**Group:** Keycaps  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> If switch_type=Low-profile Mechanical ⇒ profile must be Low Profile . "Double-shot OEM" = material + profile — capture just "OEM" here. Cherry vs OEM distinction: OEM is taller with more curved tops (stock Razer/Logitech/Corsair); Cherry is shorter/flatter (stock Keychron K Pro, most enthusiast kits). If mfg just says "sculpted profile" without naming it ⇒ unk.

**+ Proposed guidance**

> If `switch_type=Low-profile Mechanical` and stock keycaps are low-profile, profile = `Low Profile`. “Double-shot OEM” combines legend process/material with profile — capture only `OEM` here. Prefer the named manufacturer profile; do not classify Cherry vs OEM from brand defaults alone. “Sculpted profile” without a named profile ⇒ `unk`.

**Why**

The current brand-default examples are likely to age poorly and can be wrong for specific SKUs.

### 36. `legends` — change

**Group:** Keycaps  
**Priority:** P3  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Side-Printed = legends on the front face (stealth); rare — GMK CYL Modo, some HHKB. Dye-sub only takes on light-colored PBT → dark legends on light caps = Dye-Sub PBT; light legends on dark caps = Double-shot PBT (reverse dye-sub exists but is rare). Pad-printed rubs off; most budget boards.

**+ Proposed guidance**

> Do not infer legend process solely from legend color or keycap material. `Side-Printed` / front-printed = legends on the front face. Dye-sub usually appears on light PBT, but reverse dye-sub, UV print, and other methods exist. Record `Double-shot`, `Dye-sub`, `Pad-printed`, or `Laser-etched` only when the source or a reliable teardown/review states the process, or when construction is visually unambiguous.

**Why**

The current color-based rule will misclassify reverse dye-sub, UV-printed, or other dark-keycap legend methods.

### 38. `polling_rate_wired` — change

**Group:** Performance  
**Priority:** P1  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Record the Hz integer ("8K"→8000, "32K"→32000). Some boards gate 8 kHz+ behind a mode switch or driver install; the spec here is the maximum attainable over the wired interface out-of-the-box. Some mfgs quote 8 kHz wireless and 1 kHz wired (Wooting 80HE) — put wired here, not the higher one.

**+ Proposed guidance**

> Record the maximum attainable wired USB polling rate as an integer Hz (`8K`→`8000`, `32K`→`32000`), including modes that require onboard/software enablement if available out of box. Do not copy wireless claims into this field; Wooting 80HE is a wired 8 kHz example, not a wireless-over-wired exception.

**Why**

The current Wooting 80HE example says 8 kHz wireless / 1 kHz wired, which is contradicted by Wooting’s own 80HE page.

### 39. `polling_rate_wireless` — change

**Group:** Performance  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Typically the 2.4 GHz dongle rate — Wooting 80HE / 60HE v2 = 8000 Hz; most Keychron HE / Corsair / Logitech wireless = 1000 Hz; gaming 2.4 GHz commonly 500 or 1000 Hz. Bluetooth polls at ~125 Hz in practice regardless of mfg claim — record the 2.4 GHz rate here when both exist.

**+ Proposed guidance**

> Record the maximum explicitly advertised wireless polling rate, normally for the 2.4 GHz dongle when both Bluetooth and dongle exist. Do not fill from wired-only products. If the source separately lists Bluetooth and 2.4 GHz rates, use the higher wireless rate only if this scalar means max wireless; otherwise prefer a per-radio note/field. Avoid blanket `Bluetooth = 125 Hz` unless measured or specified.

**Why**

The current Wooting 80HE / 60HE v2 wireless examples are wrong for wired products and the Bluetooth heuristic is too absolute.

### 42. `rapid_trigger` — change

**Group:** Performance  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> HE/magnetic exclusive. switch_type ∉ {Hall Effect, Magnetic} ⇒ null, not No. Name map: "Rapid Trigger" (Wooting originated, now generic), "Dynamic Keystroke" / "Adjustable Pre-Travel" (Razer/SteelSeries copy). Distinct from SOCD — Snap Tap ≠ Rapid Trigger.

**+ Proposed guidance**

> Rapid Trigger requires position-aware sensing/firmware, not necessarily Hall-effect only. Allow HE/magnetic, analog optical, inductive, or other position-sensing switches when the manufacturer explicitly provides rapid-trigger/dynamic-reset behavior. For ordinary binary mechanical switches, return null/No per schema; Snap Tap/SOCD is separate.

**Why**

Razer’s Huntsman V3 Pro is analog optical and advertises Rapid Trigger, so “HE/magnetic exclusive” is too narrow.

### 43. `analog_input` — change

**Group:** Performance  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Yes = raw analog HID (keyboard reports continuous value per key). Controller Input = XInput/DirectInput gamepad emulation so a game that doesn't speak analog-keyboard still gets stick-like input (Wooting double-mapping). Razer Huntsman V3 and SteelSeries Apex Pro Gen 3 have Adjustable Actuation but no analog output — that's No here.

**+ Proposed guidance**

> `Yes` = continuous per-key analog value or gamepad/analog HID output. `Controller Input` = explicit XInput/DirectInput/gamepad emulation. Adjustable actuation alone is not analog input. Do not mark a product `No` merely because it is Razer/SteelSeries; check whether that exact model/software exposes analog/gamepad output.

**Why**

The current brand-specific No rule is too broad; Keychron and other HE products may expose gamepad analog, and model-specific software matters.

### 44. `socd_cleaning` — change

**Group:** Performance  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Name map: "Snap Tap" (Razer) = "Rappy Snappy" (Wooting) = "Nullify SOCD" (community) — all map to Snap Tap in the enum. "Null Bind" / "Null Binds" is a software-only console-command workaround, NOT a hardware feature — don't record as Yes unless the keyboard has firmware-level SOCD. Banned in CS2 as of 2024 but feature still ships.

**+ Proposed guidance**

> Map only firmware/device-level SOCD resolution features. Razer Snap Tap ≈ last-input-priority SOCD. Wooting Snappy Tappy is SOCD cleaning; Wooting Rappy Snappy is a related depth-comparison feature and should not be collapsed to Snap Tap unless the enum lacks a better value. Null binds are software/console commands, not hardware SOCD. For CS2, note that Valve official servers disallow hardware-assisted SOCD/resolution and may kick users, but the feature may still ship.

**Why**

Wooting distinguishes Rappy Snappy from Snappy Tappy/SOCD. Collapsing both to Snap Tap loses a meaningful feature distinction.

### 46. `debounce_time` — change

**Group:** Performance  
**Priority:** P4  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Firmware config, not a board spec. QMK default = 5 ms. Even QMK/VIA boards that expose it let the user change it — the "spec" value is shifting by user. Record only when a proprietary (non-QMK) board explicitly publishes a fixed debounce; otherwise unk.

**+ Proposed guidance**

> Treat as firmware/configuration, not a stable board spec. For QMK/VIA/custom firmware, only record a value if the product publishes a fixed stock debounce setting; user-tunable firmware defaults should usually be `unk`. Avoid hard-coding a universal QMK default.

**Why**

QMK debounce behavior can be keyboard/config dependent; a universal default is likely to age or be wrong.

### 47. `scan_rate` — change

**Group:** Performance  
**Priority:** P4  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Matrix-scan rate, not polling rate. HE/magnetic boards sometimes publish it (Wooting 80HE scans per-key at 8 kHz, MonsGeek FUN series at 32 kHz, Razer Huntsman V3 Pro "8k scan"). Non-HE boards almost never publish it. "Polling rate" is not a scan rate — don't conflate.

**+ Proposed guidance**

> Matrix/per-key scan rate, not USB polling rate. Record only when the source explicitly says scan rate, matrix scan, or per-key scan; “polling rate,” “response time,” or “latency” alone is not enough. HE/analog boards may publish both; keep them separate.

**Why**

The current examples invite conflating scan and polling rates. Wooting explicitly distinguishes scanning from USB polling; many other pages do not.

### 57. `onboard_profile_count` — change

**Group:** Features  
**Priority:** P3  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Null when onboard_memory=No . Some boards persist one setting without naming profiles — record 1. QMK boards: the layer count (usually 4) is the profile count.

**+ Proposed guidance**

> Null when `onboard_memory=No`. Record profile slots only when the keyboard/software advertises saved onboard profiles or named onboard slots. Do not equate QMK layers with onboard profiles; layers are keymap states, not profile memories. If a board stores only one persistent configuration, record `1` only when that persistence is evidenced.

**Why**

QMK layers are not onboard profiles. Equating them will inflate profile counts on QMK boards.

### 59. `qmk_via_support` — change

**Group:** Features  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> QMK = firmware; VIA = GUI configurator; they compose. QMK alone = source in QMK repo but no pre-packaged VIA file. VIA alone = board ships with a VIA JSON but the firmware is a proprietary QMK fork (Keychron legacy). QMK + VIA = both (most Keychron Q/V/V-Max, GMMK). Cross-check: github.com/qmk/qmk_firmware/keyboards/<brand> and usevia.app device list.

**+ Proposed guidance**

> `QMK` = open-source firmware support or source/build target. `VIA` = VIA-compatible firmware/configurator support. They often compose, but VIA support alone does not prove upstream QMK source availability, and QMK support alone does not prove VIA support. Cross-check manufacturer docs, QMK repo, and VIA/Vial device definitions when needed.

**Why**

The current QMK/VIA mapping is directionally useful but overstates what VIA-only and QMK-only imply.

### 60. `software` — change

**Group:** Features  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Primary suite only. Web-based VIA is covered by qmk_via_support — don't list it here. Brand map: Corsair=iCUE, Razer=Razer Synapse, Logitech=G HUB, HyperX=NGENUITY, SteelSeries=SteelSeries GG, Keychron=Keychron Launcher (newer) or none (Q/V open-source). None for boards configured only by Fn combos.

**+ Proposed guidance**

> Primary vendor/configuration suite only. Do not list VIA here if `qmk_via_support` captures it, unless the schema intentionally treats VIA/Launcher as software suites. Use current manufacturer software names from the product/support page; avoid stale brand maps and `None` defaults for open-source boards because many now have web launchers.

**Why**

Software names and availability change quickly; the hard-coded brand map will age and Keychron’s Launcher makes the “none for open-source boards” rule unsafe.

### 66. `usb_passthrough` — change

**Group:** Connectivity  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> True passthrough requires a secondary USB cable from the keyboard to the host (the board uses 2 host USB ports). A headset/mic jack on the case is not USB passthrough — that goes in a separate audio-jack field (if added). Corsair K100, Razer BlackWidow V4 Pro, HyperX Alloy Elite are textbook examples.

**+ Proposed guidance**

> True USB passthrough = a downstream USB port/hub on the keyboard that passes data to the host. A second upstream cable is common on older/high-power designs but is not required by definition. Audio jacks are not USB passthrough. Record `Yes` only when a USB downstream port is present and documented/visible.

**Why**

A second host cable is implementation detail, not the definition of USB passthrough.

### 69. `multi_device_pairing` — change

**Group:** Connectivity  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Bluetooth-only feature (2.4 GHz dongles pair 1:1). Look for "3 Bluetooth devices" / "pair up to N devices" wording. Fn+1/2/3 toggle hotkeys are a strong signal.

**+ Proposed guidance**

> Usually Bluetooth multi-host, but not strictly Bluetooth-only. Look for “pair up to N devices,” “Easy-Switch,” or specific host slots across Bluetooth and/or proprietary dongle modes. Fn+1/2/3 hotkeys are a signal, but require source confirmation.

**Why**

The Bluetooth-only statement is too absolute; some ecosystems support proprietary multi-host switching.

### 76. `typing_angle` — change

**Group:** Dimensions  
**Priority:** P3  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Default angle (feet closed). Enthusiast boards with fixed case tilt publish one number (Keychron Q1 = 5.2°, Q2 = 6.5°); mass-market lists per-stage ("4° / 8° / 12°") — record base-stage only. Derivable: arctan((height_rear − height_front) / depth) when all three known.

**+ Proposed guidance**

> Record the default/base typing angle with feet closed. If multiple foot stages are published, record the base stage. Derive only when `height_front`, `height_rear`, and the front-to-rear distance are measured on the same reference plane; otherwise return `unk`. Use `atan((rear-front)/front-to-rear distance)`, not arbitrary product depth if dimensions include detachable accessories or irregular case geometry.

**Why**

The derivation is valid only when the measurements use the same reference plane and distance; otherwise it creates false precision.

### 78. `case_material` — change

**Group:** Build  
**Priority:** P1  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> When mfg lists composite ("aluminum top frame + plastic bottom"), record the structural frame material (usually the top). Full-aluminum = all enclosure faces aluminum; single-face aluminum ≠ "Aluminum" — it's Plastic with aluminum trim. See enum-cleanup for ABS/Plastic collapse.

**+ Proposed guidance**

> If the manufacturer states a composite enclosure, preserve the composite if the enum/list supports it. If the field is scalar, record the dominant/structural enclosure material as marketed and note the mixed evidence. Use `Aluminum` only for a full aluminum enclosure or manufacturer-labeled aluminum case; an aluminum top plate/frame over a plastic bottom should not become full-aluminum.

**Why**

The current “structural frame, usually top” rule can overstate aluminum construction and hide composite cases.

### 79. `plate_material` — change

**Group:** Build  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Don't infer from case material (Al case often has steel plate). Budget gaming boards usually have Steel (but don't state it) — prefer unk over "Steel" unless stated. FR4 and POM appear only on enthusiast / custom boards (Keychron Q, Mode, GMMK Pro swappable plates).

**+ Proposed guidance**

> Do not infer from case material. Record only a stated plate material or reliable teardown. If multiple plates are offered, match the shipped/default plate for the selected SKU; optional aftermarket plates should not override stock.

**Why**

The current budget/enthusiast heuristics are unnecessary and can turn into guesses.

### 80. `mounting_style` — change

**Group:** Build  
**Priority:** P3  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Default for mass-market is Tray Mount but don't fill it in unstated — prefer unk. Gasket Mount, Top Mount, Leaf Spring are enthusiast-marketed — if not stated, not that. Razer/Corsair/Asus recent gaming flagships (K70 Core, ROG Azoth, Huntsman V3 Pro) have moved to Gasket — check launch year.

**+ Proposed guidance**

> Do not default unstated mass-market boards to `Tray Mount`. Record mounting style only when a manufacturer, review, teardown, or exploded diagram states/makes it clear. Avoid brand/year heuristics such as “recent flagships moved to gasket”; verify the exact model.

**Why**

Brand/year trend examples are volatile and can be false for specific models.

### 82. `foam_dampening` — change

**Group:** Build  
**Priority:** P3  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Composite values — record exactly the layers the mfg names. Case Foam (bottom), Plate Foam (between plate & switches), PCB Foam (between PCB & case). "Silicone pad" = Case Foam. "Poron strip" at case perimeter = Case Foam. If only some layers named ⇒ record the named subset; don't upgrade to "Case + Plate + PCB Foam" on ambiguity.

**+ Proposed guidance**

> Record exactly the named dampening layers/materials. Case/bottom foam, plate foam, PCB/IXPE foam, silicone pads, and acoustic mats are distinct if the enum supports them. Poron strips at the case perimeter may be gasket material, not case foam; only map them to `foam_dampening` when described as acoustic/dampening foam. Do not upgrade unnamed layers.

**Why**

The current Poron/silicone mapping can confuse gasket materials with acoustic foam.

### 85. `stabilizer_lubed` — change

**Group:** Build  
**Priority:** P4  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Most budget stabilizers ship with some thin silicone — that's not what this field captures. Record Yes only when mfg specifically advertises tuning-grade lube ("Krytox 205g0", "dielectric grease", "hand-lubed"). Factory lubed enum value = mfg mention without specific product. Generic "factory tuned" / "factory lubricated" = unk.

**+ Proposed guidance**

> Record `Yes` / `Factory-lubed` when the manufacturer explicitly says pre-lubed, factory-lubed, or lubricated stabilizers. Record a specific lube only when a product name/compound is stated (e.g., Krytox 205g0, dielectric grease). Generic “factory tuned” without lubrication wording ⇒ `unk`.

**Why**

The current text contradicts itself by saying generic factory-lubed mention maps to Factory lubed, then saying generic factory-lubricated is unk.

### 86. `south_facing_leds` — change

**Group:** Build  
**Priority:** P3  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Not visible from the top face of the keyboard — requires a PCB-side photo or a keycap-off shot of the bare switch. When mfg advertises "south-facing LEDs" it's because they're marketing Cherry-profile keycap compatibility; if silent on LED direction, unk. Most enthusiast boards (Keychron Q/V, Mode, GMMK Pro) are south-facing; most gaming boards are north-facing.

**+ Proposed guidance**

> Requires switch/PCB orientation evidence: manufacturer spec, PCB-side photo, or keycap-off/switch-socket view. Do not infer from brand/category trends. If silent and not visible, return `unk`. Note that south-facing LED marketing often implies Cherry-profile interference compatibility, not necessarily better shine-through legends.

**Why**

The “most enthusiast / most gaming” heuristic is useful background but unsafe as extraction guidance.

### 88. `sound_profile` — change

**Group:** Sound  
**Priority:** P4  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Record only when a review uses the adjective directly ("this board sounds clacky", "the thock is pronounced"). Mfg marketing copy ("premium thocky typing feel") is editorial, not evidence. Name map from community: creamy ≈ Neutral, poppy ≈ Thocky, sharp/tinny ≈ Bright. When conflicting reviews, return unk.

**+ Proposed guidance**

> Use review/measurement evidence, not manufacturer marketing. Keep terms only when reviewers directly describe the board/switch sound; if adjectives conflict, return `unk`. Avoid hard-coded community mappings like `creamy≈Neutral` or `poppy≈Thocky` unless the enum has documented aliases.

**Why**

Keyboard sound adjectives are subjective; fixed mappings can mislabel reviews.

### 89. `typing_noise` — change

**Group:** Sound  
**Priority:** P3  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Derive: switch_feel ∈ {Silent Linear, Silent Tactile} OR sound_dampening=Heavy ⇒ Silent. switch_feel=Clicky ⇒ Loud. Everything else ⇒ Moderate. This is an acoustic loudness proxy, not a sound-character judgement (that's sound_profile ).

**+ Proposed guidance**

> Do not derive `Silent` from heavy foam alone. Prefer measured dBA or reviewer consensus. If no measurement, use strong switch/design evidence: silent switches or explicit silent-dampened design ⇒ Quiet/Silent; clicky switches ⇒ Loud unless the product is explicitly silent-clicky/dampened; ordinary linear/tactile ⇒ Moderate/unk depending schema. Keep sound character in `sound_profile`.

**Why**

Heavy foam can reduce noise but does not make a keyboard silent, especially with clicky switches.

### 93. `charging_method` — change

**Group:** Power  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Wireless charging dock = proprietary dock (Logitech G915 Lightspeed dock, Razer HyperSpeed dock). Generic Qi isn't a keyboard thing. USB-C fast charge requires mfg to explicitly claim fast charging (specific wattage or "50% in 10 min" style claim).

**+ Proposed guidance**

> Record only the method explicitly supported: USB-C charging, proprietary charging dock, Qi/wireless charging, fast charge, etc. `Fast charge` requires a stated fast-charge claim such as wattage or time-to-charge. Avoid brand examples unless the exact keyboard product page confirms the dock/charging method.

**Why**

The current Logitech/Razer dock examples are risky; some cited docks are mouse/peripheral examples rather than confirmed keyboard charging methods.

### 96. `compatible_os` — change

**Group:** General  
**Priority:** P2  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> USB HID works on Linux/ChromeOS by default — only list them when mfg states support explicitly (they then guarantee it). PlayStation/Xbox compatibility is the real differentiator — record only when mfg certifies ("Works with Xbox" logo, "PS5 compatible"). Most gaming mice/keyboards don't work on Xbox without "Designed for Xbox" cert.

**+ Proposed guidance**

> Record OS/platforms the manufacturer explicitly supports or certifies. USB HID may function on Linux/ChromeOS, but only list them when support is stated. For consoles, distinguish basic USB keyboard input from game/console certification; record PlayStation/Xbox only when the product page/certification explicitly says it.

**Why**

The current console sentence is too broad. Basic USB input, game support, and official console certification are different evidence levels.

### 103. `warranty` — change

**Group:** General  
**Priority:** P3  
**Source table:** Full 103-Key Matrix

**- Current guidance**

> Mfg warranty policy page, not the product page (regional policies differ). US default for major gaming brands: Corsair 2yr, Razer 2yr, Logitech 1–2yr depending on SKU, SteelSeries 2yr, HyperX 2yr. Keychron Q series 1yr. Enthusiast/custom typically 1yr.

**+ Proposed guidance**

> Use the current manufacturer warranty policy for the product’s sale region, and cite the policy/support page. Do not encode brand-default durations in guidance; warranties vary by SKU, region, refurb status, and purchase channel.

**Why**

Warranty durations are region/SKU/channel dependent and change over time. Hard-coded brand defaults will age poorly.

## Guidance I agree with — no patch

| Row | Key | Why no change |
|---:|---|---|
| 3 | `base_model` | Correctly distinguishes cosmetic suffixes from true product-line variants. |
| 5 | `variant` | Clear ownership boundary; prevents hand-authoring CEF/variantGenerator output. |
| 6 | `mpn` | Good variant-specific MPN caution and retailer-slug warning. |
| 11 | `layout_standard` | Useful visual ANSI/ISO/JIS disambiguation and regional-source warning. |
| 14 | `function_row` | Correctly distinguishes dedicated F-row from Fn-layer F keys. |
| 16 | `switch_name` | Useful because switch_name drives component-derived subfields. |
| 20 | `actuation_force` | Good HE/magnetic pitfall: force labels can describe different points on the force curve. |
| 26 | `hot_swappable` | Correct product-vs-switch distinction for hot-swap sockets. |
| 27 | `switch_pin_support` | Correct dependency on hot_swappable and 3-pin/5-pin socket superset logic. |
| 34 | `keycap_thickness` | Correctly blocks material-based keycap-thickness guessing. |
| 35 | `doubleshot` | Correctly distinguishes shine-through from double-shot construction. |
| 37 | `shine_through` | Good not-applicable/null treatment when backlighting is absent and useful partial-shine-through nuance. |
| 40 | `key_rollover` | Correctly records highest USB-reachable rollover mode instead of boot/default mode. |
| 45 | `adjustable_input_granularity` | Correctly flags overlap/retirement rather than forcing extraction. |
| 48 | `single_key_latency` | Correctly treats latency as measurement-only and separates it from polling claims. |
| 51 | `per_key_rgb` | Acceptable derived quick-filter guidance. |
| 52 | `rgb_zones` | Correctly scopes zones to non-per-key backlighting. |
| 53 | `macro_keys` | Good distinction between dedicated macro hardware and software programmability. |
| 54 | `media_controls` | Good distinction between Fn-layer shortcuts and dedicated physical controls. |
| 58 | `os_mode_switch` | Correctly limits this to a physical OS-mode control. |
| 61 | `connection` | Clear if the enum defines Hybrid as wired + 2.4 GHz + Bluetooth. |
| 68 | `wireless_technology` | Good temporary guidance pending enum cleanup; avoids BT-version duplication. |
| 71 | `weight` | Useful scope rule for battery/detachable-module weight. |
| 75 | `height_rear` | Good default feet-closed measurement rule. |
| 81 | `gasket_mount` | Acceptable derived field guidance pending retirement cleanup. |
| 83 | `stabilizer_type` | Acceptable transitional guidance because enum cleanup owns the real fix. |
| 87 | `sound_dampening` | Acceptable as a deterministic derivation if foam_dampening is reliable. |
| 90 | `battery_capacity` | Correct null rule for wired-only and shared battery treatment for hybrid boards. |
| 92 | `battery_life_rgb` | Good warning that RGB battery-life conditions are not standardized. |
| 95 | `colors` | Clear ownership boundary; prevents hand-authoring variantGenerator color output. |
| 97 | `discontinued` | Good high-evidence threshold for discontinued status. |
| 98 | `editions` | Clear ownership boundary; prevents hand-authoring edition generation. |
| 99 | `included_accessories` | Correct closed-enum discipline and paper-goods exclusion. |
| 100 | `price_range` | Correctly prioritizes launch MSRP over volatile street price. |
| 101 | `release_date` | Correct ownership boundary and precision degradation rule. |
| 102 | `software_required` | Good distinction between required, optional, and no software. |

## Empty guidance cells — agree to keep empty

These rows had `—` guidance. I agree with keeping them empty because the generic prompt contract/components/search-hints/source-tier/UNK rules should be enough unless a future schema or enum change creates a new pitfall.

- **Identity:** 1 `brand`, 2 `model`, 4 `category`
- **Layout:** 15 `arrow_keys`
- **Switch:** 17 `switch_type`, 18 `switch_brand`, 19 `switch_feel`, 23 `total_travel`, 24 `switch_lifespan`, 30 `adjustable_actuation_min`, 31 `adjustable_actuation_max`
- **Keycaps:** 32 `keycap_material`
- **Performance:** 41 `anti_ghosting`, 49 `multi_key_latency`
- **Features:** 50 `backlighting`, 55 `knob_dial`, 56 `onboard_memory`
- **Connectivity:** 62 `wired_interface`, 63 `cable_type`, 64 `cable_length`, 65 `detachable_cable`, 67 `bluetooth_version`, 70 `multi_device_pairing_count`
- **Dimensions:** 72 `width`, 73 `depth`, 74 `height_front`, 77 `adjustable_feet`
- **Build:** 84 `stabilizer_mount`
- **Power:** 91 `battery_life_off`
- **General:** 94 `color`

## Highest-risk themes behind the changes

1. **Brand examples can rot quickly.** Warranty durations, software suites, Keychron/Razer/SteelSeries feature labels, and polling-rate claims should be checked per product page rather than baked into reasoning notes.
2. **Do not infer output from sensing.** Hall-effect, magnetic, optical, or “analog” switch branding does not automatically mean analog HID/gamepad output.
3. **Do not use convenience defaults as evidence.** `None`, `Standard`, `Tray Mount`, `No`, or `Silent` should only be returned when the schema explicitly permits defaulting or when source evidence supports it.
4. **Separate close-but-distinct fields.** Polling vs scan rate, QMK vs VIA, firmware updateability vs configurability, QMK layers vs onboard profiles, SOCD vs Rapid Trigger, and foam dampening vs gasket material need explicit separation.
5. **Allow GTIN and layout edge cases.** GTINs can be 8/12/13/14 digits; form factor cannot be determined by key count alone.
