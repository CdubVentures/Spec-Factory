function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

export function resolveRunActiveScope({
  processRunning = false,
  selectedRunStatus = '',
} = {}) {
  if (processRunning) {
    return true;
  }
  const status = normalizeStatus(selectedRunStatus);
  if (status === 'running') {
    return true;
  }
  if (
    status === 'completed'
    || status === 'failed'
    || status === 'stopped'
    || status === 'cancelled'
    || status === 'canceled'
    || status === 'error'
  ) {
    return false;
  }
  return false;
}
