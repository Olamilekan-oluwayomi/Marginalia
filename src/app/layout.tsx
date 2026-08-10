import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader, Work_Sans } from "next/font/google";
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
  title: "Research Assistant",
  description: "Read, research, and understand your documents with AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${newsreader.variable} ${workSans.variable} ${plexMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
