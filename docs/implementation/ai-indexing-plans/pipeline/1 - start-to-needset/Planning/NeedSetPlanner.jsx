import { useState, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   MOCK DATA — swap with real computeNeedSet() output
   ═══════════════════════════════════════════════════════════════════════ */
const MOCK = {
  round: 0,
  round_mode: "seed",
  identity: {
    state: "provisional",
    manufacturer: "Logitech",
    model: "G Pro X Superlight 2",
    confidence: 0.82,
    official_domain: "logitechg.com",
    support_domain: "support.logi.com",
  },
  summary: {
    total: 80,
    resolved: 14,
    core_total: 6, core_unresolved: 2,
    secondary_total: 27, secondary_unresolved: 18,
    optional_total: 47, optional_unresolved: 46,
    conflicts: 1,
  },
  blockers: {
    missing: 62,
    weak: 4,
    conflict: 1,
    needs_exact_match: 3,
    search_exhausted: 0,
  },
  profile_influence: {
    manufacturer_html: 4,
    manual_pdf: 2,
    support_docs: 2,
    fallback_web: 1,
    targeted_single: 1,
    duplicates_suppressed: 3,
    focused_bundles: 5,
    targeted_exceptions: 1,
    total_queries: 10,
    trusted_host_share: 5,
    docs_manual_share: 2,
  },
  bundles: [
    {
      key: "core_specs",
      label: "Core Specs",
      desc: "DPI, sensor, polling rate, weight — critical identifiers",
      priority: "core",
      phase: "now",
      source_target: "manufacturer HTML",
      content_target: "spec pages, product listing",
      search_intent: "manufacturer specs + product page confirmation",
      host_class: "official / support",
      query_family_mix: "2 manufacturer HTML",
      reason_active: "2 core fields still unresolved",
      queries: [
        { q: "logitech g pro x superlight 2 specs", family: "manufacturer_html" },
        { q: "g pro x superlight 2 sensor dpi polling rate", family: "manufacturer_html" },
      ],
      fields: [
        { key: "dpi", state: "satisfied", bucket: "core" },
        { key: "sensor_brand", state: "missing", bucket: "core" },
        { key: "sensor_model", state: "missing", bucket: "core" },
        { key: "polling_rate", state: "satisfied", bucket: "core" },
        { key: "weight", state: "satisfied", bucket: "secondary" },
        { key: "cable_type", state: "weak", bucket: "secondary" },
      ],
    },
    {
      key: "docs_manual",
      label: "Docs & Manuals",
      desc: "Official PDF, support pages, spec sheets",
      priority: "secondary",
      phase: "now",
      source_target: "support domain, PDF",
      content_target: "manual PDF, support article",
      search_intent: "official documentation + support article retrieval",
      host_class: "support / PDF",
      query_family_mix: "1 manual/PDF, 1 support docs",
      reason_active: "3 secondary doc fields missing",
      queries: [
        { q: "logitech g pro x superlight 2 manual pdf", family: "manual_pdf" },
        { q: "support.logi.com g pro x superlight 2", family: "support_docs" },
      ],
      fields: [
        { key: "manual_link", state: "missing", bucket: "secondary" },
        { key: "spec_sheet_url", state: "missing", bucket: "secondary" },
        { key: "support_page", state: "missing", bucket: "secondary" },
        { key: "firmware_version", state: "missing", bucket: "optional" },
        { key: "software_name", state: "weak", bucket: "optional" },
        { key: "driver_url", state: "missing", bucket: "optional" },
      ],
    },
    {
      key: "connectivity",
      label: "Connectivity & Platform",
      desc: "Wireless tech, USB, Bluetooth, compatibility",
      priority: "secondary",
      phase: "now",
      source_target: "manufacturer HTML, reviews",
      content_target: "product pages, spec comparison",
      search_intent: "connectivity + platform compatibility confirmation",
      host_class: "official / review",
      query_family_mix: "1 manufacturer HTML, 1 support docs",
      reason_active: "3 secondary connectivity fields missing",
      queries: [
        { q: "g pro x superlight 2 connectivity usb bluetooth", family: "manufacturer_html" },
        { q: "g pro x superlight 2 dongle usb-c compatibility", family: "support_docs" },
      ],
      fields: [
        { key: "bluetooth", state: "satisfied", bucket: "secondary" },
        { key: "wireless_type", state: "satisfied", bucket: "secondary" },
        { key: "usb_type", state: "missing", bucket: "secondary" },
        { key: "dongle_type", state: "missing", bucket: "secondary" },
        { key: "mouse_side_connector", state: "missing", bucket: "expected" },
        { key: "computer_side_connector", state: "satisfied", bucket: "expected" },
        { key: "os_compatibility", state: "missing", bucket: "optional" },
      ],
    },
    {
      key: "buttons_switches",
      label: "Buttons & Switches",
      desc: "Main clicks, side buttons, scroll, switches, encoder",
      priority: "secondary",
      phase: "next",
      source_target: "reviews, teardowns",
      content_target: "review articles, video teardowns",
      search_intent: "switch brand/type confirmation + encoder identification",
      host_class: "review / teardown",
      query_family_mix: "1 fallback web",
      reason_active: "2 core button fields missing + 1 conflict",
      queries: [
        { q: "g pro x superlight 2 switches buttons encoder teardown", family: "fallback_web" },
      ],
      fields: [
        { key: "main_buttons", state: "missing", bucket: "core" },
        { key: "side_buttons", state: "missing", bucket: "core" },
        { key: "switch_brand", state: "conflict", bucket: "secondary" },
        { key: "switch_type", state: "missing", bucket: "secondary" },
        { key: "switch_durability", state: "missing", bucket: "optional" },
        { key: "encoder", state: "missing", bucket: "optional" },
        { key: "encoder_brand", state: "missing", bucket: "optional" },
        { key: "encoder_type", state: "missing", bucket: "optional" },
        { key: "scroll_type", state: "missing", bucket: "optional" },
        { key: "hot_swappable", state: "missing", bucket: "optional" },
        { key: "debounce", state: "missing", bucket: "optional" },
        { key: "adjustable_scroll_wheel", state: "missing", bucket: "optional" },
      ],
    },
    {
      key: "ergonomics",
      label: "Ergonomics & Design",
      desc: "Shape, grip, dimensions, materials, coating",
      priority: "optional",
      phase: "next",
      source_target: "reviews, manufacturer HTML",
      content_target: "review articles, product pages",
      search_intent: "physical dimensions + grip/shape details",
      host_class: "review / official",
      query_family_mix: "1 manufacturer HTML",
      reason_active: "2 secondary ergonomic fields missing",
      queries: [
        { q: "g pro x superlight 2 dimensions grip shape weight", family: "manufacturer_html" },
      ],
      fields: [
        { key: "form_factor", state: "missing", bucket: "secondary" },
        { key: "grip_style", state: "missing", bucket: "secondary" },
        { key: "length_mm", state: "missing", bucket: "optional" },
        { key: "width_mm", state: "missing", bucket: "optional" },
        { key: "height_mm", state: "missing", bucket: "optional" },
        { key: "coating", state: "missing", bucket: "optional" },
        { key: "foot_material", state: "missing", bucket: "optional" },
        { key: "colors", state: "weak", bucket: "optional" },
        { key: "design", state: "missing", bucket: "optional" },
        { key: "material", state: "missing", bucket: "optional" },
        { key: "shell_material", state: "missing", bucket: "optional" },
        { key: "front_flare", state: "missing", bucket: "optional" },
      ],
    },
    {
      key: "performance",
      label: "Sensor / Performance",
      desc: "Latency, LOD, angle snapping, motion sync, onboard memory",
      priority: "optional",
      phase: "next",
      source_target: "reviews, benchmarks",
      content_target: "benchmark articles, review data",
      search_intent: "latency benchmarks + sensor feature confirmation",
      host_class: "review / benchmark",
      query_family_mix: "1 targeted single",
      reason_active: "click_latency weak + 7 optional perf fields missing",
      queries: [
        { q: "g pro x superlight 2 click latency lod motion sync", family: "targeted_single" },
      ],
      fields: [
        { key: "click_latency", state: "weak", bucket: "optional" },
        { key: "click_latency_list", state: "missing", bucket: "optional" },
        { key: "lod", state: "missing", bucket: "optional" },
        { key: "angle_snapping", state: "missing", bucket: "optional" },
        { key: "motion_sync", state: "missing", bucket: "optional" },
        { key: "lift_settings", state: "missing", bucket: "optional" },
        { key: "onboard_memory", state: "missing", bucket: "optional" },
        { key: "onboard_memory_value", state: "missing", bucket: "optional" },
      ],
    },
    {
      key: "market_meta",
      label: "Commercial / Lifecycle",
      desc: "Price, release date, discontinued, product links, ratings",
      priority: "optional",
      phase: "hold",
      source_target: "manufacturer HTML, retail",
      content_target: "product pages, retail listings",
      search_intent: null,
      host_class: null,
      query_family_mix: null,
      reason_active: null,
      queries: [],
      fields: [
        { key: "price", state: "satisfied", bucket: "secondary" },
        { key: "release_date", state: "satisfied", bucket: "secondary" },
        { key: "discontinued", state: "satisfied", bucket: "expected" },
        { key: "product_url", state: "satisfied", bucket: "secondary" },
        { key: "amazon_link", state: "missing", bucket: "optional" },
        { key: "brand_website", state: "satisfied", bucket: "optional" },
        { key: "review_count", state: "missing", bucket: "optional" },
        { key: "avg_rating", state: "missing", bucket: "optional" },
      ],
    },
  ],
  deltas: [
    { field: "dpi", from: "missing", to: "satisfied" },
    { field: "polling_rate", from: "missing", to: "satisfied" },
    { field: "weight", from: "missing", to: "satisfied" },
    { field: "bluetooth", from: "missing", to: "satisfied" },
    { field: "wireless_type", from: "missing", to: "satisfied" },
    { field: "price", from: "missing", to: "satisfied" },
    { field: "release_date", from: "missing", to: "satisfied" },
    { field: "battery_life", from: "missing", to: "satisfied" },
    { field: "product_url", from: "missing", to: "satisfied" },
    { field: "computer_side_connector", from: "missing", to: "satisfied" },
    { field: "brand_website", from: "missing", to: "satisfied" },
    { field: "discontinued", from: "missing", to: "satisfied" },
    { field: "cable_type", from: "missing", to: "weak" },
    { field: "colors", from: "missing", to: "weak" },
    { field: "click_latency", from: "missing", to: "weak" },
    { field: "switch_brand", from: "missing", to: "conflict" },
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
  missing: "#78756e",
  exhausted: "#4b4845",
  exactMatch: "#7c3aed",
  nowPhase: "#1d4ed8",
  nextPhase: "#6b7280",
  holdPhase: "#b8b4ac",
};

const font = {
  display: "'Playfair Display', Georgia, serif",
  mono: "'DM Mono', 'Menlo', monospace",
  body: "'Source Sans 3', 'Source Sans Pro', sans-serif",
};

/* ═══════════════════════════════════════════════════════════════════════
   MICRO ICONS (inline SVG for source families)
   ═══════════════════════════════════════════════════════════════════════ */
const Icons = {
  globe: (c = "#666", s = 12) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.5" stroke={c} strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="3" ry="6.5" stroke={c} strokeWidth="1" />
      <line x1="1.5" y1="8" x2="14.5" y2="8" stroke={c} strokeWidth="1" />
    </svg>
  ),
  file: (c = "#666", s = 12) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M4 2h5.5L13 5.5V14H4V2z" stroke={c} strokeWidth="1.2" />
      <path d="M9 2v4h4" stroke={c} strokeWidth="1" />
      <line x1="6" y1="8" x2="11" y2="8" stroke={c} strokeWidth="0.8" />
      <line x1="6" y1="10" x2="10" y2="10" stroke={c} strokeWidth="0.8" />
    </svg>
  ),
  headset: (c = "#666", s = 12) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 9V7.5a5 5 0 0 1 10 0V9" stroke={c} strokeWidth="1.2" />
      <rect x="1.5" y="8.5" width="3" height="4" rx="1" stroke={c} strokeWidth="1" />
      <rect x="11.5" y="8.5" width="3" height="4" rx="1" stroke={c} strokeWidth="1" />
    </svg>
  ),
  search: (c = "#666", s = 12) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="4.5" stroke={c} strokeWidth="1.2" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  target: (c = "#666", s = 12) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1" />
      <circle cx="8" cy="8" r="3" stroke={c} strokeWidth="1" />
      <circle cx="8" cy="8" r="0.8" fill={c} />
    </svg>
  ),
};

const familyIcon = (family) => {
  const map = {
    manufacturer_html: Icons.globe,
    manual_pdf: Icons.file,
    support_docs: Icons.headset,
    fallback_web: Icons.search,
    targeted_single: Icons.target,
  };
  return (map[family] || Icons.search)(T.inkMuted, 13);
};

const familyLabel = (family) => ({
  manufacturer_html: "Manufacturer HTML",
  manual_pdf: "Manual / PDF",
  support_docs: "Support Docs",
  fallback_web: "Fallback Web",
  targeted_single: "Targeted Single",
}[family] || family);

/* ═══════════════════════════════════════════════════════════════════════
   UTILITY COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

function StateChip({ state, size = "sm" }) {
  const map = {
    satisfied: { c: T.resolved, label: "Covered" },
    missing:   { c: T.missing,  label: "Missing" },
    weak:      { c: T.weak,     label: "Weak" },
    conflict:  { c: T.conflict, label: "Conflict" },
  };
  const cfg = map[state] || map.missing;
  const isSm = size === "sm";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: isSm ? 10 : 11, fontWeight: 600,
      fontFamily: font.mono, letterSpacing: "0.04em",
      color: cfg.c, textTransform: "uppercase",
    }}>
      <span style={{
        width: isSm ? 5 : 6, height: isSm ? 5 : 6,
        borderRadius: "50%", background: cfg.c,
      }} />
      {cfg.label}
    </span>
  );
}

function BucketLabel({ bucket }) {
  const map = {
    core: T.conflict, secondary: T.accent,
    expected: T.weak, optional: T.inkFaint,
  };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, fontFamily: font.mono,
      letterSpacing: "0.08em", textTransform: "uppercase",
      color: map[bucket] || T.inkFaint,
    }}>{bucket}</span>
  );
}

function PhasePill({ phase }) {
  const cfg = {
    now:  { c: T.nowPhase,  bg: "#2563eb12", border: "#2563eb35", label: "NOW" },
    next: { c: T.nextPhase, bg: "#6b728012", border: "#6b728030", label: "NEXT" },
    hold: { c: T.holdPhase, bg: "#b8b4ac10", border: "#b8b4ac30", label: "HOLD" },
  }[phase] || { c: T.holdPhase, bg: "transparent", border: T.borderLight, label: "—" };

  return (
    <span style={{
      display: "inline-block",
      fontSize: 9, fontWeight: 800, fontFamily: font.mono,
      letterSpacing: "0.1em", padding: "2px 7px",
      borderRadius: 2, color: cfg.c,
      background: cfg.bg, border: `1.5px solid ${cfg.border}`,
    }}>{cfg.label}</span>
  );
}

function SectionLabel({ children, number }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 8,
      marginBottom: 12, paddingBottom: 6,
      borderBottom: `1.5px solid ${T.ink}`,
    }}>
      {number && (
        <span style={{
          fontSize: 10, fontWeight: 700, fontFamily: font.mono,
          color: T.inkFaint, letterSpacing: "0.08em",
        }}>{number}</span>
      )}
      <span style={{
        fontSize: 12, fontWeight: 700, fontFamily: font.mono,
        color: T.ink, letterSpacing: "0.06em", textTransform: "uppercase",
      }}>{children}</span>
    </div>
  );
}

function Stat({ value, label, color, large }) {
  return (
    <div>
      <div style={{
        fontSize: large ? 36 : 28, fontWeight: 700,
        fontFamily: font.display, color: color || T.ink,
        lineHeight: 1, letterSpacing: "-0.02em",
      }}>{value}</div>
      <div style={{
        fontSize: 11, fontWeight: 600, fontFamily: font.mono,
        color: T.inkSub, textTransform: "uppercase",
        letterSpacing: "0.05em", marginTop: 5,
      }}>{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   A) HERO BAND
   ═══════════════════════════════════════════════════════════════════════ */

function HeroBand({ data }) {
  const { summary: s, identity: id, round, round_mode, profile_influence: pi } = data;
  const unresolved = s.total - s.resolved;

  const activeBundles = data.bundles.filter(b => b.queries.length > 0);
  const totalBundles = data.bundles.length;
  const totalQueries = data.bundles.reduce((n, b) => n + b.queries.length, 0);

  const searchTargets = [];
  if (pi.manufacturer_html > 0) searchTargets.push("manufacturer HTML");
  if (pi.manual_pdf > 0) searchTargets.push("manuals/PDFs");
  if (pi.support_docs > 0) searchTargets.push("support docs");
  if (pi.fallback_web > 0) searchTargets.push("fallback web");
  if (pi.targeted_single > 0) searchTargets.push("targeted exceptions");

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 3,
      padding: "28px 32px 24px",
      marginBottom: 16,
    }}>
      {/* Title row */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 16,
        marginBottom: 22,
        flexWrap: "wrap",
      }}>
        <h1 style={{
          fontSize: 26, fontWeight: 700, margin: 0,
          fontFamily: font.display, color: T.ink,
          letterSpacing: "-0.01em", lineHeight: 1,
        }}>
          NeedSet <span style={{
            fontSize: 20, fontWeight: 400, fontStyle: "italic",
            color: T.inkMuted, margin: "0 2px",
          }}>·</span> <span style={{ fontWeight: 400, fontStyle: "italic" }}>Search Planner</span>
        </h1>
        <span style={{
          fontSize: 10, fontWeight: 700, fontFamily: font.mono,
          color: T.accent, letterSpacing: "0.06em",
          padding: "3px 8px", borderRadius: 2,
          border: `1.5px solid ${T.accent}`,
        }}>
          ROUND {round} · {round_mode === "seed" ? "SEEDING" : "CARRY-FORWARD"}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: 12, fontFamily: font.mono, color: T.inkSub, fontWeight: 500,
          }}>
            {id.manufacturer} {id.model}
          </div>
          <div style={{
            fontSize: 10, fontFamily: font.mono, marginTop: 2,
            display: "flex", gap: 10, justifyContent: "flex-end",
          }}>
            <span style={{ color: T.inkMuted }}>
              Round readiness: <span style={{
                fontWeight: 700,
                color: id.state === "locked" ? T.resolved : T.weak,
              }}>{id.state}</span>
            </span>
            <span style={{ color: T.inkMuted }}>
              Planner confidence: <span style={{
                fontWeight: 700,
                color: id.confidence > 0.9 ? T.resolved : T.weak,
              }}>{Math.round(id.confidence * 100)}%</span>
            </span>
          </div>
        </div>
      </div>

      {/* 4 stat cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: 24, marginBottom: 22,
      }}>
        <Stat value={s.core_unresolved} label="Core unresolved" color={T.conflict} large />
        <Stat value={s.conflicts} label={s.conflicts === 1 ? "Conflict" : "Conflicts"} color={s.conflicts > 0 ? T.conflict : T.resolved} large />
        <Stat value={`${activeBundles.length}/${totalBundles}`} label="Bundles active / tracked" color={T.accent} large />
        <Stat value={totalQueries} label="Queries queued" color={T.accent} large />
      </div>

      {/* Narrative sentence */}
      <p style={{
        fontSize: 14, fontFamily: font.body, color: T.inkMuted,
        margin: 0, lineHeight: 1.55, maxWidth: 760,
        fontStyle: "italic",
      }}>
        NeedSet is shaping the next search round toward{" "}
        <span style={{ color: T.ink, fontWeight: 600, fontStyle: "normal" }}>
          {searchTargets.join(", ")}
        </span>
        {" "}— {unresolved} unresolved fields across {activeBundles.length} active bundles, with {s.core_unresolved} core fields still missing.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   B) WHY STUCK
   ═══════════════════════════════════════════════════════════════════════ */

function WhyStuckStrip({ blockers }) {
  const items = [
    { key: "missing",           val: blockers.missing,           c: T.missing,    icon: "○" },
    { key: "weak evidence",     val: blockers.weak,              c: T.weak,       icon: "◐" },
    { key: "conflict",          val: blockers.conflict,          c: T.conflict,   icon: "⊘" },
    { key: "needs exact match", val: blockers.needs_exact_match, c: T.exactMatch, icon: "◈" },
    { key: "search exhausted",  val: blockers.search_exhausted,  c: T.exhausted,  icon: "—" },
  ];

  const visible = items.filter(it => !(it.key === "search exhausted" && it.val === 0));

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionLabel number="02">Why We're Stuck</SectionLabel>
      <div style={{ display: "flex", gap: 10 }}>
        {visible.map(it => (
          <div key={it.key} style={{
            flex: 1,
            background: it.val > 0 ? T.surface : T.surfaceMuted,
            border: `1px solid ${it.val > 0 ? it.c + "40" : T.borderLight}`,
            borderRadius: 3, padding: "14px 16px",
            opacity: it.val === 0 ? 0.35 : 1,
            transition: "opacity 0.2s",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{
                fontSize: 24, fontWeight: 700, fontFamily: font.display,
                color: it.val > 0 ? it.c : T.inkFaint, lineHeight: 1,
              }}>{it.val}</span>
              <span style={{ fontSize: 16, color: it.c }}>{it.icon}</span>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, fontFamily: font.mono,
              color: it.val > 0 ? it.c : T.inkFaint,
              textTransform: "uppercase", letterSpacing: "0.06em",
              marginTop: 6,
            }}>{it.key}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   C) SEARCH FOCUS BUNDLES
   ═══════════════════════════════════════════════════════════════════════ */

function BundleCard({ bundle, expanded, onToggle }) {
  const resolved = bundle.fields.filter(f => f.state === "satisfied").length;
  const total = bundle.fields.length;
  const pct = Math.round((resolved / total) * 100);
  const isActive = bundle.queries.length > 0;

  return (
    <div style={{
      background: isActive ? T.surface : T.surfaceMuted,
      border: `1px solid ${expanded ? T.accent + "60" : isActive ? T.border : T.borderLight}`,
      borderRadius: 3,
      opacity: isActive ? 1 : 0.7,
      transition: "all 0.2s",
    }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          padding: "14px 20px",
          cursor: "pointer", userSelect: "none",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 16, alignItems: "start",
        }}
      >
        {/* Phase pill */}
        <div style={{ paddingTop: 2 }}>
          <PhasePill phase={bundle.phase} />
        </div>

        {/* Left: label + desc + intent strip */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: "flex", alignItems: "baseline", gap: 10, marginBottom: 3,
          }}>
            <span style={{
              fontSize: 15, fontWeight: 700, fontFamily: font.body,
              color: isActive ? T.ink : T.inkMuted,
            }}>{bundle.label}</span>
          </div>
          <div style={{
            fontSize: 12, fontFamily: font.body,
            color: isActive ? T.inkMuted : T.inkFaint,
            marginBottom: isActive && bundle.search_intent ? 10 : 0,
          }}>{bundle.desc}</div>

          {/* Intent / host / mix / reason — only for active bundles */}
          {isActive && bundle.search_intent && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: "4px 20px",
              borderTop: `1px solid ${T.borderLight}`,
              paddingTop: 8,
            }}>
              {[
                ["INTENT", bundle.search_intent],
                ["HOSTS", bundle.host_class],
                ["MIX", bundle.query_family_mix],
                ["REASON ACTIVE", bundle.reason_active],
              ].map(([lbl, val]) => (
                <div key={lbl} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{
                    fontSize: 8, fontWeight: 800, fontFamily: font.mono,
                    color: T.inkFaint, letterSpacing: "0.08em",
                    minWidth: 52,
                  }}>{lbl}</span>
                  <span style={{
                    fontSize: 11, fontFamily: font.mono, color: T.inkSub,
                    fontWeight: 500,
                  }}>{val}</span>
                </div>
              ))}
            </div>
          )}

          {/* Inactive message */}
          {!isActive && (
            <div style={{
              fontSize: 10, fontFamily: font.mono, color: T.inkFaint,
              fontStyle: "italic", marginTop: 4,
            }}>Not queued this round</div>
          )}
        </div>

        {/* Right: progress + query count */}
        <div style={{ textAlign: "right", minWidth: 130 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, fontFamily: font.mono,
            color: pct === 100 ? T.resolved : T.ink,
            marginBottom: 6,
          }}>{resolved}/{total}</div>
          <div style={{
            width: 130, height: 4, borderRadius: 2,
            background: T.surfaceMuted, overflow: "hidden",
            border: `1px solid ${T.borderLight}`,
          }}>
            <div style={{
              width: `${pct}%`, height: "100%", borderRadius: 2,
              background: pct === 100 ? T.resolved : T.accent,
              transition: "width 0.6s ease",
            }} />
          </div>
          {isActive && (
            <div style={{
              fontSize: 10, fontWeight: 700, fontFamily: font.mono,
              color: T.accent, marginTop: 8, letterSpacing: "0.04em",
            }}>
              {bundle.queries.length} {bundle.queries.length === 1 ? "QUERY" : "QUERIES"}
            </div>
          )}
        </div>
      </div>

      {/* Expanded: planned queries */}
      {expanded && isActive && (
        <div style={{
          borderTop: `1px solid ${T.borderLight}`,
          padding: "10px 20px",
          background: `${T.accent}04`,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, fontFamily: font.mono,
            color: T.inkFaint, textTransform: "uppercase",
            letterSpacing: "0.06em", marginBottom: 6,
          }}>PLANNED QUERIES</div>
          {bundle.queries.map((q, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "3px 0",
            }}>
              {familyIcon(q.family)}
              <span style={{
                fontSize: 12, fontFamily: font.mono, color: T.accent,
                fontWeight: 500,
              }}>{q.q}</span>
              <span style={{
                fontSize: 9, fontFamily: font.mono, color: T.inkFaint,
                marginLeft: "auto",
              }}>{familyLabel(q.family)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded: field table */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${T.borderLight}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["FIELD", "BUCKET", "STATE", "NEXT ACTION"].map(h => (
                  <th key={h} style={{
                    padding: "8px 20px", textAlign: "left",
                    fontSize: 9, fontWeight: 700, fontFamily: font.mono,
                    color: T.inkFaint, letterSpacing: "0.08em",
                    borderBottom: `1px solid ${T.borderLight}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...bundle.fields]
                .sort((a, b) => {
                  const order = { core: 0, secondary: 1, expected: 2, optional: 3 };
                  return (order[a.bucket] ?? 9) - (order[b.bucket] ?? 9);
                })
                .map(f => (
                  <tr key={f.key} style={{ borderBottom: `1px solid ${T.borderLight}40` }}>
                    <td style={{
                      padding: "6px 20px", fontSize: 12,
                      fontFamily: font.mono, fontWeight: 500,
                      color: f.state === "satisfied" ? T.inkFaint : T.ink,
                    }}>{f.key}</td>
                    <td style={{ padding: "6px 20px" }}><BucketLabel bucket={f.bucket} /></td>
                    <td style={{ padding: "6px 20px" }}><StateChip state={f.state} /></td>
                    <td style={{
                      padding: "6px 20px", fontSize: 11,
                      fontFamily: font.mono, color: T.inkMuted,
                    }}>{{ satisfied: "—", missing: "search", weak: "re-search / verify", conflict: "targeted resolution" }[f.state]}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BundlesSection({ bundles }) {
  const [expanded, setExpanded] = useState({});
  const toggle = k => setExpanded(p => ({ ...p, [k]: !p[k] }));

  const active = bundles.filter(b => b.queries.length > 0);
  const inactive = bundles.filter(b => b.queries.length === 0);

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionLabel number="03">Search Focus Bundles</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {active.map(b => (
          <BundleCard key={b.key} bundle={b} expanded={!!expanded[b.key]} onToggle={() => toggle(b.key)} />
        ))}
        {inactive.length > 0 && (
          <div style={{
            fontSize: 10, fontWeight: 700, fontFamily: font.mono,
            color: T.inkFaint, letterSpacing: "0.06em",
            textTransform: "uppercase", padding: "10px 0 4px",
          }}>OBSERVED · NOT QUEUED THIS ROUND</div>
        )}
        {inactive.map(b => (
          <BundleCard key={b.key} bundle={b} expanded={!!expanded[b.key]} onToggle={() => toggle(b.key)} />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   D) PROFILE INFLUENCE + QUERIES PREVIEW
   ═══════════════════════════════════════════════════════════════════════ */

function ProfileInfluence({ pi, bundles }) {
  const [showPreview, setShowPreview] = useState(false);

  const families = [
    { key: "manufacturer_html", label: "Manufacturer HTML", val: pi.manufacturer_html, c: T.accent,   icon: Icons.globe },
    { key: "manual_pdf",        label: "Manual / PDF",       val: pi.manual_pdf,        c: "#0e7490", icon: Icons.file },
    { key: "support_docs",      label: "Support Docs",       val: pi.support_docs,      c: "#7c3aed", icon: Icons.headset },
    { key: "fallback_web",      label: "Fallback Web",       val: pi.fallback_web,       c: T.weak,   icon: Icons.search },
    { key: "targeted_single",   label: "Targeted Single",    val: pi.targeted_single,   c: T.conflict, icon: Icons.target },
  ];
  const total = families.reduce((s, f) => s + f.val, 0);

  const queryByFamily = {};
  bundles.forEach(b => b.queries.forEach(q => {
    if (!queryByFamily[q.family]) queryByFamily[q.family] = [];
    queryByFamily[q.family].push(q.q);
  }));

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionLabel number="04">Profile Influence</SectionLabel>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 3, padding: "18px 20px",
      }}>
        {/* Segmented bar */}
        <div style={{
          display: "flex", height: 20, borderRadius: 2,
          overflow: "hidden", marginBottom: 14,
          border: `1px solid ${T.borderLight}`,
        }}>
          {families.filter(f => f.val > 0).map(f => (
            <div key={f.key} style={{
              width: `${(f.val / total) * 100}%`,
              background: f.c, position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 4, transition: "width 0.5s ease",
            }}>
              <span style={{
                fontSize: 9, fontWeight: 700, fontFamily: font.mono,
                color: "#fff", letterSpacing: "0.04em",
              }}>{f.val}</span>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{
          display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14,
        }}>
          {families.filter(f => f.val > 0).map(f => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {f.icon(f.c, 11)}
              <span style={{
                fontSize: 10, fontFamily: font.mono, color: T.inkMuted, fontWeight: 500,
              }}>{f.label}</span>
            </div>
          ))}
        </div>

        {/* Planning stats strip */}
        <div style={{
          display: "flex", gap: 24, flexWrap: "wrap",
          paddingTop: 12, borderTop: `1px solid ${T.borderLight}`,
          marginBottom: showPreview ? 14 : 0,
        }}>
          {[
            { label: "Trusted-host share", val: `${pi.trusted_host_share}/${total}` },
            { label: "Docs/manual share", val: `${pi.docs_manual_share}/${total}` },
            { label: "Targeted exceptions", val: `${pi.targeted_exceptions}/${total}` },
            { label: "Dupes suppressed", val: String(pi.duplicates_suppressed) },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
              <span style={{
                fontSize: 9, fontWeight: 700, fontFamily: font.mono,
                color: T.inkFaint, letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>{s.label}</span>
              <span style={{
                fontSize: 12, fontWeight: 700, fontFamily: font.mono,
                color: T.inkSub,
              }}>{s.val}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowPreview(!showPreview)}
            style={{
              fontSize: 10, fontWeight: 700, fontFamily: font.mono,
              color: T.accent, background: "none", border: "none",
              cursor: "pointer", padding: 0, letterSpacing: "0.04em",
            }}
          >{showPreview ? "HIDE PREVIEW ▴" : "QUEUED SEARCH PREVIEW ▾"}</button>
        </div>

        {/* Queries preview drawer */}
        {showPreview && (
          <div style={{
            borderTop: `1px solid ${T.borderLight}`,
            paddingTop: 12,
          }}>
            {families.filter(f => f.val > 0).map(f => {
              const queries = queryByFamily[f.key] || [];
              return (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6, marginBottom: 4,
                  }}>
                    {f.icon(f.c, 12)}
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontFamily: font.mono,
                      color: f.c,
                    }}>{f.label}</span>
                    <span style={{
                      fontSize: 10, fontFamily: font.mono, color: T.inkFaint,
                    }}>— {f.val} {f.val === 1 ? "query" : "queries"}</span>
                  </div>
                  {queries.map((q, i) => (
                    <div key={i} style={{
                      fontSize: 11, fontFamily: font.mono, color: T.inkSub,
                      paddingLeft: 20, lineHeight: 1.6,
                    }}>→ {q}</div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   E) WHAT CHANGED THIS ROUND
   ═══════════════════════════════════════════════════════════════════════ */

function WhatChanged({ deltas }) {
  const resolved  = deltas.filter(d => d.to === "satisfied");
  const improved  = deltas.filter(d => d.to === "weak" && d.from === "missing");
  const escalated = deltas.filter(d => d.to === "conflict");
  const regressed = deltas.filter(d =>
    (d.from === "satisfied" && d.to !== "satisfied") ||
    (d.from === "weak" && d.to === "missing")
  );

  const groups = [
    { label: "RESOLVED",  items: resolved,  c: T.resolved, icon: "✓" },
    { label: "IMPROVED",  items: improved,   c: "#0e7490",  icon: "↑" },
    { label: "ESCALATED", items: escalated,  c: T.weak,     icon: "⊘" },
    { label: "REGRESSED", items: regressed,  c: T.conflict, icon: "↓" },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionLabel number="05">What Changed This Round</SectionLabel>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 3, padding: "16px 20px",
      }}>
        {/* Counts */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: 20, marginBottom: 14,
        }}>
          {groups.map(g => (
            <div key={g.label}>
              <div style={{
                fontSize: 22, fontWeight: 700, fontFamily: font.display,
                color: g.items.length > 0 ? g.c : T.inkFaint, lineHeight: 1,
              }}>{g.items.length > 0 ? `+${g.items.length}` : "0"}</div>
              <div style={{
                fontSize: 10, fontWeight: 700, fontFamily: font.mono,
                color: g.items.length > 0 ? g.c : T.inkFaint,
                textTransform: "uppercase", letterSpacing: "0.06em",
                marginTop: 4,
              }}>{g.label}</div>
            </div>
          ))}
        </div>

        {/* Tags */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 5,
          paddingTop: 12, borderTop: `1px solid ${T.borderLight}`,
        }}>
          {groups.flatMap(g =>
            g.items.map((d, i) => (
              <span key={`${g.label}-${i}`} style={{
                fontSize: 10, fontFamily: font.mono, fontWeight: 600,
                padding: "2px 8px", borderRadius: 2,
                background: `${g.c}10`, color: g.c,
                border: `1px solid ${g.c}25`,
              }}>{g.icon} {d.field}</span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   F) FIELD DRILLDOWN — defaults to unresolved only
   ═══════════════════════════════════════════════════════════════════════ */

function FieldDrilldown({ bundles }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("unresolved");

  const allFields = bundles.flatMap(b =>
    b.fields.map(f => ({
      ...f, bundle: b.label, phase: b.phase,
      source_target: b.source_target, content_target: b.content_target,
    }))
  );

  const filtered = filter === "all"
    ? allFields
    : filter === "escalated"
      ? allFields.filter(f => f.state === "conflict" || f.state === "weak")
      : allFields.filter(f => f.state !== "satisfied");

  const actionMap = {
    satisfied: "—", missing: "search",
    weak: "re-search", conflict: "resolve",
  };

  const filterBtns = [
    { key: "unresolved", label: "Unresolved" },
    { key: "escalated", label: "Escalated" },
    { key: "all", label: "All fields" },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "baseline", gap: 8,
          marginBottom: open ? 10 : 0,
          paddingBottom: 6,
          borderBottom: `1.5px solid ${T.ink}`,
          cursor: "pointer", userSelect: "none",
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, fontFamily: font.mono,
          color: T.inkFaint, letterSpacing: "0.08em",
        }}>06</span>
        <span style={{
          fontSize: 12, fontWeight: 700, fontFamily: font.mono,
          color: T.ink, letterSpacing: "0.06em", textTransform: "uppercase",
          flex: 1,
        }}>FIELD DRILLDOWN</span>
        <span style={{
          fontSize: 11, fontFamily: font.mono, color: T.inkFaint,
        }}>{allFields.length} fields · {open ? "collapse ▴" : "expand ▾"}</span>
      </div>

      {open && (
        <>
          {/* Filter bar */}
          <div style={{
            display: "flex", gap: 6, marginBottom: 10,
          }}>
            {filterBtns.map(fb => (
              <button
                key={fb.key}
                onClick={() => setFilter(fb.key)}
                style={{
                  fontSize: 10, fontWeight: 700, fontFamily: font.mono,
                  letterSpacing: "0.04em", padding: "4px 10px",
                  borderRadius: 2, cursor: "pointer",
                  background: filter === fb.key ? T.ink : "transparent",
                  color: filter === fb.key ? T.surface : T.inkMuted,
                  border: `1px solid ${filter === fb.key ? T.ink : T.border}`,
                  transition: "all 0.15s",
                }}
              >{fb.label}</button>
            ))}
            <span style={{
              fontSize: 10, fontFamily: font.mono, color: T.inkFaint,
              alignSelf: "center", marginLeft: 8,
            }}>showing {filtered.length} of {allFields.length}</span>
          </div>

          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 3, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["FIELD", "BUNDLE", "PHASE", "BUCKET", "STATE", "SOURCE TARGET", "NEXT ACTION"].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left",
                      fontSize: 9, fontWeight: 700, fontFamily: font.mono,
                      color: T.inkFaint, letterSpacing: "0.08em",
                      borderBottom: `1.5px solid ${T.border}`,
                      background: T.surfaceMuted,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => (
                  <tr key={i} style={{
                    borderBottom: `1px solid ${T.borderLight}`,
                    background: f.state === "conflict" ? `${T.conflict}06` : "transparent",
                  }}>
                    <td style={{
                      padding: "6px 14px", fontSize: 11,
                      fontFamily: font.mono, fontWeight: 600,
                      color: f.state === "satisfied" ? T.inkFaint : T.ink,
                    }}>{f.key}</td>
                    <td style={{
                      padding: "6px 14px", fontSize: 10,
                      fontFamily: font.mono, color: T.inkMuted,
                    }}>{f.bundle}</td>
                    <td style={{ padding: "6px 14px" }}>
                      <PhasePill phase={f.phase} />
                    </td>
                    <td style={{ padding: "6px 14px" }}><BucketLabel bucket={f.bucket} /></td>
                    <td style={{ padding: "6px 14px" }}><StateChip state={f.state} /></td>
                    <td style={{
                      padding: "6px 14px", fontSize: 10,
                      fontFamily: font.mono, color: T.inkMuted,
                    }}>{f.source_target}</td>
                    <td style={{
                      padding: "6px 14px", fontSize: 10,
                      fontFamily: font.mono, color: T.inkMuted,
                    }}>{actionMap[f.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   G) DEBUG
   ═══════════════════════════════════════════════════════════════════════ */

function DebugSection({ data }) {
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
          fontSize: 10, fontWeight: 700, fontFamily: font.mono,
          color: T.inkFaint, letterSpacing: "0.08em",
        }}>07</span>
        <span style={{
          fontSize: 11, fontWeight: 600, fontFamily: font.mono,
          color: T.inkFaint, letterSpacing: "0.04em",
        }}>DEBUG · RAW NEEDSET JSON {open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <pre style={{
          background: T.surfaceMuted,
          border: `1px solid ${T.border}`,
          borderRadius: 3, padding: 16,
          fontSize: 10, fontFamily: font.mono,
          color: T.inkMuted, overflow: "auto",
          maxHeight: 400, lineHeight: 1.5,
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PANEL
   ═══════════════════════════════════════════════════════════════════════ */

export default function NeedSetSearchPlanner() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setTimeout(() => setLoaded(true), 50); }, []);
  const data = MOCK;

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

      <HeroBand data={data} />
      <WhyStuckStrip blockers={data.blockers} />
      <BundlesSection bundles={data.bundles} />
      <ProfileInfluence pi={data.profile_influence} bundles={data.bundles} />
      <WhatChanged deltas={data.deltas} />
      <FieldDrilldown bundles={data.bundles} />
      <DebugSection data={data} />
    </div>
  );
}
