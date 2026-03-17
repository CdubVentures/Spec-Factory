import { useState } from "react";

const MODEL_ROLES = [
  { value: "base", label: "Base", color: "#888780", bg: "#F1EFE8" },
  { value: "reasoning", label: "Reasoning", color: "#534AB7", bg: "#EEEDFE" },
  { value: "fast", label: "Fast", color: "#185FA5", bg: "#E6F1FB" },
  { value: "embedding", label: "Embedding", color: "#0F6E56", bg: "#E1F5EE" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

const INITIAL_PROVIDERS = [
  {
    id: uid(),
    name: "DeepSeek",
    api_key: "sk-a]8fK2mNpQrStUvWxYz1234567890",
    enabled: true,
    expanded: true,
    models: [
      { id: uid(), model_id: "deepseek-chat", role: "base", cost_input: 1.25, cost_output: 10, cost_cached: 0.125, max_ctx: "", max_out: "" },
      { id: uid(), model_id: "deepseek-reasoner", role: "reasoning", cost_input: 2, cost_output: 16, cost_cached: 0.5, max_ctx: "", max_out: "" },
    ],
  },
  {
    id: uid(),
    name: "Anthropic",
    api_key: "",
    enabled: false,
    expanded: false,
    models: [
      { id: uid(), model_id: "claude-sonnet-4-20250514", role: "reasoning", cost_input: 3, cost_output: 15, cost_cached: 0.3, max_ctx: "200000", max_out: "16000" },
    ],
  },
];

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



/* ── flatten all models for the unified table ──────────── */

function flattenModels(providers) {
  const rows = [];
  providers.forEach((p) => {
    p.models.forEach((m) => {
      rows.push({ ...m, providerId: p.id, providerName: p.name, providerEnabled: p.enabled });
    });
  });
  return rows;
}

/* ── provider status logic ──────────────────────────────── */

function getProviderStatus(p) {
  if (!p.enabled) return { label: "Disabled", color: "#A32D2D", bg: "#FCEBEB" };
  if (!p.api_key) return { label: "No key", color: "#5F5E5A", bg: "#F1EFE8" };
  if (p.models.length === 0) return { label: "No models", color: "#854F0B", bg: "#FAEEDA" };
  return { label: "Active", color: "#0F6E56", bg: "#E1F5EE" };
}


/* ── Provider Card ──────────────────────────────────────── */

function ProviderCard({ provider, onChange, onDelete }) {
  const status = getProviderStatus(provider);
  const initials = provider.name.slice(0, 2).toUpperCase();

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px", marginBottom: 16 }}>
            <Field label="Provider name">
              <Input value={provider.name} onChange={(e) => updateField("name", e.target.value)} placeholder="My Provider" />
            </Field>
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
          </div>

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
  const [saved, setSaved] = useState(false);

  const allModels = flattenModels(providers);

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
      id: uid(), name: "", api_key: "",
      enabled: true, expanded: true, models: [],
    }]);
  };

  const updateModelGlobal = (providerId, modelId, field, val) => {
    setProviders((prev) =>
      prev.map((p) =>
        p.id === providerId
          ? { ...p, models: p.models.map((m) => (m.id === modelId ? { ...m, [field]: val } : m)) }
          : p
      )
    );
  };

  const deleteModelGlobal = (providerId, modelId) => {
    setProviders((prev) =>
      prev.map((p) =>
        p.id === providerId
          ? { ...p, models: p.models.filter((m) => m.id !== modelId) }
          : p
      )
    );
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

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
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888780" }}>Providers and models</p>
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

      {/* ── SECTION 2: ALL MODELS ──────────────────────── */}
      <SectionHeader>All models</SectionHeader>
      <Card>
        {allModels.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#888780", fontSize: 13 }}>
            No models registered. Add models inside a provider above.
          </div>
        ) : (
          <div style={{ border: "1px solid #e8e6df", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "3%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#F9F8F5" }}>
                  {["Provider", "Model ID", "Role", "In $/1M", "Out $/1M", "Cache $/1M", "Ctx ovr.", "Out ovr.", ""].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i >= 3 ? "right" : "left", padding: "7px 8px",
                      fontWeight: 500, color: "#888780", borderBottom: "1px solid #e8e6df",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allModels.map((m) => {
                  const role = MODEL_ROLES.find((r) => r.value === m.role);
                  return (
                    <tr key={m.id} style={{
                      borderTop: "1px solid #e8e6df",
                      opacity: m.providerEnabled ? 1 : 0.45,
                    }}>
                      <td style={{ padding: "6px 8px", fontSize: 11, color: "#5F5E5A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.providerName || "—"}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input value={m.model_id} onChange={(e) => updateModelGlobal(m.providerId, m.id, "model_id", e.target.value)}
                          placeholder="model-name" style={{
                            border: "none", fontSize: 12, width: "100%", padding: "4px 0",
                            outline: "none", background: "transparent", color: "#2C2C2A",
                          }} />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <Badge color={role?.color || "#888"} bg={role?.bg || "#F1EFE8"}>
                          <select value={m.role} onChange={(e) => updateModelGlobal(m.providerId, m.id, "role", e.target.value)}
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
                          <input value={m[f]} onChange={(e) => updateModelGlobal(m.providerId, m.id, f, e.target.value)}
                            type="number" step="0.01" min="0"
                            style={{
                              border: "none", fontSize: 12, width: "100%", textAlign: "right",
                              padding: "4px 0", outline: "none", background: "transparent", color: "#2C2C2A",
                            }} />
                        </td>
                      ))}
                      {["max_ctx", "max_out"].map((f) => (
                        <td key={f} style={{ padding: "6px 8px", textAlign: "right" }}>
                          <input value={m[f]} onChange={(e) => updateModelGlobal(m.providerId, m.id, f, e.target.value)}
                            type="number" placeholder="—"
                            style={{
                              border: "none", fontSize: 12, width: "100%", textAlign: "right",
                              padding: "4px 0", outline: "none", background: "transparent",
                              color: m[f] ? "#2C2C2A" : "#B4B2A9",
                            }} />
                        </td>
                      ))}
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <span onClick={() => deleteModelGlobal(m.providerId, m.id)}
                          style={{ cursor: "pointer", color: "#B4B2A9", fontSize: 13, lineHeight: 1 }}>✕</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
