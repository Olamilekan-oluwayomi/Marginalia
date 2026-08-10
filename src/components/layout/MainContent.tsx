type MainContentProps = {
  children: React.ReactNode;
};

export function MainContent({ children }: MainContentProps) {
  return (
    <main className="min-h-screen pb-20 md:pl-14 md:pb-0">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        {children}
      </div>
    </main>
  );
}
