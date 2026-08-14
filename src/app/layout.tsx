import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Newsreader, Work_Sans } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProfileProvider } from "@/components/profile/ProfileProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-reading",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const workSans = Work_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Marginalia",
    template: "%s — Marginalia",
  },
  description:
    "Research, read, connect. A private workspace for reading, organizing, and exploring your sources with an AI research assistant.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Marginalia",
    description: "Research, read, connect.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Marginalia",
    description: "Research, read, connect.",
  },
};

/**
 * Mobile browser chrome (address bar / status bar) matches the app's paper
 * background in both color schemes. The app is private (`robots: noindex`),
 * so no social sharing metadata beyond the root defaults is needed.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edeeea" },
    { media: "(prefers-color-scheme: dark)", color: "#1d211f" },
  ],
};

const themeScript = `(function () {
  var storageKey = "research-assistant-theme";
  var stored = null;
  try { stored = window.localStorage.getItem(storageKey); } catch (e) {}
  var theme = stored === "light" || stored === "dark" ? stored : "system";
  var dark = theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${newsreader.variable} ${workSans.variable} ${plexMono.variable}`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeProvider>
          <AuthProvider>
            <ProfileProvider>{children}</ProfileProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
