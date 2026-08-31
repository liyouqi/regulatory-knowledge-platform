export type ReviewValidationMode = "strict" | "report";

export interface ReviewedInputIssue {
  dataset: string;
  recordId: string;
  message: string;
}

export interface ReviewValidationOptions {
  mode?: ReviewValidationMode;
  issues?: ReviewedInputIssue[];
}

export function rejectReviewedInput(
  options: ReviewValidationOptions,
  dataset: string,
  recordId: string,
  error: Error,
): false {
  if (options.mode !== "report") throw error;
  options.issues?.push({ dataset, recordId, message: error.message });
  return false;
}
