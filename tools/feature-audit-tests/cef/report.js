// Renders the audit run results into a single-file standalone HTML report.
// Style mirrors docs/features-html/cef-validation-tests.html for visual continuity.

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
:root {
  --bg: #f8f9fa;
  --surface: #ffffff;
  --surface-alt: #f1f3f5;
  --border: #dee2e6;
  --border-light: #e9ecef;
  --text: #212529;
  --text-muted: #6c757d;
  --accent: #4263eb;
  --accent-light: #edf2ff;
  --green: #2b8a3e;
  --green-bg: #ebfbee;
  --red: #c92a2a;
  --red-bg: #fff5f5;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --mono: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font); color: var(--text); background: var(--bg); line-height: 1.5; }
.header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 28px 0; text-align: center; }
.header h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
.header .meta { color: var(--text-muted); font-size: 14px; margin-top: 6px; }
.container { max-width: 1200px; margin: 0 auto; padding: 28px 24px; }
.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; box-shadow: var(--shadow); }
.stat .label { color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.stat .value { font-size: 26px; font-weight: 700; }
.stat.pass .value { color: var(--green); }
.stat.fail .value { color: var(--red); }
.overview { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0; margin-bottom: 28px; box-shadow: var(--shadow); overflow: hidden; }
.overview h2 { padding: 14px 20px; font-size: 15px; font-weight: 600; border-bottom: 1px solid var(--border-light); background: var(--surface-alt); }
.overview table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.overview th, .overview td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border-light); }
.overview th { background: var(--surface-alt); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-muted); }
.overview tr:last-child td { border-bottom: none; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); margin-bottom: 16px; overflow: hidden; }
.card-header { padding: 14px 20px; border-bottom: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.card-header h3 { font-size: 16px; font-weight: 600; }
.card-header .gate { color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.card-body { padding: 16px 20px; font-size: 14px; }
.card-body .desc { color: var(--text-muted); margin-bottom: 14px; }
.steps { margin-bottom: 14px; }
.steps h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 6px; }
.steps ul { list-style: none; padding-left: 0; }
.steps li { padding: 6px 10px; margin-bottom: 4px; background: var(--surface-alt); border-radius: 4px; font-size: 13px; font-family: var(--mono); }
.checks h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 6px; }
.checks table { width: 100%; border-collapse: collapse; font-size: 13px; }
.checks th, .checks td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border-light); vertical-align: top; }
.checks th { background: var(--surface-alt); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-muted); }
.checks code { font-family: var(--mono); font-size: 12px; background: var(--surface-alt); padding: 1px 5px; border-radius: 3px; color: var(--text); word-break: break-word; white-space: pre-wrap; display: inline-block; max-width: 100%; }
.badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
.badge-pass { background: var(--green-bg); color: var(--green); }
.badge-fail { background: var(--red-bg); color: var(--red); }
.badge-error { background: var(--red-bg); color: var(--red); }
.row-pass td.status { color: var(--green); font-weight: 600; }
.row-fail td.status { color: var(--red); font-weight: 600; }
.error-block { background: var(--red-bg); border-left: 3px solid var(--red); padding: 10px 14px; font-family: var(--mono); font-size: 12px; color: var(--red); white-space: pre-wrap; word-break: break-word; margin-top: 10px; border-radius: 4px; }
footer { text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px 0; }
`;

function renderCheckRow(c) {
  const cls = c.pass ? 'row-pass' : 'row-fail';
  const status = c.pass ? 'PASS' : 'FAIL';
  return `
  <tr class="${cls}">
    <td class="status">${status}</td>
    <td>${esc(c.name)}</td>
    <td><code>${esc(c.actual)}</code></td>
    <td><code>${esc(c.expected)}</code></td>
  </tr>`;
}

function renderScenarioCard(res) {
  const passCount = res.checks.filter((c) => c.pass).length;
  const failCount = res.checks.length - passCount;
  const scenarioPass = failCount === 0 && !res.error;
  const badge = res.error
    ? `<span class="badge badge-error">ERROR</span>`
    : scenarioPass
      ? `<span class="badge badge-pass">PASS</span>`
      : `<span class="badge badge-fail">FAIL (${failCount})</span>`;

  const stepsHtml = (res.steps || []).map((s) => `<li>${esc(s)}</li>`).join('');
  const errorHtml = res.error ? `<div class="error-block">${esc(res.error)}</div>` : '';
  const checkRows = res.checks.map(renderCheckRow).join('');

  return `
  <div class="card">
    <div class="card-header">
      <div>
        <h3>${esc(res.id)} — ${esc(res.title)}</h3>
        <div class="gate">${esc(res.gate || '')} · ${esc(res.productId)} · ${res.durationMs}ms</div>
      </div>
      ${badge}
    </div>
    <div class="card-body">
      <p class="desc">${esc(res.description)}</p>
      ${stepsHtml ? `<div class="steps"><h4>Steps</h4><ul>${stepsHtml}</ul></div>` : ''}
      ${errorHtml}
      ${res.checks.length > 0 ? `
      <div class="checks">
        <h4>Checks (${passCount}/${res.checks.length} passed)</h4>
        <table>
          <thead><tr><th>Status</th><th>Check</th><th>Actual</th><th>Expected</th></tr></thead>
          <tbody>${checkRows}</tbody>
        </table>
      </div>` : ''}
    </div>
  </div>`;
}

export function renderHtmlReport({ results, runStartedAt, durationMs }) {
  const total = results.length;
  const passed = results.filter((r) => !r.error && r.checks.every((c) => c.pass)).length;
  const failed = total - passed;
  const totalChecks = results.reduce((sum, r) => sum + r.checks.length, 0);
  const passedChecks = results.reduce((sum, r) => sum + r.checks.filter((c) => c.pass).length, 0);

  const overviewRows = results.map((r) => {
    const scenarioPass = !r.error && r.checks.every((c) => c.pass);
    const badge = r.error
      ? `<span class="badge badge-error">ERROR</span>`
      : scenarioPass
        ? `<span class="badge badge-pass">PASS</span>`
        : `<span class="badge badge-fail">FAIL</span>`;
    return `
      <tr>
        <td><strong>${esc(r.id)}</strong></td>
        <td>${esc(r.title)}</td>
        <td>${esc(r.gate || '')}</td>
        <td>${r.checks.filter((c) => c.pass).length} / ${r.checks.length}</td>
        <td>${r.durationMs}ms</td>
        <td>${badge}</td>
      </tr>`;
  }).join('');

  const cards = results.map(renderScenarioCard).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CEF Feature Audit Report</title>
<style>${CSS}</style>
</head>
<body>
<div class="header">
  <h1>CEF Feature Audit Report</h1>
  <div class="meta">Generated ${esc(runStartedAt)} · Runtime ${durationMs}ms · Deterministic (LLM stubbed)</div>
</div>
<div class="container">
  <div class="summary">
    <div class="stat"><div class="label">Scenarios</div><div class="value">${total}</div></div>
    <div class="stat pass"><div class="label">Passed</div><div class="value">${passed}</div></div>
    <div class="stat ${failed > 0 ? 'fail' : ''}"><div class="label">Failed</div><div class="value">${failed}</div></div>
    <div class="stat"><div class="label">Checks</div><div class="value">${passedChecks}/${totalChecks}</div></div>
  </div>

  <div class="overview">
    <h2>Summary</h2>
    <table>
      <thead><tr><th>ID</th><th>Scenario</th><th>Gate</th><th>Checks</th><th>Time</th><th>Result</th></tr></thead>
      <tbody>${overviewRows}</tbody>
    </table>
  </div>

  ${cards}

  <footer>Audit tool at tools/feature-audit-tests/cef/ · Uses _callLlmOverride + _callIdentityCheckOverride seams · No real LLM calls</footer>
</div>
</body>
</html>`;
}
