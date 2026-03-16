import { useFieldRulesStore } from './useFieldRulesStore';

export function useStudioFieldRulesState() {
  const editedRules = useFieldRulesStore((state) => state.editedRules);
  const editedFieldOrder = useFieldRulesStore((state) => state.editedFieldOrder);
  const pendingRenames = useFieldRulesStore((state) => state.pendingRenames);
  const initialized = useFieldRulesStore((state) => state.initialized);

  return {
    editedRules,
    editedFieldOrder,
    pendingRenames,
    initialized,
  };
}

export function useStudioFieldRulesActions() {
  const hydrate = useFieldRulesStore((state) => state.hydrate);
  const rehydrate = useFieldRulesStore((state) => state.rehydrate);
  const reset = useFieldRulesStore((state) => state.reset);
  const clearRenames = useFieldRulesStore((state) => state.clearRenames);
  const updateField = useFieldRulesStore((state) => state.updateField);
  const addKey = useFieldRulesStore((state) => state.addKey);
  const removeKey = useFieldRulesStore((state) => state.removeKey);
  const renameKey = useFieldRulesStore((state) => state.renameKey);
  const bulkAddKeys = useFieldRulesStore((state) => state.bulkAddKeys);
  const reorder = useFieldRulesStore((state) => state.reorder);
  const addGroup = useFieldRulesStore((state) => state.addGroup);
  const removeGroup = useFieldRulesStore((state) => state.removeGroup);
  const renameGroup = useFieldRulesStore((state) => state.renameGroup);

  return {
    hydrate,
    rehydrate,
    reset,
    clearRenames,
    updateField,
    addKey,
    removeKey,
    renameKey,
    bulkAddKeys,
    reorder,
    addGroup,
    removeGroup,
    renameGroup,
  };
}

export function getStudioFieldRulesSnapshot() {
  return useFieldRulesStore.getState().getSnapshot();
}
