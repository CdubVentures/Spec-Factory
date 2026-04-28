export const OPERATION_STATUS_CONTRACT = Object.freeze({
  allStatuses: Object.freeze(['queued', 'running', 'done', 'error', 'cancelled']),
  uiActiveStatuses: Object.freeze(['queued', 'running']),
  resourceRunningStatuses: Object.freeze(['running']),
  terminalStatuses: Object.freeze(['done', 'error', 'cancelled']),
});

function includesStatus(statuses, status) {
  return statuses.includes(status);
}

export function isOperationUiActiveStatus(status) {
  return includesStatus(OPERATION_STATUS_CONTRACT.uiActiveStatuses, status);
}

export function isOperationResourceRunningStatus(status) {
  return includesStatus(OPERATION_STATUS_CONTRACT.resourceRunningStatuses, status);
}

export function isOperationTerminalStatus(status) {
  return includesStatus(OPERATION_STATUS_CONTRACT.terminalStatuses, status);
}

export function countOperationStatuses(operations) {
  const counts = {
    queued: 0,
    running: 0,
    done: 0,
    error: 0,
    cancelled: 0,
  };
  for (const operation of operations) {
    const status = operation?.status;
    if (Object.hasOwn(counts, status)) counts[status] += 1;
  }
  return counts;
}

export function countUiActiveOperations(operations) {
  let count = 0;
  for (const operation of operations) {
    if (isOperationUiActiveStatus(operation?.status)) count += 1;
  }
  return count;
}

export function countResourceRunningOperations(operations) {
  let count = 0;
  for (const operation of operations) {
    if (isOperationResourceRunningStatus(operation?.status)) count += 1;
  }
  return count;
}
