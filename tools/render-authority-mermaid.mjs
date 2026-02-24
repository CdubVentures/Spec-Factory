import { execSync } from 'node:child_process';
import path from 'node:path';

const baseDir = path.join('implementation', 'data-managament', 'diagrams', 'authority-flows');

const diagrams = [
  '01-authoritative-store-end-to-end',
  '02-data-change-contract-and-subscribers',
  '03-data-sources-and-projections',
  '04-studio-save-compile-sync',
];

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

for (const name of diagrams) {
  const input = path.join(baseDir, `${name}.mmd`);
  const outPng = path.join(baseDir, `${name}.4k.png`);
  const outSvg = path.join(baseDir, `${name}.svg`);

  run(`npx --yes @mermaid-js/mermaid-cli -i "${input}" -o "${outPng}" -w 3840 -H 2160 -b white`);
  run(`npx --yes @mermaid-js/mermaid-cli -i "${input}" -o "${outSvg}"`);
}

console.log('Rendered authority Mermaid diagrams (4K PNG + SVG).');
