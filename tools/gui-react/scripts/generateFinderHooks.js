// WHY: O(1) Feature Scaling — auto-generates the 5 standard React Query hooks
// (query, run mutation, loop mutation, delete run, delete all) for each finder
// that opts in via `getResponseSchemaExport` in finderModuleRegistry.js.
//
// Finders with feature-specific mutations (CEF variant cascade, PIF carousel/
// eval/batch) keep hand-written hooks. The codegen skips them.
//
// Usage:
//   node tools/gui-react/scripts/generateFinderHooks.js                  — regenerate all opted-in finders
//   node tools/gui-react/scripts/generateFinderHooks.js releaseDateFinder — regenerate one
//
// Output: tools/gui-react/src/features/{panelFeaturePath}/api/{featureName}FinderQueries.generated.ts

import fs from 'node:fs';
import path from 'node:path';
import { FINDER_MODULES, deriveFinderPaths } from '../../../src/core/finder/finderModuleRegistry.js';

/** 'releaseDateFinder' → 'ReleaseDateFinder' */
function pascal(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/**
 * Emit TypeScript source for one finder's standard hooks.
 */
export function buildFinderHooksSource(module) {
  const { id, routePrefix, getResponseSchemaExport } = module;
  if (!getResponseSchemaExport) {
    throw new Error(`finder ${id} does not declare getResponseSchemaExport — hooks codegen skipped`);
  }
  const base = pascal(id);                      // ReleaseDateFinder
  const resultType = `${base}Result`;
  const urlBase = `/${routePrefix}/\${encodeURIComponent(category)}/\${encodeURIComponent(productId)}`;

  return `// AUTO-GENERATED from finderModuleRegistry.js (entry: ${id}).
// Run: node tools/gui-react/scripts/generateFinderHooks.js ${id}
// Do not edit manually.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../../../api/client.ts';
import type { ${resultType} } from '../types.generated.ts';

export interface AcceptedResponse {
  readonly status: 'accepted';
  readonly operationId: string;
}

export interface ${base}DeleteResponse {
  readonly ok: boolean;
  readonly remaining_runs?: number;
}

export function use${base}Query(category: string, productId: string) {
  return useQuery<${resultType}>({
    queryKey: ['${routePrefix}', category, productId],
    queryFn: () => api.get<${resultType}>(
      \`${urlBase}\`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

// WHY: No onSuccess invalidation — 202 means work is queued, not complete.
// WS data-change events invalidate queries when background work finishes.
export function use${base}RunMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse, Error, { variant_key?: string; variant_id?: string }>({
    mutationFn: (body) => api.post<AcceptedResponse>(
      \`${urlBase}\`,
      body,
    ),
  });
}

// Loop: retries per variant up to perVariantAttemptBudget until the candidate
// reaches the publisher gate or LLM returns definitive unknown.
export function use${base}LoopMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse, Error, { variant_key?: string; variant_id?: string }>({
    mutationFn: (body) => api.post<AcceptedResponse>(
      \`${urlBase}/loop\`,
      body,
    ),
  });
}

export function useDelete${base}RunMutation(category: string, productId: string) {
  const queryClient = useQueryClient();
  const resetQuery = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['${routePrefix}', category, productId] });
  }, [queryClient, category, productId]);
  return useMutation<${base}DeleteResponse, Error, number>({
    mutationFn: (runNumber: number) => api.del<${base}DeleteResponse>(
      \`${urlBase}/runs/\${runNumber}\`,
    ),
    onSuccess: resetQuery,
  });
}

export function useDelete${base}AllMutation(category: string, productId: string) {
  const queryClient = useQueryClient();
  const resetQuery = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['${routePrefix}', category, productId] });
  }, [queryClient, category, productId]);
  return useMutation<${base}DeleteResponse>({
    mutationFn: () => api.del<${base}DeleteResponse>(
      \`${urlBase}\`,
    ),
    onSuccess: resetQuery,
  });
}
`;
}

/**
 * Derive the on-disk filename (matches the existing hand-written convention:
 * '{featureName}FinderQueries.generated.ts' where featureName is id with the
 * 'Finder' suffix stripped — e.g. 'releaseDateFinder' → 'releaseDateFinderQueries'
 * matches existing hand-written file 'releaseDateFinderQueries.ts').
 */
function outputPathFor(module) {
  const { panelFeaturePath } = deriveFinderPaths(module.id);
  return path.resolve(
    import.meta.dirname,
    `../src/features/${panelFeaturePath}/api/${module.id}Queries.generated.ts`,
  );
}

async function main() {
  const arg = process.argv[2];
  const modules = FINDER_MODULES.filter((m) => m.getResponseSchemaExport);
  const target = arg
    ? modules.filter((m) => m.id === arg)
    : modules;

  if (arg && target.length === 0) {
    const opted = modules.map((m) => m.id).join(', ');
    throw new Error(`finder ${arg} not found or does not declare getResponseSchemaExport (opted-in: ${opted || '(none)'})`);
  }

  for (const module of target) {
    const source = buildFinderHooksSource(module);
    const outPath = outputPathFor(module);
    fs.writeFileSync(outPath, source, 'utf8');
    console.log(`Wrote ${outPath} (${source.split('\n').length} lines)`);
  }
}

const argvScript = (process.argv[1] || '').replace(/\\/g, '/');
if (argvScript.endsWith('generateFinderHooks.js')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
