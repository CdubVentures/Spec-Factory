import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  getLegacyBackendGraphPath,
  getLegacyBoundaryMatrixPath,
  getLegacyBoundaryReportPath,
  getLegacyBoundaryWaiversPath,
  getLegacyGuiGraphPath,
} from './archivePaths.mjs';

function toObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function toArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function normalizeZoneToken(value) {
  return String(value || '').trim();
}

export function buildLaneIndex(lanes = {}) {
  const index = new Map();
  const source = toObject(lanes, {});
  for (const [lane, zones] of Object.entries(source)) {
    for (const zone of toArray(zones, [])) {
      const token = normalizeZoneToken(zone);
      if (!token) continue;
      index.set(token, lane);
    }
  }
  return index;
}

export function resolveWaiverStatus(waiver = {}, nowIso = null) {
  const nowMs = Date.parse(String(nowIso || new Date().toISOString()));
  const status = String(waiver?.status || 'open').trim().toLowerCase();
  const expiresAt = String(waiver?.expires_at || '').trim();
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (status !== 'open') {
    return { state: 'inactive', reason: 'status_not_open' };
  }
  if (Number.isFinite(expiresMs) && Number.isFinite(nowMs) && expiresMs < nowMs) {
    return { state: 'expired', reason: 'expired' };
  }
  return { state: 'active', reason: 'open' };
}

function collectCrossZoneEdges(graph = {}) {
  const out = [];
  for (const row of toArray(graph?.top_cross_zone_edges, [])) {
    out.push({
      from: normalizeZoneToken(row?.from),
      to: normalizeZoneToken(row?.to),
      edges: Number.parseInt(String(row?.edges ?? 0), 10) || 0,
    });
  }
  return out.filter((row) => row.from && row.to && row.edges > 0);
}

function inferWaiverMatchFromScope(waiver = {}) {
  const scope = String(waiver?.scope || '').trim().toLowerCase();
  if (!scope) return null;
  if (scope === 'backend_cycle') {
    return { type: 'cycle', domain: 'backend' };
  }
  if (scope.includes('components_to_pages')) {
    return { type: 'zone_pair', domain: 'gui', from_zone: 'components', to_zone: 'pages' };
  }
  if (scope.includes('components_to_stores')) {
    return { type: 'zone_pair', domain: 'gui', from_zone: 'components', to_zone: 'stores' };
  }
  return null;
}

function normalizeWaiverMatch(waiver = {}) {
  if (waiver?.match && typeof waiver.match === 'object') {
    return waiver.match;
  }
  return inferWaiverMatchFromScope(waiver);
}

function waiverMatchesViolation(match, violation) {
  if (!match || typeof match !== 'object') return false;
  const type = String(match.type || '').trim().toLowerCase();
  const domain = normalizeZoneToken(match.domain);
  if (domain && domain !== violation.domain) return false;

  if (type === 'cycle') {
    return violation.type === 'cycle';
  }
  if (type === 'zone_pair') {
    const fromZone = normalizeZoneToken(match.from_zone);
    const toZone = normalizeZoneToken(match.to_zone);
    if (fromZone && fromZone !== violation.from_zone) return false;
    if (toZone && toZone !== violation.to_zone) return false;
    const code = normalizeZoneToken(match.code);
    if (code && code !== violation.code) return false;
    return true;
  }
  if (type === 'code') {
    const code = normalizeZoneToken(match.code);
    return Boolean(code) && code === violation.code;
  }
  return false;
}

function createViolation({
  domain,
  type,
  severity,
  code = '',
  fromZone = '',
  toZone = '',
  fromLane = '',
  toLane = '',
  edgeCount = 0,
  message = '',
}) {
  return {
    id: `${domain}:${type}:${fromZone || '-'}=>${toZone || '-'}:${code || '-'}`,
    domain,
    type,
    severity,
    code,
    from_zone: fromZone,
    to_zone: toZone,
    from_lane: fromLane,
    to_lane: toLane,
    edge_count: edgeCount,
    message,
    waived: false,
    waiver_id: '',
  };
}

function detectHardForbiddenViolations({
  domain,
  fromZone,
  toZone,
  fromLane,
  toLane,
  edgeCount,
}) {
  const out = [];
  if (domain === 'backend') {
    if (fromLane && fromLane !== 'entry' && (toZone === 'api' || toZone === 'cli')) {
      out.push(createViolation({
        domain,
        type: 'hard_forbidden',
        severity: 'blocker',
        code: 'BE-HARD-001',
        fromZone,
        toZone,
        fromLane,
        toLane,
        edgeCount,
        message: 'No non-entry lane may import api or cli.',
      }));
    }
    if (fromLane && !['entry', 'composition'].includes(fromLane) && toZone === 'app') {
      out.push(createViolation({
        domain,
        type: 'hard_forbidden',
        severity: 'blocker',
        code: 'BE-HARD-002',
        fromZone,
        toZone,
        fromLane,
        toLane,
        edgeCount,
        message: 'Only entry and composition lanes may import app.',
      }));
    }
  }
  if (domain === 'gui') {
    if (fromZone === 'components' && toZone === 'pages') {
      out.push(createViolation({
        domain,
        type: 'hard_forbidden',
        severity: 'blocker',
        code: 'GUI-HARD-001',
        fromZone,
        toZone,
        fromLane,
        toLane,
        edgeCount,
        message: 'components may not import pages.',
      }));
    }
    if (fromZone === 'components' && toZone === 'stores') {
      out.push(createViolation({
        domain,
        type: 'hard_forbidden',
        severity: 'blocker',
        code: 'GUI-HARD-002',
        fromZone,
        toZone,
        fromLane,
        toLane,
        edgeCount,
        message: 'components may not import stores.',
      }));
    }
    if (fromLane && fromLane !== 'entry' && (toZone === 'main.tsx' || toZone === 'App.tsx')) {
      out.push(createViolation({
        domain,
        type: 'hard_forbidden',
        severity: 'blocker',
        code: 'GUI-HARD-003',
        fromZone,
        toZone,
        fromLane,
        toLane,
        edgeCount,
        message: 'Only entry lane may import main.tsx/App.tsx.',
      }));
    }
  }
  return out;
}

function validateGraphDomain({
  domain,
  graph,
  laneIndex,
  allowedLaneDeps,
}) {
  const violations = [];
  const warnings = [];
  const crossEdges = collectCrossZoneEdges(graph);

  for (const edge of crossEdges) {
    const fromZone = edge.from;
    const toZone = edge.to;
    const edgeCount = edge.edges;
    const fromLane = laneIndex.get(fromZone) || '';
    const toLane = laneIndex.get(toZone) || '';

    if (!fromLane || !toLane) {
      warnings.push({
        domain,
        type: 'unknown_zone',
        from_zone: fromZone,
        to_zone: toZone,
        edge_count: edgeCount,
        message: 'Zone could not be mapped to a lane.',
      });
    } else {
      const allowList = toArray(allowedLaneDeps[fromLane], []);
      if (!allowList.includes(toLane)) {
        violations.push(createViolation({
          domain,
          type: 'lane_violation',
          severity: 'major',
          code: 'LANE-RULE',
          fromZone,
          toZone,
          fromLane,
          toLane,
          edgeCount,
          message: `Lane ${fromLane} may not depend on ${toLane}.`,
        }));
      }
    }

    violations.push(...detectHardForbiddenViolations({
      domain,
      fromZone,
      toZone,
      fromLane,
      toLane,
      edgeCount,
    }));
  }

  const cycleCount = Number.parseInt(String(graph?.cycle_count ?? 0), 10) || 0;
  if (cycleCount > 0) {
    violations.push(createViolation({
      domain,
      type: 'cycle',
      severity: 'blocker',
      code: domain === 'backend' ? 'BE-HARD-004' : 'GUI-HARD-004',
      edgeCount: cycleCount,
      message: `${domain} graph contains ${cycleCount} cycle(s).`,
    }));
  }

  return {
    violations,
    warnings,
    metrics: {
      files: Number.parseInt(String(graph?.files ?? 0), 10) || 0,
      edges: Number.parseInt(String(graph?.edges ?? 0), 10) || 0,
      cross_zone_edges_considered: crossEdges.length,
      cycle_count: cycleCount,
    },
  };
}

function applyWaiversToViolations({ violations, activeWaivers }) {
  for (const violation of violations) {
    for (const waiver of activeWaivers) {
      const match = normalizeWaiverMatch(waiver);
      if (waiverMatchesViolation(match, violation)) {
        violation.waived = true;
        violation.waiver_id = String(waiver.id || '');
        break;
      }
    }
  }
}

function groupSeverity(violations) {
  const summary = {
    blocker: 0,
    critical: 0,
    major: 0,
    minor: 0,
  };
  for (const row of violations) {
    const key = String(row?.severity || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(summary, key)) {
      summary[key] += 1;
    }
  }
  return summary;
}

export function buildBoundaryReport({
  matrix,
  waivers,
  backendGraph,
  guiGraph,
  nowIso = null,
  mode = 'report-only',
} = {}) {
  const nowToken = String(nowIso || new Date().toISOString());
  const matrixObj = toObject(matrix, {});
  const waiverRows = toArray(waivers?.waivers, []);

  const activeWaivers = [];
  const expiredWaivers = [];
  const inactiveWaivers = [];
  for (const waiver of waiverRows) {
    const status = resolveWaiverStatus(waiver, nowToken);
    const row = {
      id: String(waiver?.id || ''),
      scope: String(waiver?.scope || ''),
      match: normalizeWaiverMatch(waiver),
      status: String(waiver?.status || 'open'),
      expires_at: String(waiver?.expires_at || ''),
      state: status.state,
      reason: status.reason,
    };
    if (status.state === 'active') activeWaivers.push({ ...waiver, _audit: row });
    else if (status.state === 'expired') expiredWaivers.push(row);
    else inactiveWaivers.push(row);
  }

  const backendLanes = toObject(matrixObj?.backend?.lanes, {});
  const guiLanes = toObject(matrixObj?.gui?.lanes, {});
  const backendAllowed = toObject(matrixObj?.backend?.allowed_lane_dependencies, {});
  const guiAllowed = toObject(matrixObj?.gui?.allowed_lane_dependencies, {});

  const backendResult = validateGraphDomain({
    domain: 'backend',
    graph: toObject(backendGraph, {}),
    laneIndex: buildLaneIndex(backendLanes),
    allowedLaneDeps: backendAllowed,
  });
  const guiResult = validateGraphDomain({
    domain: 'gui',
    graph: toObject(guiGraph, {}),
    laneIndex: buildLaneIndex(guiLanes),
    allowedLaneDeps: guiAllowed,
  });

  applyWaiversToViolations({ violations: backendResult.violations, activeWaivers });
  applyWaiversToViolations({ violations: guiResult.violations, activeWaivers });

  const allViolations = [...backendResult.violations, ...guiResult.violations];
  const waivedCount = allViolations.filter((row) => row.waived).length;
  const unwaived = allViolations.filter((row) => !row.waived);

  return {
    generated_at: nowToken,
    mode,
    summary: {
      total_violations: allViolations.length,
      unwaived_violations: unwaived.length,
      waived_violations: waivedCount,
      by_severity_unwaived: groupSeverity(unwaived),
      active_waivers: activeWaivers.length,
      expired_waivers: expiredWaivers.length,
    },
    domains: {
      backend: backendResult,
      gui: guiResult,
    },
    waiver_audit: {
      active: activeWaivers.map((row) => row._audit),
      expired: expiredWaivers,
      inactive: inactiveWaivers,
    },
  };
}

function readJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !String(next).startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function severityRank(severity) {
  const token = String(severity || '').trim().toLowerCase();
  const rank = {
    minor: 1,
    major: 2,
    critical: 3,
    blocker: 4,
  };
  return rank[token] || 0;
}

function reportShouldFail({ report, failOn }) {
  const threshold = String(failOn || '').trim().toLowerCase();
  if (!threshold) return false;
  const minRank = severityRank(threshold);
  if (minRank === 0) return false;
  return report.summary && Object.entries(report.summary.by_severity_unwaived || {}).some(([severity, count]) => {
    return Number(count || 0) > 0 && severityRank(severity) >= minRank;
  });
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const matrixPath = path.resolve(args.matrix || getLegacyBoundaryMatrixPath());
  const waiverPath = path.resolve(args.waivers || getLegacyBoundaryWaiversPath());
  const backendGraphPath = path.resolve(args['backend-graph'] || getLegacyBackendGraphPath());
  const guiGraphPath = path.resolve(args['gui-graph'] || getLegacyGuiGraphPath());
  const outPath = path.resolve(args.out || getLegacyBoundaryReportPath());
  const nowIso = args.now || new Date().toISOString();
  const mode = args['report-only'] === 'false' ? 'enforce' : 'report-only';
  const failOn = args['fail-on'] || '';

  const matrix = readJson(matrixPath);
  const waivers = readJson(waiverPath);
  const backendGraph = readJson(backendGraphPath);
  const guiGraph = readJson(guiGraphPath);

  const report = buildBoundaryReport({
    matrix,
    waivers,
    backendGraph,
    guiGraph,
    nowIso,
    mode,
  });

  ensureParentDir(outPath);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // Keep output terse for CI logs.
  console.log(`boundary_report=${outPath}`);
  console.log(`total_violations=${report.summary.total_violations}`);
  console.log(`unwaived_violations=${report.summary.unwaived_violations}`);
  console.log(`active_waivers=${report.summary.active_waivers}`);
  console.log(`expired_waivers=${report.summary.expired_waivers}`);

  if (mode !== 'report-only' && reportShouldFail({ report, failOn })) {
    return 1;
  }
  return 0;
}

const isCliEntry = (() => {
  const entryArg = process.argv[1];
  if (!entryArg) return false;
  return import.meta.url === pathToFileURL(path.resolve(entryArg)).href;
})();

if (isCliEntry) {
  const code = runCli(process.argv.slice(2));
  if (code !== 0) process.exit(code);
}
