// WHY: JSON file I/O helpers extracted from curationSuggestions.js and componentReviewBatch.js.
// Single responsibility: read/write JSON documents with safe defaults.

import fs from 'node:fs/promises';
import path from 'node:path';

export async function readJsonDoc(filePath, defaultFactory) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : defaultFactory();
  } catch (error) {
    if (error?.code === 'ENOENT') return defaultFactory();
    throw error;
  }
}

export async function writeJsonDoc(filePath, doc) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}
