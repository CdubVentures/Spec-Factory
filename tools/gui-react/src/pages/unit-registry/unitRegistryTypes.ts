export interface UnitConversion {
  from: string;
  factor: number;
}

export interface UnitRegistryEntry {
  canonical: string;
  label: string;
  synonyms: string[];
  conversions: UnitConversion[];
  updated_at?: string;
}

export interface UnitRegistryListResponse {
  units: UnitRegistryEntry[];
}

export interface UnitRegistrySingleResponse {
  unit: UnitRegistryEntry;
}

export interface UnitRegistryCanonicalResponse {
  canonicals: string[];
}
