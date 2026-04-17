import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';

interface ColorRegistryRow {
  readonly name: string;
  readonly hex: string;
}

/**
 * Shared hook for variant-dependent finder panels. Fetches the global
 * color registry (/colors) and returns a stable name→hex map used by
 * ColorSwatch rendering.
 *
 * SSOT: app.sqlite color_registry table (seeded at boot).
 */
export function useFinderColorHexMap(): ReadonlyMap<string, string> {
  const { data = [] } = useQuery<ColorRegistryRow[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<ColorRegistryRow[]>('/colors'),
  });
  return useMemo(() => new Map(data.map((c) => [c.name, c.hex])), [data]);
}
