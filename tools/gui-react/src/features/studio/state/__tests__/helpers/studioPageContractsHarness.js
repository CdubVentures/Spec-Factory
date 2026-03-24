import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

// Shared bundled-module loaders for studio page contract slices.

export async function loadStudioPageDerivedState() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioPageDerivedState.ts',
    {
      prefix: 'studio-page-derived-state-',
    },
  );
}

export async function loadStudioPagePersistence() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioPagePersistence.ts',
    {
      prefix: 'studio-page-persistence-',
    },
  );
}

export async function loadStudioCompileReportsState() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/compileReportsState.ts',
    {
      prefix: 'studio-compile-reports-state-',
    },
  );
}
