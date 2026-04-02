# Handoff: Color & Edition Finder — LLM Integration

## What's Built (Foundation)

### Color Registry (SSOT)
- **Table**: `color_registry` in `appDb` (77 colors: 36 base + 23 light + 18 dark)
- **API**: `GET/POST/PUT/DELETE /api/v1/colors`
- **GUI**: Colors tab (global group, after Brands) with dashboard grid, color picker
- **Write-back**: Every mutation persists to `category_authority/_global/color_registry.json`
- **WebSocket**: `color-add`, `color-update`, `color-delete` events for real-time propagation

### Field Rules Studio Wiring
- `buildEgColorFieldRule(ctx)` — accepts `ctx.colorNames` from `appDb.listColors()`
- `reasoning_note` is **dynamically generated** from the registry:
  - Lists base colors (those with light-/dark- variants) compactly
  - Auto-discovers prefixes from data (light-, dark-, vivid-, pastel-, etc.)
  - Zero hardcoded prefix lists — the registry IS the config
- `studioRoutes.js` reads `appDb.listColors()` on every GET/PUT
- `registeredColors: string[]` included in studio payload for frontend

### EG Format Contract (Verified Against Real EG Codebase)
- **Colors**: `["black", "black+red", "white+orange+blue"]` — `+`-joined atoms in dominant order
- **Editions**: `["cyberpunk-2077-edition"]` — kebab-case slugs, open enum
- **Image stems**: `{view}---{color}` (three hyphens). Edition NOT in image filenames.
- **enum_policy**: `open` (infinite `+` combos can't be enumerated)
- **No `format_pattern`/`custom_string`** — these don't exist in the field rule schema

---

## What to Build Next

### 1. Identity Validation Panel (IndexLab UI)
New panel between product picker and run history in the IndexLab page. Three feature toggles:
- **Release Date** — GPT-5.4 xhigh + web → Keepa/CamelCamelCamel (one-and-done cooldown)
- **Color & Edition Variants** — GPT-5.4 xhigh + web (30-day cooldown)
- **Visual Verification** — GPT-5.4 + Gemini vision gate (coverage-based cooldown)

Each toggle shows: enabled/disabled state, cooldown badge, completion checkmark.

**See**: `docs/implementation/validation-enrichment-roadmap.html` section 03 for UI mockup.

### 2. Color & Edition Finder (LLM Feature)

#### Architecture
```
src/features/color-edition-finder/
  ├── index.js                    # Public API
  ├── colorEditionFinder.js       # Core orchestrator
  ├── colorEditionSchema.js       # Zod schema for LLM structured output
  ├── colorEditionPrompt.js       # System + user prompt builder
  ├── api/
  │   ├── colorEditionRoutes.js   # API endpoints
  │   └── colorEditionRouteContext.js
  └── tests/
      ├── colorEditionSchema.test.js
      └── colorEditionFinder.test.js
```

#### LLM Call Configuration
| Parameter | Value |
|-----------|-------|
| Provider | Lab OpenAI (`localhost:5001`) |
| Model | `gpt-5.4` |
| Thinking effort | `xhigh` |
| Web search | Enabled |
| Structured output | JSON schema (Zod-derived) |
| Max output tokens | 8,192 |
| Timeout | 120s |

#### LLM Prompt Design
The system prompt should:
1. Include product identity: `{ brand, model, variant, category }`
2. Include registered colors from `appDb.listColors()` (already available via `registeredColors` in studio payload, or read directly)
3. Instruct: "Return only colors from this list. Multi-color variants use `+` in dominant order."
4. Instruct: "Return editions as kebab-case slugs."
5. Request structured output matching `colorEditionSchema`

#### Expected LLM Response Schema
```js
{
  colors: ["black", "white", "black+red"],
  default_color: "black",
  editions: [
    { slug: "cyberpunk-2077-edition", display_name: "Cyberpunk 2077 Edition", colors: ["black+red"] }
  ],
  variants: [
    { color: "black", edition: null, sku: "...", availability: "in_stock", product_url: "..." },
    { color: "black+red", edition: "cyberpunk-2077-edition", sku: "...", availability: "discontinued", product_url: "..." }
  ],
  search_sources: ["corsair.com", "amazon.com"],
  confidence: 0.95
}
```

#### Storage
- **`product_variants` table** (per-category specDb) — see roadmap section 15 for DDL
- Each variant: `{ product_id, color, edition, sku, availability, product_url, is_default }`
- **Cooldown state**: `identity_validation_state` table or product metadata

#### Integration Points
- `src/features/indexing/` — add LLM phase definition in `llmPhaseDefs.js`
- `src/api/guiServerRuntime.js` — wire route context
- `src/app/api/routeRegistry.js` — add to `GUI_API_ROUTE_ORDER`
- `src/core/events/dataChangeContract.js` — add events
- `tools/gui-react/src/features/data-change/invalidationResolver.js` — add domain

---

## Key Files to Study

| File | Why |
|------|-----|
| `src/features/studio/contracts/egPresets.js` | Colors field rule builder with ctx pattern |
| `src/features/color-registry/colorRegistrySeed.js` | 77 color seed data + write-back |
| `src/features/studio/api/studioRoutes.js:73-136` | How `appDb.listColors()` feeds into preset builders |
| `src/features/indexing/api/indexlabRoutes.js` | Existing LLM run orchestration |
| `src/features/indexing/runtime/` | LLM phase execution pattern |
| `docs/implementation/validation-enrichment-roadmap.html` | Full roadmap with schemas, UI mockups, data model |

## Tests to Keep Green
```
node --test src/features/studio/contracts/tests/egPresets.test.js      # 58 tests
node --test src/features/color-registry/tests/colorRegistrySeed.test.js # 12 tests
node --test src/db/tests/appDb.test.js                                  # 49 tests
node --test src/features/studio/api/tests/studioShapeGoldenMaster.test.js # 8 tests
```
