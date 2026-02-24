export interface StudioAuthorityActionInput {
  category: string;
  previousCategory: string;
  initialized: boolean;
  hasServerRules: boolean;
  hasUnsavedEdits: boolean;
  previousVersion: string;
  nextVersion: string;
}

export interface StudioAuthorityAction {
  resetStore: boolean;
  hydrate: boolean;
  rehydrate: boolean;
  conflict: boolean;
}

export function decideStudioAuthorityAction(input: StudioAuthorityActionInput): StudioAuthorityAction;

export interface StudioAuthorityConflictInput {
  conflict: boolean;
  nextVersion: string;
  pendingVersion: string;
  ignoredVersion: string;
}

export function shouldOpenStudioAuthorityConflict(input: StudioAuthorityConflictInput): boolean;
