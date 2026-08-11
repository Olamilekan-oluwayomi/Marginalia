/**
 * Small, dependency-free validation helpers used at the edges of the data
 * layer. Every helper returns a `FieldError` describing the first problem, or
 * `null` when the value is acceptable.
 */

export type FieldError = {
  field: string;
  message: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireText(
  value: unknown,
  label: string,
  maxLength?: number
): FieldError | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { field: label, message: `${label} is required.` };
  }
  if (maxLength !== undefined && value.length > maxLength) {
    return {
      field: label,
      message: `${label} must be ${maxLength} characters or fewer.`,
    };
  }
  return null;
}

export function optionalText(
  value: unknown,
  label: string,
  maxLength?: number
): FieldError | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return { field: label, message: `${label} must be text.` };
  }
  if (maxLength !== undefined && value.length > maxLength) {
    return {
      field: label,
      message: `${label} must be ${maxLength} characters or fewer.`,
    };
  }
  return null;
}

export function requireNumber(
  value: unknown,
  label: string,
  options?: { min?: number }
): FieldError | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return { field: label, message: `${label} must be a number.` };
  }
  if (options?.min !== undefined && value < options.min) {
    return {
      field: label,
      message: `${label} must be at least ${options.min}.`,
    };
  }
  return null;
}

export function requireOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): FieldError | null {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    return { field: label, message: `${label} is invalid.` };
  }
  return null;
}

export function requireUuid(value: unknown, label: string): FieldError | null {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return { field: label, message: `${label} must be a valid identifier.` };
  }
  return null;
}

export function optionalDate(
  value: unknown,
  label: string
): FieldError | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return { field: label, message: `${label} must be a valid date.` };
  }
  return null;
}

export function exactlyOneProvided(
  values: Array<{ name: string; value: unknown }>
): FieldError | null {
  const provided = values.filter(
    ({ value }) => value !== undefined && value !== null
  );
  if (provided.length !== 1) {
    return {
      field: values.map(({ name }) => name).join("/"),
      message: `Provide exactly one of ${values
        .map(({ name }) => name)
        .join(" or ")}.`,
    };
  }
  return null;
}
