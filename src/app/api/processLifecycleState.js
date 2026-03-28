export function normalizeRunIdToken(value) {
  const token = String(value || '').trim();
  if (!token) return '';
  if (!/^[A-Za-z0-9._-]{8,96}$/.test(token)) return '';
  return token;
}

function normalizeStorageDestinationToken(value) {
  const token = String(value || '').trim().toLowerCase();
  return token === 's3' ? 's3' : 'local';
}

export function resolveProcessStorageDestination(runDataStorageState = {}) {
  if (!runDataStorageState || typeof runDataStorageState !== 'object') {
    return 'local';
  }
  if (runDataStorageState.enabled !== true) {
    return 'local';
  }
  return normalizeStorageDestinationToken(runDataStorageState.destinationType);
}

export function createInitialProcessState() {
  return {
    phase: 'idle',
    snapshot: {
      pid: null,
      command: null,
      startedAt: null,
      runId: null,
      category: null,
      productId: null,
      brand: null,
      model: null,
      variant: null,
      storageDestination: null,
      exitCode: null,
      endedAt: null,
    },
  };
}

export function processStateReducer(state, action) {
  switch (action.type) {
    case 'PROCESS_STARTED': {
      if (state.phase !== 'idle') return state;
      const p = action.payload || {};
      return {
        phase: 'running',
        snapshot: {
          pid: p.pid ?? null,
          command: p.command ?? null,
          startedAt: p.startedAt ?? null,
          runId: p.runId ?? null,
          category: p.category ?? null,
          productId: p.productId ?? null,
          brand: p.brand ?? null,
          model: p.model ?? null,
          variant: p.variant ?? null,
          storageDestination: p.storageDestination ?? null,
          exitCode: null,
          endedAt: null,
        },
      };
    }
    case 'PROCESS_EXITED': {
      if (state.phase !== 'running') return state;
      const p = action.payload || {};
      return {
        phase: 'idle',
        snapshot: {
          ...state.snapshot,
          exitCode: p.exitCode ?? null,
          endedAt: p.endedAt ?? null,
        },
      };
    }
    default:
      return state;
  }
}

export function deriveProcessStatus(state, { runDataStorageState } = {}) {
  const running = state.phase === 'running';
  const { snapshot } = state;

  const runId = normalizeRunIdToken(snapshot.runId || '');
  const productId = String(snapshot.productId || '').trim();
  const storageDestination = normalizeStorageDestinationToken(
    snapshot.storageDestination
    || resolveProcessStorageDestination(runDataStorageState),
  );

  return {
    running,
    run_id: runId || null,
    runId: runId || null,
    category: String(snapshot.category || '').trim() || null,
    product_id: productId || null,
    productId: productId || null,
    brand: String(snapshot.brand || '').trim() || null,
    model: String(snapshot.model || '').trim() || null,
    variant: String(snapshot.variant || '').trim() || null,
    storage_destination: storageDestination,
    storageDestination,
    pid: snapshot.pid || null,
    command: snapshot.command || null,
    startedAt: snapshot.startedAt || null,
    exitCode: running ? null : (snapshot.exitCode ?? null),
    endedAt: running ? null : (snapshot.endedAt || null),
  };
}
