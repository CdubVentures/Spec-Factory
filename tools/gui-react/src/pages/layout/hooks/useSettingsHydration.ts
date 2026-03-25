import { useEffect, useState } from 'react';
import { useSettingsAuthorityBootstrap, isSettingsAuthoritySnapshotReady } from '../../../stores/settingsAuthority.ts';
import { useRuntimeSettingsStoreHydration } from '../../../features/pipeline-settings/index.ts';
import { useSettingsAuthorityStore } from '../../../stores/settingsAuthorityStore.ts';

export function useSettingsHydration() {
  useSettingsAuthorityBootstrap();
  // WHY: Hydrate the runtime settings Zustand store at the app shell level so it's
  // populated before any child page mounts. Without this, navigating directly to
  // /llm-config leaves the store null and LLM hydration silently drops data.
  useRuntimeSettingsStoreHydration();
  const settingsSnapshot = useSettingsAuthorityStore((s) => s.snapshot);
  const settingsReady = isSettingsAuthoritySnapshotReady(settingsSnapshot);
  const [allowDegradedRender, setAllowDegradedRender] = useState(false);

  useEffect(() => {
    if (settingsReady) {
      setAllowDegradedRender(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setAllowDegradedRender(true);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [settingsReady, settingsSnapshot.category]);

  return { settingsReady, allowDegradedRender, settingsSnapshot };
}
