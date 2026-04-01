function unwrapSpawnFailure(value) {
  const subject = value && typeof value === 'object'
    ? value
    : null;
  const error = subject && 'error' in subject
    ? subject.error
    : value;
  return { subject, error };
}

export function isSpawnEperm(value) {
  const { error } = unwrapSpawnFailure(value);
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').trim();
  return code === 'EPERM' || (message.includes('spawn') && message.includes('EPERM'));
}

export function throwIfSpawnEperm(value, reason = 'child-process spawn is required for this contract') {
  if (!isSpawnEperm(value)) return false;

  const { subject, error } = unwrapSpawnFailure(value);
  const details = [
    String(error?.message || '').trim(),
    String(subject?.stderr || '').trim(),
  ].filter(Boolean);

  throw new Error(
    details.length > 0
      ? `${reason}: ${details.join(' | ')}`
      : reason,
  );
}
