export type DataChangeMessage = {
  type?: string;
  event?: string;
  category?: string;
  categories?: string[];
  domains?: string[];
  [key: string]: unknown;
};

export type DataChangeSubscriptionOptions = {
  category: string;
  domains?: string[];
  enabled?: boolean;
  onDataChange: (message: DataChangeMessage) => void;
};

export declare function resolveDataChangeEventName(message: DataChangeMessage | null | undefined): string;

export declare function dataChangeAffectsCategory(
  message: DataChangeMessage | null | undefined,
  category: string,
): boolean;

export declare function dataChangeAffectsDomains(
  message: DataChangeMessage | null | undefined,
  domains: string[] | readonly string[],
): boolean;

export declare function shouldHandleDataChangeMessage(options: {
  message: DataChangeMessage | null | undefined;
  category: string;
  domains?: string[] | readonly string[];
}): boolean;

export declare function useDataChangeSubscription(options: DataChangeSubscriptionOptions): void;
