import { listOperations, dismissOperation } from '../../../../core/operations/index.js';

export function createInfraOperationsRoutes({ jsonRes }) {
  return function handleOperationsRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'operations') return false;

    if (method === 'GET' && !parts[1]) {
      return jsonRes(res, 200, listOperations());
    }

    if (method === 'DELETE' && parts[1]) {
      dismissOperation({ id: parts[1] });
      return jsonRes(res, 200, { ok: true });
    }

    return false;
  };
}
