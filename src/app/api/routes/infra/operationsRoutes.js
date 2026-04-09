import { listOperations } from '../../../../core/operations/index.js';

export function createInfraOperationsRoutes({ jsonRes }) {
  return function handleOperationsRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'operations') return false;
    if (method !== 'GET') return false;
    return jsonRes(res, 200, listOperations());
  };
}
