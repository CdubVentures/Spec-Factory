import assert from 'node:assert/strict';

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
  const error = value && typeof value === 'object' && 'error' in value
    ? value.error
    : value;
  const stderr = String(value?.stderr || '').trim();
  const stdout = String(value?.stdout || '').trim();
  const message = String(error?.message || '').trim() || 'spawn EPERM';
  const details = [reason, message];
  if (stderr) details.push(`stderr: ${stderr}`);
  if (stdout) details.push(`stdout: ${stdout}`);
  assert.fail(details.join('\n'));
}
