import { create } from 'zustand';

export interface Operation {
  readonly id: string;
  readonly type: string;
  readonly category: string;
  readonly productId: string;
  readonly productLabel: string;
  readonly stages: readonly string[];
  readonly currentStageIndex: number;
  readonly status: 'running' | 'done' | 'error' | 'cancelled';
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly error: string | null;
  readonly modelInfo: {
    readonly model: string;
    readonly provider: string;
    readonly isFallback: boolean;
    readonly accessMode: string;
    readonly thinking: boolean;
    readonly webSearch: boolean;
    readonly effortLevel: string;
  } | null;
  readonly subType?: string;
  readonly variantKey?: string;
  readonly variantId?: string;
  /** Per-key scope — keyFinder uses this instead of variantKey. */
  readonly fieldKey?: string;
  readonly progressText?: string;
  // WHY: Two shapes flow into this slot from different finders.
  //   PIF (carousel) — rich per-view + hero fields (views, hero, mode, focusView, ...).
  //   RDF + anything using core/finder/variantFieldLoop — simple {attempt, budget, satisfied, loopId}.
  // Only `variantLabel` is shared. All other fields are optional at the type level;
  // use `isCarouselLoopProgress` to narrow before reading carousel-specific fields.
  readonly loopProgress?: {
    readonly variantLabel: string;
    // Carousel shape (PIF):
    readonly variantIndex?: number;
    readonly variantTotal?: number;
    readonly callNumber?: number;
    readonly estimatedRemaining?: number;
    readonly mode?: string;
    readonly focusView?: string | null;
    readonly views?: ReadonlyArray<{
      readonly view: string;
      readonly count: number;
      readonly target: number;
      readonly satisfied: boolean;
      readonly exhausted: boolean;
      readonly attempts: number;
      readonly attemptBudget: number;
    }>;
    readonly hero?: {
      readonly count: number;
      readonly target: number;
      readonly satisfied: boolean;
      readonly exhausted: boolean;
      readonly attempts: number;
      readonly attemptBudget: number;
    } | null;
    // Simple-loop shape (RDF / variantFieldLoop):
    readonly variantKey?: string;
    readonly attempt?: number;
    readonly budget?: number;
    readonly satisfied?: boolean;
    readonly loopId?: string;
  } | null;
  /** Set on optimistic insert (202 returned, server hasn't started yet). Cleared on first real WS update. */
  readonly queuedAt?: string;
  /** Frozen ms from optimistic insert to first WS broadcast. Stays visible. */
  readonly queueDelayMs?: number;
  /** Accumulated LLM call records — prompt, response, model per call. */
  readonly llmCalls: ReadonlyArray<LlmCallRecord>;
}

export interface LlmCallRecord {
  readonly callIndex: number;
  readonly timestamp: string;
  readonly prompt: { readonly system: string; readonly user: string };
  readonly response: unknown;
  readonly model?: string;
  readonly variant?: string;
  readonly mode?: string;
  readonly label?: string;
  // WHY: Per-call model context — captured at the moment of call.
  //   `op.modelInfo` is overwrite-only (fallback replaces primary), so these
  //   per-call fields are the only honest record of what was used per attempt.
  readonly isFallback?: boolean;
  readonly thinking?: boolean;
  readonly webSearch?: boolean;
  readonly effortLevel?: string;
  readonly accessMode?: string;
  // WHY: Mirrors llmClient.js emitUsage wire format (snake_case). No transform needed.
  readonly usage?: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
    readonly cost_usd: number;
    readonly estimated_usage?: boolean;
  } | null;
}

interface OperationsState {
  readonly operations: ReadonlyMap<string, Operation>;
  /** WHY: Separated from operations so stream appends don't clone the operations Map. */
  readonly streamTexts: ReadonlyMap<string, string>;
  upsert: (op: Operation) => void;
  remove: (id: string) => void;
  clear: () => void;
  appendStreamText: (id: string, text: string) => void;
  batchAppendStreamText: (chunks: ReadonlyMap<string, string>) => void;
  appendLlmCall: (id: string, call: LlmCallRecord) => void;
  updateLlmCall: (id: string, callIndex: number, call: LlmCallRecord) => void;
}

export const useOperationsStore = create<OperationsState>((set) => ({
  operations: new Map<string, Operation>(),
  streamTexts: new Map<string, string>(),

  upsert: (op: Operation) =>
    set((state) => {
      const next = new Map(state.operations);
      const existing = state.operations.get(op.id);
      // WHY: queueDelayMs is reported by the server (actual lab queue wait time).
      // Preserve across upserts — once set, it stays.
      const queueDelayMs = op.queueDelayMs ?? existing?.queueDelayMs;
      // WHY: llmCalls are broadcast separately (llm-call-append action), not in regular WS upsert.
      // Preserve accumulated calls from store. For hydration (GET /operations), use incoming data.
      const llmCalls = existing?.llmCalls?.length ? existing.llmCalls : (op.llmCalls ?? []);
      next.set(op.id, { ...op, queueDelayMs, llmCalls });
      // WHY: Clear stream text when operation reaches terminal state to free memory.
      if (op.status === 'done' || op.status === 'error' || op.status === 'cancelled') {
        const nextStreams = new Map(state.streamTexts);
        nextStreams.delete(op.id);
        return { operations: next, streamTexts: nextStreams };
      }
      return { operations: next };
    }),

  remove: (id: string) =>
    set((state) => {
      const next = new Map(state.operations);
      next.delete(id);
      const nextStreams = new Map(state.streamTexts);
      nextStreams.delete(id);
      return { operations: next, streamTexts: nextStreams };
    }),

  clear: () => set({ operations: new Map(), streamTexts: new Map() }),

  // WHY: Only mutates streamTexts, never touches operations — so (s) => s.operations
  // subscribers are NOT notified by stream text appends.
  appendStreamText: (id: string, text: string) =>
    set((state) => {
      const existing = state.operations.get(id);
      if (!existing || existing.status !== 'running') return state;
      const next = new Map(state.streamTexts);
      next.set(id, (state.streamTexts.get(id) ?? '') + text);
      return { streamTexts: next };
    }),

  batchAppendStreamText: (chunks: ReadonlyMap<string, string>) =>
    set((state) => {
      if (chunks.size === 0) return state;
      const next = new Map(state.streamTexts);
      let changed = false;
      for (const [id, text] of chunks) {
        const existing = state.operations.get(id);
        if (!existing || existing.status !== 'running') continue;
        next.set(id, (next.get(id) ?? '') + text);
        changed = true;
      }
      return changed ? { streamTexts: next } : state;
    }),

  appendLlmCall: (id: string, call: LlmCallRecord) =>
    set((state) => {
      const existing = state.operations.get(id);
      if (!existing) return state;
      const next = new Map(state.operations);
      next.set(id, { ...existing, llmCalls: [...existing.llmCalls, call] });
      return { operations: next };
    }),

  updateLlmCall: (id: string, callIndex: number, call: LlmCallRecord) =>
    set((state) => {
      const existing = state.operations.get(id);
      if (!existing) return state;
      const calls = [...existing.llmCalls];
      const idx = calls.findIndex((c) => c.callIndex === callIndex);
      if (idx === -1) return state;
      calls[idx] = call;
      const next = new Map(state.operations);
      next.set(id, { ...existing, llmCalls: calls });
      return { operations: next };
    }),
}));

// WHY: Narrow `loopProgress` to the carousel shape (PIF). Consumers that read
// carousel-specific fields (views, hero, mode, ...) must gate on this first —
// otherwise they can crash on RDF/variantFieldLoop emissions that share the
// `loopProgress` slot with a different shape.
export function isCarouselLoopProgress(
  lp: Operation['loopProgress'],
): lp is NonNullable<Operation['loopProgress']> & {
  readonly views: NonNullable<NonNullable<Operation['loopProgress']>['views']>;
} {
  return !!lp && Array.isArray(lp.views);
}
