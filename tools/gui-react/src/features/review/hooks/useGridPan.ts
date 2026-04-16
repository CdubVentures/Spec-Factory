import { useRef, useState, useEffect, useCallback } from 'react';

// ── Constants ──

export const INERTIA_FRICTION = 0.95;
export const INERTIA_MIN_VELOCITY = 0.05; // px/ms — below this, stop coasting
const VELOCITY_SAMPLE_COUNT = 5;
const INTERACTIVE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

// ── Pure pan state machine (testable without React) ──

interface PanMoveResult {
  isPanning: boolean;
  scrollLeft: number;
  scrollTop: number;
}

interface PanEndResult {
  didPan: boolean;
}

interface PanSession {
  onMove: (clientX: number, clientY: number) => PanMoveResult;
  onEnd: () => PanEndResult;
}

export function createPanSession(
  startX: number,
  startY: number,
  scrollLeft: number,
  scrollTop: number,
  threshold: number,
): PanSession {
  let panning = false;

  return {
    onMove(clientX: number, clientY: number): PanMoveResult {
      const dx = clientX - startX;
      const dy = clientY - startY;

      if (!panning) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= threshold) {
          panning = true;
        }
      }

      return {
        isPanning: panning,
        scrollLeft: scrollLeft - dx,
        scrollTop: scrollTop - dy,
      };
    },

    onEnd(): PanEndResult {
      return { didPan: panning };
    },
  };
}

// ── Pure velocity computation ──

interface VelocitySample {
  x: number;
  y: number;
  t: number;
}

export function computeReleaseVelocity(
  samples: ReadonlyArray<VelocitySample>,
): { vx: number; vy: number } {
  if (samples.length < 2) return { vx: 0, vy: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0) return { vx: 0, vy: 0 };
  // Inverted: dragging pointer right → scroll goes left (negative vx)
  // WHY: `|| 0` normalizes -0 to 0 (strict equality treats them differently)
  return {
    vx: -(last.x - first.x) / dt || 0,
    vy: -(last.y - first.y) / dt || 0,
  };
}

// ── Pure inertia step ──

interface InertiaStepResult {
  vx: number;
  vy: number;
  dx: number;
  dy: number;
  done: boolean;
}

export function applyInertiaStep(
  vx: number,
  vy: number,
  dt: number,
  friction: number,
): InertiaStepResult {
  // Normalize friction to actual frame time (friction is calibrated for 16ms)
  const f = Math.pow(friction, dt / 16);
  const nextVx = vx * f;
  const nextVy = vy * f;
  // Trapezoidal integration for smoother scroll delta
  const dx = ((vx + nextVx) / 2) * dt;
  const dy = ((vy + nextVy) / 2) * dt;
  const done = Math.abs(nextVx) < INERTIA_MIN_VELOCITY && Math.abs(nextVy) < INERTIA_MIN_VELOCITY;
  return { vx: nextVx, vy: nextVy, dx, dy, done };
}

// ── React hook ──

interface UseGridPanOptions {
  threshold?: number;
}

interface UseGridPanReturn {
  isPanning: boolean;
  panHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
}

export function useGridPan(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  options?: UseGridPanOptions,
): UseGridPanReturn {
  const threshold = options?.threshold ?? 8;
  const [isPanning, setIsPanning] = useState(false);
  const sessionRef = useRef<PanSession | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const capturedRef = useRef(false);
  const samplesRef = useRef<VelocitySample[]>([]);
  const inertiaRef = useRef<number | null>(null); // rAF handle

  // Cancel any running inertia animation
  const cancelInertia = useCallback(() => {
    if (inertiaRef.current !== null) {
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const target = e.target as HTMLElement;
    if (INTERACTIVE_TAGS.has(target.tagName)) return;
    if (e.button !== 0) return;

    // Cancel any running coast from a previous flick
    cancelInertia();

    pointerIdRef.current = e.pointerId;
    capturedRef.current = false;
    samplesRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];

    sessionRef.current = createPanSession(
      e.clientX,
      e.clientY,
      el.scrollLeft,
      el.scrollTop,
      threshold,
    );
  }, [scrollContainerRef, threshold, cancelInertia]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    function handlePointerMove(e: PointerEvent) {
      const session = sessionRef.current;
      if (!session || e.pointerId !== pointerIdRef.current) return;

      // Track velocity samples
      const samples = samplesRef.current;
      samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (samples.length > VELOCITY_SAMPLE_COUNT) samples.shift();

      const result = session.onMove(e.clientX, e.clientY);

      if (result.isPanning) {
        if (!capturedRef.current) {
          try {
            el!.setPointerCapture(e.pointerId);
            capturedRef.current = true;
          } catch {
            // Capture may fail if pointer was already released
          }
        }
        el!.scrollLeft = result.scrollLeft;
        el!.scrollTop = result.scrollTop;
        setIsPanning(true);
      }
    }

    function handlePointerUp(e: PointerEvent) {
      const session = sessionRef.current;
      if (!session || e.pointerId !== pointerIdRef.current) return;

      const { didPan } = session.onEnd();

      if (didPan) {
        el!.addEventListener('click', suppressClick, { capture: true, once: true });

        // Start inertia coast
        const velocity = computeReleaseVelocity(samplesRef.current);
        if (Math.abs(velocity.vx) > INERTIA_MIN_VELOCITY || Math.abs(velocity.vy) > INERTIA_MIN_VELOCITY) {
          startInertia(velocity.vx, velocity.vy);
        }
      }

      sessionRef.current = null;
      pointerIdRef.current = null;
      samplesRef.current = [];
      setIsPanning(false);

      if (capturedRef.current) {
        try {
          el!.releasePointerCapture(e.pointerId);
        } catch {
          // Pointer capture may already be released
        }
        capturedRef.current = false;
      }
    }

    function startInertia(vx: number, vy: number) {
      let lastTime = performance.now();
      let currentVx = vx;
      let currentVy = vy;

      function tick() {
        const now = performance.now();
        const dt = now - lastTime;
        lastTime = now;

        const step = applyInertiaStep(currentVx, currentVy, dt, INERTIA_FRICTION);
        currentVx = step.vx;
        currentVy = step.vy;

        el!.scrollLeft += step.dx;
        el!.scrollTop += step.dy;

        if (step.done) {
          inertiaRef.current = null;
          return;
        }
        inertiaRef.current = requestAnimationFrame(tick);
      }

      inertiaRef.current = requestAnimationFrame(tick);
    }

    function suppressClick(e: Event) {
      e.stopPropagation();
      e.preventDefault();
    }

    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerUp);

    return () => {
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [scrollContainerRef]);

  // Cleanup inertia on unmount
  useEffect(() => cancelInertia, [cancelInertia]);

  return { isPanning, panHandlers: { onPointerDown } };
}
