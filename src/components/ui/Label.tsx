import type { LabelHTMLAttributes } from "react";

type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className = "", ...props }: LabelProps) {
  return (
    <label
      className={`font-ui text-xs font-medium uppercase tracking-[0.03em] text-muted ${className}`}
      {...props}
    />
  );
}
