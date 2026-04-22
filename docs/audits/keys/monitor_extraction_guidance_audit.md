# Monitor extraction guidance audit

Source audited: `monitor-key-priority-matrix.html`. Scope: the 72 rows with non-empty per-key extraction guidance in the `Extraction guidance` column. I did not re-audit priority/availability/difficulty axes except where guidance wording depended on those fields.

## Summary

- Non-empty extraction guidance rows reviewed: **72**
- I agree as written with: **31**
- I recommend some change to: **41**
- Highest-risk fixes: HDMI 2.1/FRL wording, DisplayPort version-vs-bandwidth wording, RTINGS black/gray uniformity units, integer schema mismatch for `local_dimming_zones`, console compatibility requirements, and stale G-SYNC/Pulsar module requirements.

### Verdict distribution

| Verdict | Count |
|---|---:|
| Change | 17 |
| Minor change | 24 |
| Agree | 31 |

## Recommended changes, with + / - diff

### identity

#### `base_model` — Change

- **- Remove / replace:** `base of U2723QE-R is U2723Q when the trailing letter encodes a region`
- **+ Add / rewrite:** Only strip a suffix when it is explicitly separated or documented as variant/region. Prefer examples like `AW3423DWF-W → AW3423DWF`; if the source model is `U2723QE-R`, strip only `-R` and keep `U2723QE` unless Dell documents `E` as a region suffix.
- **Why:** The current example risks over-stripping a meaningful model letter. Identity guidance should bias toward preserving model identity and only removing documented suffixes.

#### `variant` — Minor change

- **- Remove / replace:** `capacity`
- **+ Add / rewrite:** Use monitor-relevant tokens: color, region, stand/bundle, edition, panel finish, retailer pack, or calibration package. Leave blank when suffix is only logistics or not user-facing.
- **Why:** Capacity is a carry-over from other categories and is rarely monitor-relevant; keeping it can encourage false variants.

### display_panel

#### `aspect_ratio` — Change

- **- Remove / replace:** Hard-coded mappings only, especially `3840×1600→21:9` as if exact.
- **+ Add / rewrite:** Prefer manufacturer-stated aspect ratio. If deriving, reduce width:height by GCD and then map common marketed classes where appropriate: 1920×1080 = 16:9; 2560×1080/3440×1440 ≈ ultrawide 21:9; 3840×1600 = 24:10 / 12:5, often marketed as 21:9; 5120×1440 = 32:9.
- **Why:** Several ultrawide labels are marketing approximations rather than exact mathematical ratios. The extractor should not lose that distinction.

#### `frc` — Minor change

- **- Remove / replace:** `OLED / native 10-bit → FRC=No` as a blanket rule.
- **+ Add / rewrite:** Set FRC from explicit panel bit-depth evidence. `8-bit + FRC` or `1.07B colors on an 8-bit panel` ⇒ Yes. Native 10-bit ⇒ No. Do not infer from `OLED` alone unless the panel spec confirms native depth.
- **Why:** The OLED shortcut is too broad. FRC is a bit-depth implementation detail, not just a panel-class label.

#### `native_colors` — Minor change

- **- Remove / replace:** Only the five fixed mappings.
- **+ Add / rewrite:** Keep the mappings, but add the general formula: native color count = 2^(effective bits per channel × 3). If the field stores displayable/effective colors, `8-bit + FRC` may map to 1.07B; if it stores true native colors, keep 16.7M and let `frc` carry dithering.
- **Why:** The field name says native colors, while the mapping includes effective dithered colors. The note should align with schema semantics.

#### `panel_manufacturer` — Change

- **- Remove / replace:** Broad shortcut list, especially `Fast IPS / AHVA → AU Optronics` and other panel-tech-to-maker assumptions.
- **+ Add / rewrite:** Primary evidence should be a panel part number or a panel database. Use technology shortcuts only as confidence hints, not as automatic manufacturer assignment. Safer shortcuts: QD-OLED usually Samsung Display; WOLED commonly LG Display. For LCD labels such as Fast IPS/Rapid IPS/Mini-LED IPS, do not infer maker without panel-part evidence.
- **Why:** Brand marketing labels are reused across panel suppliers. Over-broad shortcuts can create confident but wrong manufacturer values.

#### `panel_type` — Minor change

- **- Remove / replace:** Treating `Mini-LED IPS` as an IPS sub-variant.
- **+ Add / rewrite:** Separate panel class/variant from backlight technology: IPS/VA/TN/OLED/ADS/etc. are panel classes; Mini-LED is a backlight/local-dimming system. Keep the Nano IPS vs IPS Black distinction.
- **Why:** Combining backlight and panel class muddies filters and components. The Nano IPS vs IPS Black warning is good.

#### `subpixel_layout` — Change

- **- Remove / replace:** `Tandem OLED → WRGB or RGB Stripe depending on stack. Most LCDs → RGB.`
- **+ Add / rewrite:** Use macro/photo review, panel database, or manufacturer disclosure when available. WOLED usually WRGB; QD-OLED uses a triangular/non-RGB-stripe QD-OLED subpixel layout; LCDs are often RGB but BGR and rotated layouts exist and matter for text. `Tandem OLED` describes stacked emissive layers and does not itself determine subpixel layout.
- **Why:** The existing note over-derives from technology names. Subpixel layout is important enough that false shortcuts can hurt text-clarity extraction.

### performance

#### `adaptive_sync` — Minor change

- **- Remove / replace:** `G-Sync hardware-module monitors are 'G-Sync' or 'G-Sync Ultimate'` as the only full-G-SYNC path.
- **+ Add / rewrite:** Capture the certification exactly as stated: FreeSync, FreeSync Premium, FreeSync Premium Pro, G-SYNC Compatible, G-SYNC, G-SYNC Ultimate/Premium. Do not collapse tiers. As of newer NVIDIA/MediaTek scaler implementations, full G-SYNC features may not require the old dedicated module.
- **Why:** The tier warning is right, but the hardware-module wording is stale after NVIDIA's integrated-scaler G-SYNC rollout.

#### `max_refresh_rate_displayport` — Change

- **- Remove / replace:** `DP 2.1 UHBR20 lifts the ceiling further` and `cap ... at the monitor's actual DP version`.
- **+ Add / rewrite:** Cap by the port's advertised link mode/bandwidth, DSC support, color depth/chroma, lane allocation, and native resolution—not version label alone. DP 2.1 can be UHBR10/13.5/20, and USB-C DP Alt Mode may use fewer lanes. Record the monitor's actual supported max over DP.
- **Why:** Version labels are not enough. VESA distinguishes DP40/UHBR10 and DP80/UHBR20 bandwidths, and DSC changes transport requirements.

#### `max_refresh_rate_hdmi` — Change

- **- Remove / replace:** `FRL (48Gbps, real 4K@120 uncompressed)` and binary FRL-vs-TMDS framing.
- **+ Add / rewrite:** HDMI 2.1 features are optional. Record the actual HDMI link capability when stated: TMDS/18Gbps, FRL rate such as 24/32/40/48Gbps, DSC support, and max refresh at native resolution. If the spec only says `HDMI 2.1`, do not assume full 48Gbps; verify advertised modes or mark uncertain.
- **Why:** HDMI 2.1 can legally include only some 2.1 features, and FRL is up to 48Gbps rather than always 48Gbps.

#### `refresh_rate` — Minor change

- **- Remove / replace:** No mention of official dual-mode modes beyond 480Hz.
- **+ Add / rewrite:** Use native-resolution max for `refresh_rate`. Put lower-resolution dual-mode peaks in `refresh_rate_dual_mode_max`, including newer 540/720/1040/1080Hz lower-resolution modes when actually shipping or officially announced.
- **Why:** The split is right, but high-refresh dual-mode products have moved beyond the 480Hz examples since the original note.

#### `vrr_range` — Minor change

- **- Remove / replace:** `G-Sync hardware-module monitors are always 1 Hz-max.`
- **+ Add / rewrite:** Record the published VRR range exactly. If NVIDIA full G-SYNC claims a full-range/1Hz-to-max behavior, capture it only when the source or certification table supports it; otherwise keep the stated range.
- **Why:** The old hardware-module blanket rule is too broad and misses newer integrated-scaler G-SYNC implementations.

### color_image_quality

#### `black_uniformity` — Change

- **- Remove / replace:** `NOT a percentage`
- **+ Add / rewrite:** RTINGS black-uniformity standard deviation is presented as a percentage; lower is better, and 0% would be perfect. Keep the warning that it is not the 0–10 score/rating.
- **Why:** RTINGS says its black-uniformity program presents standard deviation as a percentage and gives `<2%` as a good value.

#### `brightness_hdr_peak` — Minor change

- **- Remove / replace:** `review labs standardize on 10% window` and fixed `30–50% lower` OLED delta.
- **+ Add / rewrite:** Record the measurement window/source methodology. Prefer a comparable 10% window when available, but do not assume all review labs use the same windows or that OLED deltas are always 30–50%; preserve the source window in evidence notes.
- **Why:** Good warning, but the current wording over-standardizes lab methods and over-generalizes OLED behavior.

#### `color_accuracy_delta_e` — Minor change

- **- Remove / replace:** `<2 = consumer-grade calibrated; <1 = professional` as a hard universal threshold.
- **+ Add / rewrite:** Record average Delta E with decimals where available, including test mode/profile and whether it is grayscale/white-balance, ColorChecker, or gamut validation. Use <2 and <1 as rough interpretation, not a field rule.
- **Why:** Delta E methods differ by patch set and target colorspace; thresholds are helpful but should not replace methodology notes.

#### `color_gamut_dci_p3` — Minor change

- **- Remove / replace:** `They typically differ by ~5 percentage points.`
- **+ Add / rewrite:** Keep the coverage-vs-volume distinction, but remove the fixed delta. Record coverage, not volume, unless the field explicitly asks for volume.
- **Why:** The distinction is important, but the difference can vary widely by panel technology and gamut shape.

#### `factory_calibrated` — Minor change

- **- Remove / replace:** `Yes ONLY when the monitor ships with a paper or PDF calibration report.`
- **+ Add / rewrite:** Yes when the manufacturer states factory calibration for the shipped unit/model or provides a calibration report. Treat a report as higher confidence, but do not require it if the source explicitly says factory calibrated. An sRGB preset alone is still insufficient.
- **Why:** The report requirement is too strict; some brands document factory calibration without a per-unit visible report.

#### `gray_uniformity_50` — Minor change

- **- Remove / replace:** No unit stated.
- **+ Add / rewrite:** Add that RTINGS 50% gray standard deviation is expressed as a percentage; lower is better. Keep it distinct from the 50% DSE result.
- **Why:** RTINGS explicitly says 50% gray deviation is expressed as a percentage and gives `<2.5%` as a good value.

#### `hdr_support` — Minor change

- **- Remove / replace:** `A DisplayHDR 1000 panel still needs HDR10 to accept HDR content` phrasing.
- **+ Add / rewrite:** Keep codec/cert separation. Add: VESA DisplayHDR/True Black certifications are performance certifications built on HDR10 support, so DisplayHDR can imply HDR10 support, but it is still not itself a content codec. Verify non-VESA `HDR-ready` claims separately.
- **Why:** VESA states all DisplayHDR tiers require HDR10, so the note should not imply DisplayHDR and HDR10 are independent for certified products.

#### `local_dimming_zones` — Change

- **- Remove / replace:** `record 'per-pixel' or 'n/a'` in an integer-shaped field.
- **+ Add / rewrite:** For integer `local_dimming_zones`, record numeric FALD/Mini-LED/edge-lit zone count only. For OLED/self-emissive, use the schema's null/UNK/not_applicable path or add a separate `local_dimming_type` field; do not write strings into an integer field.
- **Why:** The guidance conflicts with the field dtype. This would create invalid values.

#### `reflections` — Minor change

- **- Remove / replace:** `total reflections` as if the only RTINGS metric name.
- **+ Add / rewrite:** Record the exact lab metric requested by the field, e.g. total/direct reflections as a percent of incoming light, and do not use the 0–10 score. Preserve whether the source used total, direct, or ambient-black-level reflection metrics.
- **Why:** The anti-reflection methodology has multiple named measurements; the extractor should not mix them.

#### `text_clarity` — Change

- **- Remove / replace:** `Driven by subpixel layout` as the dominant-only cause and `RGB stripe renders correctly without tuning` as unconditional.
- **+ Add / rewrite:** Text clarity is influenced by subpixel layout, PPI, scaling, coating, pixel shape, and OS font rendering. WRGB/QD-OLED layouts can need tuning; RGB stripe is generally easier, but still depends on resolution/scaling and panel orientation.
- **Why:** Subpixel layout is important but not the whole metric; the current note can overstate certainty.

### connectivity

#### `hdmi_version` — Change

- **- Remove / replace:** `FRL (48Gbps, real 4K@120 uncompressed)` and `treat as TMDS-limited` when full wording is absent.
- **+ Add / rewrite:** HDMI 2.1 features are optional. Capture actual supported features/rates: TMDS/18Gbps, FRL rate where stated, DSC, VRR, ALLM, eARC, and advertised max modes. If bandwidth is unstated, mark the bandwidth uncertain rather than forcing TMDS unless the source proves TMDS-only.
- **Why:** Same issue as `max_refresh_rate_hdmi`: HDMI 2.1 does not guarantee 48Gbps FRL, but absence of wording is not proof of TMDS-only.

#### `thunderbolt_ports` — Minor change

- **- Remove / replace:** `documented as 40 Gbps` as a sufficient condition.
- **+ Add / rewrite:** Count as Thunderbolt only when explicitly documented as Thunderbolt/USB4 with Thunderbolt certification/logo or a Thunderbolt version. 40Gbps alone can also describe non-Thunderbolt USB4. Include Thunderbolt 5/80Gbps+ cases when they appear.
- **Why:** Bandwidth alone can misclassify USB4 as Thunderbolt, and Thunderbolt 5 exceeds 40Gbps.

### ergonomics

#### `pivot_rotation` — Minor change

- **- Remove / replace:** `Most 34"+ ultrawides are 'No' by design.`
- **+ Add / rewrite:** Keep the ±90° vs one-direction distinction, but remove the broad ultrawide default. Use manufacturer ergonomics specs for actual pivot support.
- **Why:** The direction clarification is good; the size-based shortcut can become a false negative.

### dimensions_weight

#### `height` — Change

- **- Remove / replace:** `When only 'with stand' published, use lowest-position value minus stand height.`
- **+ Add / rewrite:** Use official `without stand`/panel-only dimensions or a dimension drawing. Do not derive panel-only height by subtracting stand travel/stand height unless the drawing explicitly supports the geometry; otherwise mark unknown.
- **Why:** With-stand height includes overlap and base geometry, so simple subtraction can produce wrong panel height.

### features

#### `flicker_free` — Minor change

- **- Remove / replace:** `DC-dimmed panels = Yes unambiguously.`
- **+ Add / rewrite:** Yes when the backlight is DC-dimmed/no-PWM across the relevant brightness range, or when the brand/lab certifies flicker-free. If PWM appears only below a threshold, capture `flicker_free` according to schema policy and put the threshold/frequency in evidence.
- **Why:** The concept is right, but some monitors mix DC dimming and low-brightness PWM.

#### `flicker_frequency` — Change

- **- Remove / replace:** `0 (or empty) when panel is DC-dimmed` and hard perceptibility thresholds.
- **+ Add / rewrite:** Use `0` only if the schema explicitly defines 0 as no PWM and the source/lab confirms no flicker; otherwise leave empty/UNK for unknown. Record actual PWM frequency and brightness range. Treat >2000Hz and <500Hz as rough risk cues, not absolutes.
- **Why:** 0 vs empty has different meaning, and flicker sensitivity varies by user and waveform.

#### `macos_compatibility` — Minor change

- **- Remove / replace:** `common on non-standard resolutions like 3840×1600` as a broad claim.
- **+ Add / rewrite:** Mark `Limited` only when a source or tested behavior shows broken/poor HiDPI scaling, USB-C/Thunderbolt issue, brightness-control issue, KVM issue, DSC issue, or unsupported refresh/HDR. Do not infer from resolution alone.
- **Why:** macOS scaling support depends on pixel density, connection, OS version, and user tolerance; resolution alone is not enough.

#### `ps5_compatibility` — Change

- **- Remove / replace:** `Yes requires HDMI 2.1 FRL + 4K@120 + HDMI VRR + ALLM` and `Limited for 1440p-only panels`.
- **+ Add / rewrite:** Define compatibility tiers. Full 4K tier: supports 4K120 over HDMI 2.1 with HDR/VRR as applicable. 1440p tier can still be good because PS5 supports 1440p and 1440p VRR; mark limited only if your product taxonomy requires 4K as `full`. ALLM is useful but not required for basic PS5 monitor compatibility.
- **Why:** The current note is too strict for non-4K-but-still-good PS5 use and overstates ALLM as a requirement.

#### `xbox_series_xs_compatibility` — Change

- **- Remove / replace:** `Yes requires HDMI 2.1 FRL + 4K@120 + HDMI VRR + Dolby Vision for Xbox gaming.`
- **+ Add / rewrite:** Define tiers. Full 4K tier: 4K120 over sufficient HDMI bandwidth plus VRR/HDR support. 1440p/120 and 1080p/120 can be compatible but not full 4K. Dolby Vision is a premium supported feature, not a requirement for Xbox compatibility; note it separately when present.
- **Why:** Dolby Vision is optional, not required, and compatibility should allow non-4K 120Hz tiers.

### proposed new keys

#### `bezel_width_top_mm` — Minor change

- **- Remove / replace:** `Fallback: measure from a square-on product render ... (±1 mm acceptable)` without stronger guardrails.
- **+ Add / rewrite:** Use dimension drawings first. Only estimate from an image when it is orthographic/square-on, high-resolution, and has a reliable scale reference; otherwise return UNK. Record that image-derived values are estimates.
- **Why:** Render perspective, crop, and marketing art can make ±1mm precision unrealistic.

#### `bezel_width_side_mm` — Minor change

- **- Remove / replace:** `Same sourcing as bezel_width_top_mm` without repeating image-estimate guardrails.
- **+ Add / rewrite:** Same as top bezel: dimension drawings first; image estimates only with orthographic view and reliable scale; otherwise UNK. For seams, note that two side bezels plus any panel gap equals visible seam.
- **Why:** Side bezel is useful, but image-based measurement needs stricter uncertainty handling.

#### `refresh_rate_dual_mode_max` — Minor change

- **- Remove / replace:** `Overclocked refresh rate`.
- **+ Add / rewrite:** Use `official lower-resolution dual-mode maximum refresh rate`; do not call it overclocked unless the source labels it as an OC mode.
- **Why:** Dual-mode is often an advertised official mode, not an overclock.

#### `nvidia_reflex_analyzer` — Change

- **- Remove / replace:** `Requires G-Sync hardware module.`
- **+ Add / rewrite:** NVIDIA Reflex Analyzer is a monitor-supported latency-measurement feature using a designated Reflex Analyzer USB port and compatible mouse. Historically it appeared in G-SYNC esports displays, but do not require the old dedicated G-SYNC module.
- **Why:** Newer G-SYNC implementations can carry advanced features without the old module requirement.

#### `gsync_pulsar` — Change

- **- Remove / replace:** `Requires G-Sync hardware module.`
- **+ Add / rewrite:** G-SYNC Pulsar is variable-frequency backlight strobing with VRR, advertised for over 1,000Hz perceived/effective motion clarity on debut displays. Do not require the old dedicated G-SYNC module in the guidance.
- **Why:** The first 2026 displays use integrated scaler implementations instead of the old dedicated module requirement.

#### `srgb_emulation_mode` — Minor change

- **- Remove / replace:** No mention of quality/constraints of the clamp mode.
- **+ Add / rewrite:** Yes when an OSD/software mode clamps a wide-gamut panel to sRGB. Also note if brightness, white point, or calibration controls are locked, because a poor clamp is still present but less useful.
- **Why:** Presence and quality are different; the field is boolean, but evidence should preserve limitations.

#### `color_certifications` — Change

- **- Remove / replace:** `Third-party color-accuracy certifications: ... UltraHD Premium, TUV Rheinland Eye Comfort.`
- **+ Add / rewrite:** Either rename to `display_certifications`, or restrict `color_certifications` to color/calibration programs such as Pantone Validated, Pantone SkinTone Validated, Calman Verified, factory color-calibration certificates, etc. Keep VESA DisplayHDR in `hdr_support`; put TÜV Eye Comfort / Low Blue Light / Flicker-Free in a broader certification field.
- **Why:** This field currently mixes color, HDR, and eye-comfort certifications.

#### `power_supply_type` — Minor change

- **- Remove / replace:** `Desktop monitors mostly internal; portable + thin ultrawides mostly external.`
- **+ Add / rewrite:** Infer from explicit specs, included-accessory photos, manual diagrams, connector shape, or replacement power-adapter listings. Avoid product-class stereotypes except as weak search hints.
- **Why:** The connector/accessory inference is useful; the product-class heuristic may bias extraction.

#### `ambient_light_sensor` — Minor change

- **- Remove / replace:** `Rare on gaming monitors.`
- **+ Add / rewrite:** Keep the synonym list and add current search clues such as adaptive brightness / ambient adaptive technology where relevant. Avoid saying rare on gaming monitors without date/context.
- **Why:** Newer gaming displays are starting to include ambient-adaptive features.

#### `burn_in_warranty_years` — Agree

- Good OLED-specific split from base warranty; important buying-decision detail.

## Guidance I agree with as written

`curve_radius`, `panel_bit_depth`, `panel_coating`, `pixel_density`, `screen_size`, `input_lag`, `overdrive`, `response_time_gtg`, `response_time_mprt`, `variable_refresh_rate`, `brightness_sdr`, `color_gamut_adobe_rgb`, `contrast_ratio`, `contrast_ratio_dynamic`, `wide_color_gamut`, `daisy_chain`, `displayport_ports`, `headphone_jack`, `usb_c_ports`, `height_adjustment`, `wall_mountable`, `depth`, `height_with_stand`, `weight_without_stand`, `energy_rating`, `sku`, `colors`, `discontinued`, `warranty`, `stand_included`, `burn_in_warranty_years`.

## Notes

I based the audit on your uploaded matrix file fileciteturn0file0.


# Monitor extraction guidance audit

Reviewed 72 non-empty guidance rows.

- Agree: 31
- Minor change: 24
- Change: 17

## Highest-priority changes
1. `max_refresh_rate_hdmi` / `hdmi_version`
   - Don’t assume HDMI 2.1 = full 48 Gbps FRL.
   - Capture actual FRL/TMDS/bandwidth/features if stated.

2. `max_refresh_rate_displayport`
   - Don’t rely on DP version alone.
   - Use actual UHBR mode / DSC / lane allocation / native mode.

3. `black_uniformity` / `gray_uniformity_50`
   - RTINGS values should be treated as percentage-style standard deviation notes, not generic rating wording.

4. `local_dimming_zones`
   - Integer field cannot take string values like `per-pixel` or `n/a`.
   - OLED should use null/UNK/not_applicable path or a separate type field.

5. `ps5_compatibility`
   - Current guidance is too strict.
   - 1440p + VRR can still be good PS5 compatibility.

6. `xbox_series_xs_compatibility`
   - Dolby Vision is not required for Xbox compatibility.
   - Treat it as a premium extra, not a base requirement.

7. `gsync_pulsar` / `nvidia_reflex_analyzer`
   - Remove old “requires G-Sync hardware module” language.
   - Guidance should reflect newer integrated implementations.

## Example rows I would change
- `base_model`
- `aspect_ratio`
- `panel_manufacturer`
- `subpixel_layout`
- `max_refresh_rate_displayport`
- `max_refresh_rate_hdmi`
- `black_uniformity`
- `local_dimming_zones`
- `text_clarity`
- `hdmi_version`
- `height`
- `flicker_frequency`
- `ps5_compatibility`
- `xbox_series_xs_compatibility`
- `nvidia_reflex_analyzer`
- `gsync_pulsar`
- `color_certifications`

## Example rows I mostly agree with
- `curve_radius`
- `panel_bit_depth`
- `panel_coating`
- `pixel_density`
- `screen_size`
- `input_lag`
- `response_time_gtg`
- `variable_refresh_rate`
- `brightness_sdr`
- `contrast_ratio`
- `daisy_chain`
- `displayport_ports`
- `height_adjustment`
- `wall_mountable`
- `sku`
- `colors`
- `warranty`
- `burn_in_warranty_years`