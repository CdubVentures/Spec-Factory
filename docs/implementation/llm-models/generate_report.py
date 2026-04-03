#!/usr/bin/env python3
"""Generate HTML validation report for LLM Lab & Spec Factory models."""
import json, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Load current test results
with open(os.path.join(SCRIPT_DIR, "test_results.json")) as f:
    current = json.load(f)

# Load previous test matrices
with open(os.path.join(SCRIPT_DIR, "prev_openai.json")) as f:
    prev_openai = json.load(f)
with open(os.path.join(SCRIPT_DIR, "prev_claude.json")) as f:
    prev_claude = json.load(f)
with open(os.path.join(SCRIPT_DIR, "prev_gemini.json")) as f:
    prev_gemini = json.load(f)

timestamp = current["timestamp"]

def badge(ok, label="PASS"):
    if ok is True: return f'<span class="badge pass">{label}</span>'
    elif ok is False: return '<span class="badge fail">FAIL</span>'
    elif ok == "warn": return f'<span class="badge warn">{label}</span>'
    elif ok == "skip": return f'<span class="badge skip">N/A</span>'
    else: return f'<span class="badge info">{label}</span>'

def time_badge(t):
    if t is None: return "-"
    if t < 3: cls = "fast"
    elif t < 8: cls = "medium"
    elif t < 15: cls = "slow"
    else: cls = "very-slow"
    return f'<span class="time {cls}">{t}s</span>'

def delta_cell(prev, curr):
    if prev is None or curr is None: return "-"
    d = round(curr - prev, 1)
    if abs(d) < 0.5: return '<span style="color:#6c757d">~0</span>'
    if d > 0: return f'<span style="color:#dc3545">+{d}s</span>'
    return f'<span style="color:#198754">{d}s</span>'

# ── Stats ──
openai_total = len(current["openai"]) * 4
openai_pass = sum(1 for r in current["openai"] for t in ["base","thinking","web","json"] if r.get(t,{}).get("ok"))
gemini_total = len(current["gemini"]) * 3
gemini_pass = sum(1 for r in current["gemini"] for t in ["base","web","json"] if r.get(t,{}).get("ok"))
claude_total = len(current["claude"]) * 4
claude_pass = sum(1 for r in current["claude"] for t in ["base","thinking","web","json"] if r.get(t,{}).get("ok"))
openai_times = [r[t]["time"] for r in current["openai"] for t in ["base","thinking","web","json"] if r.get(t,{}).get("time")]
openai_avg = round(sum(openai_times)/len(openai_times), 1) if openai_times else 0
openai_fastest = min(openai_times) if openai_times else 0
openai_slowest = max(openai_times) if openai_times else 0
total_tests = openai_total + gemini_total + claude_total

# ── Build HTML ──
html_parts = []
html_parts.append(f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LLM Model Validation Report - April 2, 2026</title>
<style>
  :root {{
    --bg: #ffffff; --surface: #f8f9fa; --border: #dee2e6;
    --text: #212529; --text-muted: #6c757d; --primary: #0d6efd;
    --success: #198754; --danger: #dc3545; --warning: #fd7e14; --info: #0dcaf0;
    --pass-bg: #d1e7dd; --pass-fg: #0f5132;
    --fail-bg: #f8d7da; --fail-fg: #842029;
    --warn-bg: #fff3cd; --warn-fg: #664d03;
    --info-bg: #cff4fc; --info-fg: #055160;
    --skip-bg: #e2e3e5; --skip-fg: #41464b;
  }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; padding: 24px; max-width: 1600px; margin: 0 auto; }}
  h1 {{ font-size: 28px; font-weight: 700; margin-bottom: 4px; }}
  h2 {{ font-size: 22px; font-weight: 600; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }}
  h3 {{ font-size: 18px; font-weight: 600; margin: 24px 0 12px; }}
  .subtitle {{ color: var(--text-muted); font-size: 14px; margin-bottom: 24px; }}
  .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px; }}
  .summary-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
  .summary-card .label {{ font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); font-weight: 600; }}
  .summary-card .value {{ font-size: 36px; font-weight: 700; margin: 4px 0; }}
  .summary-card .detail {{ font-size: 13px; color: var(--text-muted); }}
  .summary-card.success {{ border-left: 4px solid var(--success); }}
  .summary-card.danger {{ border-left: 4px solid var(--danger); }}
  .summary-card.warning {{ border-left: 4px solid var(--warning); }}
  .summary-card.info {{ border-left: 4px solid var(--primary); }}
  .progress-bar {{ height: 8px; background: #e9ecef; border-radius: 4px; margin-top: 8px; overflow: hidden; }}
  .progress-bar .fill {{ height: 100%; border-radius: 4px; }}
  .fill.green {{ background: var(--success); }}
  .fill.red {{ background: var(--danger); }}
  .fill.orange {{ background: var(--warning); }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }}
  thead th {{ background: var(--surface); padding: 10px 8px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: var(--text-muted); border-bottom: 2px solid var(--border); position: sticky; top: 0; z-index: 10; }}
  tbody td {{ padding: 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }}
  tbody tr:hover {{ background: #f8f9fa; }}
  .model-name {{ font-family: 'SF Mono', Consolas, monospace; font-weight: 600; font-size: 13px; white-space: nowrap; }}
  .error-cell {{ font-size: 11px; color: var(--danger); max-width: 200px; }}
  .badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap; }}
  .badge.pass {{ background: var(--pass-bg); color: var(--pass-fg); }}
  .badge.fail {{ background: var(--fail-bg); color: var(--fail-fg); }}
  .badge.warn {{ background: var(--warn-bg); color: var(--warn-fg); }}
  .badge.info {{ background: var(--info-bg); color: var(--info-fg); }}
  .badge.skip {{ background: var(--skip-bg); color: var(--skip-fg); }}
  .badge.new {{ background: #e8daef; color: #6c3483; }}
  .time {{ display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-family: 'SF Mono', Consolas, monospace; font-weight: 500; }}
  .time.fast {{ background: #d1e7dd; color: #0f5132; }}
  .time.medium {{ background: #fff3cd; color: #664d03; }}
  .time.slow {{ background: #f8d7da; color: #842029; }}
  .time.very-slow {{ background: #dc3545; color: white; }}
  .provider-header {{ display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }}
  .provider-badge {{ padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; }}
  .provider-badge.openai {{ background: #10a37f20; color: #10a37f; border: 1px solid #10a37f40; }}
  .provider-badge.claude {{ background: #d4a57420; color: #a67c52; border: 1px solid #d4a57440; }}
  .provider-badge.gemini {{ background: #4285f420; color: #4285f4; border: 1px solid #4285f440; }}
  .table-wrapper {{ overflow-x: auto; border-radius: 8px; border: 1px solid var(--border); }}
  .table-wrapper table {{ margin-bottom: 0; }}
  .missing-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }}
  .missing-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }}
  .missing-card h4 {{ font-size: 14px; margin-bottom: 8px; }}
  .missing-card ul {{ list-style: none; padding: 0; }}
  .missing-card li {{ padding: 4px 0; font-size: 13px; font-family: 'SF Mono', Consolas, monospace; }}
  .missing-card li::before {{ content: "\\2022 "; color: var(--warning); margin-right: 6px; }}
  .legend {{ display: flex; gap: 16px; flex-wrap: wrap; margin: 12px 0; font-size: 12px; }}
  .legend-item {{ display: flex; align-items: center; gap: 4px; }}
  footer {{ margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 12px; text-align: center; }}
  @media print {{ body {{ padding: 12px; }} .table-wrapper {{ overflow: visible; }} }}
</style>
</head>
<body>

<h1>LLM Model Validation Report</h1>
<p class="subtitle">Generated: {timestamp} &nbsp;|&nbsp; LLM Lab + Spec Factory &nbsp;|&nbsp; All providers tested</p>

<div class="summary-grid">
  <div class="summary-card success">
    <div class="label">OpenAI Lab</div>
    <div class="value" style="color:var(--success);">{openai_pass}/{openai_total}</div>
    <div class="detail">19 models &middot; {round(openai_pass/openai_total*100)}% pass rate</div>
    <div class="progress-bar"><div class="fill green" style="width:{round(openai_pass/openai_total*100)}%"></div></div>
  </div>
  <div class="summary-card danger">
    <div class="label">Claude Lab</div>
    <div class="value" style="color:var(--danger);">{claude_pass}/{claude_total}</div>
    <div class="detail">4 models &middot; OAuth token expired</div>
    <div class="progress-bar"><div class="fill red" style="width:{round(claude_pass/max(claude_total,1)*100)}%"></div></div>
  </div>
  <div class="summary-card warning">
    <div class="label">Gemini Lab</div>
    <div class="value" style="color:var(--warning);">{gemini_pass}/{gemini_total}</div>
    <div class="detail">6 models &middot; Quota/capacity limits</div>
    <div class="progress-bar"><div class="fill orange" style="width:{round(gemini_pass/max(gemini_total,1)*100)}%"></div></div>
  </div>
  <div class="summary-card info">
    <div class="label">Avg Response (OpenAI)</div>
    <div class="value" style="color:var(--primary);">{openai_avg}s</div>
    <div class="detail">Range: {openai_fastest}s &ndash; {openai_slowest}s</div>
  </div>
  <div class="summary-card info">
    <div class="label">Total Tests Run</div>
    <div class="value" style="color:var(--primary);">{total_tests}</div>
    <div class="detail">29 models &middot; 4 test types</div>
  </div>
  <div class="summary-card warning">
    <div class="label">Missing Models</div>
    <div class="value" style="color:var(--warning);">15+</div>
    <div class="detail">New releases not yet in registry</div>
  </div>
</div>
""")

# ── OpenAI Table ──
html_parts.append("""
<h2>LLM Lab &mdash; Live Test Results</h2>

<div class="section">
  <div class="provider-header">
    <span class="provider-badge openai">OpenAI</span>
    <span style="font-size:13px;color:var(--text-muted);">Port 5001 &middot; 19 models &middot; ChatGPT CLI</span>
""")
html_parts.append(f'    <span class="badge pass" style="margin-left:auto;">{openai_pass}/{openai_total} PASS</span>')
html_parts.append("""  </div>
  <div class="legend">
    <div class="legend-item"><span class="time fast">fast</span> &lt;3s</div>
    <div class="legend-item"><span class="time medium">medium</span> 3-8s</div>
    <div class="legend-item"><span class="time slow">slow</span> 8-15s</div>
    <div class="legend-item"><span class="time very-slow">very slow</span> &gt;15s</div>
  </div>
  <div class="table-wrapper">
  <table>
    <thead><tr>
      <th>Model</th><th>Base</th><th>Time</th><th>Thinking</th><th>Reasoning</th><th>Time</th><th>Web</th><th>Date</th><th>Time</th><th>JSON</th><th>Valid</th><th>Time</th>
    </tr></thead>
    <tbody>
""")

for r in current["openai"]:
    m = r["model"]
    b = r.get("base",{}); t = r.get("thinking",{}); w = r.get("web",{}); j = r.get("json",{})
    html_parts.append(f"""    <tr>
      <td class="model-name">{m}</td>
      <td>{badge(b.get("ok"))}</td><td>{time_badge(b.get("time"))}</td>
      <td>{badge(t.get("ok"))}</td>
      <td>{'<span class="badge info">Yes</span>' if t.get("has_reasoning") else '<span class="badge warn">No tags</span>'}</td>
      <td>{time_badge(t.get("time"))}</td>
      <td>{badge(w.get("ok"))}</td>
      <td>{'<span class="badge pass">2026</span>' if w.get("has_date") else '<span class="badge warn">No date</span>'}</td>
      <td>{time_badge(w.get("time"))}</td>
      <td>{badge(j.get("ok"))}</td>
      <td>{'<span class="badge pass">Valid</span>' if j.get("valid_json") else '<span class="badge warn">Invalid</span>' if j.get("ok") else badge(False)}</td>
      <td>{time_badge(j.get("time"))}</td>
    </tr>""")

html_parts.append("    </tbody></table></div></div>")

# ── Claude Table ──
html_parts.append("""
<div class="section">
  <div class="provider-header">
    <span class="provider-badge claude">Claude</span>
    <span style="font-size:13px;color:var(--text-muted);">Port 5003 &middot; 4 models &middot; Claude Code CLI</span>
    <span class="badge fail" style="margin-left:auto;">AUTH EXPIRED</span>
  </div>

  <h3>Current Run (April 2, 2026) &mdash; All Failed (OAuth Expired)</h3>
  <div class="table-wrapper">
  <table>
    <thead><tr>
      <th>Model</th><th>Base</th><th>Thinking</th><th>Web</th><th>JSON</th><th>Error</th>
    </tr></thead>
    <tbody>
""")
for r in current["claude"]:
    html_parts.append(f"""    <tr>
      <td class="model-name">{r["model"]}</td>
      <td>{badge(False)}</td><td>{badge(False)}</td><td>{badge(False)}</td><td>{badge(False)}</td>
      <td class="error-cell">OAuth token expired - re-authenticate required</td>
    </tr>""")

html_parts.append("""    </tbody></table></div>

  <h3>Previous Run (March 27, 2026) &mdash; Reference Baseline</h3>
  <div class="table-wrapper">
  <table>
    <thead><tr>
      <th>Model</th><th>Base</th><th>Time</th><th>Thinking</th><th>Time</th><th>Web</th><th>Time</th><th>JSON</th><th>Time</th><th>Notes</th>
    </tr></thead>
    <tbody>
""")
for r in prev_claude:
    m = r["model"]
    b = r.get("base",{}); t = r.get("thinking"); w = r.get("web"); j = r.get("json")
    err = b.get("error","")
    if "MODEL_NOT_ALLOWED" in str(err):
        html_parts.append(f"""    <tr>
      <td class="model-name">{m}</td>
      <td>{badge(False)}</td><td>-</td><td>{badge("skip")}</td><td>-</td><td>{badge("skip")}</td><td>-</td><td>{badge("skip")}</td><td>-</td>
      <td class="error-cell">MODEL_NOT_ALLOWED</td>
    </tr>""")
    else:
        html_parts.append(f"""    <tr>
      <td class="model-name">{m}</td>
      <td>{badge(b.get("ok"))}</td><td>{time_badge(b.get("time"))}</td>
      <td>{badge(t.get("ok")) if t else badge("skip")}</td><td>{time_badge(t.get("time") if t else None)}</td>
      <td>{badge(w.get("ok")) if w else badge("skip")}</td><td>{time_badge(w.get("time") if w else None)}</td>
      <td>{badge(j.get("ok")) if j else badge("skip")}</td><td>{time_badge(j.get("time") if j else None)}</td>
      <td></td>
    </tr>""")

html_parts.append("    </tbody></table></div></div>")

# ── Gemini Table ──
html_parts.append(f"""
<div class="section">
  <div class="provider-header">
    <span class="provider-badge gemini">Gemini</span>
    <span style="font-size:13px;color:var(--text-muted);">Port 5002 &middot; 6 models &middot; Gemini CLI</span>
    <span class="badge warn" style="margin-left:auto;">{gemini_pass}/{gemini_total} PASS</span>
  </div>
  <div class="table-wrapper">
  <table>
    <thead><tr>
      <th>Model</th><th>Base</th><th>Time</th><th>Web</th><th>Time</th><th>JSON</th><th>Time</th><th>Error</th>
    </tr></thead>
    <tbody>
""")
for r in current["gemini"]:
    m = r["model"]
    b = r.get("base",{}); w = r.get("web",{}); j = r.get("json",{})
    err = b.get("error","") or w.get("error","") or j.get("error","")
    short_err = ""
    if "exhausted" in str(err): short_err = "Quota exhausted"
    elif "not found" in str(err).lower(): short_err = "Model not found"
    elif "No capacity" in str(err): short_err = "No capacity"
    html_parts.append(f"""    <tr>
      <td class="model-name">{m}</td>
      <td>{badge(b.get("ok"))}</td><td>{time_badge(b.get("time"))}</td>
      <td>{badge(w.get("ok"))}</td><td>{time_badge(w.get("time"))}</td>
      <td>{badge(j.get("ok"))}</td><td>{time_badge(j.get("time"))}</td>
      <td class="error-cell">{short_err}</td>
    </tr>""")

html_parts.append("    </tbody></table></div></div>")

# ── Spec Factory Registry ──
html_parts.append("""
<h2>Spec Factory &mdash; Provider Registry Audit</h2>

<h3>Production Providers (Direct API)</h3>
<div class="table-wrapper">
<table>
  <thead><tr><th>Provider</th><th>Model ID</th><th>Role</th><th>In Lab?</th><th>Lab Status</th><th>Notes</th></tr></thead>
  <tbody>
""")

# Gemini production
for i, (mid, role, in_lab, status, note) in enumerate([
    ("gemini-2.5-flash", "Primary", True, True, "Default model"),
    ("gemini-2.5-flash-lite", "Primary", True, True, ""),
    ("gemini-2.5-pro", "Reasoning", True, False, "No capacity in Lab"),
    ("gemini-3-flash-preview", "Primary", True, False, "Quota exhausted"),
]):
    prov = '<td rowspan="4">default-gemini</td>' if i == 0 else ""
    lab = badge(in_lab, "Yes") if in_lab else badge(False, "Not in Lab")
    st = badge(status, "Base OK") if status else badge(False)
    html_parts.append(f'    <tr>{prov}<td class="model-name">{mid}</td><td>{role}</td><td>{lab}</td><td>{st}</td><td>{note}</td></tr>')

# DeepSeek production
for i, (mid, role) in enumerate([("deepseek-chat", "Primary"), ("deepseek-reasoner", "Reasoning")]):
    prov = '<td rowspan="2">default-deepseek</td>' if i == 0 else ""
    html_parts.append(f'    <tr>{prov}<td class="model-name">{mid}</td><td>{role}</td><td>{badge("skip","N/A")}</td><td>-</td><td>API key required</td></tr>')

# Claude production
for i, (mid, role, in_lab, note) in enumerate([
    ("claude-haiku-4-5", "Primary", True, ""),
    ("claude-sonnet-4-6", "Reasoning", False, "Not in Lab - should add"),
    ("claude-opus-4-6", "Reasoning", True, ""),
]):
    prov = '<td rowspan="3">default-anthropic</td>' if i == 0 else ""
    lab = badge(in_lab, "Yes") if in_lab else badge(False, "Not in Lab")
    st = badge("warn", "Auth Expired") if in_lab else "-"
    html_parts.append(f'    <tr>{prov}<td class="model-name">{mid}</td><td>{role}</td><td>{lab}</td><td>{st}</td><td>{note}</td></tr>')

# OpenAI production
openai_prod = [
    ("gpt-4.1", "Primary", False, "API key required"),
    ("gpt-4.1-mini", "Primary", False, ""),
    ("gpt-4.1-nano", "Primary", False, ""),
    ("gpt-4o", "Primary", False, "Retiring"),
    ("gpt-4o-mini", "Primary", False, "Retiring"),
    ("gpt-5", "Primary", True, ""),
    ("gpt-5-mini", "Primary", False, ""),
    ("gpt-5.1", "Primary", True, ""),
    ("gpt-5.2", "Primary", True, ""),
    ("gpt-5.2-pro", "Reasoning", False, ""),
]
for i, (mid, role, in_lab, note) in enumerate(openai_prod):
    prov = f'<td rowspan="{len(openai_prod)}">default-openai</td>' if i == 0 else ""
    lab = badge(in_lab, "Yes") if in_lab else badge(False, "Not in Lab")
    st = badge(True) if in_lab else "-"
    html_parts.append(f'    <tr>{prov}<td class="model-name">{mid}</td><td>{role}</td><td>{lab}</td><td>{st}</td><td>{note}</td></tr>')

html_parts.append("  </tbody></table></div>")

# ── Lab Providers ──
html_parts.append("""
<h3>Lab Providers (localhost)</h3>
<div class="table-wrapper">
<table>
  <thead><tr><th>Provider</th><th>Model ID</th><th>Thinking</th><th>Web Search</th><th>Current Status</th></tr></thead>
  <tbody>
""")

# Lab OpenAI
lab_openai = [
    ("gpt-5", True, True), ("gpt-5-high", True, True), ("gpt-5-medium", True, True),
    ("gpt-5-low", True, True), ("gpt-5-minimal", False, True),
    ("gpt-5.1", True, True), ("gpt-5.1-high", False, True),
    ("gpt-5.1-medium", True, True), ("gpt-5.1-low", False, True),
    ("gpt-5.2", True, True), ("gpt-5.2-xhigh", True, True),
    ("gpt-5.2-high", False, True), ("gpt-5.2-medium", True, True), ("gpt-5.2-low", True, True),
    ("gpt-5.4", True, True), ("gpt-5.4-xhigh", False, True),
    ("gpt-5.4-high", True, True), ("gpt-5.4-medium", True, True), ("gpt-5.4-low", True, True),
]
for i, (mid, think, web) in enumerate(lab_openai):
    prov = f'<td rowspan="{len(lab_openai)}">lab-openai<br><small>:5001</small></td>' if i == 0 else ""
    html_parts.append(f'    <tr>{prov}<td class="model-name">{mid}</td><td>{badge(think, "Yes") if think else badge(False, "No")}</td><td>{badge(web, "Yes")}</td><td>{badge(True)}</td></tr>')

# Lab Gemini
lab_gemini = [
    ("gemini-2.5-flash-lite", True), ("gemini-2.5-flash", True),
    ("gemini-2.5-pro", False), ("gemini-3-flash-preview", False),
    ("gemini-3.1-flash-lite-preview", False), ("gemini-3.1-pro-preview", "warn"),
]
for i, (mid, status) in enumerate(lab_gemini):
    prov = f'<td rowspan="{len(lab_gemini)}">lab-gemini<br><small>:5002</small></td>' if i == 0 else ""
    if status is True: st = badge(True, "Base OK")
    elif status == "warn": st = badge("warn", "Partial")
    else: st = badge(False)
    html_parts.append(f'    <tr>{prov}<td class="model-name">{mid}</td><td>{badge("skip","N/A")}</td><td>{badge(True, "Yes")}</td><td>{st}</td></tr>')

# Lab Claude
lab_claude = ["claude-sonnet-4-5", "claude-opus-4-1", "claude-opus-4-6", "claude-haiku-4-5"]
for i, mid in enumerate(lab_claude):
    prov = f'<td rowspan="{len(lab_claude)}">lab-claude<br><small>:5003</small></td>' if i == 0 else ""
    html_parts.append(f'    <tr>{prov}<td class="model-name">{mid}</td><td>{badge(True, "Yes")}</td><td>{badge(True, "Yes")}</td><td>{badge(False)}</td></tr>')

html_parts.append("  </tbody></table></div>")

# ── Missing Models ──
html_parts.append("""
<h2>Missing Models &mdash; Gap Analysis</h2>
<p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">Models available from providers but not yet in LLM Lab or Spec Factory registries.</p>

<div class="missing-grid">
  <div class="missing-card" style="border-left:4px solid #10a37f;">
    <h4><span class="provider-badge openai">OpenAI</span> Not in Lab or SF</h4>
    <ul>
      <li>gpt-5.3 <span class="badge new">NEW</span></li>
      <li>gpt-5.3-codex <span class="badge new">NEW</span> (coding specialist)</li>
      <li>gpt-5.4-mini <span class="badge new">NEW</span> (400k ctx, $0.75/MTok)</li>
      <li>gpt-5.4-nano <span class="badge new">NEW</span> (400k ctx, $0.20/MTok)</li>
      <li>o3 <span class="badge new">NEW</span> (200k ctx, reasoning)</li>
      <li>o3-pro (extended reasoning)</li>
      <li>o4-mini <span class="badge new">NEW</span> (200k ctx, reasoning)</li>
      <li>o3-deep-research (deep analysis)</li>
      <li>o4-mini-deep-research (deep analysis)</li>
    </ul>
  </div>
  <div class="missing-card" style="border-left:4px solid #d4a574;">
    <h4><span class="provider-badge claude">Claude</span> Gaps</h4>
    <ul>
      <li>claude-sonnet-4-6 <span class="badge new">NEW</span> (in SF, not in Lab)</li>
    </ul>
    <h4 style="margin-top:12px;">Legacy (Not in Lab)</h4>
    <ul>
      <li>claude-opus-4-5 (MODEL_NOT_ALLOWED)</li>
      <li>claude-sonnet-4-0 (legacy)</li>
      <li>claude-opus-4-0 (legacy)</li>
    </ul>
  </div>
  <div class="missing-card" style="border-left:4px solid #4285f4;">
    <h4><span class="provider-badge gemini">Gemini</span> Not in SF Registry</h4>
    <ul>
      <li>gemini-3.1-flash-lite-preview <span class="badge new">NEW</span> (in Lab)</li>
      <li>gemini-3.1-pro-preview <span class="badge new">NEW</span> (in Lab)</li>
      <li>gemini-3-flash <span class="badge new">GA</span> (production ready)</li>
      <li>gemini-3.1-flash-image-preview (image gen)</li>
      <li>gemini-3.1-flash-live-preview (voice/audio)</li>
    </ul>
  </div>
</div>
""")

# ── Issues ──
html_parts.append("""
<h2>Issues &amp; Action Items</h2>
<div class="table-wrapper">
<table>
  <thead><tr><th>Priority</th><th>Issue</th><th>Impact</th><th>Action</th></tr></thead>
  <tbody>
    <tr><td><span class="badge fail">CRITICAL</span></td><td>Claude Lab OAuth token expired</td><td>All 4 Claude Lab models non-functional</td><td>Re-authenticate via login container</td></tr>
    <tr><td><span class="badge fail">HIGH</span></td><td>claude-sonnet-4-6 not in Lab</td><td>SF registry references it, Lab can't serve it</td><td>Add to CLAUDE_MODELS in Lab .env</td></tr>
    <tr><td><span class="badge warn">MEDIUM</span></td><td>Gemini free-tier quota exhaustion</td><td>Most Gemini models fail under any load</td><td>Consider paid quota or rate limiting</td></tr>
    <tr><td><span class="badge warn">MEDIUM</span></td><td>gemini-3.1-flash-lite-preview: "not found"</td><td>Registered in Lab but CLI can't resolve</td><td>Verify Gemini CLI version supports model</td></tr>
    <tr><td><span class="badge warn">MEDIUM</span></td><td>GPT-5.4 web search latency (12-28s)</td><td>May exceed SF 30s timeout</td><td>Raise llmTimeoutMs for 5.4 web phases</td></tr>
    <tr><td><span class="badge info">LOW</span></td><td>9 new OpenAI models not in registry</td><td>Not available for SF pipeline</td><td>Evaluate GPT-5.3, 5.4-mini/nano, o3/o4</td></tr>
    <tr><td><span class="badge info">LOW</span></td><td>2 Gemini models in Lab but not SF</td><td>Lab has them, SF can't route</td><td>Add to SF registry</td></tr>
    <tr><td><span class="badge info">LOW</span></td><td>JSON mode returns invalid JSON (gpt-5-medium/low)</td><td>SF post-processing handles this</td><td>Low impact, monitor</td></tr>
    <tr><td><span class="badge info">LOW</span></td><td>gpt-4o / gpt-4o-mini being retired</td><td>In SF registry but being discontinued</td><td>Remove in next cleanup</td></tr>
  </tbody>
</table>
</div>
""")

# ── Performance Heatmap ──
html_parts.append("""
<h2>OpenAI Performance Heatmap</h2>
<p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">Response times across test types.</p>
<div class="table-wrapper">
<table>
  <thead><tr><th>Model</th><th style="text-align:center">Base</th><th style="text-align:center">Thinking</th><th style="text-align:center">Web Search</th><th style="text-align:center">JSON</th><th style="text-align:center">Avg</th></tr></thead>
  <tbody>
""")
for r in current["openai"]:
    bt = r.get("base",{}).get("time",0)
    tt = r.get("thinking",{}).get("time",0)
    wt = r.get("web",{}).get("time",0)
    jt = r.get("json",{}).get("time",0)
    avg = round((bt+tt+wt+jt)/4, 1)
    html_parts.append(f'    <tr><td class="model-name">{r["model"]}</td><td style="text-align:center">{time_badge(bt)}</td><td style="text-align:center">{time_badge(tt)}</td><td style="text-align:center">{time_badge(wt)}</td><td style="text-align:center">{time_badge(jt)}</td><td style="text-align:center">{time_badge(avg)}</td></tr>')

html_parts.append("  </tbody></table></div>")

# ── Delta Comparison ──
html_parts.append("""
<h2>Delta: Previous vs Current (OpenAI)</h2>
<p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">March 28 baseline vs April 2 current. Positive = slower.</p>
<div class="table-wrapper">
<table>
  <thead><tr><th>Model</th><th>Prev Base</th><th>Curr Base</th><th>Delta</th><th>Prev Think</th><th>Curr Think</th><th>Delta</th><th>Prev Web</th><th>Curr Web</th><th>Delta</th></tr></thead>
  <tbody>
""")
prev_map = {r["model"]: r for r in prev_openai}
for r in current["openai"]:
    m = r["model"]
    p = prev_map.get(m, {})
    pb = p.get("base",{}).get("time"); cb = r.get("base",{}).get("time")
    pt = p.get("thinking",{}).get("time"); ct = r.get("thinking",{}).get("time")
    pw = p.get("web",{}).get("time"); cw = r.get("web",{}).get("time")
    html_parts.append(f'    <tr><td class="model-name">{m}</td><td>{time_badge(pb)}</td><td>{time_badge(cb)}</td><td>{delta_cell(pb,cb)}</td><td>{time_badge(pt)}</td><td>{time_badge(ct)}</td><td>{delta_cell(pt,ct)}</td><td>{time_badge(pw)}</td><td>{time_badge(cw)}</td><td>{delta_cell(pw,cw)}</td></tr>')

html_parts.append("""  </tbody></table></div>

<footer>
  <p>LLM Model Validation Report &middot; Spec Factory + LLM Lab &middot; April 2, 2026</p>
  <p>Sources: OpenAI API, Anthropic Claude API, Google Gemini API, LLM Lab test matrices</p>
</footer>
</body></html>""")

# Write
html = "\n".join(html_parts)
output_path = os.path.join(SCRIPT_DIR, "model-validation-report.html")
with open(output_path, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Report written to: {output_path}")
print(f"Size: {len(html):,} bytes")
print(f"OpenAI: {openai_pass}/{openai_total} pass ({round(openai_pass/openai_total*100)}%)")
print(f"Claude: {claude_pass}/{claude_total} pass (auth expired)")
print(f"Gemini: {gemini_pass}/{gemini_total} pass (quota issues)")
