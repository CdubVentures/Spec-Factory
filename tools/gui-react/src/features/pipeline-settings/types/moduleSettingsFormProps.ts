// WHY: Boundary contract for any per-module settings form rendered by
// ModuleSettingsPanel. New finder modules supply a component conforming to
// this shape and wire it into FINDER_MODULES (settingsFormPath/Export).
// Forms that don't need `category` may ignore it.

export interface ModuleSettingsFormProps {
  settings: Record<string, string>;
  category: string;
  isSaving: boolean;
  onSave: (key: string, value: string) => void;
}
