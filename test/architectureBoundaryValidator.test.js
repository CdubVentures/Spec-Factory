import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBoundaryReport,
  resolveWaiverStatus,
  buildLaneIndex,
} from '../tools/architecture/validate-boundaries.mjs';

function createMatrix() {
  return {
    version: 'v-test',
    backend: {
      lanes: {
        foundation: ['core'],
        domain: ['catalog', 'queue'],
        entry: ['api'],
      },
      allowed_lane_dependencies: {
        foundation: ['foundation'],
        domain: ['foundation', 'domain'],
        entry: ['foundation', 'domain', 'entry'],
      },
      hard_forbidden_rules: [
        { id: 'BE-HARD-001', rule: 'No non-entry lane may import api or cli.' },
      ],
    },
    gui: {
      lanes: {
        entry: ['App.tsx'],
        pages: ['pages'],
        components: ['components'],
        stores: ['stores'],
        foundation: ['types', 'utils'],
      },
      allowed_lane_dependencies: {
        entry: ['pages', 'components', 'stores', 'foundation'],
        pages: ['components', 'stores', 'foundation'],
        components: ['foundation'],
        stores: ['foundation'],
        foundation: ['foundation'],
      },
      hard_forbidden_rules: [
        { id: 'GUI-HARD-001', rule: 'components may not import pages.' },
        { id: 'GUI-HARD-002', rule: 'components may not import stores (target-state rule).' },
      ],
    },
  };
}

function createGraph({
  label,
  cross = [],
  cycleCount = 0,
} = {}) {
  return {
    label,
    files: 10,
    edges: 20,
    cycle_count: cycleCount,
    top_cross_zone_edges: cross.map((row) => ({
      pair: `${row.from}=>${row.to}`,
      from: row.from,
      to: row.to,
      edges: row.edges ?? 1,
    })),
  };
}

test('buildLaneIndex resolves zone to lane map', () => {
  const index = buildLaneIndex({
    foundation: ['core', 'utils'],
    domain: ['catalog'],
  });
  assert.equal(index.get('core'), 'foundation');
  assert.equal(index.get('utils'), 'foundation');
  assert.equal(index.get('catalog'), 'domain');
});

test('report includes unwaived backend lane violation and hard-forbidden violation', () => {
  const report = buildBoundaryReport({
    matrix: createMatrix(),
    waivers: { waivers: [] },
    backendGraph: createGraph({
      label: 'backend',
      cross: [{ from: 'catalog', to: 'api', edges: 3 }],
    }),
    guiGraph: createGraph({
      label: 'gui',
      cross: [],
    }),
    nowIso: '2026-03-04T00:00:00.000Z',
  });

  const backendViolations = report.domains.backend.violations.filter((v) => !v.waived);
  assert.equal(backendViolations.some((v) => v.type === 'lane_violation'), true);
  assert.equal(backendViolations.some((v) => v.type === 'hard_forbidden' && v.code === 'BE-HARD-001'), true);
});

test('active waiver suppresses matching gui violation', () => {
  const report = buildBoundaryReport({
    matrix: createMatrix(),
    waivers: {
      waivers: [
        {
          id: 'W-GUI-1',
          status: 'open',
          expires_at: '2026-06-30T00:00:00.000Z',
          match: {
            type: 'zone_pair',
            domain: 'gui',
            from_zone: 'components',
            to_zone: 'pages',
          },
        },
      ],
    },
    backendGraph: createGraph({ label: 'backend' }),
    guiGraph: createGraph({
      label: 'gui',
      cross: [{ from: 'components', to: 'pages', edges: 5 }],
    }),
    nowIso: '2026-03-04T00:00:00.000Z',
  });

  const match = report.domains.gui.violations.find((v) => v.from_zone === 'components' && v.to_zone === 'pages');
  assert.ok(match);
  assert.equal(match.waived, true);
  assert.equal(match.waiver_id, 'W-GUI-1');
});

test('expired waiver is reported and does not waive violation', () => {
  const report = buildBoundaryReport({
    matrix: createMatrix(),
    waivers: {
      waivers: [
        {
          id: 'W-EXPIRED',
          status: 'open',
          expires_at: '2026-01-01T00:00:00.000Z',
          match: {
            type: 'zone_pair',
            domain: 'gui',
            from_zone: 'components',
            to_zone: 'stores',
          },
        },
      ],
    },
    backendGraph: createGraph({ label: 'backend' }),
    guiGraph: createGraph({
      label: 'gui',
      cross: [{ from: 'components', to: 'stores', edges: 2 }],
    }),
    nowIso: '2026-03-04T00:00:00.000Z',
  });

  const violation = report.domains.gui.violations.find((v) => v.from_zone === 'components' && v.to_zone === 'stores');
  assert.ok(violation);
  assert.equal(violation.waived, false);
  assert.equal(report.waiver_audit.expired.some((w) => w.id === 'W-EXPIRED'), true);
});

test('scope fallback waiver backend_cycle waives cycle violation', () => {
  const report = buildBoundaryReport({
    matrix: createMatrix(),
    waivers: {
      waivers: [
        {
          id: 'W-CYCLE',
          scope: 'backend_cycle',
          status: 'open',
          expires_at: '2026-06-30T00:00:00.000Z',
        },
      ],
    },
    backendGraph: createGraph({ label: 'backend', cycleCount: 1 }),
    guiGraph: createGraph({ label: 'gui' }),
    nowIso: '2026-03-04T00:00:00.000Z',
  });

  const cycleViolation = report.domains.backend.violations.find((v) => v.type === 'cycle');
  assert.ok(cycleViolation);
  assert.equal(cycleViolation.waived, true);
  assert.equal(cycleViolation.waiver_id, 'W-CYCLE');
});

test('resolveWaiverStatus identifies active and expired waivers', () => {
  const nowIso = '2026-03-04T00:00:00.000Z';
  const active = resolveWaiverStatus({
    id: 'A',
    status: 'open',
    expires_at: '2026-06-30T00:00:00.000Z',
  }, nowIso);
  const expired = resolveWaiverStatus({
    id: 'E',
    status: 'open',
    expires_at: '2026-01-01T00:00:00.000Z',
  }, nowIso);
  assert.equal(active.state, 'active');
  assert.equal(expired.state, 'expired');
});
