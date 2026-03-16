export function copyContext(context = {}) {
  return { ...context };
}

export function renameContextKeys(context = {}, keyMap = {}) {
  const result = { ...context };

  for (const [fromKey, toKey] of Object.entries(keyMap)) {
    if (!Object.prototype.hasOwnProperty.call(result, fromKey)) {
      continue;
    }

    result[toKey] = result[fromKey];
    if (toKey !== fromKey) {
      delete result[fromKey];
    }
  }

  return result;
}
