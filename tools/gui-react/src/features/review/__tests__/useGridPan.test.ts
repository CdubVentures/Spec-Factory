import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPanSession,
  computeReleaseVelocity,
  applyInertiaStep,
  INERTIA_FRICTION,
  INERTIA_MIN_VELOCITY,
} from '../hooks/useGridPan.ts';

// ── PanSession tests ──

describe('createPanSession', () => {
  const DEFAULT_THRESHOLD = 5;

  it('starts with isPanning false', () => {
    const session = createPanSession(100, 200, 0, 0, DEFAULT_THRESHOLD);
    const result = session.onMove(100, 200);
    assert.equal(result.isPanning, false);
  });

  it('stays not panning when move is below threshold', () => {
    const session = createPanSession(100, 200, 0, 0, DEFAULT_THRESHOLD);
    const result = session.onMove(103, 200);
    assert.equal(result.isPanning, false);
  });

  it('starts panning when move reaches threshold', () => {
    const session = createPanSession(100, 200, 0, 0, DEFAULT_THRESHOLD);
    const result = session.onMove(105, 200);
    assert.equal(result.isPanning, true);
  });

  it('starts panning on diagonal move that exceeds threshold (3,4 = 5px hypotenuse)', () => {
    const session = createPanSession(100, 200, 0, 0, DEFAULT_THRESHOLD);
    const result = session.onMove(103, 204);
    assert.equal(result.isPanning, true);
  });

  it('does not pan on diagonal move below threshold (2,2 ≈ 2.83px)', () => {
    const session = createPanSession(100, 200, 0, 0, DEFAULT_THRESHOLD);
    const result = session.onMove(102, 202);
    assert.equal(result.isPanning, false);
  });

  it('computes correct scroll position: dragging right scrolls left', () => {
    const session = createPanSession(100, 200, 50, 80, DEFAULT_THRESHOLD);
    const result = session.onMove(130, 200);
    assert.equal(result.scrollLeft, 20);
    assert.equal(result.scrollTop, 80);
  });

  it('computes correct scroll position: dragging left scrolls right', () => {
    const session = createPanSession(100, 200, 50, 80, DEFAULT_THRESHOLD);
    const result = session.onMove(80, 200);
    assert.equal(result.scrollLeft, 70);
    assert.equal(result.scrollTop, 80);
  });

  it('computes correct scroll position: dragging down scrolls up', () => {
    const session = createPanSession(100, 200, 50, 80, DEFAULT_THRESHOLD);
    const result = session.onMove(100, 240);
    assert.equal(result.scrollTop, 40);
    assert.equal(result.scrollLeft, 50);
  });

  it('computes correct scroll position: diagonal drag', () => {
    const session = createPanSession(100, 200, 50, 80, DEFAULT_THRESHOLD);
    const result = session.onMove(110, 215);
    assert.equal(result.scrollLeft, 40);
    assert.equal(result.scrollTop, 65);
  });

  it('onEnd returns didPan: false when threshold was never exceeded', () => {
    const session = createPanSession(100, 200, 0, 0, DEFAULT_THRESHOLD);
    session.onMove(102, 201);
    const result = session.onEnd();
    assert.equal(result.didPan, false);
  });

  it('onEnd returns didPan: true when panning occurred', () => {
    const session = createPanSession(100, 200, 0, 0, DEFAULT_THRESHOLD);
    session.onMove(110, 200);
    const result = session.onEnd();
    assert.equal(result.didPan, true);
  });

  it('once panning starts, it stays panning even if pointer moves back near start', () => {
    const session = createPanSession(100, 200, 0, 0, DEFAULT_THRESHOLD);
    session.onMove(110, 200);
    const result = session.onMove(101, 200);
    assert.equal(result.isPanning, true);
  });

  it('allows negative scroll values (browser clamps these)', () => {
    const session = createPanSession(100, 200, 0, 0, DEFAULT_THRESHOLD);
    const result = session.onMove(130, 200);
    assert.equal(result.scrollLeft, -30);
  });

  it('works with custom threshold', () => {
    const session = createPanSession(100, 200, 0, 0, 10);
    const below = session.onMove(107, 200);
    assert.equal(below.isPanning, false);
    const at = session.onMove(110, 200);
    assert.equal(at.isPanning, true);
  });

  it('onEnd after no moves returns didPan: false', () => {
    const session = createPanSession(100, 200, 0, 0, DEFAULT_THRESHOLD);
    const result = session.onEnd();
    assert.equal(result.didPan, false);
  });
});

// ── Velocity computation tests ──

describe('computeReleaseVelocity', () => {
  it('returns zero for empty samples', () => {
    const v = computeReleaseVelocity([]);
    assert.equal(v.vx, 0);
    assert.equal(v.vy, 0);
  });

  it('returns zero for single sample', () => {
    const v = computeReleaseVelocity([{ x: 100, y: 200, t: 1000 }]);
    assert.equal(v.vx, 0);
    assert.equal(v.vy, 0);
  });

  it('returns zero when timestamps are identical', () => {
    const v = computeReleaseVelocity([
      { x: 100, y: 200, t: 1000 },
      { x: 200, y: 300, t: 1000 },
    ]);
    assert.equal(v.vx, 0);
    assert.equal(v.vy, 0);
  });

  it('computes horizontal velocity (inverted for scroll direction)', () => {
    // Pointer moved right 200px in 100ms → scroll velocity should be negative (scroll left)
    const v = computeReleaseVelocity([
      { x: 100, y: 200, t: 1000 },
      { x: 300, y: 200, t: 1100 },
    ]);
    assert.equal(v.vx, -2); // -(300-100)/100 = -2 px/ms
    assert.equal(v.vy, 0);
  });

  it('computes vertical velocity (inverted for scroll direction)', () => {
    // Pointer moved down 150px in 100ms → scroll velocity should be negative (scroll up)
    const v = computeReleaseVelocity([
      { x: 100, y: 200, t: 1000 },
      { x: 100, y: 350, t: 1100 },
    ]);
    assert.equal(v.vx, 0);
    assert.equal(v.vy, -1.5);
  });

  it('computes diagonal velocity', () => {
    const v = computeReleaseVelocity([
      { x: 100, y: 200, t: 1000 },
      { x: 200, y: 400, t: 1200 },
    ]);
    assert.equal(v.vx, -0.5); // -(200-100)/200
    assert.equal(v.vy, -1);   // -(400-200)/200
  });

  it('uses first and last sample only', () => {
    // Middle samples are ignored — velocity is from endpoints
    const v = computeReleaseVelocity([
      { x: 0, y: 0, t: 0 },
      { x: 999, y: 999, t: 50 },   // outlier in middle
      { x: 100, y: 0, t: 100 },
    ]);
    assert.equal(v.vx, -1); // -(100-0)/100
    assert.equal(v.vy, 0);
  });

  it('computes negative velocity for leftward pointer drag (scroll goes right)', () => {
    // Pointer moved left → scroll should go right → positive vx
    const v = computeReleaseVelocity([
      { x: 300, y: 200, t: 1000 },
      { x: 100, y: 200, t: 1100 },
    ]);
    assert.equal(v.vx, 2); // -(100-300)/100 = 2 px/ms
  });
});

// ── Inertia step tests ──

describe('applyInertiaStep', () => {
  it('decays velocity by friction factor normalized to 16ms', () => {
    const dt = 16;
    const result = applyInertiaStep(1, 0, dt, INERTIA_FRICTION);
    // At exactly 16ms, friction applies once: v * friction^(16/16) = v * friction
    assert.ok(Math.abs(result.vx - INERTIA_FRICTION) < 0.001);
    assert.equal(result.vy, 0);
  });

  it('decays faster with longer frame times', () => {
    const result16 = applyInertiaStep(1, 0, 16, INERTIA_FRICTION);
    const result32 = applyInertiaStep(1, 0, 32, INERTIA_FRICTION);
    // 32ms should decay more than 16ms
    assert.ok(Math.abs(result32.vx) < Math.abs(result16.vx));
  });

  it('computes scroll delta proportional to dt', () => {
    const result = applyInertiaStep(2, 0, 16, INERTIA_FRICTION);
    // dx should be roughly velocity * dt (using average of old and new velocity)
    assert.ok(result.dx > 0);
    assert.ok(result.dx > 20); // 2 px/ms * 16ms ≈ 32px, minus some friction
  });

  it('signals done when velocity drops below threshold', () => {
    // Very small velocity should be done
    const result = applyInertiaStep(0.01, 0.01, 16, INERTIA_FRICTION);
    assert.equal(result.done, true);
  });

  it('does not signal done for significant velocity', () => {
    const result = applyInertiaStep(1, 1, 16, INERTIA_FRICTION);
    assert.equal(result.done, false);
  });

  it('handles both axes simultaneously', () => {
    const result = applyInertiaStep(1, -2, 16, INERTIA_FRICTION);
    assert.ok(result.vx > 0);
    assert.ok(result.vy < 0);
    assert.ok(result.dx > 0);
    assert.ok(result.dy < 0);
  });

  it('eventually reaches done after repeated steps', () => {
    let vx = 2;
    let vy = 1;
    let steps = 0;
    while (steps < 500) {
      const result = applyInertiaStep(vx, vy, 16, INERTIA_FRICTION);
      vx = result.vx;
      vy = result.vy;
      steps++;
      if (result.done) break;
    }
    assert.ok(steps < 500, 'inertia should converge to done');
    assert.ok(steps > 10, 'inertia should coast for multiple frames');
  });

  it('zero velocity is immediately done', () => {
    const result = applyInertiaStep(0, 0, 16, INERTIA_FRICTION);
    assert.equal(result.done, true);
    assert.equal(result.dx, 0);
    assert.equal(result.dy, 0);
  });
});
