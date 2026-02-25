import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PANELS_DIR = path.resolve('tools/gui-react/src/pages/runtime-ops/panels');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('all capped prefetch containers are vertically scrollable', () => {
  const files = fs
    .readdirSync(PANELS_DIR)
    .filter((name) => name.startsWith('Prefetch') && name.endsWith('.tsx'))
    .map((name) => path.join(PANELS_DIR, name));

  for (const filePath of files) {
    const source = readText(filePath);
    const cappedClassMatches = Array.from(source.matchAll(/className="([^"]*max-h-[^"]*)"/g));

    for (const match of cappedClassMatches) {
      const className = match[1];
      if (/\bmax-h-/.test(className) && !/\boverflow-/.test(className)) {
        continue;
      }
      assert.match(
        className,
        /\boverflow-y-auto\b/,
        `${path.basename(filePath)} has capped content without vertical scrolling: ${className}`,
      );
    }
  }
});
