import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadBundledModule(entryRelativePath, {
  stubs = {},
  prefix = 'bundled-module-',
} = {}) {
  const esbuild = await import('esbuild');
  const entryPath = path.resolve(entryRelativePath);
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: {
      '.js': 'js',
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    plugins: [
      {
        name: 'stub-modules',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (Object.prototype.hasOwnProperty.call(stubs, args.path)) {
              return { path: args.path, namespace: 'stub' };
            }
            return null;
          });

          build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
            contents: stubs[args.path],
            loader: 'js',
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });

  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const tmpFile = path.join(tmpDir, 'module.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    return await import(`${pathToFileURL(tmpFile).href}?v=${Date.now()}-${Math.random()}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
