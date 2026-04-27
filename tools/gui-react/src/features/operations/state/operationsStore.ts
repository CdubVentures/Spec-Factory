import { create } from 'zustand';

/**
 * PIF-only carousel grid shape. Emitted by productImageFinder.js. Rendered by
 * LoopProgressGrid via the `views[]` + `hero` fields.
 */
export interface CarouselLoopProgress {
  readonly variantLabel: string;
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
}

/**
 * Canonical two-budget pill shape. Emitted by keyFinderLoop + variantFieldLoop
 * per the active-operations-upgrade guide §6. Rendered by LoopProgressPill.
 * Intermediate iterations carry final_status=null; the terminal pill fires
 * once per loop (keyFinder) or per variant (variantFieldLoop) with the
 * derived final_status.
 */
export interface PillLoopProgress {
  readonly loop_id: string;
  /**
   * Mirrors the publisher's gate output. `evidenceCount`/`evidenceTarget` come
   * from `submitCandidate.publishResult.actual` / `.required` (the latter is
   * `fieldRule.evidence.min_evidence_refs`). `confidence` is the candidate's
   * normalized confidence (0–100); `threshold` is `publishConfidenceThreshold`
   * (also 0–100). `satisfied` is `publishResult.status === 'published'`.
   */
  readonly publish: {
    readonly evidenceCount: number;
    readonly evidenceTarget: number;
    readonly satisfied: boolean;
    readonly confidence: number | null;
    readonly threshold: number | null;
    /**
     * Per-candidate bucket chips for the sidebar pill — one entry per
     * competing value in the publisher's deterministic evaluator. Carries
     * across iterations so the sidebar always shows the latest known state.
     * Null when the loop hasn't seen a publishCandidate return yet.
     */
    readonly buckets?: ReadonlyArray<{
      readonly fp: string;
      readonly label: string;
      readonly count: number;
      readonly required: number;
      readonly qualifies: boolean;
      readonly topConf: number | null;
    }> | null;
  };
  readonly callBudget: {
    readonly used: number;
    readonly budget: number;
    readonly exhausted: boolean;
  };
  readonly final_status:
    | 'published'
    | 'definitive_unk'
    | 'budget_exhausted'
    | 'skipped_resolved'
    | 'aborted'
    | null;
  /** variantFieldLoop stamps variant identity; keyFinderLoop omits these. */
  readonly variantKey?: string;
  readonly variantLabel?: string;
}

/**
 * Union of the two shapes that flow into `op.loopProgress`. Frontend uses
 * `isCarouselLoopProgress` (PIF) or `isPillLoopProgress` (everything else)
 * to narrow before rendering.
 */
export type LoopProgress = CarouselLoopProgress | PillLoopProgress;

export interface LlmCallSummary {
  readonly callIndex: number;
  readonly callId?: string;
  readonly timestamp: string;
  readonly model?: string;
  readonly variant?: string;
  readonly mode?: string;
  readonly lane?: string;
  readonly label?: string;
  readonly isFallback?: boolean;
  readonly thinking?: boolean;
  readonly webSearch?: boolean;
  readonly effortLevel?: string;
  readonly accessMode?: string;
  readonly usage?: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
    readonly cost_usd: number;
    readonly estimated_usage?: boolean;
  } | null;
  readonly responseStatus: 'pending' | 'done';
}

export interface OperationIndexLabLinkIdentityPayload {
  readonly productId: string;
  readonly brand: string;
  readonly baseModel: string;
}

export interface Operation {
  readonly id: string;
  readonly type: string;
  readonly category: string;
  readonly productId: string;
  readonly productLabel: string;
  readonly indexLabLinkIdentity?: OperationIndexLabLinkIdentityPayload;
  readonly stages: readonly string[];
  readonly currentStageIndex: number;
  readonly status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
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
  readonly loopProgress?: LoopProgress | null;
  /** Set on optimistic insert (202 returned, server hasn't started yet). Cleared on first real WS update. */
  readonly queuedAt?: string;
  /** Frozen ms from optimistic insert to first WS broadcast. Stays visible. */
  readonly queueDelayMs?: number;
  /** keyFinder-only: true once runKeyFinder has populated the in-flight registry
   *  with this op's primary + passengers. Consumers chaining Run Group under
   *  alwaysSoloRun=false await this per-opId to ensure registration-ordered
   *  dispatch (the N+1 POST's buildPassengers sees the N-th's pack in the
   *  registry). Never clears once set. */
  readonly passengersRegistered?: boolean;
  /** keyFinder-only: the passenger field_keys selected when registration completed.
   *  Debug visibility; UI doesn't render this today. */
  readonly passengerFieldKeys?: readonly string[];
  readonly llmCallCount?: number;
  readonly activeLlmCallCount?: number;
  readonly activeLlmCalls?: ReadonlyArray<LlmCallSummary>;
  /** Accumulated LLM call records — prompt, response, model per call. */
  readonly llmCalls: ReadonlyArray<LlmCallRecord>;
}

export interface LlmCallRecord {
  readonly callIndex: number;
  readonly callId?: string;
  readonly timestamp: string;
  readonly prompt: { readonly system: string; readonly user: string };
  readonly response: unknown;
  readonly model?: string;
  readonly variant?: string;
  readonly mode?: string;
  readonly lane?: string;
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

export interface LlmCallStreamText {
  readonly callId: string;
  readonly text: string;
  readonly reasoningText?: string;
  readonly contentText?: string;
  readonly lane?: string;
  readonly label?: string;
  readonly channel?: string;
}

export interface LlmCallStreamChunk {
  readonly callId: string;
  readonly text: string;
  readonly lane?: string;
  readonly label?: string;
  readonly channel?: string;
}

interface OperationsState {
  readonly operations: ReadonlyMap<string, Operation>;
  /** WHY: Separated from operations so stream appends don't clone the operations Map. */
  readonly streamTexts: ReadonlyMap<string, string>;
  readonly callStreamTexts: ReadonlyMap<string, ReadonlyMap<string, LlmCallStreamText>>;
  upsert: (op: OperationUpsert) => void;
  remove: (id: string) => void;
  clear: () => void;
  appendStreamText: (id: string, text: string) => void;
  batchAppendStreamText: (chunks: ReadonlyMap<string, string>) => void;
  appendCallStreamText: (id: string, chunk: LlmCallStreamChunk) => void;
  batchAppendCallStreamText: (chunks: ReadonlyMap<string, ReadonlyArray<LlmCallStreamChunk>>) => void;
  appendLlmCall: (id: string, call: LlmCallRecord) => void;
  updateLlmCall: (id: string, callIndex: number, call: LlmCallRecord) => void;
}

export type OperationUpsert = Omit<Operation, 'llmCalls'> & {
  readonly llmCalls?: ReadonlyArray<LlmCallRecord>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonLikeEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((entry, index) => jsonLikeEqual(entry, b[index]));
  }
  if (isRecord(a) || isRecord(b)) {
    if (!isRecord(a) || !isRecord(b)) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && jsonLikeEqual(a[key], b[key]));
  }
  return false;
}

function normalizeOperationUpsert(op: OperationUpsert, existing?: Operation): Operation {
  return {
    ...op,
    queueDelayMs: op.queueDelayMs ?? existing?.queueDelayMs,
    llmCalls: Object.prototype.hasOwnProperty.call(op, 'llmCalls') ? (op.llmCalls ?? []) : [],
  };
}

function isTerminalOperation(op: Pick<Operation, 'status'>): boolean {
  return op.status === 'done' || op.status === 'error' || op.status === 'cancelled';
}

function mergeLlmCall(existing: LlmCallRecord, incoming: LlmCallRecord): LlmCallRecord {
  return {
    ...existing,
    ...incoming,
    callIndex: existing.callIndex,
    timestamp: incoming.timestamp || existing.timestamp,
    prompt: existing.prompt || incoming.prompt,
    response: incoming.response === undefined ? existing.response : incoming.response,
  };
}

function appendCallStream(
  streams: ReadonlyMap<string, ReadonlyMap<string, LlmCallStreamText>>,
  id: string,
  chunk: LlmCallStreamChunk,
): ReadonlyMap<string, ReadonlyMap<string, LlmCallStreamText>> {
  if (!chunk.callId || !chunk.text) return streams;
  const next = new Map(streams);
  const existingByCall = streams.get(id) ?? new Map<string, LlmCallStreamText>();
  const nextByCall = new Map(existingByCall);
  const existing = existingByCall.get(chunk.callId);
  const nextReasoningText = chunk.channel === 'reasoning'
    ? `${existing?.reasoningText ?? ''}${chunk.text}`
    : existing?.reasoningText;
  const nextContentText = chunk.channel === 'content'
    ? `${existing?.contentText ?? ''}${chunk.text}`
    : existing?.contentText;
  nextByCall.set(chunk.callId, {
    callId: chunk.callId,
    text: `${existing?.text ?? ''}${chunk.text}`,
    reasoningText: nextReasoningText,
    contentText: nextContentText,
    lane: chunk.lane || existing?.lane,
    label: chunk.label || existing?.label,
    channel: chunk.channel || existing?.channel,
  });
  next.set(id, nextByCall);
  return next;
}

export const useOperationsStore = create<OperationsState>((set) => ({
  operations: new Map<string, Operation>(),
  streamTexts: new Map<string, string>(),
  callStreamTexts: new Map<string, ReadonlyMap<string, LlmCallStreamText>>(),

  upsert: (op: OperationUpsert) =>
    set((state) => {
      const existing = state.operations.get(op.id);
      // WHY: Normalize before comparing so repeated lightweight WS summaries
      // can short-circuit without cloning the operations Map.
      const normalized = normalizeOperationUpsert(op, existing);
      const shouldClearStreams = isTerminalOperation(normalized)
        && (state.streamTexts.has(op.id) || state.callStreamTexts.has(op.id));
      if (existing && jsonLikeEqual(existing, normalized) && !shouldClearStreams) return state;

      const next = new Map(state.operations);
      next.set(op.id, normalized);
      // WHY: Clear stream text when operation reaches terminal state to free memory.
      if (isTerminalOperation(normalized)) {
        const nextStreams = new Map(state.streamTexts);
        nextStreams.delete(op.id);
        const nextCallStreams = new Map(state.callStreamTexts);
        nextCallStreams.delete(op.id);
        return { operations: next, streamTexts: nextStreams, callStreamTexts: nextCallStreams };
      }
      return { operations: next };
    }),

  remove: (id: string) =>
    set((state) => {
      const next = new Map(state.operations);
      next.delete(id);
      const nextStreams = new Map(state.streamTexts);
      nextStreams.delete(id);
      const nextCallStreams = new Map(state.callStreamTexts);
      nextCallStreams.delete(id);
      return { operations: next, streamTexts: nextStreams, callStreamTexts: nextCallStreams };
    }),

  clear: () => set({ operations: new Map(), streamTexts: new Map(), callStreamTexts: new Map() }),

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

  appendCallStreamText: (id: string, chunk: LlmCallStreamChunk) =>
    set((state) => {
      const existing = state.operations.get(id);
      if (!existing || existing.status !== 'running') return state;
      const next = appendCallStream(state.callStreamTexts, id, chunk);
      return next === state.callStreamTexts ? state : { callStreamTexts: next };
    }),

  batchAppendCallStreamText: (chunks: ReadonlyMap<string, ReadonlyArray<LlmCallStreamChunk>>) =>
    set((state) => {
      if (chunks.size === 0) return state;
      let next = state.callStreamTexts;
      for (const [id, opChunks] of chunks) {
        const existing = state.operations.get(id);
        if (!existing || existing.status !== 'running') continue;
        for (const chunk of opChunks) {
          next = appendCallStream(next, id, chunk);
        }
      }
      return next === state.callStreamTexts ? state : { callStreamTexts: next };
    }),

  appendLlmCall: (id: string, call: LlmCallRecord) =>
    set((state) => {
      const existing = state.operations.get(id);
      if (!existing) return state;
      const calls = [...existing.llmCalls];
      const idx = call.callId ? calls.findIndex((c) => c.callId === call.callId) : -1;
      if (idx >= 0) {
        calls[idx] = mergeLlmCall(calls[idx], call);
        const next = new Map(state.operations);
        next.set(id, { ...existing, llmCalls: calls });
        return { operations: next };
      }
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
      calls[idx] = mergeLlmCall(calls[idx], call);
      const next = new Map(state.operations);
      next.set(id, { ...existing, llmCalls: calls });
      return { operations: next };
    }),
}));

// WHY: Narrow `loopProgress` to the PIF carousel shape. Consumers that read
// carousel-specific fields (views, hero, mode, ...) must gate on this first —
// otherwise they can crash on pill-shape emissions that share the slot.
export function isCarouselLoopProgress(
  lp: LoopProgress | null | undefined,
): lp is CarouselLoopProgress & {
  readonly views: NonNullable<CarouselLoopProgress['views']>;
} {
  return !!lp && Array.isArray((lp as CarouselLoopProgress).views);
}

// WHY: Narrow `loopProgress` to the canonical pill shape emitted by
// keyFinderLoop + variantFieldLoop. The LoopProgressRouter uses this to pick
// LoopProgressPill. Check order: isCarouselLoopProgress first (PIF wins).
export function isPillLoopProgress(
  lp: LoopProgress | null | undefined,
): lp is PillLoopProgress {
  return !!lp
    && typeof lp === 'object'
    && 'publish' in lp
    && 'callBudget' in lp;
}
