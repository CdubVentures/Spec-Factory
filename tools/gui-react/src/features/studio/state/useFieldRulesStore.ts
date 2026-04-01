import { create } from 'zustand';
import { reorderFieldOrder } from './keyUtils.ts';
import {
  applyStudioRuleCommand,
  createSetFieldValueCommand,
} from '../rules/ruleCommands.ts';
import { EG_PRESET_KEYS } from './egPresetsClient.ts';
import type { FieldRule } from '../../../types/studio.ts';

type RuleMap = Record<string, FieldRule>;

function syncGroupsFromOrder(fieldOrder: string[], rules: RuleMap): RuleMap {
  let currentGroup = 'ungrouped';
  let changed = false;
  const updated = { ...rules };
  for (const item of fieldOrder) {
    if (item.startsWith('__grp::')) {
      currentGroup = item.slice(7);
      continue;
    }
    const rule = updated[item];
    if (!rule) continue;
    const uiObj = (rule.ui || {}) as Record<string, unknown>;
    const existing = uiObj.group ? String(uiObj.group) : String(rule.group || 'ungrouped');
    if (existing !== currentGroup) {
      updated[item] = {
        ...rule,
        ui: { ...uiObj, group: currentGroup },
        group: currentGroup,
      };
      changed = true;
    }
  }
  return changed ? updated : rules;
}

interface FieldRulesState {
  editedRules: RuleMap;
  editedFieldOrder: string[];
  pendingRenames: Record<string, string>;
  initialized: boolean;
  egLockedKeys: readonly string[];
  egEditablePaths: readonly string[];
  egToggles: Record<string, boolean>;

  hydrate: (rules: RuleMap, fieldOrder: string[], egLockedKeys?: readonly string[], egEditablePaths?: readonly string[], egToggles?: Record<string, boolean>) => void;
  rehydrate: (rules: RuleMap, fieldOrder: string[], egLockedKeys?: readonly string[], egEditablePaths?: readonly string[], egToggles?: Record<string, boolean>) => void;
  reset: () => void;
  clearRenames: () => void;
  clearEdited: () => void;

  updateField: (key: string, path: string, value: unknown) => void;
  setEgToggle: (key: string, enabled: boolean, preset: FieldRule) => void;
  addKey: (key: string, rule: FieldRule, afterKey?: string) => void;
  removeKey: (key: string) => void;
  renameKey: (oldKey: string, newKey: string, rewriteConstraints: (constraints: string[], oldK: string, newK: string) => string[], constraintRefsKey: (expr: string, k: string) => boolean) => void;
  bulkAddKeys: (entries: Array<{ key: string; rule: FieldRule }>) => void;

  reorder: (activeItem: string, overItem: string) => void;

  addGroup: (name: string) => void;
  removeGroup: (name: string) => void;
  renameGroup: (oldName: string, newName: string) => void;

  getSnapshot: () => {
    rules: RuleMap;
    fieldOrder: string[];
    renames: Record<string, string>;
    egToggles: Record<string, boolean>;
  };
}

export const useFieldRulesStore = create<FieldRulesState>((set, get) => ({
  editedRules: {},
  editedFieldOrder: [],
  pendingRenames: {},
  initialized: false,
  egLockedKeys: [],
  egEditablePaths: [],
  egToggles: {},

  hydrate: (rules, fieldOrder, egLockedKeys, egEditablePaths, egToggles) => {
    const cleaned: RuleMap = JSON.parse(JSON.stringify(rules));
    for (const key of Object.keys(cleaned)) {
      delete cleaned[key]._edited;
    }
    set({
      editedRules: cleaned,
      editedFieldOrder: [...fieldOrder],
      pendingRenames: {},
      initialized: true,
      egLockedKeys: egLockedKeys ?? [],
      egEditablePaths: egEditablePaths ?? [],
      egToggles: egToggles ?? {},
    });
  },

  rehydrate: (rules, fieldOrder, egLockedKeys, egEditablePaths, egToggles) => {
    const cleaned: RuleMap = JSON.parse(JSON.stringify(rules));
    for (const key of Object.keys(cleaned)) {
      delete cleaned[key]._edited;
    }
    set({
      editedRules: cleaned,
      editedFieldOrder: [...fieldOrder],
      pendingRenames: {},
      initialized: true,
      egLockedKeys: egLockedKeys ?? [],
      egEditablePaths: egEditablePaths ?? [],
      egToggles: egToggles ?? {},
    });
  },

  reset: () => {
    set({
      editedRules: {},
      editedFieldOrder: [],
      pendingRenames: {},
      initialized: false,
    });
  },

  clearRenames: () => {
    set({ pendingRenames: {} });
  },

  clearEdited: () => {
    set((state) => {
      const cleaned: RuleMap = {};
      for (const [k, rule] of Object.entries(state.editedRules)) {
        const { _edited: _, ...rest } = rule;
        cleaned[k] = rest;
      }
      return { editedRules: cleaned };
    });
  },

  updateField: (key, path, value) => {
    set((state) => {
      // WHY: EG-locked fields only allow edits to specific paths (aliases, search hints).
      if (state.egLockedKeys.includes(key) && !state.egEditablePaths.includes(path)) {
        return state;
      }
      const next = { ...state.editedRules };
      const rule = { ...(next[key] || {}) };
      applyStudioRuleCommand({
        rule,
        key,
        command: createSetFieldValueCommand(path, value),
      });
      rule._edited = true;
      next[key] = rule;
      return { editedRules: next };
    });
  },

  setEgToggle: (key, enabled, preset) => {
    set((state) => {
      const nextToggles = { ...state.egToggles, [key]: enabled };
      // WHY: Derive the active locked keys from the updated toggles.
      // O(1): EG_PRESET_KEYS derived from the frontend preset registry.
      const nextLockedKeys = EG_PRESET_KEYS.filter((k) => nextToggles[k] === true);

      const next = { ...state.editedRules };
      if (enabled) {
        // WHY: When toggling ON, replace the field with the full EG preset.
        // Preserve user-editable paths (aliases, search hints) from the current rule.
        // O(1): Generic loop over egEditablePaths — adding a new editable path is automatic.
        const current = next[key] || {};
        const merged = JSON.parse(JSON.stringify(preset)) as Record<string, unknown>;
        for (const dotPath of state.egEditablePaths) {
          const [section, property] = dotPath.split('.');
          const val = (current as Record<string, Record<string, unknown>>)?.[section]?.[property];
          if (val !== undefined) {
            if (!merged[section]) merged[section] = {};
            (merged[section] as Record<string, unknown>)[property] = val;
          }
        }
        merged._edited = true;
        next[key] = merged;
      } else {
        // WHY: When toggling OFF, keep the current field values but mark as edited.
        // The field becomes fully editable.
        if (next[key]) {
          next[key] = { ...next[key], _edited: true };
        }
      }

      return {
        editedRules: next,
        egToggles: nextToggles,
        egLockedKeys: nextLockedKeys,
      };
    });
  },

  addKey: (key, rule, afterKey) => {
    set((state) => {
      const nextOrder = [...state.editedFieldOrder];
      if (afterKey) {
        const idx = nextOrder.indexOf(afterKey);
        nextOrder.splice(idx >= 0 ? idx + 1 : nextOrder.length, 0, key);
      } else {
        nextOrder.push(key);
      }
      const nextRules = { ...state.editedRules, [key]: { ...rule, _edited: true } };
      return {
        editedFieldOrder: nextOrder,
        editedRules: syncGroupsFromOrder(nextOrder, nextRules),
      };
    });
  },

  removeKey: (key) => {
    set((state) => {
      // WHY: EG-locked fields (colors, editions) cannot be deleted.
      if (state.egLockedKeys.includes(key)) return state;
      const nextOrder = state.editedFieldOrder.filter((k) => k !== key);
      const nextRules: RuleMap = {};
      for (const [k, rule] of Object.entries(state.editedRules)) {
        if (k === key) continue;
        nextRules[k] = rule;
      }
      return { editedFieldOrder: nextOrder, editedRules: nextRules };
    });
  },

  renameKey: (oldKey, newKey, rewriteConstraints, _constraintRefsKeyFn) => {
    set((state) => {
      const nextOrder = state.editedFieldOrder.map((k) => (k === oldKey ? newKey : k));
      const nextRules: RuleMap = {};
      for (const [k, rule] of Object.entries(state.editedRules)) {
        const rewritten = Array.isArray(rule.constraints)
          ? rewriteConstraints(rule.constraints as string[], oldKey, newKey)
          : rule.constraints;
        if (k === oldKey) {
          const updated: Record<string, unknown> = { ...rule, constraints: rewritten };
          const newLabel = newKey.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          if (updated.label && (updated.label as string).toLowerCase() === oldKey.toLowerCase()) {
            updated.label = newLabel;
          }
          const uiObj = (updated.ui || {}) as Record<string, unknown>;
          const currentUiLabel = String(uiObj.label || '');
          if (!currentUiLabel || currentUiLabel.toLowerCase() === oldKey.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').toLowerCase()) {
            updated.ui = { ...uiObj, label: newLabel };
            updated.display_name = newLabel;
          }
          nextRules[newKey] = updated;
        } else {
          nextRules[k] = { ...rule, constraints: rewritten };
        }
      }
      return {
        editedFieldOrder: nextOrder,
        editedRules: nextRules,
        pendingRenames: { ...state.pendingRenames, [oldKey]: newKey },
      };
    });
  },

  bulkAddKeys: (entries) => {
    set((state) => {
      const nextOrder = [...state.editedFieldOrder];
      const nextRules = { ...state.editedRules };
      for (const { key, rule } of entries) {
        nextOrder.push(key);
        nextRules[key] = { ...rule, _edited: true };
      }
      return { editedFieldOrder: nextOrder, editedRules: syncGroupsFromOrder(nextOrder, nextRules) };
    });
  },

  reorder: (activeItem, overItem) => {
    set((state) => {
      const nextOrder = reorderFieldOrder(state.editedFieldOrder, activeItem, overItem);
      return {
        editedFieldOrder: nextOrder,
        editedRules: syncGroupsFromOrder(nextOrder, state.editedRules),
      };
    });
  },

  addGroup: (name) => {
    set((state) => {
      const nextOrder = [`__grp::${name}`, ...state.editedFieldOrder];
      return {
        editedFieldOrder: nextOrder,
        editedRules: syncGroupsFromOrder(nextOrder, state.editedRules),
      };
    });
  },

  removeGroup: (name) => {
    set((state) => {
      const marker = `__grp::${name}`;
      const nextOrder = state.editedFieldOrder.filter((k) => k !== marker);
      const updatedRules: RuleMap = {};
      for (const [k, rule] of Object.entries(state.editedRules)) {
        const uiObj = (rule.ui || {}) as Record<string, unknown>;
        const ruleGroup = uiObj.group ? String(uiObj.group) : String(rule.group || 'ungrouped');
        if (ruleGroup.toLowerCase() === name.toLowerCase()) {
          const updatedUi = { ...uiObj, group: 'ungrouped' };
          updatedRules[k] = { ...rule, ui: updatedUi, group: 'ungrouped', _edited: true };
        } else {
          updatedRules[k] = rule;
        }
      }
      return { editedFieldOrder: nextOrder, editedRules: updatedRules };
    });
  },

  renameGroup: (oldName, newName) => {
    set((state) => {
      const oldMarker = `__grp::${oldName}`;
      const newMarker = `__grp::${newName}`;
      const nextOrder = state.editedFieldOrder.map((k) => (k === oldMarker ? newMarker : k));
      const updatedRules: RuleMap = {};
      for (const [k, rule] of Object.entries(state.editedRules)) {
        const uiObj = (rule.ui || {}) as Record<string, unknown>;
        const ruleGroup = uiObj.group ? String(uiObj.group) : String(rule.group || 'ungrouped');
        if (ruleGroup === oldName) {
          const updatedUi = { ...uiObj, group: newName };
          updatedRules[k] = { ...rule, ui: updatedUi, group: newName, _edited: true };
        } else {
          updatedRules[k] = rule;
        }
      }
      return { editedFieldOrder: nextOrder, editedRules: updatedRules };
    });
  },

  getSnapshot: () => {
    const state = get();
    return {
      rules: state.editedRules,
      fieldOrder: state.editedFieldOrder,
      renames: state.pendingRenames,
      egToggles: state.egToggles,
    };
  },
}));
