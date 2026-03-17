# Prompt: Redesign the Global LLM Configuration Page

You are redesigning a settings page called "Global" that configures LLM providers, models, costs, limits, and caching for an application called SpecFactory. The current design is flat, single-provider, and doesn't scale. You must replace it with a **provider registry pattern** that supports N providers, each with N models, with global defaults that propagate to all downstream sections.

Read this entire specification before writing any code. Follow it exactly. Do not invent fields, skip sections, or rearrange the structure.

---

## 1. Current State (What Exists Now — Remove All Of This)

The current Global config page has these flat sections that must ALL be removed and replaced:

- **PROVIDER & API** — single LLM Provider field, single Base URL, single OpenAI API Key, single Anthropic API Key. Problem: only supports one provider at a time, hardcodes two key fields.
- **CORTEX / LLM LAB CONNECTION** — a toggle for "Cortex Enabled". Problem: this is just another provider type; it should be a provider entry in the registry, not a special toggle.
- **BUDGET & COST** — Monthly Budget, Per-Product Budget, Budget Guards toggle, and a single COST RATES subsection (Input Cost / 1M tokens, Output Cost / 1M tokens, Cached Input Cost / 1M tokens). Problem: costs are global but should be per-model since different models have different pricing.
- **GLOBAL LIMITS** — Max Tokens (context), Max Output Tokens, Timeout (ms), Max Calls Per Round, Max Calls Per Product, Max Fast Calls Per Product. This data is correct but needs restructuring.
- **REASONING** — Reasoning Mode toggle, Reasoning Budget. Problem: reasoning is just a model role, not a separate section. The budget is a limit that belongs with other limits.
- **EXTRACTION CACHE** — Cache Enabled toggle, Cache Dir, Cache TTL (ms). This section is fine and stays mostly as-is.

Delete every one of these sections. Replace them with the three sections defined below.

---

## 2. New Data Model (JSON Schema)

This is the exact data structure the UI must produce when saved. Every field listed here must appear in the UI. No field should appear in the UI that is not listed here.

```json
{
  "providers": [
    {
      "id": "uuid-auto-generated",
      "name": "DeepSeek",
      "type": "openai-compatible",
      "base_url": "https://api.deepseek.com",
      "api_key": "sk-xxxxxxxxxxxx",
      "enabled": true,
      "models": [
        {
          "model_id": "deepseek-chat",
          "role": "base",
          "cost_input_per_1m": 1.25,
          "cost_output_per_1m": 10.00,
          "cost_cached_per_1m": 0.125,
          "max_context_tokens": null,
          "max_output_tokens": null
        },
        {
          "model_id": "deepseek-reasoner",
          "role": "reasoning",
          "cost_input_per_1m": 2.00,
          "cost_output_per_1m": 16.00,
          "cost_cached_per_1m": 0.50,
          "max_context_tokens": null,
          "max_output_tokens": null
        }
      ]
    },
    {
      "id": "uuid-auto-generated",
      "name": "Anthropic",
      "type": "anthropic",
      "base_url": "https://api.anthropic.com",
      "api_key": "",
      "enabled": false,
      "models": []
    }
  ],

  "defaults": {
    "base_model": "deepseek/deepseek-chat",
    "reasoning_model": "deepseek/deepseek-reasoner",
    "fallback_model": null,

    "max_context_tokens": 16384,
    "max_output_tokens": 1400,
    "timeout_ms": 30000,
    "max_calls_per_round": 5,
    "max_calls_per_product": 14,
    "max_fast_calls_per_product": 6,
    "reasoning_budget": 32768,

    "monthly_budget_usd": 300,
    "per_product_budget_usd": 0.15,
    "budget_guards_enabled": false
  },

  "cache": {
    "enabled": true,
    "cache_dir": ".specfactory_tmp/llm_cache",
    "cache_ttl_ms": 60480000
  }
}
```

### Field Rules

**providers[].type** — Must be a dropdown with these exact options:
- `openai-compatible` (works for DeepSeek, OpenAI, Together, Groq, any OpenAI-compatible API)
- `anthropic` (Anthropic's native API format)
- `ollama` (local Ollama instance)
- `cortex` (replaces the old Cortex toggle — Cortex is just another provider)

**providers[].models[].role** — Must be a dropdown with these exact options:
- `base` — standard completion model
- `reasoning` — extended thinking / chain-of-thought model
- `fast` — smaller/cheaper model for simple tasks
- `embedding` — embedding model (no cost_output field needed, set to 0)

**providers[].models[].max_context_tokens** and **max_output_tokens** — These are OPTIONAL per-model overrides. When `null`, the model uses the global default. When set, they override the global default for that specific model only. Display as empty/placeholder text "uses global default" when null.

**defaults.base_model** and **defaults.reasoning_model** — Format is `provider_name/model_id` as a composite key. The UI must render these as dropdowns that are dynamically populated from all registered providers and their models, filtered by role. The base_model dropdown shows only models with role `base` or `fast`. The reasoning_model dropdown shows only models with role `reasoning`. If no models of that role exist, show "No models registered" as disabled placeholder.

**defaults.fallback_model** — Optional. A model to try if the primary model fails. Dropdown populated from all registered models regardless of role. Can be null.

---

## 3. UI Layout Specification

The page has exactly three sections, rendered in this order from top to bottom:

### Section 1: Provider Registry

**Section header:** "PROVIDER REGISTRY" (uppercase label, small text, muted color)

**Layout:** A vertical list of provider cards. Each card is collapsible. Below the list, a dashed-border "+ Add provider" button spans the full width.

**Each provider card contains (when expanded):**

Row 1 — Header bar:
- Left side: Avatar circle (first 1-2 letters of provider name, colored background), provider name (bold, 15px), status badge ("Active" green if enabled + has API key + has at least 1 model; "No key" gray if no API key; "No models" amber if key present but no models; "Disabled" red if enabled=false)
- Right side: Enable/disable toggle, collapse/expand control, delete button (trash icon, requires confirmation)

Row 2 — Connection fields (2-column grid):
- Column 1: "Provider type" dropdown (openai-compatible, anthropic, ollama, cortex)
- Column 2: "Base URL" text input

Row 3 — API key (full width):
- "API key" password input with show/hide toggle

Row 4 — Models sub-section:
- Sub-header: "Models" label
- A table with columns: Model ID (text input) | Role (dropdown) | Input $/1M (number) | Output $/1M (number) | Cached $/1M (number) | per-model context override (number, optional) | per-model output override (number, optional) | delete row button
- Below the table: "+ Add model" button
- Each row is directly editable inline (no modal)

**When collapsed:** Show only the header bar (avatar, name, status badge, toggle, expand control). Hide all fields and the models table.

**"+ Add provider" button behavior:** Adds a new expanded card with empty fields, type defaulted to "openai-compatible", base_url empty, api_key empty, models array empty.

### Section 2: Global Defaults

**Section header:** "GLOBAL DEFAULTS" (uppercase label, small text, muted color)

**Layout:** A single card with three sub-sections separated by horizontal dividers.

**Sub-section A — Model Selection:**
- Heading: "Model selection"
- Helper text below heading: "These propagate to all sections. Override per-section if needed."
- 3-column grid:
  - "Default base model" — dropdown, populated from providers (models with role=base or role=fast), format "ProviderName / model_id"
  - "Default reasoning model" — dropdown, populated from providers (models with role=reasoning), format "ProviderName / model_id"
  - "Fallback model" — dropdown, populated from all provider models regardless of role, with an additional "None" option at top

**Mixed-provider warning banner (conditional):**
Immediately below the 3-column model selection grid, render a warning banner if ANY of the following are true:
- base_model and reasoning_model come from different providers
- fallback_model comes from a different provider than base_model
- Any per-section override (downstream, not on this page) uses a different provider than the global default

The banner must:
- Use an amber/warning style (amber background, amber border-left accent, amber icon)
- Headline: "Mixed-provider configuration detected"
- Body text lists every mismatch found, e.g.:
  - "Base model uses DeepSeek but reasoning model uses Anthropic — these providers use different API formats and token counting. A failure in one provider will not automatically fall back to the other unless a fallback model is configured."
  - "Fallback model uses Ollama (local) but base model uses DeepSeek (remote) — if the remote provider is down, fallback will work, but if the local Ollama server is down, there is no further fallback."
- Include a "Dismiss" link to hide the banner for this session (not permanently — it reappears on next page load if the mismatch still exists)
- This banner is INFORMATIONAL, not blocking. The user can still save. It is a flag, not a gate.

**Provider health indicator dots (conditional):**
Next to each model dropdown, show a small colored dot indicating the provider's reachability status:
- Green dot: provider responded to a lightweight health check (e.g., list models endpoint) within the last 5 minutes
- Gray dot: no health check performed yet
- Red dot: last health check failed (with tooltip showing the error, e.g., "401 Unauthorized", "Connection refused", "Timeout after 5000ms")
- Health checks fire on page load and can be manually re-triggered with a small refresh icon next to the dot
- This is especially critical for mixed configs — if one provider is red, the user immediately sees which part of their pipeline is broken

**Sub-section B — Limits:**
- Heading: "Limits"
- Helper text: "Apply to all sections including fallback unless overridden per-section."
- Grid layout with these fields (3 columns, 3 rows):
  - Row 1: Max context tokens (16384) | Max output tokens (1400) | Timeout ms (30000)
  - Row 2: Max calls per round (5) | Max calls per product (14) | Max fast calls per product (6)
  - Row 3: Reasoning budget (32768) | [empty] | [empty]

**Sub-section C — Budget:**
- Heading: "Budget"
- 3-column grid:
  - Monthly budget USD (300) | Per-product budget USD (0.15) | Budget guards toggle (disabled by default)

### Section 3: Extraction Cache

**Section header:** "EXTRACTION CACHE" (uppercase label, small text, muted color)

**Layout:** A single card.

Row 1: "Cache enabled" label on left, toggle switch on right.

Row 2 (only visible when cache enabled): 2-column grid:
- Cache dir (text input, default ".specfactory_tmp/llm_cache")
- Cache TTL ms (number input, default 60480000)

---

## 4. Behavior Rules

### Propagation
1. When `defaults.base_model` is changed, every downstream section that hasn't explicitly overridden its model selection should reflect the new default. The UI does not need to implement this propagation itself — it just saves the config. The backend handles propagation. But the UI should display "Using global default: DeepSeek / deepseek-chat" as placeholder text in any per-section config that hasn't overridden.

2. When `defaults.max_context_tokens` (or any other limit) is changed, same logic. Per-section limits show "Using global: 16384" unless overridden.

3. The fallback chain uses global limits unless the fallback model's per-model overrides are set.

### Validation
1. **Provider name** — required, must be unique across all providers.
2. **Base URL** — required, must start with `http://` or `https://`.
3. **API key** — required for types `openai-compatible` and `anthropic`. Optional for `ollama` and `cortex`.
4. **Model ID** — required, must be unique within a provider. Can duplicate across providers (e.g., two providers can both have "gpt-4").
5. **Cost fields** — required, must be >= 0. Can be 0 (for free/local models).
6. **Limit fields** — required, must be positive integers.
7. **Budget fields** — required, must be >= 0.
8. **Default model dropdowns** — if no models with the required role exist in any provider, show a warning: "No [base/reasoning] models registered. Add a model with role=[base/reasoning] to a provider."

### Mixed-Provider Detection and Flagging

This is a critical feature. Users frequently configure models from different providers without realizing the implications. The system must actively detect and flag every mix scenario. These are NOT errors — they are warnings that let the user make an informed choice.

**Detection logic — run this on every change to any model dropdown (base, reasoning, fallback, or per-section overrides):**

```
function detectMixIssues(config):
  issues = []
  
  base_provider = getProvider(config.defaults.base_model)
  reasoning_provider = getProvider(config.defaults.reasoning_model)
  fallback_provider = getProvider(config.defaults.fallback_model)
  
  # Check 1: Base vs Reasoning mismatch
  if base_provider != reasoning_provider and both are set:
    issues.push({
      type: "cross_provider",
      severity: "warning",
      message: "Base model ({base}) and reasoning model ({reasoning}) use different providers. Token counts, rate limits, and error formats will differ between calls.",
      fields: ["base_model", "reasoning_model"]
    })
  
  # Check 2: Fallback provider mismatch
  if fallback_provider != base_provider and fallback is set:
    issues.push({
      type: "fallback_cross_provider",
      severity: "info",
      message: "Fallback model uses a different provider ({fallback_provider}) than the base model ({base_provider}). This provides provider-level redundancy but costs may vary significantly.",
      fields: ["fallback_model"]
    })
  
  # Check 3: Fallback is same provider as primary (no redundancy)
  if fallback_provider == base_provider and fallback is set:
    issues.push({
      type: "same_provider_fallback",
      severity: "warning",
      message: "Fallback model uses the same provider as the base model ({base_provider}). If this provider goes down, the fallback will also fail. Consider using a different provider for true redundancy.",
      fields: ["fallback_model"]
    })
  
  # Check 4: No fallback configured at all
  if fallback is null:
    issues.push({
      type: "no_fallback",
      severity: "info",
      message: "No fallback model configured. If the primary model or provider fails, calls will error with no automatic retry.",
      fields: ["fallback_model"]
    })
  
  # Check 5: Mixed local/remote (e.g., Ollama base + DeepSeek reasoning)
  if one provider is type "ollama" and another is remote:
    issues.push({
      type: "local_remote_mix",
      severity: "warning", 
      message: "Mixing local ({local}) and remote ({remote}) providers. Network issues affect them differently — remote calls may fail while local works (and vice versa if the local server is stopped).",
      fields: affected_dropdowns
    })
  
  # Check 6: Provider type mismatch (different API formats)
  if base_provider.type != reasoning_provider.type:
    issues.push({
      type: "api_format_mismatch",
      severity: "info",
      message: "Base model uses {base_type} API format, reasoning uses {reasoning_type}. The system handles both, but response parsing differs — verify that structured output schemas work with both providers.",
      fields: ["base_model", "reasoning_model"]
    })
  
  # Check 7: Context window mismatch across selected models
  if base_model.max_context != reasoning_model.max_context and both have overrides:
    issues.push({
      type: "context_mismatch",
      severity: "info",
      message: "Selected models have different max context windows (base: {x}, reasoning: {y}). The global limit will cap both, but if set above the smaller model's limit, that model will truncate silently.",
      fields: ["max_context_tokens"]
    })

  return issues
```

**How issues display:**

Each issue renders as a compact inline alert below the Model Selection sub-section, stacked vertically:
- `severity: "warning"` — amber left border, amber icon, amber-tinted background
- `severity: "info"` — blue left border, info icon, blue-tinted background
- Each alert has the message text and a small "dismiss" button (dismiss is per-session only)
- The affected dropdown fields get a matching colored ring (amber or blue) so the user can see exactly which fields are involved
- Alerts animate in/out smoothly when model selections change

**These alerts must NOT block saving.** They are informational flags. The user may intentionally want a mixed config (e.g., cheap Ollama for fast tasks, powerful Anthropic for reasoning). The point is awareness, not prevention.

**Per-section override flagging:**
When a downstream section (not on this page, but relevant to the backend) overrides the global model with a model from a different provider, the Global Defaults page should show a summary line:
- "3 sections override the global model. 2 use a different provider." — with a link/button to expand and see which sections and what they're using.

### Save Behavior
- The "Save" button at the top right saves the entire page atomically.
- Validate all fields before saving. If any validation fails, highlight the specific field with a red border and show the error message below it. Do not save partial data.
- After successful save, show a brief success toast/notification.

### Delete Confirmations
- Deleting a provider: "Delete [Provider Name]? This will remove all its models and cannot be undone."
- Deleting a model row: No confirmation needed (it's a single row in a table, easily re-added).

---

## 5. Styling Requirements

- Clean, flat design. No gradients, no shadows, no decorative effects.
- Use a neutral color palette: white/light gray cards, subtle borders, muted label text.
- Section headers: uppercase, small font (11-12px), letter-spacing, muted color.
- Form labels: 12px, muted secondary color, positioned above each input.
- Input fields: standard height (~36px), subtle border, clear focus state.
- Cards: white background, thin border (0.5-1px), rounded corners (8-12px), padding ~16-20px.
- Status badges: small pills with semantic colors (green=active, gray=inactive, amber=warning, red=disabled).
- Role badges on model table: small pills, color-coded by role (base=gray, reasoning=purple, fast=blue, embedding=teal).
- The page must be responsive. On screens < 768px, grids collapse to single column.
- Toggle switches use the system/component library style, not custom implementations.
- Password fields have a show/hide eye icon toggle.

---

## 6. What NOT to Build

Do not include any of the following. These exist in the old design but are eliminated:

1. ~~CORTEX / LLM LAB CONNECTION section~~ — Cortex is now a provider type in the registry.
2. ~~Separate REASONING section~~ — Reasoning Mode is implicit (you either picked a reasoning model or you didn't). Reasoning Budget is a limit in Section 2B.
3. ~~Flat COST RATES subsection~~ — Costs are per-model inside each provider card.
4. ~~Single LLM Provider / Base URL / OpenAI Key / Anthropic Key fields~~ — Replaced by the provider registry.
5. ~~Any mention of "Cortex Enabled" as a standalone toggle~~ — It's a provider.
6. ~~Any global cost rate fields~~ — All costs live on individual models.

---

## 7. Example Populated State

When the page loads with the sample data from the schema above, it should look like:

**Provider Registry:**
- Card 1: "DeepSeek" — expanded, Active badge, type=openai-compatible, base_url=https://api.deepseek.com, key=sk-xxx (masked), 2 models (deepseek-chat as base, deepseek-reasoner as reasoning) with their costs filled in.
- Card 2: "Anthropic" — collapsed, "No key" badge, type=anthropic, base_url=https://api.anthropic.com, key empty, 0 models.
- "+ Add provider" button at bottom.

**Global Defaults:**
- Model Selection: base=DeepSeek / deepseek-chat, reasoning=DeepSeek / deepseek-reasoner, fallback=None
- Limits: all filled with default values
- Budget: 300 monthly, 0.15 per-product, guards disabled

**Extraction Cache:**
- Enabled, dir=.specfactory_tmp/llm_cache, TTL=60480000

---

## 8. Edge Cases to Handle

1. **Zero providers**: Show empty state with prominent "+ Add provider" button and helper text: "Add at least one provider to start using LLM features."
2. **Provider with zero models**: Card shows "No models" amber badge. The model selection dropdowns in Global Defaults will not include this provider.
3. **All providers disabled**: Global Defaults model dropdowns show "No active models available" as disabled placeholder.
4. **Duplicate provider name**: Block save, highlight the duplicate name field.
5. **Deleting provider whose model is the current default**: After delete, the default dropdown shows "Model not found — please select a new default" in red text. Block save until resolved.
6. **Extremely long model IDs**: Model ID column should truncate with ellipsis. Full ID visible on hover/tooltip.
7. **Ollama provider**: base_url defaults to "http://localhost:11434", api_key field is hidden (not just optional — hidden entirely, since Ollama doesn't use keys).
8. **Cortex provider**: base_url defaults to whatever the Cortex default is. Show a helper text: "Replaces the old Cortex/LLM Lab connection toggle."
9. **Mixed-provider with one provider disabled**: User selects DeepSeek for base and Anthropic for reasoning, then disables the Anthropic provider. The reasoning dropdown must immediately show "Anthropic (disabled)" in red text with a warning: "Selected provider is disabled. This model will not be available at runtime." Do not auto-clear the selection — the user may re-enable the provider. But block save if any selected default model belongs to a disabled provider.
10. **Mixed-provider with one provider's key revoked/expired**: Health check dot turns red. The mixed-provider warning banner updates to include: "Anthropic health check failed: 401 Unauthorized. The reasoning model will fail at runtime."
11. **Fallback chain loops**: User sets base=ProviderA/model1, fallback=ProviderA/model1 (same model). Block save with error: "Fallback model cannot be the same as the base model."
12. **Budget implications of mixed providers**: When mixed providers are detected and budget guards are enabled, show an additional info alert: "Budget tracking spans multiple providers. Actual costs depend on which provider handles each call. The per-product budget applies to the combined cost across all providers."
13. **Rate limit stacking**: When base and reasoning use different providers, add info text near the "Max calls per round" field: "This limit applies per-round across all providers combined, not per-provider. Each provider may have its own external rate limits."

---

## 9. Implementation Notes

- The provider `id` field is auto-generated (UUID) on creation. It is not user-editable and does not appear in the UI. It is used internally as the stable identifier for a provider across renames.
- The composite key format for model references is `provider_id/model_id` in the actual saved config, but displayed as `ProviderName / model_id` in the UI for readability.
- The models table should support drag-to-reorder rows (optional, nice-to-have). Order determines priority when multiple models share a role.
- API key fields must never log or echo the full key. On load, show masked value. On save, only send the key if it was changed (to avoid overwriting with the masked version).

### Health Check Implementation
- Provider health checks are **runtime UI state**, not persisted config. They do not appear in the JSON schema.
- The health check endpoint varies by provider type:
  - `openai-compatible`: GET `{base_url}/v1/models` with the API key in Authorization header
  - `anthropic`: POST `{base_url}/v1/messages` with a minimal request (1 token max) — or use whatever lightweight auth-check endpoint Anthropic provides
  - `ollama`: GET `{base_url}/api/tags` (no auth needed)
  - `cortex`: Whatever health endpoint Cortex exposes
- Health check timeout: 5 seconds. If no response in 5s, mark as red with "Timeout" tooltip.
- Cache health check results for 5 minutes. Show last-checked timestamp on hover.
- Health checks run in parallel on page load (don't block rendering — show gray dots, then update to green/red as results arrive).

### Mixed-Provider Detection Timing
- The detection logic runs **client-side** on every change to a model dropdown, not on save. This gives instant feedback.
- The detection function receives the full current form state (not just the changed field) so it can evaluate all combinations.
- Alerts are rendered as a React/Vue/whatever component that subscribes to the form state and re-evaluates on every change. Do not debounce — dropdown changes are discrete events, not rapid-fire inputs.

---

## Summary Checklist

Before submitting, verify:

- [ ] Old sections (Provider & API, Cortex, Budget & Cost, Cost Rates, Global Limits, Reasoning) are ALL gone
- [ ] Three new sections exist: Provider Registry, Global Defaults, Extraction Cache
- [ ] Provider cards are collapsible with inline-editable model tables
- [ ] Model costs are per-model, not global
- [ ] Provider type dropdown includes: openai-compatible, anthropic, ollama, cortex
- [ ] Model role dropdown includes: base, reasoning, fast, embedding
- [ ] Default model dropdowns are dynamically populated and filtered by role
- [ ] Fallback model dropdown exists and pulls from all models
- [ ] All validation rules are implemented
- [ ] Delete provider requires confirmation
- [ ] Status badges update dynamically based on provider state
- [ ] Ollama hides the API key field
- [ ] Per-model context/output overrides exist with "uses global default" placeholder
- [ ] Responsive layout (single column below 768px)
- [ ] Save is atomic with field-level error highlighting
- [ ] Mixed-provider detection logic runs on every model dropdown change
- [ ] Warning banner appears when base/reasoning/fallback span multiple providers
- [ ] Same-provider fallback warning appears (no redundancy)
- [ ] No-fallback info alert appears when fallback is null
- [ ] Local/remote mix (Ollama + cloud) flagged specifically
- [ ] API format mismatch flagged (openai-compatible vs anthropic)
- [ ] Context window mismatch across selected models flagged
- [ ] Provider health dots appear next to model dropdowns (green/gray/red)
- [ ] Health check fires on page load with manual refresh option
- [ ] Disabled provider with selected model blocks save with clear error
- [ ] Fallback = base model (same model) blocks save
- [ ] All mix alerts are non-blocking (info/warning, NOT errors) except disabled-provider and self-referencing fallback
- [ ] Alerts dismiss per-session but reappear on next load if mismatch persists
- [ ] Affected dropdowns get colored ring matching the alert severity
