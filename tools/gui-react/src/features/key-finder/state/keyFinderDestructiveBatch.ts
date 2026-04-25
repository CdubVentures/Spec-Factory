export interface KeyFinderDestructiveMutationInput {
  readonly fieldKey: string;
}

export type KeyFinderDestructiveMutation = (
  input: KeyFinderDestructiveMutationInput,
) => Promise<unknown>;

export interface KeyFinderDestructiveBatchFailure {
  readonly fieldKey: string;
  readonly message: string;
}

export interface KeyFinderDestructiveBatchResult {
  readonly attempted: number;
  readonly succeeded: readonly string[];
  readonly failed: readonly KeyFinderDestructiveBatchFailure[];
}

function messageFromReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  const text = String(reason ?? '').trim();
  return text || 'Unknown error';
}

export async function runKeyFinderDestructiveBatch({
  fieldKeys,
  mutate,
}: {
  readonly fieldKeys: readonly string[];
  readonly mutate: KeyFinderDestructiveMutation;
}): Promise<KeyFinderDestructiveBatchResult> {
  const uniqueFieldKeys = [...new Set(fieldKeys.map((fieldKey) => fieldKey.trim()).filter(Boolean))];
  const settled = await Promise.allSettled(
    uniqueFieldKeys.map(async (fieldKey) => {
      await mutate({ fieldKey });
      return fieldKey;
    }),
  );

  const succeeded: string[] = [];
  const failed: KeyFinderDestructiveBatchFailure[] = [];
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const fieldKey = uniqueFieldKeys[index];
    if (result.status === 'fulfilled') {
      succeeded.push(result.value);
    } else {
      failed.push({ fieldKey, message: messageFromReason(result.reason) });
    }
  }

  return {
    attempted: uniqueFieldKeys.length,
    succeeded,
    failed,
  };
}

export function formatKeyFinderDestructiveBatchFailure(
  verb: string,
  result: KeyFinderDestructiveBatchResult,
): string {
  const failures = result.failed
    .map((failure) => `${failure.fieldKey}: ${failure.message}`)
    .join('; ');
  return `${verb} failed for ${result.failed.length} of ${result.attempted} key(s): ${failures}`;
}
