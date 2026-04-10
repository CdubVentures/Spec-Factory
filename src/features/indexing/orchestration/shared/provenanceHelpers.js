export function createEmptyProvenance(fieldOrder, fields) {
  const output = {};
  for (const key of fieldOrder) {
    output[key] = {
      value: fields[key],
      confirmations: 0,
      approved_confirmations: 0,
      pass_target: 0,
      meets_pass_target: false,
      confidence: 0,
      evidence: []
    };
  }
  return output;
}

export function ensureProvenanceField(provenance, field, fallbackValue = null) {
  if (!provenance[field]) {
    provenance[field] = {
      value: fallbackValue,
      confirmations: 0,
      approved_confirmations: 0,
      pass_target: 1,
      meets_pass_target: false,
      confidence: 0,
      evidence: []
    };
  }
  return provenance[field];
}

export function tsvRowFromFields(fieldOrder, fields) {
  return fieldOrder.map((field) => fields[field] ?? 'unk').join('\t');
}
