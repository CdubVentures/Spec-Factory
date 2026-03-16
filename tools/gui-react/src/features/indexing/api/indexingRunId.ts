function randomHex(bytes = 3) {
  const safeBytes = Math.max(1, Math.min(16, Number.parseInt(String(bytes || 3), 10) || 3));
  const seeded = new Uint8Array(safeBytes);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(seeded);
  } else {
    for (let idx = 0; idx < safeBytes; idx += 1) {
      seeded[idx] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(seeded)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function buildRequestedRunId(date = new Date()) {
  const stamp = date
    .toISOString()
    .split('-').join('')
    .split(':').join('')
    .split('.').join('')
    .split('T').join('')
    .split('Z').join('')
    .slice(0, 14);
  return `${stamp}-${randomHex(3)}`;
}
