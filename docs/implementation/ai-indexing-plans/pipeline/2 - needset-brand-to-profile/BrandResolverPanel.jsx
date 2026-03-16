import { useState, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   DATA — derived directly from the two schema files
   ═══════════════════════════════════════════════════════════════════════ */
const MOCK = {
  brand: "Logitech",
  category: "gaming_mouse",
  status: "resolved",       // "resolved" | "resolved_empty" | "skipped" | "failed"
  source: "llm",            // "cache" | "llm"
  confidence: 0.8,

  output: {
    officialDomain: "logitechg.com",
    supportDomain: "support.logi.com",
    aliases: ["logitech.com", "logitechg.com/en-us", "logi.com"],
    reasoning: [
      "Logitech gaming products use logitechg.com as the primary product domain",
      "Support redirects through support.logi.com for all Logitech brands",
      "logi.com is the corporate shortened alias used in marketing",
    ],
  },

  fields: [
    { key: "officialDomain", spec: true,  actual: true,  status: "match" },
    { key: "supportDomain",  spec: true,  actual: true,  status: "match" },
    { key: "aliases",        spec: true,  actual: true,  status: "match" },
    { key: "host_hints",     spec: true,  actual: false, status: "extra", note: "Closed — synthesized downstream from officialDomain + aliases" },
    { key: "confidence",     spec: false, actual: true,  status: "extra" },
    { key: "reasoning",      spec: false, actual: true,  status: "extra" },
  ],

  gaps: [
    { id: "BRAND-OUT-1", field: "host_hints",       severity: "low", note: "Closed — hints synthesized downstream from officialDomain + aliases at searchDiscovery.js:373-378." },
    { id: "BRAND-IN-1",  field: "host_hints input",  severity: "low", note: "Closed — no dedicated path needed. Downstream synthesis is by design." },
    { id: "BRAND-OUT-2", field: "confidence",         severity: "low",  note: "Extra — useful telemetry, outside correction-note contract." },
    { id: "BRAND-OUT-3", field: "reasoning",          severity: "low",  note: "Extra — useful debug, outside correction-note contract." },
    { id: "BRAND-IN-2",  field: "config surface",     severity: "low",  note: "Full config passed but only LLM adapter reads it." },
    { id: "BRAND-OUT-4", field: "persisted artifact",  severity: "low",  note: "Output is in-memory only, no standalone file." },
    { id: "BRAND-IN-3",  field: "persisted input",     severity: "low",  note: "No dedicated persisted input artifact." },
  ],

  consumers: [
    { label: "Search Profile Hints", uses: "officialDomain + aliases", ref: "searchDiscovery.js:246-250" },
    { label: "Manufacturer Auto-Promote", uses: "officialDomain", ref: "searchDiscovery.js:187-222" },
    { label: "Telemetry", uses: "status, domains, aliases, confidence", ref: "searchDiscovery.js:166-180" },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════════════════════════ */
const T = {
  bg: "#f5f3ee",
  surface: "#ffffff",
  surfaceMuted: "#edeae3",
  border: "#d6d1c7",
  borderLight: "#e8e4dc",
  ink: "#1a1916",
  inkSub: "#3d3a35",
  inkMuted: "#6b6560",
  inkFaint: "#9e9890",
  accent: "#2563eb",
  resolved: "#16803c",
  weak: "#b45309",
  conflict: "#c2260c",
  extra: "#7c3aed",
  info: "#0e7490",
};

const font = {
  display: "'Playfair Display', Georgia, serif",
  mono: "'DM Mono', 'Menlo', monospace",
  body: "'Source Sans 3', 'Source Sans Pro', sans-serif",
};

/* ═══════════════════════════════════════════════════════════════════════
   SMALL PARTS
   ═══════════════════════════════════════════════════════════════════════ */

function StatusBadge({ status }) {
  const map = {
    resolved:       { c: T.resolved, l: "RESOLVED" },
    resolved_empty: { c: T.weak,     l: "RESOLVED EMPTY" },
    skipped:        { c: T.inkFaint, l: "SKIPPED" },
    failed:         { c: T.conflict, l: "FAILED" },
  };
  const cfg = map[status] || map.failed;
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, fontFamily: font.mono,
      letterSpacing: "0.08em", padding: "3px 9px", borderRadius: 2,
      color: cfg.c, background: `${cfg.c}12`, border: `1.5px solid ${cfg.c}35`,
    }}>{cfg.l}</span>
  );
}

function FieldChip({ status }) {
  const map = {
    match:    { c: T.resolved, l: "Match" },
    mismatch: { c: T.conflict, l: "Missing" },
    extra:    { c: T.extra,    l: "Extra" },
  };
  const cfg = map[status] || map.match;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 600, fontFamily: font.mono,
      color: cfg.c, textTransform: "uppercase", letterSpacing: "0.04em",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.c }} />
      {cfg.l}
    </span>
  );
}

function SeverityDot({ severity }) {
  const c = severity === "high" ? T.conflict : T.inkFaint;
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, fontFamily: font.mono,
      letterSpacing: "0.08em", color: c,
      textTransform: "uppercase",
    }}>{severity}</span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   A) HERO STRIP — brand, status, two stats
   ═══════════════════════════════════════════════════════════════════════ */

function Hero({ data }) {
  const highGaps = data.gaps.filter(g => g.severity === "high").length;
  const matchCount = data.fields.filter(f => f.status === "match").length;
  const specCount = data.fields.filter(f => f.spec).length;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 3, padding: "24px 28px 20px", marginBottom: 16,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 14,
        marginBottom: 18, flexWrap: "wrap",
      }}>
        <h1 style={{
          fontSize: 24, fontWeight: 700, margin: 0,
          fontFamily: font.display, color: T.ink, lineHeight: 1,
        }}>
          Brand Resolver
        </h1>
        <StatusBadge status={data.status} />
        <span style={{
          fontSize: 10, fontFamily: font.mono, color: T.inkFaint,
        }}>{data.source === "cache" ? "cache hit" : "LLM call"} · conf {data.confidence}</span>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 12, fontFamily: font.mono, color: T.inkSub, fontWeight: 500,
        }}>{data.brand} / {data.category}</span>
      </div>

      <div style={{ display: "flex", gap: 40 }}>
        <div>
          <div style={{
            fontSize: 30, fontWeight: 700, fontFamily: font.display,
            color: matchCount === specCount ? T.resolved : T.weak, lineHeight: 1,
          }}>{matchCount}/{specCount}</div>
          <div style={{
            fontSize: 10, fontWeight: 600, fontFamily: font.mono,
            color: T.inkSub, textTransform: "uppercase",
            letterSpacing: "0.05em", marginTop: 4,
          }}>Spec fields matched</div>
        </div>
        <div>
          <div style={{
            fontSize: 30, fontWeight: 700, fontFamily: font.display,
            color: highGaps > 0 ? T.conflict : T.resolved, lineHeight: 1,
          }}>{highGaps}</div>
          <div style={{
            fontSize: 10, fontWeight: 600, fontFamily: font.mono,
            color: T.inkSub, textTransform: "uppercase",
            letterSpacing: "0.05em", marginTop: 4,
          }}>{highGaps === 1 ? "Open gap" : "Open gaps"}</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   B) OUTPUT — domains + aliases
   ═══════════════════════════════════════════════════════════════════════ */

function Output({ output }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 3, padding: "18px 24px", marginBottom: 16,
    }}>
      {/* Section label */}
      <div style={{
        fontSize: 11, fontWeight: 700, fontFamily: font.mono,
        color: T.ink, letterSpacing: "0.06em", textTransform: "uppercase",
        marginBottom: 14, paddingBottom: 6, borderBottom: `1.5px solid ${T.ink}`,
      }}>Resolution Output</div>

      {/* Domains side by side */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
        marginBottom: 14,
      }}>
        {[
          { label: "OFFICIAL DOMAIN", val: output.officialDomain, c: T.accent },
          { label: "SUPPORT DOMAIN", val: output.supportDomain, c: T.info },
        ].map(d => (
          <div key={d.label} style={{
            padding: "10px 14px", borderRadius: 3,
            background: `${d.c}06`, border: `1px solid ${d.c}20`,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, fontFamily: font.mono,
              color: T.inkFaint, letterSpacing: "0.08em", marginBottom: 4,
            }}>{d.label}</div>
            <div style={{
              fontSize: 15, fontFamily: font.mono, fontWeight: 600, color: d.c,
            }}>{d.val}</div>
          </div>
        ))}
      </div>

      {/* Aliases */}
      <div style={{
        fontSize: 9, fontWeight: 700, fontFamily: font.mono,
        color: T.inkFaint, letterSpacing: "0.08em", marginBottom: 6,
      }}>ALIASES</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {output.aliases.map((a, i) => (
          <span key={i} style={{
            fontSize: 11, fontFamily: font.mono, fontWeight: 500,
            padding: "3px 9px", borderRadius: 2,
            background: T.surfaceMuted, border: `1px solid ${T.borderLight}`,
            color: T.inkSub,
          }}>{a}</span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   C) FIELD AUDIT + INLINE GAPS
   ═══════════════════════════════════════════════════════════════════════ */

function FieldAudit({ fields, gaps }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 3, overflow: "hidden", marginBottom: 16,
    }}>
      {/* Section label inside */}
      <div style={{
        padding: "14px 24px 8px",
        fontSize: 11, fontWeight: 700, fontFamily: font.mono,
        color: T.ink, letterSpacing: "0.06em", textTransform: "uppercase",
        borderBottom: `1.5px solid ${T.ink}`,
        margin: "0 0 0 0",
      }}>Field Audit · Spec vs Actual</div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["FIELD", "SPEC", "ACTUAL", "STATUS"].map(h => (
              <th key={h} style={{
                padding: "9px 24px", textAlign: "left",
                fontSize: 9, fontWeight: 700, fontFamily: font.mono,
                color: T.inkFaint, letterSpacing: "0.08em",
                borderBottom: `1px solid ${T.border}`,
                background: T.surfaceMuted,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map(f => (
            <tr key={f.key} style={{
              borderBottom: `1px solid ${T.borderLight}`,
              background: f.status === "mismatch" ? `${T.conflict}05` : "transparent",
            }}>
              <td style={{
                padding: "7px 24px", fontSize: 12,
                fontFamily: font.mono, fontWeight: 600,
                color: f.status === "mismatch" ? T.conflict : T.ink,
              }}>{f.key}</td>
              <td style={{ padding: "7px 24px", fontSize: 12, color: f.spec ? T.resolved : T.inkFaint }}>
                {f.spec ? "✓" : "—"}
              </td>
              <td style={{ padding: "7px 24px", fontSize: 12, color: f.actual ? T.resolved : T.conflict }}>
                {f.actual ? "✓" : "✗"}
              </td>
              <td style={{ padding: "7px 24px" }}>
                <FieldChip status={f.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Inline gaps */}
      <div style={{
        padding: "14px 24px",
        borderTop: `1.5px solid ${T.border}`,
        background: T.surfaceMuted,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, fontFamily: font.mono,
          color: T.inkFaint, letterSpacing: "0.06em",
          textTransform: "uppercase", marginBottom: 8,
        }}>GAPS ({gaps.length})</div>
        {gaps.map(g => (
          <div key={g.id} style={{
            display: "flex", gap: 10, alignItems: "baseline",
            padding: "4px 0",
          }}>
            <span style={{
              fontSize: 9, fontFamily: font.mono, fontWeight: 700,
              color: T.inkFaint, minWidth: 75,
            }}>{g.id}</span>
            <SeverityDot severity={g.severity} />
            <span style={{
              fontSize: 11, fontFamily: font.mono, fontWeight: 600,
              color: g.severity === "high" ? T.conflict : T.inkMuted,
              minWidth: 110,
            }}>{g.field}</span>
            <span style={{
              fontSize: 11, fontFamily: font.body, color: T.inkMuted,
            }}>{g.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   D) CONSUMERS — compact list, not cards
   ═══════════════════════════════════════════════════════════════════════ */

function Consumers({ consumers }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 3, padding: "14px 24px", marginBottom: 16,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, fontFamily: font.mono,
        color: T.ink, letterSpacing: "0.06em", textTransform: "uppercase",
        marginBottom: 10, paddingBottom: 6, borderBottom: `1.5px solid ${T.ink}`,
      }}>Downstream Consumers</div>
      {consumers.map((c, i) => (
        <div key={i} style={{
          display: "flex", gap: 12, alignItems: "baseline",
          padding: "5px 0",
          borderBottom: i < consumers.length - 1 ? `1px solid ${T.borderLight}` : "none",
        }}>
          <span style={{
            fontSize: 12, fontFamily: font.body, fontWeight: 600,
            color: T.ink, minWidth: 180,
          }}>{c.label}</span>
          <span style={{
            fontSize: 11, fontFamily: font.mono, color: T.inkMuted,
            flex: 1,
          }}>{c.uses}</span>
          <span style={{
            fontSize: 9, fontFamily: font.mono, color: T.inkFaint,
          }}>{c.ref}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   E) DEBUG
   ═══════════════════════════════════════════════════════════════════════ */

function Debug({ data }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "baseline", gap: 8,
          paddingBottom: 6,
          borderBottom: `1px dashed ${T.border}`,
          cursor: "pointer", userSelect: "none",
          marginBottom: open ? 10 : 0,
        }}
      >
        <span style={{
          fontSize: 11, fontWeight: 600, fontFamily: font.mono,
          color: T.inkFaint, letterSpacing: "0.04em",
        }}>DEBUG · RAW JSON {open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <pre style={{
          background: T.surfaceMuted,
          border: `1px solid ${T.border}`,
          borderRadius: 3, padding: 16,
          fontSize: 10, fontFamily: font.mono,
          color: T.inkMuted, overflow: "auto",
          maxHeight: 360, lineHeight: 1.5,
        }}>{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════════ */

export default function BrandResolverPanel() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setTimeout(() => setLoaded(true), 50); }, []);
  const d = MOCK;

  return (
    <div style={{
      fontFamily: font.body,
      background: T.bg,
      color: T.ink,
      minHeight: "100vh",
      padding: "24px 28px 40px",
      opacity: loaded ? 1 : 0,
      transition: "opacity 0.4s ease",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@400;500&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <Hero data={d} />
      <Output output={d.output} />
      <FieldAudit fields={d.fields} gaps={d.gaps} />
      <Consumers consumers={d.consumers} />
      <Debug data={d} />
    </div>
  );
}
