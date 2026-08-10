import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const base = "rounded-md px-5 py-3 text-sm font-medium transition-colors";

  const variants = {
    primary: "bg-pine text-paper hover:bg-pine-dim active:bg-pine-dim",
    secondary:
      "border border-rule bg-paper-raised text-ink hover:border-pine active:bg-paper",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
