export function isSpawnEperm(value) {
  const error = value && typeof value === 'object' && 'error' in value
    ? value.error
    : value;
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').trim();
  return code === 'EPERM' || (message.includes('spawn') && message.includes('EPERM'));
}

export function skipIfSpawnEperm(t, value, reason = 'sandbox blocks child-process spawn') {
  if (!isSpawnEperm(value)) return false;
  t.skip(reason);
  return true;
}
