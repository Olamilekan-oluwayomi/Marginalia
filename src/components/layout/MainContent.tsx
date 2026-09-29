type MainContentProps = {
  children: React.ReactNode;
};

export function MainContent({ children }: MainContentProps) {
  return (
    <main id="main" className="min-h-[calc(100vh-3.5rem)] pb-20 md:pb-0">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        {children}
      </div>
    </main>
  );
}
