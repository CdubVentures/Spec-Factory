export type FieldStudioMapValidationResponse = {
  valid?: boolean;
  ok?: boolean;
  errors?: string[];
  warnings?: string[];
  normalized?: Record<string, unknown> | null;
};

export type FieldStudioMapValidationOutcome = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalized: Record<string, unknown> | null;
};

export declare function getFieldStudioMapValidationOutcome(
  result: unknown,
): FieldStudioMapValidationOutcome;

export declare function assertFieldStudioMapValidationOrThrow(args: {
  result: unknown;
  actionLabel?: string;
  allowLegacyCompileBypass?: boolean;
}): FieldStudioMapValidationOutcome;
