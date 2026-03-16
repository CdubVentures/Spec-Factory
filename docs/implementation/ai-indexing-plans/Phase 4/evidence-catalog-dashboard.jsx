import { useState, useEffect, useCallback } from "react";

// ─── Mock Data (replace with real API calls) ───────────────────────────────

const mockSourceRecords = () => [
  { id: "sr-001", url: "razer.com/gaming-mice/razer-viper-v3-pro", host: "razer.com", tier: "tier1_mfg", identity: "confirmed", identityScore: 0.98, fieldsExtracted: 24, parserWarnings: 0, quality: 0.95, status: "reviewed", fetchMs: 1240, parseMs: 890 },
  { id: "sr-002", url: "rtings.com/mouse/reviews/razer/viper-v3-pro", host: "rtings.com", tier: "tier2_lab", identity: "confirmed", identityScore: 0.96, fieldsExtracted: 31, parserWarnings: 1, quality: 0.91, status: "auto-accepted", fetchMs: 2100, parseMs: 1450 },
  { id: "sr-003", url: "techpowerup.com/review/razer-viper-v3-pro", host: "techpowerup.com", tier: "tier2_lab", identity: "confirmed", identityScore: 0.94, fieldsExtracted: 28, parserWarnings: 2, quality: 0.84, status: "auto-accepted", fetchMs: 1890, parseMs: 1120 },
  { id: "sr-004", url: "amazon.com/dp/B0DM1234", host: "amazon.com", tier: "tier3_retail", identity: "uncertain", identityScore: 0.62, fieldsExtracted: 8, parserWarnings: 4, quality: 0.52, status: "needs-review", fetchMs: 4200, parseMs: 2300 },
  { id: "sr-005", url: "eloshapes.com/mouse/razer-viper-v3-pro", host: "eloshapes.com", tier: "tier5_agg", identity: "confirmed", identityScore: 0.91, fieldsExtracted: 18, parserWarnings: 0, quality: 0.88, status: "auto-accepted", fetchMs: 980, parseMs: 420 },
  { id: "sr-006", url: "mousespecs.org/razer-viper-v3-hyperspeed", host: "mousespecs.org", tier: "tier5_agg", identity: "variant", identityScore: 0.78, fieldsExtracted: 14, parserWarnings: 1, quality: 0.72, status: "needs-review", fetchMs: 1100, parseMs: 380 },
  { id: "sr-007", url: "sensor.fyi/info/focus-pro-36k", host: "sensor.fyi", tier: "tier5_agg", identity: "confirmed", identityScore: 0.89, fieldsExtracted: 9, parserWarnings: 0, quality: 0.90, status: "auto-accepted", fetchMs: 560, parseMs: 210 },
  { id: "sr-008", url: "prosettings.net/mouse/razer-viper-v3-pro", host: "prosettings.net", tier: "tier3_db", identity: "confirmed", identityScore: 0.92, fieldsExtracted: 21, parserWarnings: 0, quality: 0.86, status: "auto-accepted", fetchMs: 1340, parseMs: 670 },
  { id: "sr-009", url: "rtings.com/mouse/reviews/razer/viper-v2-pro", host: "rtings.com", tier: "tier2_lab", identity: "rejected", identityScore: 0.12, fieldsExtracted: 29, parserWarnings: 0, quality: 0.92, status: "rejected", fetchMs: 1950, parseMs: 1380 },
  { id: "sr-010", url: "razer.com/mena-ar/gaming-mice/razer-viper-v3-pro", host: "razer.com", tier: "tier1_mfg", identity: "confirmed", identityScore: 0.97, fieldsExtracted: 22, parserWarnings: 0, quality: 0.94, status: "auto-accepted", fetchMs: 1560, parseMs: 920 },
];

const mockComparisonMatrix = () => ({
  fields: [
    { field: "weight", sources: { "razer.com": "54g", "rtings.com": "55g", "techpowerup.com": "54g", "eloshapes.com": "54g", "prosettings.net": "54g" }, consensus: "54g", agreement: 4, conflict: 1, note: "rtings.com outlier (55g)" },
    { field: "sensor", sources: { "razer.com": "Focus Pro 36K", "rtings.com": "Focus Pro 36K", "techpowerup.com": "Focus Pro 36K", "eloshapes.com": "Focus Pro 36K", "sensor.fyi": "Focus Pro 36K" }, consensus: "Focus Pro 36K", agreement: 5, conflict: 0, note: null },
    { field: "dpi", sources: { "razer.com": "36000", "rtings.com": "36000", "techpowerup.com": "100", "eloshapes.com": "36000" }, consensus: "36000", agreement: 3, conflict: 1, note: "techpowerup.com parse error (100)" },
    { field: "height", sources: { "razer.com": "39.1mm", "rtings.com": "39.2mm", "techpowerup.com": "11", "eloshapes.com": "39.1mm" }, consensus: "39.1mm", agreement: 3, conflict: 1, note: "techpowerup.com parse error (11)" },
    { field: "switch", sources: { "razer.com": "Gen-3 Optical", "rtings.com": "Razer Optical Gen-3", "prosettings.net": "Optical Gen 3" }, consensus: "Gen-3 Optical", agreement: 3, conflict: 0, note: "Normalized variants" },
    { field: "polling_rate", sources: { "razer.com": "8000Hz", "rtings.com": "8000Hz", "techpowerup.com": "8000Hz", "eloshapes.com": "8000Hz" }, consensus: "8000Hz", agreement: 4, conflict: 0, note: null },
    { field: "click_latency", sources: { "rtings.com": "0.6ms" }, consensus: "0.6ms", agreement: 1, conflict: 0, note: "Single lab source" },
    { field: "sensor_latency", sources: { "rtings.com": "1.1ms" }, consensus: "1.1ms", agreement: 1, conflict: 0, note: "Single lab source" },
    { field: "connection", sources: { "razer.com": "2.4GHz / Bluetooth / Wired", "rtings.com": "Wireless", "prosettings.net": "2.4GHz Wireless" }, consensus: "2.4GHz / Bluetooth / Wired", agreement: 1, conflict: 2, note: "Granularity mismatch" },
    { field: "lngth", sources: { "razer.com": "126.9mm", "rtings.com": "127.0mm", "eloshapes.com": "126.9mm" }, consensus: "126.9mm", agreement: 2, conflict: 1, note: null },
    { field: "width", sources: { "razer.com": "63.5mm", "rtings.com": "63.7mm", "eloshapes.com": "63.5mm" }, consensus: "63.5mm", agreement: 2, conflict: 1, note: null },
    { field: "encoder", sources: {}, consensus: null, agreement: 0, conflict: 0, note: "No sources found" },
    { field: "debounce", sources: { "rtings.com": "0ms" }, consensus: "0ms", agreement: 1, conflict: 0, note: "Single lab source" },
  ],
  allSources: ["razer.com", "rtings.com", "techpowerup.com", "eloshapes.com", "prosettings.net", "sensor.fyi"]
});

const mockUrlMemory = () => [
  { url: "razer.com/gaming-mice/razer-viper-v3-pro", host: "razer.com", timesVisited: 9, lastFetch: "2h ago", avgFields: 22, successRate: 1.0, contentHash: "a3f8...", status: "active" },
  { url: "rtings.com/mouse/reviews/razer/viper-v3-pro", host: "rtings.com", timesVisited: 7, lastFetch: "2h ago", avgFields: 30, successRate: 0.95, contentHash: "b2e1...", status: "active" },
  { url: "eloshapes.com/mouse/razer-viper-v3-pro", host: "eloshapes.com", timesVisited: 6, lastFetch: "3h ago", avgFields: 17, successRate: 1.0, contentHash: "c9d4...", status: "active" },
  { url: "sensor.fyi/info/focus-pro-36k", host: "sensor.fyi", timesVisited: 11, lastFetch: "4h ago", avgFields: 9, successRate: 1.0, contentHash: "d7a2...", status: "active" },
  { url: "mousespecs.org/razer-viper-v3-pro", host: "mousespecs.org", timesVisited: 3, lastFetch: "6h ago", avgFields: 0, successRate: 0.33, contentHash: "—", status: "degraded" },
];

const mockHostHealth = () => [
  { host: "razer.com", tier: "tier1_mfg", fetches: 42, successes: 39, fields: 186, blockRate: 0.07, status: "healthy", avgMs: 1400 },
  { host: "rtings.com", tier: "tier2_lab", fetches: 28, successes: 27, fields: 248, blockRate: 0.04, status: "healthy", avgMs: 2050 },
  { host: "techpowerup.com", tier: "tier2_lab", fetches: 22, successes: 21, fields: 164, blockRate: 0.05, status: "healthy", avgMs: 1890 },
  { host: "eloshapes.com", tier: "tier5_agg", fetches: 30, successes: 30, fields: 210, blockRate: 0.0, status: "healthy", avgMs: 980 },
  { host: "sensor.fyi", tier: "tier5_agg", fetches: 18, successes: 18, fields: 72, blockRate: 0.0, status: "healthy", avgMs: 560 },
  { host: "amazon.com", tier: "tier3_retail", fetches: 15, successes: 10, fields: 42, blockRate: 0.33, status: "degraded", avgMs: 4200 },
  { host: "corsair.com", tier: "tier1_mfg", fetches: 8, successes: 2, fields: 6, blockRate: 0.75, status: "blocked", avgMs: 6800 },
  { host: "mousespecs.org", tier: "tier5_agg", fetches: 9, successes: 7, fields: 38, blockRate: 0.22, status: "degraded", avgMs: 1100 },
];

const mockCompoundTrend = () => [
  { run: 1, product: "Razer Viper V3 Pro", searches: 18, urlReuse: 0, fields: 109, cost: 0.32, fetchSuccess: 95 },
  { run: 2, product: "Corsair Dark Core RGB Pro", searches: 16, urlReuse: 12, fields: 35, cost: 0.28, fetchSuccess: 50 },
  { run: 3, product: "Logitech G Pro X Superlight 2", searches: 14, urlReuse: 18, fields: 72, cost: 0.24, fetchSuccess: 78 },
  { run: 4, product: "Glorious Model D 2 PRO", searches: 12, urlReuse: 24, fields: 26, cost: 0.22, fetchSuccess: 70 },
  { run: 5, product: "Pulsar X2V2", searches: 11, urlReuse: 31, fields: 20, cost: 0.19, fetchSuccess: 56 },
  { run: 6, product: "SteelSeries Aerox 9", searches: 10, urlReuse: 38, fields: 53, cost: 0.18, fetchSuccess: 88 },
  { run: 7, product: "Razer DeathAdder V3", searches: 7, urlReuse: 52, fields: 94, cost: 0.14, fetchSuccess: 92 },
  { run: 8, product: "Endgame Gear OP1we", searches: 9, urlReuse: 44, fields: 48, cost: 0.16, fetchSuccess: 82 },
];

// ─── Shared UI Components ──────────────────────────────────────────────────

const FONT = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";
const DISPLAY = "'DM Sans', 'Segoe UI', system-ui, sans-serif";

const colors = {
  bg: "#0c0f14",
  surface: "#141820",
  surfaceHover: "#1a2030",
  border: "#1e2738",
  borderActive: "#2a4060",
  text: "#c8d0dc",
  textDim: "#6b7a8d",
  textBright: "#e8edf4",
  accent: "#4a9eff",
  accentDim: "#2a5a9a",
  green: "#34d399",
  greenDim: "#0d4a30",
  amber: "#fbbf24",
  amberDim: "#5a4010",
  red: "#f87171",
  redDim: "#5a1a1a",
  purple: "#a78bfa",
  cyan: "#22d3ee",
};

const Badge = ({ children, color = colors.accent, bg }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", padding: "2px 8px",
    borderRadius: 4, fontSize: 11, fontFamily: FONT, fontWeight: 600,
    color, background: bg || `${color}18`, letterSpacing: "0.02em",
  }}>{children}</span>
);

const IdentityBadge = ({ identity }) => {
  const map = {
    confirmed: { color: colors.green, label: "CONFIRMED" },
    uncertain: { color: colors.amber, label: "UNCERTAIN" },
    variant: { color: colors.purple, label: "VARIANT" },
    rejected: { color: colors.red, label: "REJECTED" },
    quarantined: { color: colors.amber, label: "QUARANTINED" },
  };
  const c = map[identity] || { color: colors.textDim, label: identity };
  return <Badge color={c.color}>{c.label}</Badge>;
};

const TierBadge = ({ tier }) => {
  const map = {
    tier1_mfg: { color: colors.accent, label: "MFG" },
    tier2_lab: { color: colors.green, label: "LAB" },
    tier3_retail: { color: colors.amber, label: "RETAIL" },
    tier3_db: { color: colors.cyan, label: "DB" },
    tier5_agg: { color: colors.purple, label: "AGG" },
  };
  const c = map[tier] || { color: colors.textDim, label: tier };
  return <Badge color={c.color}>{c.label}</Badge>;
};

const StatusDot = ({ status }) => {
  const c = { healthy: colors.green, degraded: colors.amber, blocked: colors.red, cooldown: colors.amber, active: colors.green }[status] || colors.textDim;
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, marginRight: 6, boxShadow: `0 0 6px ${c}40` }} />;
};

const KPI = ({ label, value, sub, trend }) => (
  <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "14px 18px", flex: 1, minWidth: 140 }}>
    <div style={{ fontSize: 11, color: colors.textDim, fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, fontFamily: DISPLAY, color: colors.textBright, lineHeight: 1.1 }}>
      {value}
      {trend && <span style={{ fontSize: 12, color: trend > 0 ? colors.green : trend < 0 ? colors.red : colors.textDim, marginLeft: 6 }}>{trend > 0 ? "▲" : trend < 0 ? "▼" : "─"}</span>}
    </div>
    {sub && <div style={{ fontSize: 11, color: colors.textDim, fontFamily: FONT, marginTop: 2 }}>{sub}</div>}
  </div>
);

const MiniBar = ({ value, max = 100, color = colors.accent, width = 60 }) => (
  <div style={{ width, height: 6, background: `${color}15`, borderRadius: 3, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s ease" }} />
  </div>
);

// ─── Sub-Tab: Source Records ───────────────────────────────────────────────

const SourceRecordsTab = ({ data }) => {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? data : data.filter(s => s.identity === filter);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["all", "confirmed", "variant", "uncertain", "rejected"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "4px 12px", borderRadius: 4, border: `1px solid ${filter === f ? colors.accent : colors.border}`,
            background: filter === f ? `${colors.accent}15` : "transparent", color: filter === f ? colors.accent : colors.textDim,
            fontSize: 12, fontFamily: FONT, cursor: "pointer", textTransform: "uppercase",
          }}>{f} {f !== "all" ? `(${data.filter(s => s.identity === f).length})` : `(${data.length})`}</button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              {["Source URL", "Tier", "Identity", "Fields", "Warnings", "Quality", "Status"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: colors.textDim, fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{ borderBottom: `1px solid ${colors.border}08`, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = colors.surfaceHover}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "8px 10px", color: colors.text, maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</td>
                <td style={{ padding: "8px 10px" }}><TierBadge tier={s.tier} /></td>
                <td style={{ padding: "8px 10px" }}><IdentityBadge identity={s.identity} /></td>
                <td style={{ padding: "8px 10px", color: colors.textBright, fontWeight: 600 }}>{s.fieldsExtracted}</td>
                <td style={{ padding: "8px 10px" }}>
                  {s.parserWarnings > 0 ? <Badge color={colors.amber}>{s.parserWarnings} warn</Badge> : <span style={{ color: colors.textDim }}>clean</span>}
                </td>
                <td style={{ padding: "8px 10px" }}><MiniBar value={s.quality * 100} color={s.quality > 0.8 ? colors.green : s.quality > 0.6 ? colors.amber : colors.red} /></td>
                <td style={{ padding: "8px 10px" }}>
                  <Badge color={s.status === "reviewed" ? colors.green : s.status === "auto-accepted" ? colors.accent : s.status === "rejected" ? colors.red : colors.amber}>
                    {s.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Sub-Tab: Comparison Matrix ────────────────────────────────────────────

const ComparisonMatrixTab = ({ data }) => {
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);
  const fields = showConflictsOnly ? data.fields.filter(f => f.conflict > 0 || !f.consensus) : data.fields;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => setShowConflictsOnly(!showConflictsOnly)} style={{
          padding: "4px 12px", borderRadius: 4, fontSize: 12, fontFamily: FONT, cursor: "pointer",
          border: `1px solid ${showConflictsOnly ? colors.amber : colors.border}`,
          background: showConflictsOnly ? `${colors.amber}15` : "transparent",
          color: showConflictsOnly ? colors.amber : colors.textDim,
        }}>{showConflictsOnly ? "Showing conflicts only" : "Show conflicts only"}</button>
        <span style={{ fontSize: 11, color: colors.textDim, fontFamily: FONT }}>
          {data.fields.filter(f => f.conflict > 0).length} conflicts · {data.fields.filter(f => !f.consensus).length} missing · {data.allSources.length} sources
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
              <th style={{ padding: "8px 10px", textAlign: "left", color: colors.textDim, fontWeight: 600, fontSize: 10, textTransform: "uppercase", position: "sticky", left: 0, background: colors.bg, zIndex: 2, minWidth: 120 }}>Field</th>
              {data.allSources.map(s => (
                <th key={s} style={{ padding: "8px 6px", textAlign: "center", color: colors.textDim, fontWeight: 500, fontSize: 9, textTransform: "uppercase", minWidth: 100, maxWidth: 140 }}>{s.replace("www.", "")}</th>
              ))}
              <th style={{ padding: "8px 10px", textAlign: "center", color: colors.accent, fontWeight: 700, fontSize: 10, textTransform: "uppercase", minWidth: 120 }}>Consensus</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(f => {
              const hasConflict = f.conflict > 0;
              const isEmpty = !f.consensus;
              return (
                <tr key={f.field} style={{ borderBottom: `1px solid ${colors.border}08`, background: hasConflict ? `${colors.amber}06` : isEmpty ? `${colors.red}04` : "transparent" }}>
                  <td style={{ padding: "6px 10px", fontWeight: 600, color: colors.textBright, position: "sticky", left: 0, background: hasConflict ? `${colors.amber}08` : isEmpty ? `${colors.red}06` : colors.bg, zIndex: 1 }}>
                    {f.field}
                    {hasConflict && <span style={{ color: colors.amber, marginLeft: 4, fontSize: 9 }}>⚠</span>}
                  </td>
                  {data.allSources.map(src => {
                    const val = f.sources[src];
                    const isOutlier = val && f.consensus && val !== f.consensus;
                    return (
                      <td key={src} style={{
                        padding: "6px 6px", textAlign: "center",
                        color: !val ? colors.textDim : isOutlier ? colors.red : colors.text,
                        background: isOutlier ? `${colors.red}08` : "transparent",
                        fontWeight: isOutlier ? 600 : 400,
                      }}>
                        {val || "—"}
                      </td>
                    );
                  })}
                  <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: f.consensus ? colors.green : colors.red, background: `${f.consensus ? colors.green : colors.red}06` }}>
                    {f.consensus || "MISSING"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {fields.some(f => f.note) && (
        <div style={{ marginTop: 16, padding: 12, background: colors.surface, borderRadius: 6, border: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", fontFamily: FONT, marginBottom: 8, letterSpacing: "0.08em" }}>Notes</div>
          {fields.filter(f => f.note).map(f => (
            <div key={f.field} style={{ fontSize: 11, color: colors.text, fontFamily: FONT, marginBottom: 4 }}>
              <span style={{ color: colors.accent, fontWeight: 600 }}>{f.field}:</span> {f.note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Sub-Tab: URL Memory ───────────────────────────────────────────────────

const UrlMemoryTab = ({ data }) => (
  <div>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          {["URL", "Visits", "Avg Fields", "Success", "Last Fetch", "Status"].map(h => (
            <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: colors.textDim, fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.sort((a, b) => b.timesVisited - a.timesVisited).map(u => (
          <tr key={u.url} style={{ borderBottom: `1px solid ${colors.border}08` }}>
            <td style={{ padding: "8px 10px", color: colors.text, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.url}</td>
            <td style={{ padding: "8px 10px", color: colors.textBright, fontWeight: 700, fontSize: 14 }}>{u.timesVisited}</td>
            <td style={{ padding: "8px 10px", color: colors.text }}>{u.avgFields}</td>
            <td style={{ padding: "8px 10px" }}><MiniBar value={u.successRate * 100} color={u.successRate > 0.8 ? colors.green : u.successRate > 0.5 ? colors.amber : colors.red} /></td>
            <td style={{ padding: "8px 10px", color: colors.textDim }}>{u.lastFetch}</td>
            <td style={{ padding: "8px 10px" }}><StatusDot status={u.status} /><span style={{ color: colors.text, fontSize: 11 }}>{u.status}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── Sub-Tab: Host Health ──────────────────────────────────────────────────

const HostHealthTab = ({ data }) => (
  <div>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          {["Host", "Tier", "Status", "Block Rate", "Fetches", "Fields", "Avg Latency"].map(h => (
            <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: colors.textDim, fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.sort((a, b) => b.blockRate - a.blockRate).map(h => (
          <tr key={h.host} style={{ borderBottom: `1px solid ${colors.border}08` }}>
            <td style={{ padding: "8px 10px", color: colors.textBright, fontWeight: 600 }}>{h.host}</td>
            <td style={{ padding: "8px 10px" }}><TierBadge tier={h.tier} /></td>
            <td style={{ padding: "8px 10px" }}><StatusDot status={h.status} /><span style={{ color: colors.text, fontSize: 11 }}>{h.status}</span></td>
            <td style={{ padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <MiniBar value={h.blockRate * 100} max={100} color={h.blockRate > 0.5 ? colors.red : h.blockRate > 0.1 ? colors.amber : colors.green} />
                <span style={{ color: h.blockRate > 0.5 ? colors.red : h.blockRate > 0.1 ? colors.amber : colors.textDim, fontSize: 11 }}>{(h.blockRate * 100).toFixed(0)}%</span>
              </div>
            </td>
            <td style={{ padding: "8px 10px", color: colors.text }}>{h.fetches}</td>
            <td style={{ padding: "8px 10px", color: colors.textBright, fontWeight: 600 }}>{h.fields}</td>
            <td style={{ padding: "8px 10px", color: colors.textDim }}>{h.avgMs}ms</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── Sub-Tab: Compound Trend ───────────────────────────────────────────────

const CompoundTrendTab = ({ data }) => {
  const first = data[0];
  const last = data[data.length - 1];
  const searchReduction = first ? Math.round(((first.searches - last.searches) / first.searches) * 100) : 0;
  const urlReuseTrend = last?.urlReuse > 30 ? "increasing" : last?.urlReuse > 10 ? "flat" : "none";
  const verdict = searchReduction >= 30 && urlReuseTrend === "increasing" ? "PROVEN" : searchReduction >= 10 ? "PARTIAL" : "NOT_PROVEN";

  return (
    <div>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 6, marginBottom: 16,
        background: verdict === "PROVEN" ? colors.greenDim : verdict === "PARTIAL" ? colors.amberDim : colors.redDim,
        border: `1px solid ${verdict === "PROVEN" ? colors.green : verdict === "PARTIAL" ? colors.amber : colors.red}30`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: DISPLAY, color: verdict === "PROVEN" ? colors.green : verdict === "PARTIAL" ? colors.amber : colors.red }}>{verdict}</span>
        <span style={{ fontSize: 11, color: colors.textDim, fontFamily: FONT }}>{searchReduction}% search reduction · URL reuse: {urlReuseTrend}</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            {["#", "Product", "Searches", "URL Reuse", "Fields", "Cost", "Fetch %"].map(h => (
              <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: colors.textDim, fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={r.run} style={{ borderBottom: `1px solid ${colors.border}08` }}>
              <td style={{ padding: "8px 10px", color: colors.textDim, fontWeight: 600 }}>{r.run}</td>
              <td style={{ padding: "8px 10px", color: colors.textBright }}>{r.product}</td>
              <td style={{ padding: "8px 10px" }}>
                <span style={{ color: colors.textBright, fontWeight: 600 }}>{r.searches}</span>
                {i > 0 && <span style={{ color: r.searches < data[i - 1].searches ? colors.green : colors.red, fontSize: 10, marginLeft: 4 }}>{r.searches < data[i - 1].searches ? "▼" : r.searches > data[i - 1].searches ? "▲" : "─"}</span>}
              </td>
              <td style={{ padding: "8px 10px" }}><MiniBar value={r.urlReuse} color={colors.accent} /><span style={{ color: colors.textDim, fontSize: 10, marginLeft: 4 }}>{r.urlReuse}%</span></td>
              <td style={{ padding: "8px 10px", color: r.fields > 50 ? colors.green : r.fields > 20 ? colors.amber : colors.red, fontWeight: 600 }}>{r.fields}</td>
              <td style={{ padding: "8px 10px", color: colors.textDim }}>${r.cost}</td>
              <td style={{ padding: "8px 10px" }}><MiniBar value={r.fetchSuccess} color={r.fetchSuccess > 80 ? colors.green : r.fetchSuccess > 50 ? colors.amber : colors.red} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Main Panel ────────────────────────────────────────────────────────────

const TABS = [
  { key: "matrix", label: "Comparison Matrix", icon: "⊞" },
  { key: "sources", label: "Source Records", icon: "◉" },
  { key: "urls", label: "URL Memory", icon: "⟁" },
  { key: "hosts", label: "Host Health", icon: "◈" },
  { key: "trend", label: "Compound Trend", icon: "↗" },
];

export default function EvidenceCatalogPanel() {
  const [activeTab, setActiveTab] = useState("matrix");
  const [sourceRecords] = useState(mockSourceRecords);
  const [comparisonMatrix] = useState(mockComparisonMatrix);
  const [urlMemory] = useState(mockUrlMemory);
  const [hostHealth] = useState(mockHostHealth);
  const [compoundTrend] = useState(mockCompoundTrend);

  const confirmed = sourceRecords.filter(s => s.identity === "confirmed").length;
  const variants = sourceRecords.filter(s => s.identity === "variant").length;
  const conflicts = comparisonMatrix.fields.filter(f => f.conflict > 0).length;
  const filled = comparisonMatrix.fields.filter(f => f.consensus).length;
  const total = comparisonMatrix.fields.length;
  const needsReview = sourceRecords.filter(s => s.status === "needs-review").length;

  return (
    <div style={{ background: colors.bg, color: colors.text, fontFamily: DISPLAY, minHeight: "100vh", padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.textBright, margin: 0, letterSpacing: "-0.02em" }}>
          Evidence Catalog
          <span style={{ fontSize: 12, color: colors.textDim, fontWeight: 400, marginLeft: 12, fontFamily: FONT }}>mouse / razer-viper-v3-pro</span>
        </h1>
        <div style={{ fontSize: 11, color: colors.textDim, fontFamily: FONT, marginTop: 4 }}>
          Collect → Extract → Catalog → Compare → Publish
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <KPI label="Sources" value={sourceRecords.length} sub={`${confirmed} confirmed · ${variants} variant`} />
        <KPI label="Fields" value={`${filled}/${total}`} sub={`${conflicts} conflicts`} trend={filled > total * 0.7 ? 1 : -1} />
        <KPI label="Fill Rate" value={`${Math.round((filled / total) * 100)}%`} sub="consensus coverage" />
        <KPI label="Review Queue" value={needsReview} sub={needsReview > 0 ? "needs attention" : "clear"} trend={needsReview > 0 ? -1 : 1} />
        <KPI label="URL Reuse" value={`${compoundTrend[compoundTrend.length - 1]?.urlReuse || 0}%`} sub="from prior runs" trend={1} />
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: `1px solid ${colors.border}`, paddingBottom: 0 }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: "10px 18px", border: "none", cursor: "pointer",
            background: activeTab === tab.key ? colors.surface : "transparent",
            color: activeTab === tab.key ? colors.textBright : colors.textDim,
            fontFamily: FONT, fontSize: 12, fontWeight: activeTab === tab.key ? 600 : 400,
            borderBottom: activeTab === tab.key ? `2px solid ${colors.accent}` : "2px solid transparent",
            borderRadius: "6px 6px 0 0", transition: "all 0.15s ease",
          }}>
            <span style={{ marginRight: 6, fontSize: 13 }}>{tab.icon}</span>
            {tab.label}
            {tab.key === "sources" && needsReview > 0 && (
              <span style={{ marginLeft: 6, padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: colors.amberDim, color: colors.amber }}>{needsReview}</span>
            )}
            {tab.key === "matrix" && conflicts > 0 && (
              <span style={{ marginLeft: 6, padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: colors.amberDim, color: colors.amber }}>{conflicts}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 20 }}>
        {activeTab === "matrix" && <ComparisonMatrixTab data={comparisonMatrix} />}
        {activeTab === "sources" && <SourceRecordsTab data={sourceRecords} />}
        {activeTab === "urls" && <UrlMemoryTab data={urlMemory} />}
        {activeTab === "hosts" && <HostHealthTab data={hostHealth} />}
        {activeTab === "trend" && <CompoundTrendTab data={compoundTrend} />}
      </div>
    </div>
  );
}
