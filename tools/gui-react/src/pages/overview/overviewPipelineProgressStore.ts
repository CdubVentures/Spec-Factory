import { create } from 'zustand';
import type { PipelineProgressStepId, PipelineStageId } from './pipelinePlan.ts';

export type PipelineProgressStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface PipelineProgressStep {
  readonly id: PipelineProgressStepId;
  readonly label: string;
  readonly status: PipelineProgressStatus;
  readonly completed: number;
  readonly total: number;
}

export interface PipelineProductProgress {
  readonly productId: string;
  readonly steps: readonly PipelineProgressStep[];
}

interface OverviewPipelineProgressState {
  readonly byCategory: Readonly<Record<string, Readonly<Record<string, PipelineProductProgress>>>>;
  readonly initialize: (category: string, productIds: readonly string[]) => void;
  readonly markStage: (
    category: string,
    productIds: readonly string[],
    stageId: PipelineStageId,
    status: PipelineProgressStatus,
  ) => void;
  readonly clearCategory: (category: string) => void;
}

const STEP_DEFS: readonly Pick<PipelineProgressStep, 'id' | 'label'>[] = Object.freeze([
  { id: 'cef', label: 'CEF' },
  { id: 'dp', label: 'DP' },
  { id: 'pif', label: 'PIF' },
  { id: 'eval', label: 'Eval' },
  { id: 'rdf', label: 'RDF' },
  { id: 'sku', label: 'SKU' },
  { id: 'kf', label: 'KF' },
]);

const STAGE_STEP: Readonly<Record<PipelineStageId, PipelineProgressStepId>> = Object.freeze({
  cef_1: 'cef',
  cef_2: 'cef',
  pif_dep: 'dp',
  pif_loop: 'pif',
  pif_eval: 'eval',
  rdf_run: 'rdf',
  sku_run: 'sku',
  kf_early: 'kf',
  kf_context: 'kf',
});

const STAGE_PROGRESS_UNITS: Readonly<Record<PipelineStageId, { readonly completed: number; readonly total: number }>> = Object.freeze({
  cef_1: { completed: 1, total: 2 },
  cef_2: { completed: 2, total: 2 },
  pif_dep: { completed: 1, total: 1 },
  pif_loop: { completed: 1, total: 1 },
  pif_eval: { completed: 1, total: 1 },
  rdf_run: { completed: 1, total: 1 },
  sku_run: { completed: 1, total: 1 },
  kf_early: { completed: 1, total: 2 },
  kf_context: { completed: 2, total: 2 },
});

function makeInitialProductProgress(productId: string): PipelineProductProgress {
  return {
    productId,
    steps: STEP_DEFS.map((step) => ({
      ...step,
      status: 'pending',
      completed: 0,
      total: step.id === 'cef' || step.id === 'kf' ? 2 : 1,
    })),
  };
}

function resolveStepStatus(
  current: PipelineProgressStep,
  stageId: PipelineStageId,
  status: PipelineProgressStatus,
): PipelineProgressStep {
  const units = STAGE_PROGRESS_UNITS[stageId];
  if (status === 'running') {
    return {
      ...current,
      status: current.status === 'done' ? 'done' : 'running',
      total: units.total,
    };
  }

  if (status === 'skipped') {
    const completed = Math.max(current.completed, units.completed);
    return {
      ...current,
      status: completed >= units.total ? 'skipped' : current.status,
      completed,
      total: units.total,
    };
  }

  if (status === 'error') {
    return {
      ...current,
      status: 'error',
      completed: Math.max(current.completed, units.completed),
      total: units.total,
    };
  }

  const completed = Math.max(current.completed, units.completed);
  return {
    ...current,
    status: completed >= units.total ? 'done' : 'running',
    completed,
    total: units.total,
  };
}

export const useOverviewPipelineProgressStore = create<OverviewPipelineProgressState>((set) => ({
  byCategory: {},
  initialize: (category, productIds) => {
    set((state) => {
      const nextCategory: Record<string, PipelineProductProgress> = {};
      for (const productId of productIds) {
        nextCategory[productId] = makeInitialProductProgress(productId);
      }
      return {
        byCategory: {
          ...state.byCategory,
          [category]: nextCategory,
        },
      };
    });
  },
  markStage: (category, productIds, stageId, status) => {
    const stepId = STAGE_STEP[stageId];
    set((state) => {
      const currentCategory = state.byCategory[category] ?? {};
      const nextCategory: Record<string, PipelineProductProgress> = { ...currentCategory };

      for (const productId of productIds) {
        const current = nextCategory[productId] ?? makeInitialProductProgress(productId);
        nextCategory[productId] = {
          ...current,
          steps: current.steps.map((step) =>
            step.id === stepId ? resolveStepStatus(step, stageId, status) : step,
          ),
        };
      }

      return {
        byCategory: {
          ...state.byCategory,
          [category]: nextCategory,
        },
      };
    });
  },
  clearCategory: (category) => {
    set((state) => {
      const next = { ...state.byCategory };
      delete next[category];
      return { byCategory: next };
    });
  },
}));

export function usePipelineProductProgress(
  category: string,
  productId: string,
): PipelineProductProgress | null {
  return useOverviewPipelineProgressStore((state) => state.byCategory[category]?.[productId] ?? null);
}
