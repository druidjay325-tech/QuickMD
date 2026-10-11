import { tr } from "./i18n";
import rules from "./locales/native-errors.json";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly detail: string | null = null,
    public readonly cause: AppError | null = null,
  ) {
    super(code);
    this.name = "AppError";
  }
  override toString(): string {
    return [tr(this.code), this.cause ? String(this.cause) : null, this.detail]
      .filter(Boolean)
      .join(": ");
  }
}
export function normalizeError(value: unknown): AppError {
  if (value instanceof AppError) return value;
  if (
    value &&
    typeof value === "object" &&
    "code" in value &&
    typeof value.code === "string"
  ) {
    return new AppError(
      value.code,
      "detail" in value && typeof value.detail === "string"
        ? value.detail
        : null,
      "cause" in value && value.cause ? normalizeError(value.cause) : null,
    );
  }
  const message = value instanceof Error ? value.message : String(value);
  for (const rule of rules) {
    if (message.startsWith(rule.prefix))
      return new AppError(
        rule.code,
        message.slice(rule.prefix.length).replace(/^[：: ]+/, "") || null,
      );
  }
  return new AppError("errors.system", message);
}
