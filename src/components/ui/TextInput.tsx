import type { ComponentProps } from "react";
import { inputClass } from "./input-class";

type TextInputProps = Omit<
  ComponentProps<"input">,
  "aria-describedby" | "aria-invalid"
> & {
  /**
   * Validation message for this field. When present the input is marked
   * invalid and the message is rendered directly beneath it, with
   * `aria-describedby` pointed at it.
   */
  error?: string | null;
};

/**
 * Single-line text input carrying the shared form treatment, the invalid
 * state, and that state's message.
 *
 * The error paragraph is rendered here rather than by each form so the
 * `aria-describedby` target can never drift from the message it names. Use
 * `id` on every `TextInput` that can receive an `error` — without it there is
 * nothing to describe the message with.
 */
export function TextInput({
  error = null,
  readOnly,
  className = "",
  ...props
}: TextInputProps) {
  const invalid = Boolean(error);
  const errorId = invalid && props.id ? `${props.id}-error` : undefined;

  return (
    <>
      <input
        readOnly={readOnly}
        aria-invalid={invalid}
        aria-describedby={errorId}
        className={`${inputClass(invalid, readOnly)} ${className}`}
        {...props}
      />

      {error && props.id ? (
        <p id={errorId} className="mt-2 font-ui text-xs text-error">
          {error}
        </p>
      ) : null}
    </>
  );
}
