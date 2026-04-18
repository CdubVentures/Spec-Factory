/**
 * loopIdGenerator — one shared ID per top-level /loop request.
 *
 * WHY: Runs emitted from the same loop must be groupable in the UI. Adding
 * a short random suffix on top of the timestamp avoids collisions when two
 * loops fire in the same millisecond (e.g. Loop All firing per-variant
 * loops in parallel).
 */
export function generateLoopId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `loop-${ts}-${rand}`;
}
