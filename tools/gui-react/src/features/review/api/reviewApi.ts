import { api } from '../../../api/client.ts';
import type {
  CandidateDeleteResponse,
  ClearPublishedFieldRequest,
  ClearPublishedFieldResponse,
} from '../../../types/review.ts';

export function deleteCandidateBySourceId(
  category: string,
  productId: string,
  fieldKey: string,
  sourceId: string,
): Promise<CandidateDeleteResponse> {
  return api.del<CandidateDeleteResponse>(
    `/review/${category}/candidates/${productId}/${fieldKey}/${encodeURIComponent(sourceId)}`,
  );
}

export function deleteAllCandidatesForField(
  category: string,
  productId: string,
  fieldKey: string,
): Promise<CandidateDeleteResponse> {
  return api.del<CandidateDeleteResponse>(
    `/review/${category}/candidates/${productId}/${fieldKey}`,
  );
}

interface ManualOverrideBody {
  productId: string;
  field: string;
  value: unknown;
  variantId?: string;
  reviewer?: string;
  reason?: string;
  itemFieldStateId?: number;
}

export function manualOverrideField(
  category: string,
  body: ManualOverrideBody,
): Promise<unknown> {
  return api.post(`/review/${category}/manual-override`, body);
}

export function clearPublishedField(
  category: string,
  body: ClearPublishedFieldRequest & { itemFieldStateId?: number },
): Promise<ClearPublishedFieldResponse> {
  return api.post<ClearPublishedFieldResponse>(`/review/${category}/clear-published`, body);
}
