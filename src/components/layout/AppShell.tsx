import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <Sidebar />
      <MainContent>{children}</MainContent>
    </div>
  );
}
