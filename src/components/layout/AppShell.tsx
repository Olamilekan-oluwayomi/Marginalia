import { Header } from "./Header";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  showTitle?: boolean;
};

export function AppShell({
  children,
  title,
  showTitle = true,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-pine focus:px-4 focus:py-3 focus:font-ui focus:text-sm focus:font-medium focus:text-paper"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:pl-14">
        <Header title={title} showTitle={showTitle} />
        <MainContent>{children}</MainContent>
      </div>
    </div>
  );
}
