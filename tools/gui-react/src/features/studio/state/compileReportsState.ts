export interface CompileReportsViewStateOptions {
  compileRunning: boolean;
  validateRunning: boolean;
  compileError: string | null;
  validateError: string | null;
  compilePending: boolean;
  compileIsError: boolean;
  compileErrorMessage?: string;
  validatePending: boolean;
  validateIsError: boolean;
  validateErrorMessage?: string;
  artifacts: Array<{ updated?: string | null }>;
  progressTick: number;
  nowMs: number;
}

export interface CompileReportsViewState {
  compileProcessRunning: boolean;
  validateProcessRunning: boolean;
  anyProcessRunning: boolean;
  progressActive: boolean;
  compileBadgeLabel: string;
  compileBadgeClass: string;
  validateBadgeLabel: string;
  validateBadgeClass: string;
  artifactProgressLabel: string;
  artifactProgressPercent: number;
}

const IDLE_BADGE_CLASS =
  'sf-border-default sf-bg-surface-soft sf-text-muted dark:sf-border-default sf-dk-surface-900a30 dark:sf-text-subtle';

export function deriveCompileReportsViewState({
  compileRunning,
  validateRunning,
  compileError,
  validateError,
  compilePending,
  compileIsError,
  compileErrorMessage,
  validatePending,
  validateIsError,
  validateErrorMessage,
  artifacts,
  progressTick,
  nowMs,
}: CompileReportsViewStateOptions): CompileReportsViewState {
  const anyProcessRunning = compileRunning || validateRunning;
  const progressActive = compileRunning || validateRunning || compilePending || validatePending;

  const activeArtifactGoal = Math.max(artifacts.length, 9);
  const idleArtifactGoal = Math.max(artifacts.length, 1);
  const elapsedMs = progressTick * 500;
  const fallbackRunningCount = progressActive
    ? Math.min(
        Math.max(1, Math.floor(elapsedMs / 1500)),
        Math.max(1, activeArtifactGoal - 1),
      )
    : 0;
  const artifactProgressCount = progressActive ? fallbackRunningCount : 0;
  const artifactProgressGoal = progressActive ? activeArtifactGoal : idleArtifactGoal;
  const idleArtifactCount = progressActive ? 0 : artifacts.length;
  const artifactProgressPercent = progressActive
    ? artifactProgressGoal > 0
      ? Math.round((artifactProgressCount / artifactProgressGoal) * 100)
      : 0
    : idleArtifactGoal > 0
      ? Math.round((idleArtifactCount / idleArtifactGoal) * 100)
      : 0;
  const artifactProgressLabel = progressActive
    ? `Artifacts ${artifactProgressCount} of ${artifactProgressGoal}`
    : `Artifacts ${idleArtifactCount} of ${idleArtifactGoal}`;

  const compileBadge = compileRunning
    ? { label: 'Compile running', className: 'sf-callout sf-callout-info' }
    : compilePending
      ? { label: 'Compile starting', className: 'sf-callout sf-callout-info' }
      : compileIsError
        ? { label: compileErrorMessage || 'Compile failed', className: 'sf-callout sf-callout-danger' }
        : compileError
          ? { label: 'Compile failed', className: 'sf-callout sf-callout-danger' }
          : null;

  const validateBadge = validateRunning
    ? { label: 'Validation running', className: 'sf-callout sf-callout-info' }
    : validatePending
      ? { label: 'Validation starting', className: 'sf-callout sf-callout-info' }
      : validateIsError
        ? { label: validateErrorMessage || 'Validation failed', className: 'sf-callout sf-callout-danger' }
        : validateError
          ? { label: 'Validation failed', className: 'sf-callout sf-callout-danger' }
          : null;

  return {
    compileProcessRunning: compileRunning,
    validateProcessRunning: validateRunning,
    anyProcessRunning,
    progressActive,
    compileBadgeLabel: compileBadge?.label || 'Compile idle',
    compileBadgeClass: compileBadge?.className || IDLE_BADGE_CLASS,
    validateBadgeLabel: validateBadge?.label || 'Validation idle',
    validateBadgeClass: validateBadge?.className || IDLE_BADGE_CLASS,
    artifactProgressLabel,
    artifactProgressPercent,
  };
}
