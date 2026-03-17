import type { ComponentType } from "react";

export interface KeySectionBaseProps {
  selectedKey: string;
  currentRule: Record<string, unknown>;
  updateField: (key: string, path: string, value: unknown) => void;
  category: string;
  BadgeRenderer: ComponentType<{ p: string }>;
  saveIfAutoSaveEnabled: () => void;
}
