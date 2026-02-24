export interface RunActivityScopeOptions {
  processRunning?: boolean;
  selectedRunStatus?: string | null;
}

export declare function resolveRunActiveScope(
  options?: RunActivityScopeOptions,
): boolean;
