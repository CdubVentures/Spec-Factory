import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import { useAuthoritySnapshot } from '../../../hooks/useAuthoritySnapshot.js';
import { buildAuthorityVersionToken } from '../../../hooks/authoritySnapshotHelpers.js';
import { autoSaveFingerprint } from '../../../stores/autoSaveFingerprint.ts';
import {
  SETTINGS_AUTOSAVE_DEBOUNCE_MS,
  SETTINGS_AUTOSAVE_STATUS_MS,
} from '../../../stores/settingsManifest.ts';
import type { FieldRule, StudioConfig } from '../../../types/studio.ts';
import {
  decideStudioAuthorityAction,
  shouldOpenStudioAuthorityConflict,
} from './authoritySync.js';
import { invalidateFieldRulesQueries } from './invalidateFieldRulesQueries.ts';
import {
  shouldFlushStudioDocsOnUnmount,
} from './studioBehaviorContracts.ts';
import {
  registerUnloadGuard,
  markDomainFlushedByUnmount,
  isDomainFlushedByUnload,
} from '../../../stores/settingsUnloadGuard.ts';
import { deriveStudioPageViewState } from './studioPageDerivedState.ts';
import {
  buildStudioPersistMap as buildStudioPersistMapPayload,
  shouldPersistStudioMapPayload,
  shouldPersistStudioDocsAttempt,
} from './studioPagePersistence.ts';
import { useStudioPersistenceAuthority } from './studioPersistenceAuthority.ts';
import {
  getStudioFieldRulesSnapshot,
  useStudioFieldRulesActions,
  useStudioFieldRulesState,
} from './studioFieldRulesController.ts';

export interface UseStudioPageDocsControllerInput {
  category: string;
  rules: Record<string, FieldRule>;
  fieldOrder: string[];
  wbMap: StudioConfig;
  autoSaveAllEnabled: boolean;
  autoSaveEnabled: boolean;
  autoSaveMapEnabled: boolean;
  mapSavedAt?: string | null;
  compiledAt?: string | null;
  queryClient: QueryClient;
  egLockedKeys?: readonly string[];
  egEditablePaths?: readonly string[];
  egToggles?: Record<string, boolean>;
  registeredColors?: readonly string[];
}

export interface UseStudioPageDocsControllerResult {
  saveMapMut: ReturnType<typeof useStudioPersistenceAuthority>['saveMapMut'];
  saveStudioDocsMut: ReturnType<
    typeof useStudioPersistenceAuthority
  >['saveStudioDocsMut'];
  fieldRulesInitialized: boolean;
  authorityConflictVersion: string;
  authorityConflictDetectedAt: string;
  autoSaveStatus: 'idle' | 'saved';
  effectiveAutoSaveEnabled: boolean;
  effectiveAutoSaveMapEnabled: boolean;
  storeRules: Record<string, FieldRule>;
  storeFieldOrder: string[];
  hasUnsavedChanges: boolean;
  saveFromStore: (options?: { force?: boolean }) => void;
  persistFieldKeyOrder: (order: string[]) => void;
  reloadAuthoritySnapshot: () => void;
  keepLocalChangesForAuthorityConflict: () => void;
}

export function useStudioPageDocsController({
  category,
  rules,
  fieldOrder,
  wbMap,
  autoSaveAllEnabled,
  autoSaveEnabled,
  autoSaveMapEnabled,
  mapSavedAt,
  compiledAt,
  queryClient,
  egLockedKeys,
  egEditablePaths,
  egToggles,
  registeredColors,
}: UseStudioPageDocsControllerInput): UseStudioPageDocsControllerResult {
  const hydrated = useRef(false);
  // WHY: During save+refetch, hasUnsavedEdits stays true (clearEdited deferred)
  // which prevents authority sync from rehydrating with stale data.
  // Also suppresses false conflict dialogs caused by our own save.
  const saveInProgressRef = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saved'>(
    'idle',
  );
  const [authorityConflictVersion, setAuthorityConflictVersion] = useState('');
  const [authorityConflictDetectedAt, setAuthorityConflictDetectedAt] =
    useState('');
  const fieldRulesState = useStudioFieldRulesState();
  const fieldRulesActions = useStudioFieldRulesActions();
  const { saveMapMut, saveStudioDocsMut, saveFieldKeyOrderMut } = useStudioPersistenceAuthority({
    category,
    onStudioDocsSaved: () => {
      // WHY: Synchronous — no race conditions. The local Zustand store already
      // has the correct values. Just strip _edited flags. The WebSocket broadcast
      // from the server + the 10s authority poll handle downstream reconciliation.
      fieldRulesActions.clearRenames();
      fieldRulesActions.clearEdited();
      fieldRulesActions.clearGroupsDirty();
    },
  });
  const previousCategoryRef = useRef(category);
  const authorityVersionRef = useRef('');
  const ignoredConflictVersionRef = useRef('');
  const fallbackAuthorityVersion = buildAuthorityVersionToken({
    map_hash: mapSavedAt ? `map:${mapSavedAt}` : null,
    compiled_hash: compiledAt ? `compiled:${compiledAt}` : null,
    specdb_sync_version: 0,
    updated_at: mapSavedAt || compiledAt || null,
  });
  const { authorityVersionToken: snapshotAuthorityVersion } =
    useAuthoritySnapshot({
      category,
      enabled: category !== 'all',
    });
  const authoritySnapshotVersion =
    snapshotAuthorityVersion || fallbackAuthorityVersion;

  useEffect(() => {
    const hasServerRules = Object.keys(rules).length > 0;
    const hasUnsavedEdits = Object.values(fieldRulesState.editedRules).some(
      (rule) => Boolean(rule?._edited),
    );
    const nextVersion = authoritySnapshotVersion;
    const next = String(nextVersion || '').trim();
    const previous = String(authorityVersionRef.current || '').trim();
    const versionChanged = Boolean(next) && next !== previous;

    // WHY: Capture and clear saveInProgress on the first version change after
    // our own save. This one-cycle grace suppresses the false conflict dialog
    // caused by the server reflecting our save back through WebSocket/poll.
    const wasSaveInProgress = saveInProgressRef.current;
    if (versionChanged && wasSaveInProgress) {
      saveInProgressRef.current = false;
    }

    const action = decideStudioAuthorityAction({
      category,
      previousCategory: previousCategoryRef.current,
      initialized: fieldRulesState.initialized,
      hasServerRules,
      hasUnsavedEdits,
      previousVersion: authorityVersionRef.current,
      nextVersion,
    });

    if (action.resetStore) {
      fieldRulesActions.reset();
      authorityVersionRef.current = '';
      ignoredConflictVersionRef.current = '';
      setAuthorityConflictVersion('');
      setAuthorityConflictDetectedAt('');
      hydrated.current = false;
    }
    if (action.hydrate) {
      fieldRulesActions.hydrate(rules, fieldOrder, egLockedKeys, egEditablePaths, egToggles, registeredColors);
    }
    let didRehydrate = false;
    // WHY: When wasSaveInProgress, our own save caused this version change.
    // The local store already has correct values — skip rehydrating with
    // potentially stale server data (authority snapshot resolves before payload).
    const skipRehydrate = action.rehydrate && wasSaveInProgress;
    if (action.rehydrate && !wasSaveInProgress) {
      fieldRulesActions.rehydrate(rules, fieldOrder, egLockedKeys, egEditablePaths, egToggles, registeredColors);
      hydrated.current = false;
      didRehydrate = true;
    }
    if (
      shouldOpenStudioAuthorityConflict({
        conflict: action.conflict && !wasSaveInProgress,
        nextVersion,
        pendingVersion: authorityConflictVersion,
        ignoredVersion: ignoredConflictVersionRef.current,
      })
    ) {
      setAuthorityConflictVersion(nextVersion);
      setAuthorityConflictDetectedAt(new Date().toISOString());
    }

    if ((action.hydrate || didRehydrate || skipRehydrate) && hasServerRules) {
      authorityVersionRef.current = nextVersion;
      ignoredConflictVersionRef.current = '';
      setAuthorityConflictVersion('');
      setAuthorityConflictDetectedAt('');
    } else if (hasServerRules && !authorityVersionRef.current) {
      authorityVersionRef.current = nextVersion;
    }
    previousCategoryRef.current = category;
  }, [
    authorityConflictVersion,
    authoritySnapshotVersion,
    category,
    fieldOrder,
    fieldRulesActions,
    fieldRulesState,
    rules,
  ]);

  const studioPageViewState = deriveStudioPageViewState({
    activeTab: 'mapping',
    autoSaveAllEnabled,
    autoSaveEnabled,
    autoSaveMapEnabled,
    initialized: fieldRulesState.initialized,
    groupsDirty: fieldRulesState.groupsDirty,
    serverRules: rules,
    serverFieldOrder: fieldOrder,
    editedRules: fieldRulesState.editedRules,
    editedFieldOrder: fieldRulesState.editedFieldOrder,
  });
  const effectiveAutoSaveEnabled =
    studioPageViewState.effectiveAutoSaveEnabled;
  const effectiveAutoSaveMapEnabled =
    studioPageViewState.effectiveAutoSaveMapEnabled;
  const storeRules = studioPageViewState.storeRules;
  const storeFieldOrder = studioPageViewState.storeFieldOrder;
  const hasUnsavedChanges = studioPageViewState.hasUnsavedChanges;
  const lastStudioAutoSaveFingerprintRef = useRef('');
  const lastStudioAutoSaveAttemptFingerprintRef = useRef('');
  const saveStudioDocs = saveStudioDocsMut.mutate;

  const buildStudioPersistMap = useCallback(
    (snap: {
      rules: Record<string, Record<string, unknown>>;
      fieldOrder: string[];
      renames: Record<string, string>;
    }) =>
      buildStudioPersistMapPayload({
        baseMap: wbMap,
        snapshot: snap,
      }),
    [wbMap],
  );

  const saveFromStore = useCallback(
    (options?: { force?: boolean }) => {
      const force = options?.force === true;
      const snap = getStudioFieldRulesSnapshot();
      const payload = buildStudioPersistMap(snap);
      if (!shouldPersistStudioMapPayload({ payload, force })) {
        return;
      }
      const nextFingerprint = autoSaveFingerprint(payload);
      if (
        !shouldPersistStudioDocsAttempt({
          force,
          nextFingerprint,
          lastSavedFingerprint: lastStudioAutoSaveFingerprintRef.current,
          lastAttemptFingerprint:
            lastStudioAutoSaveAttemptFingerprintRef.current,
        })
      ) {
        return;
      }
      if (nextFingerprint) {
        lastStudioAutoSaveAttemptFingerprintRef.current = nextFingerprint;
      }
      saveInProgressRef.current = true;
      saveStudioDocs(payload, {
        onSuccess: () => {
          lastStudioAutoSaveFingerprintRef.current = nextFingerprint;
          lastStudioAutoSaveAttemptFingerprintRef.current = nextFingerprint;
          if (effectiveAutoSaveEnabled) {
            setAutoSaveStatus('saved');
            setTimeout(
              () => setAutoSaveStatus('idle'),
              SETTINGS_AUTOSAVE_STATUS_MS.studioSavedIndicatorReset,
            );
          }
        },
        onError: () => {
          saveInProgressRef.current = false;
        },
      });
    },
    [buildStudioPersistMap, effectiveAutoSaveEnabled, saveStudioDocs],
  );

  useEffect(() => {
    if (!fieldRulesState.initialized) return;
    const snap = getStudioFieldRulesSnapshot();
    const hydratedPayload = buildStudioPersistMap(snap);
    const hydratedFingerprint = shouldPersistStudioMapPayload({
      payload: hydratedPayload,
      force: false,
    })
      ? autoSaveFingerprint(hydratedPayload)
      : '';
    lastStudioAutoSaveFingerprintRef.current = hydratedFingerprint;
    lastStudioAutoSaveAttemptFingerprintRef.current = hydratedFingerprint;
    hydrated.current = true;
  }, [
    authoritySnapshotVersion,
    buildStudioPersistMap,
    fieldRulesState.initialized,
  ]);

  const editedRules = fieldRulesState.editedRules;
  const editedFieldOrder = fieldRulesState.editedFieldOrder;
  useEffect(() => {
    if (
      !effectiveAutoSaveEnabled ||
      !fieldRulesState.initialized ||
      !hydrated.current ||
      authorityConflictVersion
    ) {
      return;
    }
    const snap = getStudioFieldRulesSnapshot();
    const payload = buildStudioPersistMap(snap);
    if (!shouldPersistStudioMapPayload({ payload, force: false })) {
      return;
    }
    const nextFingerprint = autoSaveFingerprint(payload);
    if (
      !shouldPersistStudioDocsAttempt({
        force: false,
        nextFingerprint,
        lastSavedFingerprint: lastStudioAutoSaveFingerprintRef.current,
        lastAttemptFingerprint: lastStudioAutoSaveAttemptFingerprintRef.current,
      })
    ) {
      return;
    }
    const timer = setTimeout(
      saveFromStore,
      SETTINGS_AUTOSAVE_DEBOUNCE_MS.studioDocs,
    );
    return () => clearTimeout(timer);
  }, [
    authorityConflictVersion,
    buildStudioPersistMap,
    editedFieldOrder,
    editedRules,
    effectiveAutoSaveEnabled,
    fieldRulesState.initialized,
    saveFromStore,
  ]);

  useEffect(() => {
    return registerUnloadGuard({
      domain: 'studioDocs',
      isDirty: () => {
        if (!effectiveAutoSaveEnabled || !fieldRulesState.initialized || !hydrated.current) return false;
        const snap = getStudioFieldRulesSnapshot();
        const payload = buildStudioPersistMap(snap);
        if (!shouldPersistStudioMapPayload({ payload, force: false })) return false;
        const fp = autoSaveFingerprint(payload);
        return Boolean(fp) && fp !== lastStudioAutoSaveFingerprintRef.current;
      },
      getPayload: () => {
        const snap = getStudioFieldRulesSnapshot();
        const payload = buildStudioPersistMap(snap);
        return {
          url: `/api/v1/studio/${category}/field-studio-map`,
          method: 'PUT',
          body: payload,
        };
      },
      markFlushed: () => {
        const snap = getStudioFieldRulesSnapshot();
        const payload = buildStudioPersistMap(snap);
        const fp = shouldPersistStudioMapPayload({ payload, force: false })
          ? autoSaveFingerprint(payload)
          : '';
        lastStudioAutoSaveAttemptFingerprintRef.current = fp;
      },
    });
  }, [buildStudioPersistMap, category, effectiveAutoSaveEnabled, fieldRulesState.initialized]);

  useEffect(
    () => () => {
      if (isDomainFlushedByUnload('studioDocs')) return;
      const snap = getStudioFieldRulesSnapshot();
      const payload = buildStudioPersistMap(snap);
      if (!shouldPersistStudioMapPayload({ payload, force: true })) {
        return;
      }
      const nextFingerprint = autoSaveFingerprint(payload);
      if (
        !shouldFlushStudioDocsOnUnmount({
          autoSaveEnabled: effectiveAutoSaveEnabled,
          initialized: fieldRulesState.initialized,
          hydrated: hydrated.current,
          authorityConflictVersion,
          isPending: saveStudioDocsMut.isPending,
          nextFingerprint,
          lastSavedFingerprint: lastStudioAutoSaveFingerprintRef.current,
        })
      ) {
        return;
      }
      saveFromStore({ force: true });
      markDomainFlushedByUnmount('studioDocs');
    },
    [
      authorityConflictVersion,
      buildStudioPersistMap,
      effectiveAutoSaveEnabled,
      fieldRulesState.initialized,
      saveFromStore,
      saveStudioDocsMut.isPending,
    ],
  );

  const reloadAuthoritySnapshot = useCallback(() => {
    if (Object.keys(rules).length === 0) return;
    fieldRulesActions.rehydrate(rules, fieldOrder, egLockedKeys, egEditablePaths, egToggles, registeredColors);
    authorityVersionRef.current = authoritySnapshotVersion;
    ignoredConflictVersionRef.current = '';
    setAuthorityConflictVersion('');
    setAuthorityConflictDetectedAt('');
    hydrated.current = false;
  }, [authoritySnapshotVersion, fieldOrder, fieldRulesActions, rules]);

  const keepLocalChangesForAuthorityConflict = useCallback(() => {
    if (authorityConflictVersion) {
      ignoredConflictVersionRef.current = authorityConflictVersion;
    }
    setAuthorityConflictVersion('');
    setAuthorityConflictDetectedAt('');
  }, [authorityConflictVersion]);

  const persistFieldKeyOrder = useCallback(
    (order: string[]) => { saveFieldKeyOrderMut.mutate(order); },
    [saveFieldKeyOrderMut],
  );

  return {
    saveMapMut,
    saveStudioDocsMut,
    fieldRulesInitialized: fieldRulesState.initialized,
    authorityConflictVersion,
    authorityConflictDetectedAt,
    autoSaveStatus,
    effectiveAutoSaveEnabled,
    effectiveAutoSaveMapEnabled,
    storeRules,
    storeFieldOrder,
    hasUnsavedChanges,
    saveFromStore,
    persistFieldKeyOrder,
    reloadAuthoritySnapshot,
    keepLocalChangesForAuthorityConflict,
  };
}
