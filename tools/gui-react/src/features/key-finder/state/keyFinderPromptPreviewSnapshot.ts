import type { KeyGroup } from '../types.ts';

export interface KeyPromptPreviewState {
  readonly fieldKey: string;
  readonly passengerFieldKeysSnapshot: readonly string[];
}

function findKey(groups: readonly KeyGroup[], fieldKey: string) {
  return groups
    .flatMap((group) => group.keys)
    .find((key) => key.field_key === fieldKey);
}

function passengerFieldKeysForRow(groups: readonly KeyGroup[], fieldKey: string): readonly string[] | null {
  const entry = findKey(groups, fieldKey);
  if (!entry) return null;
  return entry.bundle_preview.map((passenger) => passenger.field_key);
}

export function createKeyPromptPreviewState(
  groups: readonly KeyGroup[],
  fieldKey: string,
): KeyPromptPreviewState {
  return {
    fieldKey,
    passengerFieldKeysSnapshot: passengerFieldKeysForRow(groups, fieldKey) ?? [],
  };
}

export function resolveKeyPromptPassengerSnapshot(
  groups: readonly KeyGroup[],
  promptState: KeyPromptPreviewState | null,
): readonly string[] {
  if (!promptState) return [];
  return passengerFieldKeysForRow(groups, promptState.fieldKey) ?? promptState.passengerFieldKeysSnapshot;
}
