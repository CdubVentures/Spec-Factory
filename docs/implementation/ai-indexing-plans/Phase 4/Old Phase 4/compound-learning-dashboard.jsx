import { useState, useEffect, useCallback, useRef } from "react";

// --- Simulated data generators (replace with real API calls) ---
const generateCompoundCurve = () => {
  const products = [];
  let searches = 18 + Math.random() * 4;
  let urlReuse = 0;
  for (let i = 1; i <= 12; i++) {
    const decay = Math.max(0.7, 1 - (i * 0.04) - (Math.random() * 0.02));
    searches = Math.max(4, searches * decay + (Math.random() * 2 - 1));
    urlReuse = Math.min(95, urlReuse + (3 + Math.random() * 5));
    products.push({
      run: i,
      product: `Product ${i}`,
      searches: Math.round(searches),
      urlReuse: Math.round(urlReuse),
      newUrls: Math.max(1, Math.round(18 - i * 1.2 + Math.random() * 3)),
      llmCost: +(0.48 - i * 0.02 + Math.random() * 0.08).toFixed(2),
      fields: Math.round(52 + i * 2.5 + Math.random() * 8),
      timeToFirstCitation: +(12 - i * 0.6 + Math.random() * 3).toFixed(1),
    });
  }
  return products;
};

const generateQueryIndex = () => [
  { query: "Razer Viper V3 Pro specifications", provider: "bing", results: 12, relevant: 8, fields: 14, yield: 0.87, dead: false },
  { query: "site:razer.com Viper V3 Pro specs", provider: "bing", results: 4, relevant: 4, fields: 11, yield: 0.92, dead: false },
  { query: "Razer Viper V3 Pro sensor DPI polling", provider: "bing", results: 9, relevant: 5, fields: 8, yield: 0.71, dead: false },
  { query: "site:rtings.com Razer Viper V3 Pro", provider: "bing", results: 2, relevant: 2, fields: 19, yield: 0.95, dead: false },
  { query: "Razer Viper V3 Pro click latency test", provider: "searxng", results: 6, relevant: 2, fields: 3, yield: 0.38, dead: false },
  { query: "Razer Viper V3 Pro teardown encoder", provider: "searxng", results: 1, relevant: 0, fields: 0, yield: 0, dead: true },
  { query: "site:techpowerup.com Razer Viper V3", provider: "bing", results: 3, relevant: 3, fields: 16, yield: 0.94, dead: false },
  { query: "Razer Viper V3 Pro PDF manual", provider: "bing", results: 5, relevant: 1, fields: 6, yield: 0.52, dead: false },
];

const generateUrlIndex = () => [
  { url: "rtings.com/mouse/reviews/razer/viper-v3-pro", tier: "tier2_lab", status: "ok", fields: 19, reuses: 4, yield: "high", lastOk: "2h ago", ttl: "28d" },
  { url: "techpowerup.com/review/razer-viper-v3-pro", tier: "tier2_lab", status: "ok", fields: 16, reuses: 3, yield: "high", lastOk: "2h ago", ttl: "28d" },
  { url: "razer.com/gaming-mice/razer-viper-v3-pro", tier: "tier1_mfg", status: "ok", fields: 11, reuses: 5, yield: "high", lastOk: "1h ago", ttl: "30d" },
  { url: "razer.com/gaming-mice/razer-viper-v3-pro/support", tier: "tier1_mfg", status: "ok", fields: 8, reuses: 2, yield: "med", lastOk: "1h ago", ttl: "30d" },
  { url: "amazon.com/dp/B0EXAMPLE", tier: "tier3_retail", status: "ok", fields: 5, reuses: 1, yield: "med", lastOk: "3h ago", ttl: "7d" },
  { url: "eloshapes.com/mouse/razer-viper-v3-pro", tier: "tier5_agg", status: "ok", fields: 12, reuses: 6, yield: "high", lastOk: "2h ago", ttl: "14d" },
  { url: "sensor.fyi/info/focus-pro-30k", tier: "tier5_agg", status: "ok", fields: 7, reuses: 8, yield: "high", lastOk: "4h ago", ttl: "30d" },
  { url: "mousespecs.org/razer-viper-v3-pro", tier: "tier5_agg", status: "403", fields: 0, reuses: 0, yield: "dead", lastOk: "never", ttl: "—" },
];

const generateHostHealth = () => [
  { host: "rtings.com", tier: "tier2_lab", status: "healthy", blockRate: 0.02, avgCooldown: 0, fetches24h: 18, fields24h: 142, pacing: 1500 },
  { host: "techpowerup.com", tier: "tier2_lab", status: "healthy", blockRate: 0.05, avgCooldown: 0, fetches24h: 14, fields24h: 98, pacing: 1500 },
  { host: "razer.com", tier: "tier1_mfg", status: "healthy", blockRate: 0.08, avgCooldown: 2, fetches24h: 22, fields24h: 86, pacing: 2000 },
  { host: "corsair.com", tier: "tier1_mfg", status: "cooldown", blockRate: 0.35, avgCooldown: 45, fetches24h: 8, fields24h: 12, pacing: 3000 },
  { host: "amazon.com", tier: "tier3_retail", status: "degraded", blockRate: 0.22, avgCooldown: 15, fetches24h: 10, fields24h: 28, pacing: 2500 },
  { host: "eloshapes.com", tier: "tier5_agg", status: "healthy", blockRate: 0, avgCooldown: 0, fetches24h: 20, fields24h: 156, pacing: 1200 },
  { host: "sensor.fyi", tier: "tier5_agg", status: "healthy", blockRate: 0, avgCooldown: 0, fetches24h: 12, fields24h: 64, pacing: 1000 },
  { host: "glorious.com", tier: "tier1_mfg", status: "blocked", blockRate: 0.92, avgCooldown: 300, fetches24h: 3, fields24h: 0, pacing: 5000 },
];

const generateKnobTelemetry = () => [
  { run: "run-001", knob: "LLM_MAX_CALLS", effective: 14, config: 14, match: true },
  { run: "run-001", knob: "CONVERGENCE_MAX_ROUNDS", effective: 3, config: 3, match: true },
  { run: "run-001", knob: "PER_HOST_MIN_DELAY_MS", effective: 1500, config: 1500, match: true },
  { run: "run-001", knob: "RETRIEVAL_MAX_PRIME_SOURCES", effective: 10, config: 10, match: true },
  { run: "run-002", knob: "LLM_MAX_CALLS", effective: 14, config: 14, match: true },
  { run: "run-002", knob: "CONVERGENCE_MAX_ROUNDS", effective: 3, config: 3, match: true },
  { run: "run-002", knob: "PER_HOST_MIN_DELAY_MS", effective: 2000, config: 1500, match: false },
  { run: "run-002", knob: "RETRIEVAL_MAX_PRIME_SOURCES", effective: 10, config: 10, match: true },
  { run: "run-003", knob: "LLM_MAX_CALLS", effective: 12, config: 14, match: false },
  { run: "run-003", knob: "CONVERGENCE_MAX_ROUNDS", effective: 3, config: 3, match: true },
  { run: "run-003", knob: "PER_HOST_MIN_DELAY_MS", effective: 1500, config: 1500, match: true },
  { run: "run-003", knob: "RETRIEVAL_MAX_PRIME_SOURCES", effective: 10, config: 10, match: true },
];

const generatePlanDiffs = () => [
  { field: "sensor", v1Host: "razer.com", v2Host: "rtings.com", v1Tier: "tier1", v2Tier: "tier2_lab", v1Found: true, v2Found: true, winner: "v2", reason: "Lab measurement > marketing copy" },
  { field: "click_latency", v1Host: "—", v2Host: "rtings.com", v1Tier: "—", v2Tier: "tier2_lab", v1Found: false, v2Found: true, winner: "v2", reason: "v1 had no path to lab data" },
  { field: "weight", v1Host: "razer.com", v2Host: "razer.com", v1Tier: "tier1", v2Tier: "tier1_mfg", v1Found: true, v2Found: true, winner: "tie", reason: "Same source, same value" },
  { field: "encoder", v1Host: "—", v2Host: "techpowerup.com", v1Tier: "—", v2Tier: "tier2_lab", v1Found: false, v2Found: true, winner: "v2", reason: "Teardown data from lab" },
  { field: "dpi", v1Host: "razer.com", v2Host: "razer.com", v1Tier: "tier1", v2Tier: "tier1_mfg", v1Found: true, v2Found: true, winner: "tie", reason: "Identical" },
  { field: "sensor_latency", v1Host: "—", v2Host: "rtings.com", v1Tier: "—", v2Tier: "tier2_lab", v1Found: false, v2Found: true, winner: "v2", reason: "Lab measurement only" },
  { field: "debounce", v1Host: "—", v2Host: "—", v1Tier: "—", v2Tier: "—", v1Found: false, v2Found: false, winner: "neither", reason: "Not published anywhere" },
  { field: "switch_type", v1Host: "amazon.com", v2Host: "razer.com", v1Tier: "tier3", v2Tier: "tier1_mfg", v1Found: true, v2Found: true, winner: "v2", reason: "Higher authority source" },
];

// --- Sparkline component ---
const Sparkline = ({ data, width = 120, height = 32, color = "#22d3ee", decreasing = true }) => {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const trend = data[data.length - 1] - data[0];
  const good = decreasing ? trend < 0 : trend > 0;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={good ? "#34d399" : "#f87171"} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
};

// --- Metric Card ---
const MetricCard = ({ label, value, sub, trend, good, spark, sparkDecreasing }) => (
  <div style={{
    background: "rgba(15, 23, 42, 0.7)",
    border: "1px solid rgba(51, 65, 85, 0.6)",
    borderRadius: 6,
    padding: "14px 16px",
    minWidth: 0,
  }}>
    <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: "#f1f5f9", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{sub}</div>}
    {trend !== undefined && (
      <div style={{ fontSize: 12, marginTop: 6, color: good ? "#34d399" : "#f87171", fontWeight: 600 }}>
        {good ? "▼" : "▲"} {trend}
      </div>
    )}
    {spark && <div style={{ marginTop: 8 }}><Sparkline data={spark} decreasing={sparkDecreasing !== false} /></div>}
  </div>
);

// --- Status Pill ---
const StatusPill = ({ status }) => {
  const colors = {
    healthy: { bg: "rgba(34,197,94,0.15)", text: "#34d399", border: "rgba(34,197,94,0.3)" },
    cooldown: { bg: "rgba(251,191,36,0.15)", text: "#fbbf24", border: "rgba(251,191,36,0.3)" },
    degraded: { bg: "rgba(251,146,60,0.15)", text: "#fb923c", border: "rgba(251,146,60,0.3)" },
    blocked: { bg: "rgba(248,113,113,0.15)", text: "#f87171", border: "rgba(248,113,113,0.3)" },
    ok: { bg: "rgba(34,197,94,0.15)", text: "#34d399", border: "rgba(34,197,94,0.3)" },
    "403": { bg: "rgba(248,113,113,0.15)", text: "#f87171", border: "rgba(248,113,113,0.3)" },
  };
  const c = colors[status] || colors.degraded;
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 700, padding: "2px 8px",
      borderRadius: 99, background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      textTransform: "uppercase", letterSpacing: "0.08em",
    }}>{status}</span>
  );
};

// --- Tier Badge ---
const TierBadge = ({ tier }) => {
  const short = tier?.replace("tier", "T").replace("_mfg", "·MFG").replace("_lab", "·LAB").replace("_retail", "·RET").replace("_agg", "·AGG") || "—";
  const tierNum = parseInt(tier?.charAt(4)) || 5;
  const hue = tierNum === 1 ? 160 : tierNum === 2 ? 190 : tierNum === 3 ? 40 : tierNum === 4 ? 20 : 270;
  return (
    <span style={{
      display: "inline-block", fontSize: 9, fontWeight: 700, padding: "1px 6px",
      borderRadius: 3, background: `hsla(${hue}, 60%, 40%, 0.2)`, color: `hsl(${hue}, 70%, 65%)`,
      border: `1px solid hsla(${hue}, 50%, 50%, 0.3)`, fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: "0.04em",
    }}>{short}</span>
  );
};

// --- Yield Badge ---
const YieldBadge = ({ yield: y }) => {
  const c = y === "high" ? "#34d399" : y === "med" ? "#fbbf24" : "#f87171";
  return <span style={{ fontSize: 10, fontWeight: 700, color: c }}>●&nbsp;{y}</span>;
};

// --- Tab system ---
const TABS = [
  { id: "compound", label: "Compound Curve", icon: "📉" },
  { id: "queries", label: "QueryIndex", icon: "🔍" },
  { id: "urls", label: "URLIndex", icon: "🔗" },
  { id: "hosts", label: "Host Health", icon: "🏥" },
  { id: "diff", label: "v1 ↔ v2 Diff", icon: "⚖️" },
  { id: "knobs", label: "Knob Telemetry", icon: "🎛️" },
];

// --- Main Dashboard ---
export default function CompoundLearningDashboard() {
  const [tab, setTab] = useState("compound");
  const [compoundData] = useState(generateCompoundCurve);
  const [queryData] = useState(generateQueryIndex);
  const [urlData] = useState(generateUrlIndex);
  const [hostData] = useState(generateHostHealth);
  const [knobData] = useState(generateKnobTelemetry);
  const [diffData] = useState(generatePlanDiffs);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const latestRun = compoundData[compoundData.length - 1];
  const firstRun = compoundData[0];
  const searchReduction = firstRun ? Math.round((1 - latestRun.searches / firstRun.searches) * 100) : 0;
  const costReduction = firstRun ? Math.round((1 - latestRun.llmCost / firstRun.llmCost) * 100) : 0;
  const deadQueries = queryData.filter(q => q.dead).length;
  const highYieldUrls = urlData.filter(u => u.yield === "high").length;
  const blockedHosts = hostData.filter(h => h.status === "blocked").length;
  const knobMismatches = knobData.filter(k => !k.match).length;
  const v2Wins = diffData.filter(d => d.winner === "v2").length;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #020617 0%, #0f172a 50%, #020617 100%)",
      color: "#e2e8f0",
      fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
      padding: 0,
    }}>
      {/* Scanline overlay */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 999,
        background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 3px)",
      }} />

      {/* Header */}
      <div style={{
        background: "rgba(2, 6, 23, 0.95)",
        borderBottom: "1px solid rgba(34, 211, 238, 0.15)",
        padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#34d399",
            boxShadow: "0 0 8px rgba(34, 211, 238, 0.6)",
            animation: "pulse 2s ease-in-out infinite",
          }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.01em" }}>
              INDEXLAB — PHASE 4 COMPOUND LEARNING
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
              Instrumentation &amp; Validation Command Center
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            Category: <span style={{ color: "#22d3ee", fontWeight: 600 }}>mouse</span>
          </div>
          <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "#64748b" }}>
            {clock.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
        gap: 10,
        padding: "16px 24px 8px",
      }}>
        <MetricCard
          label="Searches / Product"
          value={latestRun?.searches || "—"}
          sub={`started at ${firstRun?.searches || "—"}`}
          trend={`${searchReduction}% reduction`}
          good={searchReduction > 0}
          spark={compoundData.map(d => d.searches)}
        />
        <MetricCard
          label="URL Reuse Rate"
          value={`${latestRun?.urlReuse || 0}%`}
          sub="cross-product"
          spark={compoundData.map(d => d.urlReuse)}
          sparkDecreasing={false}
        />
        <MetricCard
          label="LLM Cost / Product"
          value={`$${latestRun?.llmCost || "—"}`}
          trend={`${costReduction}% savings`}
          good={costReduction > 0}
          spark={compoundData.map(d => d.llmCost)}
        />
        <MetricCard
          label="Time to 1st Citation"
          value={`${latestRun?.timeToFirstCitation || "—"}s`}
          spark={compoundData.map(d => d.timeToFirstCitation)}
        />
        <MetricCard
          label="Dead Queries"
          value={deadQueries}
          sub={`of ${queryData.length} total`}
          good={deadQueries < 3}
        />
        <MetricCard
          label="v2 Wins"
          value={`${v2Wins}/${diffData.length}`}
          sub="fields improved"
        />
        <MetricCard
          label="Blocked Hosts"
          value={blockedHosts}
          sub={`of ${hostData.length}`}
          good={blockedHosts === 0}
        />
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 2, padding: "8px 24px 0",
        borderBottom: "1px solid rgba(51, 65, 85, 0.4)",
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 16px",
              fontSize: 12,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "#22d3ee" : "#94a3b8",
              background: tab === t.id ? "rgba(34, 211, 238, 0.08)" : "transparent",
              border: "none",
              borderBottom: tab === t.id ? "2px solid #22d3ee" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s",
              fontFamily: "inherit",
              letterSpacing: "0.02em",
            }}
          >
            <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
            {t.id === "knobs" && knobMismatches > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 9, background: "rgba(248,113,113,0.2)",
                color: "#f87171", padding: "1px 5px", borderRadius: 99, fontWeight: 700,
              }}>{knobMismatches}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ padding: "16px 24px 32px" }}>

        {/* COMPOUND CURVE */}
        {tab === "compound" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
                The Compound Curve — Does It Get Cheaper?
              </h3>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                If searches/product isn't declining by run 5, the indexes aren't being consulted. This is the go/no-go metric.
              </p>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(51,65,85,0.5)" }}>
                    {["Run", "Product", "Searches", "URL Reuse %", "Net New URLs", "LLM Cost", "Fields Filled", "Time to Citation"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compoundData.map((row, i) => {
                    const prevSearches = i > 0 ? compoundData[i - 1].searches : null;
                    const searchDelta = prevSearches ? row.searches - prevSearches : 0;
                    return (
                      <tr key={i} style={{
                        borderBottom: "1px solid rgba(30,41,59,0.5)",
                        background: i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.3)",
                      }}>
                        <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: "#64748b" }}>#{row.run}</td>
                        <td style={{ padding: "8px 10px", color: "#e2e8f0", fontWeight: 500 }}>{row.product}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: row.searches <= 8 ? "#34d399" : row.searches <= 14 ? "#fbbf24" : "#f87171" }}>
                            {row.searches}
                          </span>
                          {searchDelta !== 0 && (
                            <span style={{ fontSize: 10, marginLeft: 6, color: searchDelta < 0 ? "#34d399" : "#f87171" }}>
                              {searchDelta < 0 ? "▼" : "▲"}{Math.abs(searchDelta)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 60, height: 6, background: "rgba(30,41,59,0.8)", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${row.urlReuse}%`, height: "100%", background: `hsl(${120 + row.urlReuse}, 70%, 50%)`, borderRadius: 3, transition: "width 0.3s" }} />
                            </div>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#94a3b8" }}>{row.urlReuse}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: "#94a3b8" }}>{row.newUrls}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: row.llmCost <= 0.35 ? "#34d399" : row.llmCost <= 0.50 ? "#fbbf24" : "#f87171" }}>
                            ${row.llmCost}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#f1f5f9" }}>{row.fields}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: "#94a3b8" }}>{row.timeToFirstCitation}s</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Compound verdict */}
            <div style={{
              marginTop: 16, padding: "12px 16px", borderRadius: 6,
              background: searchReduction >= 30 ? "rgba(34,197,94,0.08)" : searchReduction >= 10 ? "rgba(251,191,36,0.08)" : "rgba(248,113,113,0.08)",
              border: `1px solid ${searchReduction >= 30 ? "rgba(34,197,94,0.25)" : searchReduction >= 10 ? "rgba(251,191,36,0.25)" : "rgba(248,113,113,0.25)"}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: searchReduction >= 30 ? "#34d399" : searchReduction >= 10 ? "#fbbf24" : "#f87171" }}>
                {searchReduction >= 30 ? "✓ COMPOUNDING PROVEN" : searchReduction >= 10 ? "⚠ COMPOUNDING PARTIAL" : "✗ COMPOUNDING NOT PROVEN"}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                {searchReduction}% search reduction over {compoundData.length} runs. Target: ≥30% by run 10.
                {searchReduction < 30 && " Indexes may not be consulted — check QueryIndex and URLIndex read paths."}
              </div>
            </div>
          </div>
        )}

        {/* QUERY INDEX */}
        {tab === "queries" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>QueryIndex — Query Memory</h3>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                Every query logged with provider, results, field yield. Dead queries are flagged for elimination.
              </p>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(51,65,85,0.5)" }}>
                  {["Query", "Provider", "Results", "Relevant", "Fields", "Yield", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryData.map((q, i) => (
                  <tr key={i} style={{
                    borderBottom: "1px solid rgba(30,41,59,0.5)",
                    background: q.dead ? "rgba(248,113,113,0.05)" : i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.3)",
                    opacity: q.dead ? 0.6 : 1,
                  }}>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#e2e8f0", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.query}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: q.provider === "bing" ? "#60a5fa" : q.provider === "google" ? "#fbbf24" : "#a78bfa" }}>{q.provider}</span>
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace" }}>{q.results}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: q.relevant === 0 ? "#f87171" : "#94a3b8" }}>{q.relevant}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#f1f5f9" }}>{q.fields}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 48, height: 5, background: "rgba(30,41,59,0.8)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${q.yield * 100}%`, height: "100%", background: q.yield >= 0.7 ? "#34d399" : q.yield >= 0.4 ? "#fbbf24" : "#f87171", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#94a3b8" }}>{(q.yield * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {q.dead ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.15)", padding: "2px 6px", borderRadius: 3 }}>DEAD</span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#34d399" }}>active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* URL INDEX */}
        {tab === "urls" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>URLIndex — URL Memory &amp; Reuse</h3>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                High-yield URLs are reused across products. Dead URLs are deprioritized. TTL enforces freshness.
              </p>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(51,65,85,0.5)" }}>
                  {["URL", "Tier", "Status", "Fields", "Reuses", "Yield", "Last OK", "TTL"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {urlData.map((u, i) => (
                  <tr key={i} style={{
                    borderBottom: "1px solid rgba(30,41,59,0.5)",
                    background: i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.3)",
                  }}>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#e2e8f0", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.url}</td>
                    <td style={{ padding: "8px 10px" }}><TierBadge tier={u.tier} /></td>
                    <td style={{ padding: "8px 10px" }}><StatusPill status={u.status} /></td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#f1f5f9" }}>{u.fields}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", color: u.reuses > 3 ? "#34d399" : "#94a3b8", fontWeight: u.reuses > 3 ? 700 : 400 }}>
                        {u.reuses}×
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px" }}><YieldBadge yield={u.yield} /></td>
                    <td style={{ padding: "8px 10px", fontSize: 11, color: "#64748b" }}>{u.lastOk}</td>
                    <td style={{ padding: "8px 10px", fontSize: 11, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>{u.ttl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* HOST HEALTH */}
        {tab === "hosts" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Host Health — Block Rate &amp; Pacing Monitor</h3>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                Blocked hosts burn budget. Cooldowns waste time. Watch for hosts stuck in degraded/blocked.
              </p>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(51,65,85,0.5)" }}>
                  {["Host", "Tier", "Status", "Block Rate", "Avg Cooldown", "Fetches/24h", "Fields/24h", "Pacing (ms)"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hostData.sort((a, b) => b.blockRate - a.blockRate).map((h, i) => (
                  <tr key={i} style={{
                    borderBottom: "1px solid rgba(30,41,59,0.5)",
                    background: h.status === "blocked" ? "rgba(248,113,113,0.04)" : i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.3)",
                  }}>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#e2e8f0", fontWeight: 500 }}>{h.host}</td>
                    <td style={{ padding: "8px 10px" }}><TierBadge tier={h.tier} /></td>
                    <td style={{ padding: "8px 10px" }}><StatusPill status={h.status} /></td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 48, height: 5, background: "rgba(30,41,59,0.8)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${h.blockRate * 100}%`, height: "100%", background: h.blockRate > 0.3 ? "#f87171" : h.blockRate > 0.1 ? "#fbbf24" : "#34d399", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: h.blockRate > 0.3 ? "#f87171" : "#94a3b8" }}>{(h.blockRate * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: h.avgCooldown > 60 ? "#f87171" : "#94a3b8" }}>{h.avgCooldown}s</td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace" }}>{h.fetches24h}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#f1f5f9" }}>{h.fields24h}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: "#64748b" }}>{h.pacing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* V1 vs V2 DIFF */}
        {tab === "diff" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Side-by-Side — v1 ↔ v2 Plan Diff</h3>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                Shadow mode comparison. v2 must match or beat v1 on every field before cutover.
              </p>
            </div>
            {/* Summary strip */}
            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              {[
                { label: "v2 Wins", count: diffData.filter(d => d.winner === "v2").length, color: "#34d399" },
                { label: "Ties", count: diffData.filter(d => d.winner === "tie").length, color: "#94a3b8" },
                { label: "v1 Wins", count: diffData.filter(d => d.winner === "v1").length, color: "#f87171" },
                { label: "Neither", count: diffData.filter(d => d.winner === "neither").length, color: "#64748b" },
              ].map(s => (
                <div key={s.label} style={{
                  padding: "8px 16px", borderRadius: 6,
                  background: "rgba(15,23,42,0.7)",
                  border: "1px solid rgba(51,65,85,0.4)",
                }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.count}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                </div>
              ))}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(51,65,85,0.5)" }}>
                  {["Field", "v1 Host", "v1 Tier", "v2 Host", "v2 Tier", "Winner", "Reason"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {diffData.map((d, i) => (
                  <tr key={i} style={{
                    borderBottom: "1px solid rgba(30,41,59,0.5)",
                    background: d.winner === "v2" ? "rgba(34,197,94,0.04)" : d.winner === "v1" ? "rgba(248,113,113,0.04)" : "transparent",
                  }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: "#e2e8f0" }}>{d.field}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: d.v1Found ? "#e2e8f0" : "#475569" }}>{d.v1Host}</td>
                    <td style={{ padding: "8px 10px" }}>{d.v1Tier !== "—" ? <TierBadge tier={d.v1Tier} /> : <span style={{ color: "#475569" }}>—</span>}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: d.v2Found ? "#e2e8f0" : "#475569" }}>{d.v2Host}</td>
                    <td style={{ padding: "8px 10px" }}>{d.v2Tier !== "—" ? <TierBadge tier={d.v2Tier} /> : <span style={{ color: "#475569" }}>—</span>}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3,
                        background: d.winner === "v2" ? "rgba(34,197,94,0.15)" : d.winner === "v1" ? "rgba(248,113,113,0.15)" : "rgba(100,116,139,0.15)",
                        color: d.winner === "v2" ? "#34d399" : d.winner === "v1" ? "#f87171" : "#64748b",
                      }}>{d.winner.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: 11, color: "#94a3b8", maxWidth: 220 }}>{d.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* KNOB TELEMETRY */}
        {tab === "knobs" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Per-Run Knob Telemetry — Audit Trail</h3>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                Effective values per run vs configured values. Mismatches mean runtime overrides or stale settings.
              </p>
            </div>
            {knobMismatches > 0 && (
              <div style={{
                padding: "10px 14px", marginBottom: 16, borderRadius: 6,
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>⚠ {knobMismatches} KNOB MISMATCH{knobMismatches > 1 ? "ES" : ""}</span>
                <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>
                  Effective values differ from config. Check runtime overrides.
                </span>
              </div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(51,65,85,0.5)" }}>
                  {["Run", "Knob", "Config Value", "Effective Value", "Match"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {knobData.map((k, i) => (
                  <tr key={i} style={{
                    borderBottom: "1px solid rgba(30,41,59,0.5)",
                    background: !k.match ? "rgba(248,113,113,0.04)" : i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.3)",
                  }}>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#64748b" }}>{k.run}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#e2e8f0" }}>{k.knob}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace" }}>{k.config}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: !k.match ? "#f87171" : "#e2e8f0", fontWeight: !k.match ? 700 : 400 }}>{k.effective}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {k.match ? (
                        <span style={{ color: "#34d399", fontSize: 14 }}>✓</span>
                      ) : (
                        <span style={{ color: "#f87171", fontSize: 10, fontWeight: 700, background: "rgba(248,113,113,0.15)", padding: "2px 6px", borderRadius: 3 }}>MISMATCH</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: rgba(15,23,42,0.5); }
        ::-webkit-scrollbar-thumb { background: rgba(51,65,85,0.6); border-radius: 3px; }
      `}</style>
    </div>
  );
}
