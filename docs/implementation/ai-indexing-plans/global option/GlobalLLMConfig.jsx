import { useState, useEffect, useCallback, useMemo } from "react";

const PROVIDER_TYPES = [
  { value: "openai-compatible", label: "OpenAI Compatible" },
  { value: "anthropic", label: "Anthropic" },
  { value: "ollama", label: "Ollama" },
  { value: "cortex", label: "Cortex" },
];

const MODEL_ROLES = [
  { value: "base", label: "Base", color: "#888780", bg: "#F1EFE8" },
  { value: "reasoning", label: "Reasoning", color: "#534AB7", bg: "#EEEDFE" },
  { value: "fast", label: "Fast", color: "#185FA5", bg: "#E6F1FB" },
  { value: "embedding", label: "Embedding", color: "#0F6E56", bg: "#E1F5EE" },
];

const DEFAULT_URLS = {
  "openai-compatible": "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  ollama: "http://localhost:11434",
  cortex: "http://localhost:39281",
};

const uid = () => Math.random().toString(36).slice(2, 10);

const INITIAL_PROVIDERS = [
  {
    id: uid(),
    name: "DeepSeek",
    type: "openai-compatible",
    base_url: "https://api.deepseek.com",
    api_key: "sk-a]8fK2mNpQrStUvWxYz1234567890",
    enabled: true,
    expanded: true,
    health: "green",
    models: [
      { id: uid(), model_id: "deepseek-chat", role: "base", cost_input: 1.25, cost_output: 10, cost_cached: 0.125, max_ctx: "", max_out: "" },
      { id: uid(), model_id: "deepseek-reasoner", role: "reasoning", cost_input: 2, cost_output: 16, cost_cached: 0.5, max_ctx: "", max_out: "" },
    ],
  },
  {
    id: uid(),
    name: "Anthropic",
    type: "anthropic",
    base_url: "https://api.anthropic.com",
    api_key: "",
    enabled: false,
    expanded: false,
    health: "gray",
    models: [
      { id: uid(), model_id: "claude-sonnet-4-20250514", role: "reasoning", cost_input: 3, cost_output: 15, cost_cached: 0.3, max_ctx: "200000", max_out: "16000" },
    ],
  },
];

const INITIAL_DEFAULTS = {
  base_model: "",
  reasoning_model: "",
  fallback_model: "",
  max_context_tokens: 16384,
  max_output_tokens: 1400,
  timeout_ms: 30000,
  max_calls_per_round: 5,
  max_calls_per_product: 14,
  max_fast_calls_per_product: 6,
  reasoning_budget: 32768,
  monthly_budget_usd: 300,
  per_product_budget_usd: 0.15,
  budget_guards_enabled: false,
};

const INITIAL_CACHE = {
  enabled: true,
  cache_dir: ".specfactory_tmp/llm_cache",
  cache_ttl_ms: 60480000,
};

/* ── tiny reusable bits ─────────────────────────────────── */

const Toggle = ({ value, onChange, size = "md" }) => {
  const w = size === "sm" ? 36 : 42;
  const h = size === "sm" ? 20 : 24;
  const d = size === "sm" ? 14 : 18;
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: w, height: h, borderRadius: h, cursor: "pointer",
        background: value ? "#1D9E75" : "#B4B2A9",
        padding: 3, transition: "background .2s", flexShrink: 0,
        display: "flex", alignItems: "center",
      }}
    >
      <div style={{
        width: d, height: d, borderRadius: "50%", background: "#fff",
        transition: "transform .2s",
        transform: value ? `translateX(${w - d - 6}px)` : "translateX(0)",
      }} />
    </div>
  );
};

const Badge = ({ children, color, bg }) => (
  <span style={{
    fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6,
    background: bg, color, whiteSpace: "nowrap", lineHeight: "18px",
  }}>{children}</span>
);

const HealthDot = ({ status }) => {
  const colors = { green: "#1D9E75", gray: "#B4B2A9", red: "#E24B4A" };
  const tips = { green: "Healthy", gray: "Not checked", red: "Unreachable" };
  return (
    <div title={tips[status] || ""} style={{
      width: 8, height: 8, borderRadius: "50%",
      background: colors[status] || colors.gray, flexShrink: 0,
    }} />
  );
};

const Field = ({ label, children, style: s }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, ...s }}>
    <label style={{ fontSize: 12, color: "#888780", fontWeight: 400 }}>{label}</label>
    {children}
  </div>
);

const Input = (props) => (
  <input
    {...props}
    style={{
      height: 36, padding: "0 10px", fontSize: 13, border: "1px solid #D3D1C7",
      borderRadius: 8, outline: "none", width: "100%", boxSizing: "border-box",
      background: "#fff", color: "#2C2C2A", ...(props.style || {}),
    }}
    onFocus={(e) => { e.target.style.borderColor = "#85B7EB"; }}
    onBlur={(e) => { e.target.style.borderColor = "#D3D1C7"; }}
  />
);

const Select = ({ value, onChange, options, placeholder, style: s, ringColor }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{
      height: 36, padding: "0 8px", fontSize: 13, border: "1px solid #D3D1C7",
      borderRadius: 8, outline: "none", width: "100%", boxSizing: "border-box",
      background: "#fff", color: value ? "#2C2C2A" : "#888780", cursor: "pointer",
      boxShadow: ringColor ? `0 0 0 2px ${ringColor}` : "none",
      ...(s || {}),
    }}
  >
    {placeholder && <option value="">{placeholder}</option>}
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

const SectionHeader = ({ children }) => (
  <div style={{
    fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "#888780",
    textTransform: "uppercase", marginBottom: 10,
  }}>{children}</div>
);

const Card = ({ children, style: s }) => (
  <div style={{
    background: "#fff", border: "1px solid #e8e6df", borderRadius: 12,
    padding: "16px 20px", ...s,
  }}>{children}</div>
);

const SubHeading = ({ children, sub }) => (
  <div style={{ marginBottom: sub ? 4 : 12 }}>
    <div style={{ fontSize: 13, fontWeight: 500, color: "#5F5E5A" }}>{children}</div>
    {sub && <div style={{ fontSize: 11, color: "#B4B2A9", marginTop: 2 }}>{sub}</div>}
  </div>
);

const Divider = () => <div style={{ borderTop: "1px solid #e8e6df", margin: "16px 0" }} />;

const AlertBanner = ({ severity, title, message, onDismiss }) => {
  const styles = {
    warning: { bg: "#FDF6E9", border: "#EF9F27", titleC: "#633806", msgC: "#854F0B", icon: "⚠" },
    info: { bg: "#EDF4FC", border: "#85B7EB", titleC: "#0C447C", msgC: "#185FA5", icon: "ℹ" },
    error: { bg: "#FDF0F0", border: "#E24B4A", titleC: "#791F1F", msgC: "#A32D2D", icon: "✕" },
  };
  const s = styles[severity] || styles.info;
  return (
    <div style={{
      display: "flex", gap: 10, padding: "10px 12px", background: s.bg,
      borderLeft: `3px solid ${s.border}`, borderRadius: "0 8px 8px 0",
    }}>
      <span style={{ flexShrink: 0, fontSize: 13, lineHeight: "18px" }}>{s.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: s.titleC, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11, color: s.msgC, lineHeight: 1.5 }}>{message}</div>
      </div>
      {onDismiss && (
        <span onClick={onDismiss} style={{
          fontSize: 11, color: s.msgC, cursor: "pointer", flexShrink: 0, alignSelf: "start",
          opacity: 0.7,
        }}>dismiss</span>
      )}
    </div>
  );
};

/* ── provider status logic ──────────────────────────────── */

function getProviderStatus(p) {
  if (!p.enabled) return { label: "Disabled", color: "#A32D2D", bg: "#FCEBEB" };
  if (!p.api_key && p.type !== "ollama" && p.type !== "cortex")
    return { label: "No key", color: "#5F5E5A", bg: "#F1EFE8" };
  if (p.models.length === 0) return { label: "No models", color: "#854F0B", bg: "#FAEEDA" };
  return { label: "Active", color: "#0F6E56", bg: "#E1F5EE" };
}

/* ── model options builder ──────────────────────────────── */

function buildModelOptions(providers, roleFilter) {
  const opts = [];
  providers.forEach((p) => {
    if (!p.enabled) return;
    p.models.forEach((m) => {
      if (roleFilter && !roleFilter.includes(m.role)) return;
      opts.push({
        value: `${p.id}/${m.model_id}`,
        label: `${p.name} / ${m.model_id}`,
        providerType: p.type,
        providerId: p.id,
        providerName: p.name,
      });
    });
  });
  return opts;
}

/* ── mix detection ──────────────────────────────────────── */

function detectMixIssues(providers, defaults) {
  const issues = [];
  const dismissed = new Set();

  const findProvider = (compositeKey) => {
    if (!compositeKey) return null;
    const pid = compositeKey.split("/")[0];
    return providers.find((p) => p.id === pid) || null;
  };

  const bp = findProvider(defaults.base_model);
  const rp = findProvider(defaults.reasoning_model);
  const fp = findProvider(defaults.fallback_model);

  if (bp && rp && bp.id !== rp.id) {
    issues.push({
      key: "cross_provider",
      severity: "warning",
      title: "Cross-provider: base vs reasoning",
      message: `Base model uses ${bp.name} (${bp.type}) but reasoning uses ${rp.name} (${rp.type}). Different API formats and token counting. Rate limits tracked independently per provider.`,
      ring: ["base_model", "reasoning_model"],
    });
  }

  if (fp && bp && fp.id !== bp.id) {
    const fpLocal = fp.type === "ollama";
    const bpLocal = bp.type === "ollama";
    if (fpLocal !== bpLocal) {
      issues.push({
        key: "local_remote",
        severity: "warning",
        title: "Local + remote mix in fallback chain",
        message: `Fallback uses ${fp.name} (${fpLocal ? "local" : "remote"}) while base is ${bp.name} (${bpLocal ? "local" : "remote"}). Network outages affect them differently.`,
        ring: ["fallback_model"],
      });
    } else {
      issues.push({
        key: "fallback_cross",
        severity: "info",
        title: "Fallback uses a different provider",
        message: `Fallback uses ${fp.name} while base uses ${bp.name}. This provides provider-level redundancy but costs may vary.`,
        ring: ["fallback_model"],
      });
    }
  }

  if (fp && bp && fp.id === bp.id) {
    const baseModelId = defaults.base_model?.split("/")[1];
    const fbModelId = defaults.fallback_model?.split("/")[1];
    if (baseModelId === fbModelId) {
      issues.push({
        key: "self_fallback",
        severity: "error",
        title: "Fallback is same as base model",
        message: "Fallback model cannot be the same as the base model. Pick a different model or provider for redundancy.",
        ring: ["fallback_model"],
      });
    } else {
      issues.push({
        key: "same_provider_fb",
        severity: "warning",
        title: "Fallback on same provider (no redundancy)",
        message: `Both base and fallback use ${bp.name}. If this provider goes down, the fallback also fails. Consider a different provider.`,
        ring: ["fallback_model"],
      });
    }
  }

  if (!defaults.fallback_model) {
    issues.push({
      key: "no_fallback",
      severity: "info",
      title: "No fallback model configured",
      message: "If the primary model or provider fails, calls will error with no automatic retry.",
      ring: ["fallback_model"],
    });
  }

  if (bp && rp && bp.type !== rp.type) {
    issues.push({
      key: "api_mismatch",
      severity: "info",
      title: "Different API formats",
      message: `Base uses ${bp.type}, reasoning uses ${rp.type}. Verify that structured output schemas work with both.`,
      ring: ["base_model", "reasoning_model"],
    });
  }

  const usedProviders = new Set([bp?.name, rp?.name, fp?.name].filter(Boolean));
  if (usedProviders.size >= 2 && defaults.budget_guards_enabled) {
    issues.push({
      key: "budget_multi",
      severity: "info",
      title: `Budget spans ${usedProviders.size} providers`,
      message: `Monthly and per-product budgets track combined costs across ${[...usedProviders].join(", ")}. Cost-per-call varies by which model handles it.`,
      ring: [],
    });
  }

  return issues;
}

/* ── Provider Card ──────────────────────────────────────── */

function ProviderCard({ provider, onChange, onDelete }) {
  const status = getProviderStatus(provider);
  const initials = provider.name.slice(0, 2).toUpperCase();
  const hideKey = provider.type === "ollama";

  const updateField = (field, val) => onChange({ ...provider, [field]: val });
  const updateModel = (modelId, field, val) => {
    onChange({
      ...provider,
      models: provider.models.map((m) => m.id === modelId ? { ...m, [field]: val } : m),
    });
  };
  const addModel = () => {
    onChange({
      ...provider,
      models: [...provider.models, {
        id: uid(), model_id: "", role: "base",
        cost_input: 0, cost_output: 0, cost_cached: 0, max_ctx: "", max_out: "",
      }],
    });
  };
  const deleteModel = (mid) => onChange({ ...provider, models: provider.models.filter((m) => m.id !== mid) });

  const [showKey, setShowKey] = useState(false);

  return (
    <Card style={{ marginBottom: 10, padding: provider.expanded ? "16px 20px" : "12px 20px" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 11, fontWeight: 600,
            background: provider.enabled ? "#E6F1FB" : "#F1EFE8",
            color: provider.enabled ? "#185FA5" : "#888780",
          }}>{initials}</div>
          <span style={{ fontWeight: 500, fontSize: 15, color: "#2C2C2A" }}>{provider.name || "Untitled"}</span>
          <Badge color={status.color} bg={status.bg}>{status.label}</Badge>
          <HealthDot status={provider.health} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Toggle value={provider.enabled} onChange={(v) => updateField("enabled", v)} size="sm" />
          <span
            onClick={() => updateField("expanded", !provider.expanded)}
            style={{ fontSize: 12, color: "#888780", cursor: "pointer", userSelect: "none" }}
          >{provider.expanded ? "▾ collapse" : "▸ expand"}</span>
          <span onClick={() => { if (window.confirm(`Delete ${provider.name}? This removes all its models.`)) onDelete(); }}
            style={{ fontSize: 14, cursor: "pointer", color: "#A32D2D", lineHeight: 1 }} title="Delete provider"
          >✕</span>
        </div>
      </div>

      {provider.expanded && (
        <div style={{ marginTop: 16 }}>
          {/* connection fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px", marginBottom: hideKey ? 16 : 8 }}>
            <Field label="Provider name">
              <Input value={provider.name} onChange={(e) => updateField("name", e.target.value)} placeholder="My Provider" />
            </Field>
            <Field label="Provider type">
              <Select value={provider.type} onChange={(v) => {
                const update = { type: v };
                if (DEFAULT_URLS[v] && !provider.base_url) update.base_url = DEFAULT_URLS[v];
                onChange({ ...provider, ...update });
              }} options={PROVIDER_TYPES} />
            </Field>
            <Field label="Base URL" style={{ gridColumn: hideKey ? "span 2" : undefined }}>
              <Input value={provider.base_url} onChange={(e) => updateField("base_url", e.target.value)} placeholder="https://..." />
            </Field>
            {!hideKey && (
              <Field label="API key">
                <div style={{ position: "relative" }}>
                  <Input
                    type={showKey ? "text" : "password"}
                    value={provider.api_key}
                    onChange={(e) => updateField("api_key", e.target.value)}
                    placeholder="sk-..."
                    style={{ paddingRight: 36 }}
                  />
                  <span onClick={() => setShowKey(!showKey)} style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    fontSize: 12, cursor: "pointer", color: "#888780", userSelect: "none",
                  }}>{showKey ? "hide" : "show"}</span>
                </div>
              </Field>
            )}
          </div>

          {provider.type === "cortex" && (
            <div style={{ fontSize: 11, color: "#888780", marginBottom: 12, fontStyle: "italic" }}>
              Replaces the old Cortex / LLM Lab connection toggle.
            </div>
          )}

          {/* models table */}
          <div style={{ fontSize: 12, fontWeight: 500, color: "#888780", marginBottom: 8 }}>Models</div>
          <div style={{ border: "1px solid #e8e6df", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "23%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "4%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#F9F8F5" }}>
                  {["Model ID", "Role", "In $/1M", "Out $/1M", "Cache $/1M", "Ctx ovr.", "Out ovr.", ""].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i >= 2 ? "right" : "left", padding: "7px 8px",
                      fontWeight: 500, color: "#888780", borderBottom: "1px solid #e8e6df",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {provider.models.map((m) => {
                  const role = MODEL_ROLES.find((r) => r.value === m.role);
                  return (
                    <tr key={m.id} style={{ borderTop: "1px solid #e8e6df" }}>
                      <td style={{ padding: "6px 8px" }}>
                        <input value={m.model_id} onChange={(e) => updateModel(m.id, "model_id", e.target.value)}
                          placeholder="model-name" style={{
                            border: "none", fontSize: 12, width: "100%", padding: "4px 0",
                            outline: "none", background: "transparent", color: "#2C2C2A",
                          }} />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <Badge color={role?.color || "#888"} bg={role?.bg || "#F1EFE8"}>
                          <select value={m.role} onChange={(e) => updateModel(m.id, "role", e.target.value)}
                            style={{
                              border: "none", background: "transparent", fontSize: 11,
                              color: "inherit", fontWeight: 500, cursor: "pointer", outline: "none",
                              appearance: "none", WebkitAppearance: "none", padding: 0,
                            }}>
                            {MODEL_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </Badge>
                      </td>
                      {["cost_input", "cost_output", "cost_cached"].map((f) => (
                        <td key={f} style={{ padding: "6px 8px", textAlign: "right" }}>
                          <input value={m[f]} onChange={(e) => updateModel(m.id, f, e.target.value)}
                            type="number" step="0.01" min="0"
                            style={{
                              border: "none", fontSize: 12, width: "100%", textAlign: "right",
                              padding: "4px 0", outline: "none", background: "transparent", color: "#2C2C2A",
                            }} />
                        </td>
                      ))}
                      {["max_ctx", "max_out"].map((f) => (
                        <td key={f} style={{ padding: "6px 8px", textAlign: "right" }}>
                          <input value={m[f]} onChange={(e) => updateModel(m.id, f, e.target.value)}
                            type="number" placeholder="—"
                            style={{
                              border: "none", fontSize: 12, width: "100%", textAlign: "right",
                              padding: "4px 0", outline: "none", background: "transparent",
                              color: m[f] ? "#2C2C2A" : "#B4B2A9",
                            }} />
                        </td>
                      ))}
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <span onClick={() => deleteModel(m.id)}
                          style={{ cursor: "pointer", color: "#B4B2A9", fontSize: 13, lineHeight: 1 }}>✕</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button onClick={addModel} style={{
            background: "none", border: "none", fontSize: 12, color: "#185FA5",
            cursor: "pointer", padding: "4px 0", fontWeight: 500,
          }}>+ Add model</button>
        </div>
      )}
    </Card>
  );
}

/* ── Main component ─────────────────────────────────────── */

export default function GlobalLLMConfig() {
  const [providers, setProviders] = useState(INITIAL_PROVIDERS);
  const [defaults, setDefaults] = useState(INITIAL_DEFAULTS);
  const [cache, setCache] = useState(INITIAL_CACHE);
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());
  const [saved, setSaved] = useState(false);

  // Auto-select first matching model as default on mount
  useEffect(() => {
    const baseOpts = buildModelOptions(providers, ["base", "fast"]);
    const reasonOpts = buildModelOptions(providers, ["reasoning"]);
    if (!defaults.base_model && baseOpts.length) {
      setDefaults((d) => ({ ...d, base_model: baseOpts[0].value }));
    }
    if (!defaults.reasoning_model && reasonOpts.length) {
      setDefaults((d) => ({ ...d, reasoning_model: reasonOpts[0].value }));
    }
  }, []);

  const baseOpts = useMemo(() => buildModelOptions(providers, ["base", "fast"]), [providers]);
  const reasonOpts = useMemo(() => buildModelOptions(providers, ["reasoning"]), [providers]);
  const allOpts = useMemo(() => buildModelOptions(providers, null), [providers]);
  const mixIssues = useMemo(() => detectMixIssues(providers, defaults), [providers, defaults]);

  const ringFor = (field) => {
    for (const issue of mixIssues) {
      if (dismissedAlerts.has(issue.key)) continue;
      if (issue.ring?.includes(field)) {
        return issue.severity === "warning" ? "#EF9F27"
          : issue.severity === "error" ? "#E24B4A" : "#85B7EB";
      }
    }
    return null;
  };

  const updateProvider = (idx, p) => {
    const next = [...providers];
    next[idx] = p;
    setProviders(next);
  };
  const deleteProvider = (idx) => {
    setProviders(providers.filter((_, i) => i !== idx));
  };
  const addProvider = () => {
    setProviders([...providers, {
      id: uid(), name: "", type: "openai-compatible", base_url: "", api_key: "",
      enabled: true, expanded: true, health: "gray", models: [],
    }]);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const upd = (field, val) => setDefaults((d) => ({ ...d, [field]: val }));
  const updCache = (field, val) => setCache((c) => ({ ...c, [field]: val }));

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      maxWidth: 860, margin: "0 auto", padding: "28px 24px 60px",
      color: "#2C2C2A", fontSize: 13, lineHeight: 1.5,
    }}>
      {/* page header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#2C2C2A" }}>Global</h1>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888780" }}>Provider, budget, limits, cortex, cache</p>
        </div>
        <button onClick={handleSave} style={{
          padding: "8px 22px", fontSize: 13, fontWeight: 500, cursor: "pointer",
          borderRadius: 8, border: "1px solid #D3D1C7", background: saved ? "#E1F5EE" : "#fff",
          color: saved ? "#0F6E56" : "#2C2C2A", transition: "all .2s",
        }}>
          {saved ? "✓ Saved" : "Save"}
        </button>
      </div>

      {/* ── SECTION 1: PROVIDER REGISTRY ────────────────── */}
      <SectionHeader>Provider registry</SectionHeader>
      {providers.length === 0 && (
        <Card style={{ marginBottom: 10, textAlign: "center", padding: "32px 20px" }}>
          <div style={{ fontSize: 13, color: "#888780", marginBottom: 12 }}>
            No providers configured. Add at least one to start using LLM features.
          </div>
        </Card>
      )}
      {providers.map((p, i) => (
        <ProviderCard
          key={p.id}
          provider={p}
          onChange={(up) => updateProvider(i, up)}
          onDelete={() => deleteProvider(i)}
        />
      ))}
      <button onClick={addProvider} style={{
        width: "100%", padding: "12px", fontSize: 13, fontWeight: 500, cursor: "pointer",
        borderRadius: 10, border: "2px dashed #D3D1C7", background: "transparent",
        color: "#185FA5", marginBottom: 28,
      }}>+ Add provider</button>

      {/* ── SECTION 2: GLOBAL DEFAULTS ──────────────────── */}
      <SectionHeader>Global defaults</SectionHeader>
      <Card style={{ marginBottom: 28 }}>
        {/* A: model selection */}
        <SubHeading sub="These propagate to all sections. Override per-section if needed.">Model selection</SubHeading>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 14px", marginBottom: 6 }}>
          <Field label="Default base model">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1 }}>
                <Select
                  value={defaults.base_model}
                  onChange={(v) => upd("base_model", v)}
                  options={baseOpts}
                  placeholder={baseOpts.length ? "Select base model..." : "No base models registered"}
                  ringColor={ringFor("base_model")}
                />
              </div>
              <HealthDot status={providers.find((p) => p.id === defaults.base_model?.split("/")[0])?.health || "gray"} />
            </div>
          </Field>
          <Field label="Default reasoning model">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1 }}>
                <Select
                  value={defaults.reasoning_model}
                  onChange={(v) => upd("reasoning_model", v)}
                  options={reasonOpts}
                  placeholder={reasonOpts.length ? "Select reasoning model..." : "No reasoning models registered"}
                  ringColor={ringFor("reasoning_model")}
                />
              </div>
              <HealthDot status={providers.find((p) => p.id === defaults.reasoning_model?.split("/")[0])?.health || "gray"} />
            </div>
          </Field>
          <Field label="Fallback model">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1 }}>
                <Select
                  value={defaults.fallback_model}
                  onChange={(v) => upd("fallback_model", v)}
                  options={allOpts}
                  placeholder="None"
                  ringColor={ringFor("fallback_model")}
                />
              </div>
              {defaults.fallback_model && (
                <HealthDot status={providers.find((p) => p.id === defaults.fallback_model?.split("/")[0])?.health || "gray"} />
              )}
            </div>
          </Field>
        </div>

        {/* mix alerts */}
        {mixIssues.filter((i) => !dismissedAlerts.has(i.key)).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, marginBottom: 4 }}>
            {mixIssues.filter((i) => !dismissedAlerts.has(i.key)).map((issue) => (
              <AlertBanner
                key={issue.key}
                severity={issue.severity}
                title={issue.title}
                message={issue.message}
                onDismiss={issue.severity !== "error" ? () => setDismissedAlerts((s) => new Set([...s, issue.key])) : undefined}
              />
            ))}
          </div>
        )}

        <Divider />

        {/* B: limits */}
        <SubHeading sub="Apply to all sections including fallback unless overridden per-section.">Limits</SubHeading>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 14px" }}>
          <Field label="Max context tokens">
            <Input type="number" value={defaults.max_context_tokens} onChange={(e) => upd("max_context_tokens", +e.target.value)} />
          </Field>
          <Field label="Max output tokens">
            <Input type="number" value={defaults.max_output_tokens} onChange={(e) => upd("max_output_tokens", +e.target.value)} />
          </Field>
          <Field label="Timeout (ms)">
            <Input type="number" value={defaults.timeout_ms} onChange={(e) => upd("timeout_ms", +e.target.value)} />
          </Field>
          <Field label="Max calls / round">
            <Input type="number" value={defaults.max_calls_per_round} onChange={(e) => upd("max_calls_per_round", +e.target.value)} />
          </Field>
          <Field label="Max calls / product">
            <Input type="number" value={defaults.max_calls_per_product} onChange={(e) => upd("max_calls_per_product", +e.target.value)} />
          </Field>
          <Field label="Max fast calls / product">
            <Input type="number" value={defaults.max_fast_calls_per_product} onChange={(e) => upd("max_fast_calls_per_product", +e.target.value)} />
          </Field>
          <Field label="Reasoning budget">
            <Input type="number" value={defaults.reasoning_budget} onChange={(e) => upd("reasoning_budget", +e.target.value)} />
          </Field>
        </div>

        <Divider />

        {/* C: budget */}
        <SubHeading>Budget</SubHeading>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 14px" }}>
          <Field label="Monthly budget (USD)">
            <Input type="number" value={defaults.monthly_budget_usd} onChange={(e) => upd("monthly_budget_usd", +e.target.value)} />
          </Field>
          <Field label="Per-product budget (USD)">
            <Input type="number" step="0.01" value={defaults.per_product_budget_usd} onChange={(e) => upd("per_product_budget_usd", +e.target.value)} />
          </Field>
          <Field label="Budget guards">
            <div style={{ height: 36, display: "flex", alignItems: "center" }}>
              <Toggle value={defaults.budget_guards_enabled} onChange={(v) => upd("budget_guards_enabled", v)} size="sm" />
              <span style={{ marginLeft: 8, fontSize: 12, color: "#888780" }}>
                {defaults.budget_guards_enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </Field>
        </div>
      </Card>

      {/* ── SECTION 3: EXTRACTION CACHE ─────────────────── */}
      <SectionHeader>Extraction cache</SectionHeader>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: cache.enabled ? 14 : 0 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#2C2C2A" }}>Cache enabled</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge color={cache.enabled ? "#0F6E56" : "#5F5E5A"} bg={cache.enabled ? "#E1F5EE" : "#F1EFE8"}>
              {cache.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Toggle value={cache.enabled} onChange={(v) => updCache("enabled", v)} size="sm" />
          </div>
        </div>
        {cache.enabled && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
            <Field label="Cache dir">
              <Input value={cache.cache_dir} onChange={(e) => updCache("cache_dir", e.target.value)} />
            </Field>
            <Field label="Cache TTL (ms)">
              <Input type="number" value={cache.cache_ttl_ms} onChange={(e) => updCache("cache_ttl_ms", +e.target.value)} />
            </Field>
          </div>
        )}
      </Card>
    </div>
  );
}
