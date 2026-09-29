type AnswerProps = {
  children: React.ReactNode;
};

export function Answer({ children }: AnswerProps) {
  return (
    <article className="answer-enter max-w-reading font-reading text-[1.0625rem] leading-[1.65] text-ink">
      {children}
    </article>
  );
}
