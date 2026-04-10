import { create } from 'zustand';

export interface Operation {
  readonly id: string;
  readonly type: string;
  readonly category: string;
  readonly productId: string;
  readonly productLabel: string;
  readonly stages: readonly string[];
  readonly currentStageIndex: number;
  readonly status: 'running' | 'done' | 'error';
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
  } | null;
  readonly streamText: string;
}

interface OperationsState {
  readonly operations: ReadonlyMap<string, Operation>;
  upsert: (op: Operation) => void;
  remove: (id: string) => void;
  clear: () => void;
  appendStreamText: (id: string, text: string) => void;
}

export const useOperationsStore = create<OperationsState>((set) => ({
  operations: new Map<string, Operation>(),

  upsert: (op: Operation) =>
    set((state) => {
      const next = new Map(state.operations);
      // WHY: Clear streamText when operation reaches terminal state to free memory.
      const streamText = (op.status === 'done' || op.status === 'error')
        ? ''
        : (state.operations.get(op.id)?.streamText ?? '');
      next.set(op.id, { ...op, streamText });
      return { operations: next };
    }),

  remove: (id: string) =>
    set((state) => {
      const next = new Map(state.operations);
      next.delete(id);
      return { operations: next };
    }),

  clear: () => set({ operations: new Map() }),

  appendStreamText: (id: string, text: string) =>
    set((state) => {
      const existing = state.operations.get(id);
      if (!existing || existing.status !== 'running') return state;
      const next = new Map(state.operations);
      next.set(id, { ...existing, streamText: existing.streamText + text });
      return { operations: next };
    }),
}));
