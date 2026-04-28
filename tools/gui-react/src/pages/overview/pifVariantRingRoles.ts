export interface PifVariantRingProgress {
  readonly priorityFilled: number;
  readonly priorityTotal: number;
  readonly loopFilled: number;
  readonly loopTotal: number;
  readonly heroFilled: number;
  readonly heroTarget: number;
}

export interface PifVariantRingSpec {
  readonly cls: 'outer' | 'middle' | 'inner';
  readonly radius: number;
  readonly filled: number;
  readonly target: number;
}

export function buildPifVariantRingSpecs(progress: PifVariantRingProgress): PifVariantRingSpec[] {
  return [
    {
      cls: 'outer',
      radius: 21,
      filled: progress.priorityFilled,
      target: progress.priorityTotal,
    },
    {
      cls: 'middle',
      radius: 14,
      filled: progress.loopFilled,
      target: progress.loopTotal,
    },
    {
      cls: 'inner',
      radius: 7,
      filled: progress.heroFilled,
      target: progress.heroTarget,
    },
  ];
}
