export type WorkbookMapValidationResponse = {
  valid?: boolean;
  ok?: boolean;
  errors?: string[];
  warnings?: string[];
  normalized?: Record<string, unknown> | null;
};

export type WorkbookMapValidationOutcome = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalized: Record<string, unknown> | null;
};

export declare function getWorkbookMapValidationOutcome(
  result: unknown,
): WorkbookMapValidationOutcome;

export declare function assertWorkbookMapValidationOrThrow(args: {
  result: unknown;
  actionLabel?: string;
}): WorkbookMapValidationOutcome;

export declare function resolveWorkbookMapPayloadForSave(args: {
  result: unknown;
  fallback: Record<string, unknown>;
}): Record<string, unknown>;

