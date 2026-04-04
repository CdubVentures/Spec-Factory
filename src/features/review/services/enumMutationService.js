export function normalizeEnumToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function hasMeaningfulEnumValue(value) {
  const token = normalizeEnumToken(value);
  return token !== '' && token !== 'unk' && token !== 'unknown' && token !== 'n/a' && token !== 'null';
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

export function readEnumConsistencyFormatHint(rule = {}) {
  const enumBlock = rule?.enum && typeof rule.enum === 'object' ? rule.enum : {};
  const enumMatch = enumBlock?.match && typeof enumBlock.match === 'object' ? enumBlock.match : {};
  return String(enumMatch?.format_hint || rule?.enum_match_format_hint || '').trim();
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

export function applyEnumSharedLaneState({
  runtimeSpecDb,
  applySharedLaneState,
  category,
  field,
  normalizedValue,
  listValueRow,
  selectedCandidateId,
  selectedValue,
  confidenceScore,
  laneAction,
  nowIso,
  confirmStatusOverride,
}) {
  return applySharedLaneState({
    specDb: runtimeSpecDb,
    category,
    targetKind: 'enum_key',
    fieldKey: field,
    enumValueNorm: normalizedValue,
    listValueId: listValueRow?.id ?? null,
    enumListId: listValueRow?.list_id ?? null,
    selectedCandidateId: selectedCandidateId || null,
    selectedValue,
    confidenceScore,
    laneAction,
    nowIso,
    confirmStatusOverride,
  });
}

export function applyEnumSharedLaneWithResolvedConfidence({
  runtimeSpecDb,
  applySharedLaneState,
  category,
  field,
  normalizedValue,
  listValueRow,
  selectedCandidateId,
  selectedValue,
  laneAction,
  nowIso,
  confirmStatusOverride = undefined,
  fallbackConfidence = 1.0,
}) {
  const sharedConfidence = fallbackConfidence;
  return applyEnumSharedLaneState({
    runtimeSpecDb,
    applySharedLaneState,
    category,
    field,
    normalizedValue,
    listValueRow,
    selectedCandidateId,
    selectedValue,
    confidenceScore: sharedConfidence,
    laneAction,
    nowIso,
    confirmStatusOverride,
  });
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

