import { useEffect } from 'react';
import { useUiStore } from '../../../stores/uiStore.ts';
import { useRuntimeStore } from '../../../stores/runtimeStore.ts';
import { isTestCategory } from '../../../utils/testMode.ts';
import { useCategoriesQuery } from '../../../hooks/useCategoriesQuery.ts';
import { useProcessStatusQuery } from '../../../hooks/useProcessStatusQuery.ts';
import { coerceCategories, resolveActiveCategory } from '../../../utils/categoryStoreSync.js';

export function useCategorySync() {
  const setCategories = useUiStore((s) => s.setCategories);
  const setCategory = useUiStore((s) => s.setCategory);
  const category = useUiStore((s) => s.category);
  const setProcessStatus = useRuntimeStore((s) => s.setProcessStatus);

  const categoriesQuery = useCategoriesQuery();

  useEffect(() => {
    if (!categoriesQuery.data) return;
    const normalized = coerceCategories(categoriesQuery.data);
    setCategories(normalized);
    const nextCategory = resolveActiveCategory({
      currentCategory: category,
      categories: normalized,
    });
    if (nextCategory !== category) {
      setCategory(nextCategory);
    }
  }, [categoriesQuery.data, setCategories, setCategory, category]);

  useEffect(() => {
    if (!categoriesQuery.isError) return;
    const fallback = coerceCategories([]);
    setCategories(fallback);
    const nextCategory = resolveActiveCategory({
      currentCategory: category,
      categories: fallback,
    });
    if (nextCategory !== category) {
      setCategory(nextCategory);
    }
  }, [categoriesQuery.isError, setCategories, setCategory, category]);

  const testMode = isTestCategory(category);

  const { data: polledProcessStatus } = useProcessStatusQuery(5000);

  useEffect(() => {
    if (!polledProcessStatus) return;
    setProcessStatus(polledProcessStatus);
  }, [polledProcessStatus, setProcessStatus]);

  const processStatus = useRuntimeStore((s) => s.processStatus);

  return { category, setCategory, testMode, processStatus };
}
