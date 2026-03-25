import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUiStore } from '../../../stores/uiStore.ts';
import { isTestCategory } from '../../../utils/testMode.ts';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import { DEFAULT_CATEGORY } from '../../../utils/categoryStoreSync.js';

export function useFieldTestNavigation({ category, testMode }: { category: string; testMode: boolean }) {
  const setCategory = useUiStore((s) => s.setCategory);
  const location = useLocation();
  const navigate = useNavigate();

  const fieldTestTabActive = location.pathname.startsWith('/test-mode');
  const [lastMainPath, setLastMainPath] = usePersistedTab<string>('appShell:fieldTest:returnPath', '/');
  const [lastMainCategory, setLastMainCategory] = usePersistedTab<string>('appShell:fieldTest:returnCategory', DEFAULT_CATEGORY);

  useEffect(() => {
    if (!testMode) return;
    if (location.pathname === '/indexing' || location.pathname === '/runtime-ops') {
      navigate('/test-mode', { replace: true });
    }
  }, [testMode, location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname.startsWith('/test-mode')) return;
    if (location.pathname) setLastMainPath(location.pathname);
    if (!isTestCategory(category)) setLastMainCategory(category);
  }, [location.pathname, category, setLastMainPath, setLastMainCategory]);

  const handleFieldTestToggle = () => {
    if (fieldTestTabActive) {
      const restorePath = lastMainPath && !lastMainPath.startsWith('/test-mode') ? lastMainPath : '/';
      const restoreCategory = lastMainCategory && !isTestCategory(lastMainCategory) ? lastMainCategory : DEFAULT_CATEGORY;
      if (category !== restoreCategory) {
        setCategory(restoreCategory);
      }
      navigate(restorePath);
      return;
    }
    if (location.pathname) setLastMainPath(location.pathname);
    if (!isTestCategory(category)) setLastMainCategory(category);
    navigate('/test-mode');
  };

  return { fieldTestTabActive, handleFieldTestToggle };
}
