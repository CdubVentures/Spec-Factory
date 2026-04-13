export interface KpiCard {
  readonly label: string;
  readonly value: string;
  readonly tone: string;
}

export interface CooldownState {
  readonly onCooldown: boolean;
  readonly daysRemaining: number;
  readonly progressPct: number;
  readonly label: string;
  readonly eligibleDate: string;
}

export interface StatusChipData {
  readonly label: string;
  readonly tone: string;
}

export interface RunDiscoveryLog {
  readonly confirmedCount: number;
  readonly addedNewCount: number;
  readonly rejectedCount: number;
  readonly urlsCheckedCount: number;
  readonly queriesRunCount: number;
  readonly confirmedFromKnown: readonly string[];
  readonly addedNew: readonly string[];
  readonly rejectedFromKnown: readonly string[];
  readonly urlsChecked: readonly string[];
  readonly queriesRun: readonly string[];
}

export interface DeleteTarget {
  readonly kind: 'run' | 'loop' | 'all';
  readonly runNumber?: number;
  readonly runNumbers?: readonly number[];
  readonly count?: number;
}
