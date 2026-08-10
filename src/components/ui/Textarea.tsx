import type { TextareaHTMLAttributes } from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className = "", ...props }: TextareaProps) {
  return (
    <textarea
      className={`w-full resize-none rounded-md border border-rule bg-paper-raised px-4 py-3 font-reading text-base leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-pine ${className}`}
      {...props}
    />
  );
}
