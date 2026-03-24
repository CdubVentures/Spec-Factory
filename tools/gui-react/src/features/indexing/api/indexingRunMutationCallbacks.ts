import type { ProcessStatus } from '../../../types/events.ts';

interface StartIndexLabMutationVariablesLike {
  requestedRunId?: string;
}

interface StartIndexLabMutationContextLike {
  previousRunId?: string;
}

interface HandleStartIndexLabMutationErrorInput {
  context: StartIndexLabMutationContextLike | undefined;
  setSelectedIndexLabRunId: (runId: string) => void;
}

export function handleStartIndexLabMutationError(input: HandleStartIndexLabMutationErrorInput): void {
  input.setSelectedIndexLabRunId(String(input.context?.previousRunId || '').trim());
}

interface HandleStartIndexLabMutationSuccessInput {
  status: ProcessStatus | null | undefined;
  variables: StartIndexLabMutationVariablesLike | undefined;
  setSelectedIndexLabRunId: (runId: string) => void;
  publishProcessStatus: (status: ProcessStatus | null | undefined) => void;
  refreshAll: () => Promise<void> | void;
}

export function handleStartIndexLabMutationSuccess(input: HandleStartIndexLabMutationSuccessInput): void {
  const resolvedRunId = String(input.status?.run_id || input.status?.runId || input.variables?.requestedRunId || '').trim();
  if (resolvedRunId) {
    input.setSelectedIndexLabRunId(resolvedRunId);
  }
  input.publishProcessStatus(input.status);
  void input.refreshAll();
}
