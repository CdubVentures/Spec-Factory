import { useFieldRulesStore } from './useFieldRulesStore.ts';

export function useStudioFieldRulesState() {
  const editedRules = useFieldRulesStore((state) => state.editedRules);
  const editedFieldOrder = useFieldRulesStore((state) => state.editedFieldOrder);
  const pendingRenames = useFieldRulesStore((state) => state.pendingRenames);
  const initialized = useFieldRulesStore((state) => state.initialized);
  const egLockedKeys = useFieldRulesStore((state) => state.egLockedKeys);
  const egToggles = useFieldRulesStore((state) => state.egToggles);
  const registeredColors = useFieldRulesStore((state) => state.registeredColors);

  const groupsDirty = useFieldRulesStore((state) => state.groupsDirty);

  return {
    editedRules,
    editedFieldOrder,
    pendingRenames,
    initialized,
    groupsDirty,
    egLockedKeys,
    egToggles,
    registeredColors,
  };
}

export function useStudioFieldRulesActions() {
  const hydrate = useFieldRulesStore((state) => state.hydrate);
  const rehydrate = useFieldRulesStore((state) => state.rehydrate);
  const reset = useFieldRulesStore((state) => state.reset);
  const clearRenames = useFieldRulesStore((state) => state.clearRenames);
  const clearEdited = useFieldRulesStore((state) => state.clearEdited);
  const clearEditedKeys = useFieldRulesStore((state) => state.clearEditedKeys);
  const clearGroupsDirty = useFieldRulesStore((state) => state.clearGroupsDirty);
  const updateField = useFieldRulesStore((state) => state.updateField);
  const setEgToggle = useFieldRulesStore((state) => state.setEgToggle);
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
    clearEdited,
    clearEditedKeys,
    clearGroupsDirty,
    updateField,
    setEgToggle,
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
