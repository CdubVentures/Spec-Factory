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
}

interface OperationsState {
  readonly operations: ReadonlyMap<string, Operation>;
  upsert: (op: Operation) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useOperationsStore = create<OperationsState>((set) => ({
  operations: new Map<string, Operation>(),

  upsert: (op: Operation) =>
    set((state) => {
      const next = new Map(state.operations);
      next.set(op.id, op);
      return { operations: next };
    }),

  remove: (id: string) =>
    set((state) => {
      const next = new Map(state.operations);
      next.delete(id);
      return { operations: next };
    }),

  clear: () => set({ operations: new Map() }),
}));
