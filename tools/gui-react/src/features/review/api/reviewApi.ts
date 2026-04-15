import { api } from '../../../api/client.ts';
import type { CandidateDeleteResponse } from '../../../types/review.ts';

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
