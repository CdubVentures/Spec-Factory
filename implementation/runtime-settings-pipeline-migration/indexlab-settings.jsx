import { useState, useEffect, useRef } from "react";

const SECTIONS = [
  {
    id: "needset",
    label: "NeedSet Engine",
    phase: "01",
    status: "near-complete",
    icon: "⬡",
    color: "#8B6914",
    groups: [
      {
        label: "Formula Multipliers",
        settings: [
          { id: "ns_tier_weight", label: "Tier Weight", type: "slider", min: 0, max: 2, step: 0.05, value: 1.2, unit: "×" },
          { id: "ns_identity_weight", label: "Identity Weight", type: "slider", min: 0, max: 2, step: 0.05, value: 1.5, unit: "×" },
          { id: "ns_freshness_weight", label: "Freshness Weight", type: "slider", min: 0, max: 2, step: 0.05, value: 0.8, unit: "×" },
          { id: "ns_penalty_weight", label: "Penalty Weight", type: "slider", min: 0, max: 1, step: 0.05, value: 0.3, unit: "×" },
        ],
      },
      {
        label: "Decay & Freshness",
        settings: [
          { id: "ns_decay_half_life", label: "Decay Half-Life", type: "number", value: 72, unit: "hrs" },
          { id: "ns_decay_floor", label: "Decay Floor", type: "slider", min: 0, max: 1, step: 0.01, value: 0.15, unit: "" },
          { id: "ns_freshness_threshold", label: "Fresh Threshold", type: "number", value: 24, unit: "hrs" },
        ],
      },
      {
        label: "Identity Lock States",
        settings: [
          { id: "ns_locked_cap", label: "Locked Cap", type: "slider", min: 0, max: 1, step: 0.01, value: 1.0, unit: "" },
          { id: "ns_provisional_cap", label: "Provisional Cap", type: "slider", min: 0, max: 1, step: 0.01, value: 0.75, unit: "" },
          { id: "ns_conflict_cap", label: "Conflict Cap", type: "slider", min: 0, max: 1, step: 0.01, value: 0.4, unit: "" },
          { id: "ns_snippet_lineage", label: "Snippet Timestamp Lineage", type: "toggle", value: false },
        ],
      },
    ],
  },
  {
    id: "searchprofile",
    label: "SearchProfile & Aliases",
    phase: "02",
    status: "complete",
    icon: "◈",
    color: "#1A6B3C",
    groups: [
      {
        label: "Query Generation",
        settings: [
          { id: "sp_model", label: "Planner Model", type: "select", value: "claude-sonnet-4-6", options: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"] },
          { id: "sp_max_tokens", label: "Max Tokens", type: "number", value: 1024, unit: "tok" },
          { id: "sp_alias_count", label: "Alias Count", type: "number", value: 8, unit: "" },
          { id: "sp_deterministic_aliases", label: "Deterministic Aliases", type: "toggle", value: true },
          { id: "sp_planner_enabled", label: "LLM Planner Enabled", type: "toggle", value: true },
        ],
      },
      {
        label: "Query Rows",
        settings: [
          { id: "sp_target_fields_required", label: "Require target_fields", type: "toggle", value: true },
          { id: "sp_max_query_rows", label: "Max Query Rows", type: "number", value: 20, unit: "" },
          { id: "sp_dedupe_window", label: "Dedupe Window", type: "number", value: 5, unit: "min" },
        ],
      },
    ],
  },
  {
    id: "serp",
    label: "SERP & Reranker",
    phase: "03",
    status: "complete",
    icon: "⊛",
    color: "#1A6B3C",
    groups: [
      {
        label: "Provider Search",
        settings: [
          { id: "serp_providers", label: "Active Providers", type: "chips", value: ["google", "bing", "brave"], options: ["google", "bing", "brave", "ddg", "serper"] },
          { id: "serp_results_per_provider", label: "Results per Provider", type: "number", value: 10, unit: "" },
          { id: "serp_dedupe_enabled", label: "Cross-Provider Dedupe", type: "toggle", value: true },
        ],
      },
      {
        label: "Reranker",
        settings: [
          { id: "serp_tier_weight", label: "Tier Score Weight", type: "slider", min: 0, max: 1, step: 0.05, value: 0.45, unit: "" },
          { id: "serp_identity_weight", label: "Identity Score Weight", type: "slider", min: 0, max: 1, step: 0.05, value: 0.35, unit: "" },
          { id: "serp_penalty_weight", label: "Penalty Weight", type: "slider", min: 0, max: 1, step: 0.05, value: 0.2, unit: "" },
          { id: "serp_safety_filter", label: "Safety Filter", type: "toggle", value: true },
          { id: "serp_score_breakdown", label: "Emit Score Breakdown", type: "toggle", value: true },
        ],
      },
    ],
  },
  {
    id: "urlhealth",
    label: "URL Health & Repair",
    phase: "04",
    status: "partial",
    icon: "⬢",
    color: "#8B3A1A",
    groups: [
      {
        label: "Host Budgets",
        settings: [
          { id: "uh_host_budget_default", label: "Default Host Budget", type: "number", value: 50, unit: "req/hr" },
          { id: "uh_cooldown_min", label: "Min Cooldown", type: "number", value: 60, unit: "sec" },
          { id: "uh_cooldown_max", label: "Max Cooldown", type: "number", value: 3600, unit: "sec" },
          { id: "uh_budget_telemetry", label: "Budget Telemetry", type: "toggle", value: true },
        ],
      },
      {
        label: "Repair Queue",
        settings: [
          { id: "uh_repair_auto_enqueue", label: "Auto-Enqueue Repair Signals", type: "toggle", value: false },
          { id: "uh_repair_dedupe_key", label: "Deterministic Dedupe Keys", type: "toggle", value: true },
          { id: "uh_repair_priority", label: "Repair Priority", type: "select", value: "normal", options: ["low", "normal", "high", "critical"] },
        ],
      },
    ],
  },
  {
    id: "fetchscheduler",
    label: "Fetch Scheduler",
    phase: "05",
    status: "complete",
    icon: "⟳",
    color: "#1A6B3C",
    groups: [
      {
        label: "Concurrency",
        settings: [
          { id: "fs_max_concurrent", label: "Max Concurrent Fetches", type: "number", value: 12, unit: "" },
          { id: "fs_host_pacer_window", label: "Host Pacer Window", type: "number", value: 1000, unit: "ms" },
          { id: "fs_host_max_per_window", label: "Max Reqs / Window", type: "number", value: 3, unit: "" },
        ],
      },
      {
        label: "Fallback Policy",
        settings: [
          { id: "fs_fallback_403", label: "Fallback on 403", type: "toggle", value: true },
          { id: "fs_fallback_timeout", label: "Fallback on Timeout", type: "toggle", value: true },
          { id: "fs_fallback_5xx", label: "Fallback on 5xx", type: "toggle", value: true },
          { id: "fs_fallback_network", label: "Fallback on Network Error", type: "toggle", value: true },
          { id: "fs_fetch_timeout", label: "Fetch Timeout", type: "number", value: 15000, unit: "ms" },
        ],
      },
    ],
  },
  {
    id: "evidence",
    label: "Evidence Index",
    phase: "06A",
    status: "complete",
    icon: "◉",
    color: "#1A6B3C",
    groups: [
      {
        label: "FTS & Storage",
        settings: [
          { id: "ev_fts_enabled", label: "FTS5 Retrieval", type: "toggle", value: true },
          { id: "ev_snippet_max_len", label: "Max Snippet Length", type: "number", value: 512, unit: "chars" },
          { id: "ev_dedupe_threshold", label: "Dedupe Similarity Threshold", type: "slider", min: 0, max: 1, step: 0.01, value: 0.85, unit: "" },
          { id: "ev_stable_ids", label: "Stable Snippet IDs", type: "toggle", value: true },
        ],
      },
    ],
  },
  {
    id: "autoqueue",
    label: "Automation Queue",
    phase: "06B",
    status: "partial",
    icon: "⬟",
    color: "#8B3A1A",
    groups: [
      {
        label: "Worker Lifecycle",
        settings: [
          { id: "aq_ttl", label: "Item TTL", type: "number", value: 86400, unit: "sec" },
          { id: "aq_max_retries", label: "Max Retries", type: "number", value: 5, unit: "" },
          { id: "aq_backoff_base", label: "Backoff Base", type: "number", value: 2000, unit: "ms" },
          { id: "aq_backoff_max", label: "Backoff Max", type: "number", value: 60000, unit: "ms" },
          { id: "aq_worker_poll_interval", label: "Poll Interval", type: "number", value: 5000, unit: "ms" },
        ],
      },
    ],
  },
  {
    id: "retrieval",
    label: "Tier Retrieval",
    phase: "07",
    status: "complete",
    icon: "▣",
    color: "#1A6B3C",
    groups: [
      {
        label: "Tier Routing",
        settings: [
          { id: "ret_tier_1_weight", label: "Tier 1 Preference", type: "slider", min: 0, max: 2, step: 0.1, value: 1.5, unit: "×" },
          { id: "ret_tier_2_weight", label: "Tier 2 Preference", type: "slider", min: 0, max: 2, step: 0.1, value: 1.0, unit: "×" },
          { id: "ret_prime_source_min", label: "Prime Source Min Score", type: "slider", min: 0, max: 1, step: 0.01, value: 0.6, unit: "" },
          { id: "ret_miss_diagnostics", label: "Emit Miss Diagnostics", type: "toggle", value: true },
        ],
      },
    ],
  },
  {
    id: "extraction",
    label: "Extraction Context",
    phase: "08",
    status: "complete",
    icon: "◎",
    color: "#1A6B3C",
    groups: [
      {
        label: "Context Assembly",
        settings: [
          { id: "ex_identity_gating", label: "Identity Uncertainty Gating", type: "toggle", value: true },
          { id: "ex_ambiguity_threshold", label: "Ambiguity Threshold", type: "slider", min: 0, max: 1, step: 0.01, value: 0.35, unit: "" },
          { id: "ex_max_evidence_items", label: "Max Evidence Items", type: "number", value: 25, unit: "" },
          { id: "ex_rule_aware", label: "Rule-Aware Processing", type: "toggle", value: true },
          { id: "ex_structured_output", label: "Structured Output", type: "toggle", value: true },
        ],
      },
      {
        label: "Visual Assets (08B)",
        settings: [
          { id: "ex_visual_enabled", label: "Visual Evidence Enabled", type: "toggle", value: false },
          { id: "ex_visual_quality_gate", label: "Quality Gate Score", type: "slider", min: 0, max: 1, step: 0.01, value: 0.7, unit: "" },
          { id: "ex_visual_target_match", label: "Target-Match Gate", type: "toggle", value: false },
          { id: "ex_screenshot_queue_max", label: "Screenshot Queue Limit", type: "number", value: 10, unit: "" },
        ],
      },
    ],
  },
  {
    id: "convergence",
    label: "Convergence Loop",
    phase: "09",
    status: "complete",
    icon: "⊕",
    color: "#1A6B3C",
    groups: [
      {
        label: "Stop Conditions",
        settings: [
          { id: "cv_max_rounds", label: "Max Rounds", type: "number", value: 6, unit: "" },
          { id: "cv_confidence_threshold", label: "Confidence Threshold", type: "slider", min: 0, max: 1, step: 0.01, value: 0.88, unit: "" },
          { id: "cv_stall_rounds", label: "Stall Tolerance", type: "number", value: 2, unit: "rounds" },
          { id: "cv_query_dedupe", label: "Round Query Dedupe", type: "toggle", value: true },
          { id: "cv_escalation_path", label: "Escalation on Stall", type: "toggle", value: true },
        ],
      },
    ],
  },
  {
    id: "learning",
    label: "Learning & Compounding",
    phase: "10",
    status: "complete",
    icon: "⟐",
    color: "#1A6B3C",
    groups: [
      {
        label: "Stores & Decay",
        settings: [
          { id: "lrn_decay_enabled", label: "Decay-Aware Readback", type: "toggle", value: true },
          { id: "lrn_decay_rate", label: "Learning Decay Rate", type: "slider", min: 0, max: 1, step: 0.01, value: 0.05, unit: "/day" },
          { id: "lrn_lexicon_enrich", label: "Discovery Lexicon Enrichment", type: "toggle", value: true },
          { id: "lrn_store_count", label: "Active Store Count", type: "number", value: 4, unit: "" },
        ],
      },
    ],
  },
  {
    id: "lanes",
    label: "Lane Manager",
    phase: "11",
    status: "near-complete",
    icon: "⋮⋮",
    color: "#8B6914",
    groups: [
      {
        label: "Lane Concurrency",
        settings: [
          { id: "ln_fetch_concurrency", label: "Fetch Lane Concurrency", type: "number", value: 4, unit: "" },
          { id: "ln_extract_concurrency", label: "Extract Lane Concurrency", type: "number", value: 2, unit: "" },
          { id: "ln_search_concurrency", label: "Search Lane Concurrency", type: "number", value: 3, unit: "" },
          { id: "ln_learn_concurrency", label: "Learning Lane Concurrency", type: "number", value: 1, unit: "" },
        ],
      },
      {
        label: "Governance",
        settings: [
          { id: "ln_knob_telemetry", label: "Per-Run Knob Telemetry", type: "toggle", value: false },
          { id: "ln_governance_checks", label: "CI Governance Checks", type: "toggle", value: true },
          { id: "ln_pause_resume", label: "Allow Pause/Resume", type: "toggle", value: true },
        ],
      },
    ],
  },
  {
    id: "batch",
    label: "Batch Automation",
    phase: "12",
    status: "complete",
    icon: "⊞",
    color: "#1A6B3C",
    groups: [
      {
        label: "Orchestration",
        settings: [
          { id: "bt_max_batch_size", label: "Max Batch Size", type: "number", value: 100, unit: "items" },
          { id: "bt_concurrency", label: "Batch Concurrency", type: "number", value: 5, unit: "" },
          { id: "bt_retry_failed", label: "Retry Failed Items", type: "toggle", value: true },
          { id: "bt_emit_lifecycle", label: "Emit Lifecycle Events", type: "toggle", value: true },
        ],
      },
    ],
  },
  {
    id: "ops",
    label: "Runtime Ops",
    phase: "13",
    status: "complete",
    icon: "⬗",
    color: "#1A6B3C",
    groups: [
      {
        label: "Diagnostics",
        settings: [
          { id: "ops_trace_enabled", label: "Runtime Trace", type: "toggle", value: true },
          { id: "ops_ring_buffer_size", label: "Ring Buffer Size", type: "number", value: 500, unit: "events" },
          { id: "ops_screencast_enabled", label: "Live Screencast", type: "toggle", value: false },
          { id: "ops_worker_drilldown", label: "Worker Drill-Down", type: "toggle", value: true },
          { id: "ops_readonly_mode", label: "Read-Only Mode", type: "toggle", value: false },
        ],
      },
    ],
  },
];

const STATUS_META = {
  complete: { label: "Complete", dot: "#3ddc84", bg: "rgba(61,220,132,0.1)" },
  "near-complete": { label: "Near", dot: "#f5a623", bg: "rgba(245,166,35,0.1)" },
  partial: { label: "Partial", dot: "#e25c3a", bg: "rgba(226,92,58,0.1)" },
};

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: value ? "#c8923a" : "#2a2822",
        border: "1px solid " + (value ? "#c8923a" : "#3d3b35"),
        cursor: "pointer", position: "relative",
        transition: "all 0.2s ease", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2,
        left: value ? 22 : 2, width: 18, height: 18,
        borderRadius: "50%", background: value ? "#fff" : "#666",
        transition: "all 0.2s ease",
      }} />
    </button>
  );
}

function Slider({ value, min, max, step, unit, onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
      <div style={{ position: "relative", flex: 1, height: 4 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 2, background: "#2a2822", border: "1px solid #3d3b35" }} />
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: pct + "%", borderRadius: 2, background: "linear-gradient(90deg, #8B6914, #c8923a)" }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer", height: "100%" }} />
      </div>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#c8923a", minWidth: 48, textAlign: "right" }}>
        {value}{unit}
      </span>
    </div>
  );
}

function NumberInput({ value, unit, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input type="number" value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          background: "#1a1914", border: "1px solid #3d3b35",
          color: "#e8e4d8", fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 13, padding: "4px 10px", borderRadius: 4,
          width: 90, textAlign: "right", outline: "none",
        }} />
      {unit && <span style={{ color: "#666", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>{unit}</span>}
    </div>
  );
}

function SelectInput({ value, options, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        background: "#1a1914", border: "1px solid #3d3b35",
        color: "#e8e4d8", fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12, padding: "4px 10px", borderRadius: 4, outline: "none",
        cursor: "pointer",
      }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ChipsInput({ value, options, onChange }) {
  const toggle = (chip) => {
    if (value.includes(chip)) onChange(value.filter(v => v !== chip));
    else onChange([...value, chip]);
  };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(o => (
        <button key={o} onClick={() => toggle(o)} style={{
          padding: "3px 10px", borderRadius: 12,
          border: "1px solid " + (value.includes(o) ? "#c8923a" : "#3d3b35"),
          background: value.includes(o) ? "rgba(200,146,58,0.15)" : "transparent",
          color: value.includes(o) ? "#c8923a" : "#666",
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
          cursor: "pointer", transition: "all 0.15s",
        }}>{o}</button>
      ))}
    </div>
  );
}

function SettingRow({ setting, value, onChange }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderBottom: "1px solid #1e1d19", gap: 16,
    }}>
      <label style={{ color: "#a8a49a", fontSize: 13, letterSpacing: "0.01em", flex: 1 }}>
        {setting.label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: setting.type === "slider" ? 1.2 : 0 }}>
        {setting.type === "toggle" && <Toggle value={value} onChange={onChange} />}
        {setting.type === "slider" && <Slider value={value} min={setting.min} max={setting.max} step={setting.step} unit={setting.unit} onChange={onChange} />}
        {setting.type === "number" && <NumberInput value={value} unit={setting.unit} onChange={onChange} />}
        {setting.type === "select" && <SelectInput value={value} options={setting.options} onChange={onChange} />}
        {setting.type === "chips" && <ChipsInput value={value} options={setting.options} onChange={onChange} />}
      </div>
    </div>
  );
}

function SettingsPanel({ section, values, onChange }) {
  const meta = STATUS_META[section.status];
  return (
    <div style={{ padding: "0 32px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, paddingTop: 32 }}>
        <span style={{ fontSize: 28, color: section.color, opacity: 0.8 }}>{section.icon}</span>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#e8e4d8", letterSpacing: "0.05em" }}>
            {section.label}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#555" }}>PHASE {section.phase}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", padding: "2px 8px", borderRadius: 4, background: meta.bg, color: meta.dot }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.dot, display: "inline-block" }} />
              {meta.label}
            </span>
          </div>
        </div>
      </div>

      {section.groups.map(group => (
        <div key={group.label} style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4, paddingBottom: 8, borderBottom: "1px solid #252420" }}>
            {group.label}
          </div>
          {group.settings.map(s => (
            <SettingRow key={s.id} setting={s} value={values[s.id] ?? s.value} onChange={v => onChange(s.id, v)} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function IndexLabSettings() {
  const [active, setActive] = useState("needset");
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const saveTimer = useRef(null);

  const handleChange = (id, val) => {
    setValues(v => ({ ...v, [id]: val }));
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaved(true), 800);
  };

  const activeSection = SECTIONS.find(s => s.id === active);

  const filtered = search.trim().length > 1
    ? SECTIONS.flatMap(s => s.groups.flatMap(g => g.settings.map(st => ({ ...st, section: s.label })))).filter(st => st.label.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #13120f; }
        ::-webkit-scrollbar-thumb { background: #2a2822; border-radius: 2px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #c8923a; cursor: pointer; border: 2px solid #13120f; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.3; }
        select option { background: #1a1914; }
      `}</style>
      <div style={{
        display: "flex", height: "100vh", background: "#13120f",
        fontFamily: "'IBM Plex Mono', monospace", overflow: "hidden",
      }}>
        {/* Sidebar */}
        <div style={{
          width: 240, background: "#0e0d0b", borderRight: "1px solid #252420",
          display: "flex", flexDirection: "column", flexShrink: 0,
        }}>
          {/* Header */}
          <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #252420" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#c8923a", letterSpacing: "0.1em" }}>INDEX</span>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#e8e4d8", letterSpacing: "0.1em" }}>LAB</span>
            </div>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.12em", marginTop: 2 }}>PIPELINE SETTINGS</div>
          </div>

          {/* Search */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #252420" }}>
            <input
              placeholder="Search settings..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", background: "#1a1914", border: "1px solid #2a2822",
                borderRadius: 4, color: "#a8a49a", fontSize: 11, padding: "7px 10px",
                outline: "none", fontFamily: "'IBM Plex Mono', monospace",
              }} />
          </div>

          {/* Nav */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {SECTIONS.map(s => {
              const meta = STATUS_META[s.status];
              const isActive = active === s.id && !search;
              return (
                <button key={s.id} onClick={() => { setActive(s.id); setSearch(""); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "9px 20px",
                    background: isActive ? "rgba(200,146,58,0.08)" : "transparent",
                    border: "none", borderLeft: isActive ? "2px solid #c8923a" : "2px solid transparent",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                    transition: "all 0.15s",
                  }}>
                  <span style={{ fontSize: 14, color: isActive ? "#c8923a" : "#444" }}>{s.icon}</span>
                  <span style={{ fontSize: 12, color: isActive ? "#e8e4d8" : "#666", flex: 1, letterSpacing: "0.01em" }}>{s.label}</span>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.dot, flexShrink: 0, opacity: 0.7 }} />
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid #252420", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, color: "#333", letterSpacing: "0.08em" }}>2026-02-24</span>
            {saved && <span style={{ fontSize: 9, color: "#3ddc84", letterSpacing: "0.05em" }}>● SAVED</span>}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Top bar */}
          <div style={{
            position: "sticky", top: 0, zIndex: 10,
            background: "rgba(19,18,15,0.95)", backdropFilter: "blur(8px)",
            borderBottom: "1px solid #252420", padding: "0 32px",
            display: "flex", alignItems: "center", justifyContent: "space-between", height: 52,
          }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              {/* Status summary */}
              {Object.entries(STATUS_META).map(([k, v]) => {
                const count = SECTIONS.filter(s => s.status === k).length;
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: v.dot, display: "inline-block" }} />
                    <span style={{ fontSize: 10, color: "#555" }}>{count} {v.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{
                padding: "6px 16px", borderRadius: 4, border: "1px solid #3d3b35",
                background: "transparent", color: "#666", fontSize: 11, cursor: "pointer",
                fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.05em",
              }}>Reset</button>
              <button style={{
                padding: "6px 16px", borderRadius: 4, border: "none",
                background: "#c8923a", color: "#13120f", fontSize: 11, cursor: "pointer",
                fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, letterSpacing: "0.05em",
              }}>Export Config</button>
            </div>
          </div>

          {/* Search results */}
          {search.trim().length > 1 ? (
            <div style={{ padding: "32px" }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 20 }}>
                SEARCH RESULTS FOR "{search.toUpperCase()}"
              </div>
              {filtered.length === 0 && <div style={{ color: "#444", fontSize: 13 }}>No settings found.</div>}
              {filtered.map(st => (
                <div key={st.id} style={{ marginBottom: 2 }}>
                  <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.08em", marginBottom: 2 }}>{st.section.toUpperCase()}</div>
                  <SettingRow setting={st} value={values[st.id] ?? st.value} onChange={v => handleChange(st.id, v)} />
                </div>
              ))}
            </div>
          ) : activeSection ? (
            <SettingsPanel section={activeSection} values={values} onChange={handleChange} />
          ) : null}
        </div>
      </div>
    </>
  );
}
