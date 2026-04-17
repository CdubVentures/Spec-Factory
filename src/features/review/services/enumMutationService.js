export function normalizeEnumToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function hasMeaningfulEnumValue(value) {
  const token = normalizeEnumToken(value);
  if (value == null) return false;
  return token !== '' && token !== 'unknown' && token !== 'n/a' && token !== 'null';
}

export function dedupeEnumValues(values = []) {
  const seen = new Set();
  const output = [];
  for (const rawValue of values) {
    const text = String(rawValue ?? '').trim();
    if (!hasMeaningfulEnumValue(text)) continue;
    const token = normalizeEnumToken(text);
    if (seen.has(token)) continue;
    seen.add(token);
    output.push(text);
  }
  return output;
}

export function validateEnumCandidate({
  candidateRow,
  candidateId,
  field,
  resolvedValue,
  isMeaningfulValue,
  normalizeLower,
  valueMismatchMessage,
  allowValueMismatch = false,
}) {
  if (String(candidateRow?.field_key || '').trim() !== String(field || '').trim()) {
    return {
      error: 'candidate_context_mismatch',
      message: `candidate_id '${candidateId}' does not belong to enum field '${field}'.`,
    };
  }
  const candidateValueToken = String(candidateRow?.value ?? '').trim();
  if (
    !allowValueMismatch
    && (
    isMeaningfulValue(candidateValueToken)
    && normalizeLower(candidateValueToken) !== normalizeLower(String(resolvedValue ?? '').trim())
    )
  ) {
    return {
      error: 'candidate_value_mismatch',
      message: valueMismatchMessage,
    };
  }
  return null;
}

export function upsertEnumListValueAndFetch({
  runtimeSpecDb,
  field,
  value,
  normalizedValue,
  upsertValues,
}) {
  runtimeSpecDb.upsertListValue({
    fieldKey: field,
    value,
    normalizedValue,
    ...(upsertValues || {}),
  });
  return runtimeSpecDb.getListValueByFieldAndValue(field, value);
}

export function resolveEnumPreAffectedProductIds(runtimeSpecDb, listValueId) {
  try {
    const preRows = runtimeSpecDb.getProductsByListValueId(listValueId) || [];
    return [...new Set(preRows.map((row) => row?.product_id).filter(Boolean))];
  } catch {
    return [];
  }
}

export function resolveEnumRequiredCandidate({
  action,
  requestedCandidateId,
}) {
  const needsCandidateAction = action === 'accept' || action === 'confirm';
  if (!needsCandidateAction) return null;
  if (!requestedCandidateId) {
    return {
      status: 400,
      payload: {
        error: 'candidate_id_required',
        message: `candidateId is required for enum ${action}.`,
      },
    };
  }
  return null;
}

