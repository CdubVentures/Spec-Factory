import {
  cancelOperation,
  completeOperation,
  failOperation,
  fireAndForget,
  getOperationSignal,
  registerOperation,
} from '../../core/operations/index.js';
import { buildOperationTelemetry } from '../../core/operations/buildOperationTelemetry.js';
import { createStreamBatcher } from '../../core/llm/streamBatcher.js';
import { runWriterModelTest } from '../../core/llm/writerModelTest.js';

export function createWriterModelTestHandler({
  jsonRes,
  config,
  broadcastWs,
  logger = null,
  registerOperationFn = registerOperation,
  createStreamBatcherFn = createStreamBatcher,
  buildOperationTelemetryFn = buildOperationTelemetry,
  runWriterModelTestFn = runWriterModelTest,
  fireAndForgetFn = fireAndForget,
  getOperationSignalFn = getOperationSignal,
  completeOperationFn = completeOperation,
  failOperationFn = failOperation,
  cancelOperationFn = cancelOperation,
}) {
  return async function handleWriterModelTest(parts, _params, method, _req, res) {
    if (parts[0] !== 'llm-policy' || parts[1] !== 'writer-test') return false;
    if (method !== 'POST') return false;

    const op = registerOperationFn({
      type: 'writer-test',
      subType: 'model-check',
      category: 'settings',
      productId: 'writer-model-test',
      productLabel: 'Writer Model Test',
      stages: ['Prepare', 'Call', 'Validate'],
    });
    const batcher = createStreamBatcherFn({ operationId: op.id, broadcastWs });
    const signal = getOperationSignalFn(op.id);

    return fireAndForgetFn({
      res,
      jsonRes,
      op,
      batcher,
      broadcastWs,
      signal,
      completeOperation: completeOperationFn,
      failOperation: failOperationFn,
      cancelOperation: cancelOperationFn,
      asyncWork: async () => runWriterModelTestFn({
        config,
        logger,
        signal,
        telemetry: buildOperationTelemetryFn({ op, batcher }),
      }),
    });
  };
}
