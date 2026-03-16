import { useState, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   DATA — derived from searchProfileFinal shape
   (searchDiscovery.js + discoveryResultProcessor.js)
   ═══════════════════════════════════════════════════════════════════════ */
const MOCK = {
  category: "mouse",
  product_id: "mouse-razer-viper-v3-pro",
  run_id: "run-2026-03-16-001",
  base_model: "Viper V3",
  aliases: ["RVV3P", "Viper V3 Pro"],
  status: "executed",
  provider: "searxng",
  source: "schema4_planner",

  selected_queries: [
    "Razer Viper V3 Pro sensor specifications",
    "Razer Viper V3 Pro weight dimensions",
    "Razer Viper V3 Pro switch type review",
    "Razer Viper V3 Pro polling rate specs site:razer.com",
    "RVV3P sensor DPI rtings",
    "Razer Viper V3 Pro teardown encoder",
  ],
  selected_query_count: 6,
  query_guard: {
    brand_tokens: ["razer"],
    model_tokens: ["viper", "v3", "pro"],
    required_digit_groups: ["3"],
    accepted_query_count: 6,
    rejected_query_count: 2,
  },

  effective_host_plan: {
    host_groups: [
      { host: "razer.com", tier: 1, role: "manufacturer" },
      { host: "rtings.com", tier: 2, role: "lab" },
      { host: "techpowerup.com", tier: 2, role: "lab" },
    ],
  },

  brand_resolution: {
    officialDomain: "razer.com",
    supportDomain: "mysupport.razer.com",
    aliases: ["razerzone.com"],
    confidence: 0.9,
    reasoning: [
      "Razer uses razer.com for product pages",
      "Support portal is mysupport.razer.com",
    ],
  },

  schema4_planner: {
    mode: "llm",
    planner_confidence: 0.82,
    duplicates_suppressed: 3,
    targeted_exceptions: 0,
  },

  schema4_learning: {
    query_hashes_generated: ["a1b2", "c3d4", "e5f6", "g7h8", "i9j0", "k1l2"],
    queries_generated: [
      "Razer Viper V3 Pro sensor specifications",
      "Razer Viper V3 Pro weight dimensions",
      "Razer Viper V3 Pro switch type review",
      "Razer Viper V3 Pro polling rate specs",
      "RVV3P sensor DPI rtings",
      "Razer Viper V3 Pro teardown encoder",
    ],
    families_used: ["manufacturer_html", "review_lookup", "benchmark_lookup", "targeted_single"],
    domains_targeted: ["razer.com", "rtings.com", "techpowerup.com"],
    groups_activated: ["sensor_performance", "construction", "switches"],
    duplicates_suppressed: 3,
  },

  schema4_panel: {
    round: 0,
    round_mode: "seed",
    identity: { state: "locked", manufacturer: "Razer", model: "Viper V3 Pro" },
    summary: { total: 81, resolved: 0, core_unresolved: 12, secondary_unresolved: 24, optional_unresolved: 45 },
    blockers: { missing: 81, weak: 0, conflict: 0, needs_exact_match: 3, search_exhausted: 0 },
    bundles: [
      { key: "sensor_performance", label: "Sensor & Performance", priority: "core", phase: "now", queries: [{ q: "Razer Viper V3 Pro sensor specifications", family: "manufacturer_html" }], fields: [{ key: "sensor_model", state: "missing", bucket: "core" }, { key: "max_dpi", state: "missing", bucket: "core" }] },
      { key: "construction", label: "Construction", priority: "core", phase: "now", queries: [{ q: "Razer Viper V3 Pro weight dimensions", family: "manufacturer_html" }], fields: [{ key: "weight", state: "missing", bucket: "core" }] },
      { key: "switches", label: "Switches", priority: "secondary", phase: "next", queries: [{ q: "Razer Viper V3 Pro switch type review", family: "review_lookup" }], fields: [{ key: "switch_type", state: "missing", bucket: "secondary" }] },
    ],
    profile_influence: {
      manufacturer_html: 2, review_lookup: 1, benchmark_lookup: 1,
      manual_pdf: 0, support_docs: 0, fallback_web: 0, targeted_single: 2,
      duplicates_suppressed: 3, focused_bundles: 3, targeted_exceptions: 0,
      total_queries: 6, trusted_host_share: 2, docs_manual_share: 0,
    },
    deltas: [],
  },

  // Execution results
  query_rows: [
    { query: "Razer Viper V3 Pro sensor specifications", hint_source: "schema4_search_plan", target_fields: ["sensor_model", "max_dpi"], domain_hint: "razer.com", result_count: 8, attempts: 1, providers: ["searxng"], score: 0 },
    { query: "Razer Viper V3 Pro weight dimensions", hint_source: "schema4_search_plan", target_fields: ["weight", "length", "width"], domain_hint: "razer.com", result_count: 12, attempts: 1, providers: ["searxng"], score: 0 },
    { query: "Razer Viper V3 Pro switch type review", hint_source: "schema4_search_plan", target_fields: ["switch_type"], domain_hint: "", result_count: 15, attempts: 1, providers: ["searxng"], score: 0 },
    { query: "Razer Viper V3 Pro polling rate specs site:razer.com", hint_source: "schema4_search_plan", target_fields: ["polling_rate"], domain_hint: "razer.com", result_count: 3, attempts: 1, providers: ["searxng"], score: 0 },
    { query: "RVV3P sensor DPI rtings", hint_source: "schema4_search_plan", target_fields: ["sensor_model", "max_dpi"], domain_hint: "rtings.com", result_count: 5, attempts: 1, providers: ["searxng"], score: 0 },
    { query: "Razer Viper V3 Pro teardown encoder", hint_source: "schema4_search_plan", target_fields: ["encoder_type"], domain_hint: "", result_count: 2, attempts: 1, providers: ["searxng"], score: 0 },
  ],
  query_stats: [],
  discovered_count: 12,
  approved_count: 8,
  candidate_count: 4,
  llm_query_planning: true,
  llm_query_model: "gemini-2.5-flash-lite",
  llm_serp_triage: false,
  llm_serp_triage_model: "",
  serp_explorer: {
    query_count: 6,
    candidates_checked: 45,
    urls_triaged: 18,
    urls_selected: 12,
    urls_rejected: 27,
    dedupe_input: 52,
    dedupe_output: 45,
    duplicates_removed: 7,
    llm_triage_applied: false,
  },
  key: "specs/inputs/_search_profile/mouse/mouse-razer-viper-v3-pro.json",
  run_key: "specs/inputs/_search_profile/mouse/run-2026-03-16-001.json",
  latest_key: "specs/inputs/_search_profile/mouse/mouse-razer-viper-v3-pro.latest.json",
};

/* ═══════════════════════════════════════════════════════════════════════
   THEME — matches BrandResolverPanel
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

function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, fontFamily: font.mono,
      letterSpacing: "0.08em", padding: "3px 9px", borderRadius: 2,
      color, background: `${color}12`, border: `1.5px solid ${color}35`,
    }}>{label}</span>
  );
}

function Stat({ value, label, color }) {
  return (
    <div>
      <div style={{
        fontSize: 30, fontWeight: 700, fontFamily: font.display,
        color, lineHeight: 1,
      }}>{value}</div>
      <div style={{
        fontSize: 10, fontWeight: 600, fontFamily: font.mono,
        color: T.inkSub, textTransform: "uppercase",
        letterSpacing: "0.05em", marginTop: 4,
      }}>{label}</div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, fontFamily: font.mono,
      color: T.ink, letterSpacing: "0.06em", textTransform: "uppercase",
      marginBottom: 14, paddingBottom: 6, borderBottom: `1.5px solid ${T.ink}`,
    }}>{title}</div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 3, padding: "18px 24px", marginBottom: 16,
      ...style,
    }}>{children}</div>
  );
}

function Chip({ text, color }) {
  return (
    <span style={{
      fontSize: 11, fontFamily: font.mono, fontWeight: 500,
      padding: "3px 9px", borderRadius: 2,
      background: color ? `${color}10` : T.surfaceMuted,
      border: `1px solid ${color ? `${color}30` : T.borderLight}`,
      color: color || T.inkSub,
    }}>{text}</span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   A) HERO — product, status, headline stats
   ═══════════════════════════════════════════════════════════════════════ */

function Hero({ data }) {
  const statusColor = data.status === "executed" ? T.resolved : T.weak;
  const sourceLabel = data.source === "schema4_planner" ? "Schema 4" : "Deterministic";
  const confidence = data.schema4_planner?.planner_confidence;

  return (
    <Card style={{ padding: "24px 28px 20px" }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 14,
        marginBottom: 18, flexWrap: "wrap",
      }}>
        <h1 style={{
          fontSize: 24, fontWeight: 700, margin: 0,
          fontFamily: font.display, color: T.ink, lineHeight: 1,
        }}>Search Profile</h1>
        <Badge label={data.status.toUpperCase()} color={statusColor} />
        <Badge label={sourceLabel} color={T.accent} />
        {confidence != null && (
          <span style={{ fontSize: 10, fontFamily: font.mono, color: T.inkFaint }}>
            planner conf {confidence}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 12, fontFamily: font.mono, color: T.inkSub, fontWeight: 500,
        }}>{data.product_id}</span>
      </div>

      <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
        <Stat value={data.selected_query_count} label="Queries executed" color={T.accent} />
        <Stat value={data.discovered_count} label="URLs discovered" color={T.resolved} />
        <Stat value={data.approved_count} label="Approved domains" color={T.info} />
        <Stat
          value={data.query_guard.rejected_query_count}
          label="Queries rejected"
          color={data.query_guard.rejected_query_count > 0 ? T.weak : T.resolved}
        />
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   B) BRAND INTELLIGENCE — what we knew going in
   ═══════════════════════════════════════════════════════════════════════ */

function BrandIntelligence({ data }) {
  const br = data.brand_resolution;
  if (!br) {
    return (
      <Card>
        <SectionHeader title="Brand Intelligence" />
        <span style={{ fontSize: 12, fontFamily: font.body, color: T.inkMuted }}>
          No brand resolution available (brand not in identity lock or resolver skipped)
        </span>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader title="Brand Intelligence" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        {[
          { label: "OFFICIAL DOMAIN", val: br.officialDomain, c: T.accent },
          { label: "SUPPORT DOMAIN", val: br.supportDomain, c: T.info },
          { label: "CONFIDENCE", val: br.confidence, c: br.confidence >= 0.8 ? T.resolved : T.weak },
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

      {/* Aliases row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: font.mono, color: T.inkFaint, letterSpacing: "0.08em", marginBottom: 4 }}>
            BRAND ALIASES
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {br.aliases.map((a, i) => <Chip key={i} text={a} />)}
            {br.aliases.length === 0 && <span style={{ fontSize: 11, color: T.inkFaint }}>none</span>}
          </div>
        </div>
        {data.base_model && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, fontFamily: font.mono, color: T.inkFaint, letterSpacing: "0.08em", marginBottom: 4 }}>
              BASE MODEL
            </div>
            <Chip text={data.base_model} color={T.extra} />
          </div>
        )}
        {data.aliases?.length > 0 && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, fontFamily: font.mono, color: T.inkFaint, letterSpacing: "0.08em", marginBottom: 4 }}>
              PRODUCT ALIASES
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {data.aliases.map((a, i) => <Chip key={i} text={a} color={T.extra} />)}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   C) QUERY PLAN — what we searched for
   ═══════════════════════════════════════════════════════════════════════ */

function QueryPlan({ data }) {
  const rows = data.query_rows || [];
  const totalResults = rows.reduce((s, r) => s + (r.result_count || 0), 0);

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 24px 8px" }}>
        <SectionHeader title={`Query Plan · ${rows.length} queries · ${totalResults} results`} />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["QUERY", "SOURCE", "TARGET FIELDS", "DOMAIN HINT", "RESULTS"].map(h => (
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
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <td style={{
                padding: "7px 24px", fontSize: 12,
                fontFamily: font.mono, fontWeight: 500,
                color: T.ink, maxWidth: 360, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{r.query}</td>
              <td style={{ padding: "7px 24px" }}>
                <span style={{ fontSize: 10, fontFamily: font.mono, color: T.inkMuted }}>{r.hint_source || "—"}</span>
              </td>
              <td style={{ padding: "7px 24px" }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(r.target_fields || []).slice(0, 3).map((f, j) => (
                    <span key={j} style={{
                      fontSize: 9, fontFamily: font.mono, padding: "1px 5px",
                      borderRadius: 2, background: T.surfaceMuted, color: T.inkSub,
                    }}>{f}</span>
                  ))}
                </div>
              </td>
              <td style={{ padding: "7px 24px", fontSize: 11, fontFamily: font.mono, color: r.domain_hint ? T.accent : T.inkFaint }}>
                {r.domain_hint || "—"}
              </td>
              <td style={{
                padding: "7px 24px", fontSize: 13, fontFamily: font.mono, fontWeight: 600,
                color: r.result_count > 0 ? T.resolved : T.conflict,
              }}>{r.result_count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Guard summary */}
      <div style={{
        padding: "10px 24px", background: T.surfaceMuted,
        borderTop: `1px solid ${T.border}`,
        display: "flex", gap: 20, fontSize: 10, fontFamily: font.mono, color: T.inkMuted,
      }}>
        <span>Guard tokens: brand=[{data.query_guard.brand_tokens.join(", ")}] model=[{data.query_guard.model_tokens.join(", ")}]</span>
        <span>Accepted: {data.query_guard.accepted_query_count}</span>
        <span>Rejected: {data.query_guard.rejected_query_count}</span>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   D) DISCOVERY SCORECARD — what the search found
   ═══════════════════════════════════════════════════════════════════════ */

function DiscoveryScorecard({ data }) {
  const se = data.serp_explorer || {};
  const triageMethod = se.llm_triage_applied ? "LLM" : "Deterministic";

  return (
    <Card>
      <SectionHeader title="Discovery Scorecard" />

      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 16 }}>
        <Stat value={se.candidates_checked || 0} label="Candidates checked" color={T.inkSub} />
        <Stat value={se.dedupe_output || 0} label="After dedup" color={T.inkSub} />
        <Stat value={se.urls_triaged || 0} label="Triaged" color={T.accent} />
        <Stat value={data.discovered_count} label="Discovered" color={T.resolved} />
        <Stat value={se.urls_rejected || 0} label="Rejected" color={T.conflict} />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12,
      }}>
        {[
          { label: "APPROVED URLS", val: data.approved_count, c: T.resolved },
          { label: "CANDIDATE URLS", val: data.candidate_count, c: T.weak },
          { label: "TRIAGE METHOD", val: triageMethod, c: T.accent },
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
              fontSize: 18, fontFamily: font.mono, fontWeight: 600, color: d.c,
            }}>{d.val}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   E) PLANNER DECISIONS — Schema 4 intelligence
   ═══════════════════════════════════════════════════════════════════════ */

function PlannerDecisions({ data }) {
  const planner = data.schema4_planner;
  const learning = data.schema4_learning;
  const panel = data.schema4_panel;

  if (!planner) {
    return (
      <Card>
        <SectionHeader title="Planner Decisions" />
        <span style={{ fontSize: 12, fontFamily: font.body, color: T.inkMuted }}>
          Schema 4 planner not active — deterministic fallback path used
        </span>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader title="Planner Decisions · Schema 4" />

      {/* Planner stats row */}
      <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
        <Badge label={`MODE: ${planner.mode.toUpperCase()}`} color={T.accent} />
        <span style={{ fontSize: 11, fontFamily: font.mono, color: T.inkSub }}>
          confidence: <strong style={{ color: planner.planner_confidence >= 0.7 ? T.resolved : T.weak }}>{planner.planner_confidence}</strong>
        </span>
        <span style={{ fontSize: 11, fontFamily: font.mono, color: T.inkSub }}>
          dupes suppressed: {planner.duplicates_suppressed}
        </span>
        {planner.targeted_exceptions > 0 && (
          <span style={{ fontSize: 11, fontFamily: font.mono, color: T.extra }}>
            exceptions: {planner.targeted_exceptions}
          </span>
        )}
      </div>

      {/* Profile influence breakdown */}
      {panel?.profile_influence && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, fontFamily: font.mono,
            color: T.inkFaint, letterSpacing: "0.08em", marginBottom: 8,
          }}>QUERY FAMILY MIX</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["manufacturer_html", "review_lookup", "benchmark_lookup", "manual_pdf", "support_docs", "fallback_web", "targeted_single"]
              .filter(f => (panel.profile_influence[f] || 0) > 0)
              .map(f => (
                <span key={f} style={{
                  fontSize: 11, fontFamily: font.mono, fontWeight: 500,
                  padding: "3px 9px", borderRadius: 2,
                  background: `${T.accent}10`, border: `1px solid ${T.accent}25`,
                  color: T.accent,
                }}>{f.replace(/_/g, " ")} ({panel.profile_influence[f]})</span>
              ))
            }
          </div>
        </div>
      )}

      {/* Learning writeback */}
      {learning && (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, fontFamily: font.mono, color: T.inkFaint, letterSpacing: "0.08em", marginBottom: 4 }}>
              FAMILIES USED
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {learning.families_used.map((f, i) => <Chip key={i} text={f} color={T.accent} />)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, fontFamily: font.mono, color: T.inkFaint, letterSpacing: "0.08em", marginBottom: 4 }}>
              DOMAINS TARGETED
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {learning.domains_targeted.map((d, i) => <Chip key={i} text={d} color={T.info} />)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, fontFamily: font.mono, color: T.inkFaint, letterSpacing: "0.08em", marginBottom: 4 }}>
              GROUPS ACTIVATED
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {learning.groups_activated.map((g, i) => <Chip key={i} text={g} color={T.extra} />)}
            </div>
          </div>
        </div>
      )}

      {/* Bundles summary */}
      {panel?.bundles?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, fontFamily: font.mono,
            color: T.inkFaint, letterSpacing: "0.08em", marginBottom: 8,
          }}>FOCUS GROUP BUNDLES</div>
          {panel.bundles.map((b, i) => (
            <div key={i} style={{
              display: "flex", gap: 10, alignItems: "baseline",
              padding: "5px 0",
              borderBottom: i < panel.bundles.length - 1 ? `1px solid ${T.borderLight}` : "none",
            }}>
              <Badge label={b.phase.toUpperCase()} color={b.phase === "now" ? T.resolved : b.phase === "next" ? T.weak : T.inkFaint} />
              <span style={{ fontSize: 12, fontFamily: font.body, fontWeight: 600, color: T.ink, minWidth: 160 }}>
                {b.label}
              </span>
              <span style={{ fontSize: 10, fontFamily: font.mono, color: T.inkMuted }}>
                {b.queries.length} queries · {(b.fields || []).filter(f => f.state === "missing").length} missing fields
              </span>
              <Badge label={b.priority.toUpperCase()} color={b.priority === "core" ? T.accent : T.inkFaint} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   F) DEBUG
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

export default function SearchProfilePanel() {
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
      <BrandIntelligence data={d} />
      <QueryPlan data={d} />
      <DiscoveryScorecard data={d} />
      <PlannerDecisions data={d} />
      <Debug data={d} />
    </div>
  );
}
