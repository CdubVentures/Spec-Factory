export function normalizeDataChangeToken(value) {
  return String(value || '').trim();
}

export function collectDataChangeDomains(values) {
  const source = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const output = [];
  for (const value of source) {
    const token = normalizeDataChangeToken(value).toLowerCase();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    output.push(token);
  }
  return output;
}
