export interface ColorEntry {
  readonly name: string;
  readonly hex: string;
  readonly css_var: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ColorFormData {
  readonly name: string;
  readonly hex: string;
}
