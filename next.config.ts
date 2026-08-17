import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// Content Security Policy
//
// Built around the application's actual dependencies:
//   - Inline theme-init script in layout.tsx + Next.js runtime inline scripts
//     require 'unsafe-inline' for script-src. A nonce-based approach would
//     force every page to dynamic rendering and disable static generation.
//   - Tailwind CSS and Next.js inject inline <style> tags → 'unsafe-inline'
//     for style-src.
//   - next/font/google self-hosts fonts at build time → no external font
//     origins needed.
//   - Supabase browser client needs HTTPS + WSS to *.supabase.co for its
//     REST API and Realtime (onAuthStateChange).
//   - No iframes, plugins, or third-party scripts are used.
//   - All outbound API calls (Gemini, Tavily, Groq) run server-side only
//     and are not constrained by CSP.
// ---------------------------------------------------------------------------
const cspHeader = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval'" : ""} 'unsafe-inline'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  serverExternalPackages: ["unpdf"],
  experimental: {
    serverActions: {
      // Default is 1 MB, which rejects realistic PDFs before the upload action
      // even runs. 12 MB leaves room for the multipart request overhead while
      // the per-file limit (10 MB) stays aligned with the storage bucket.
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        // Apply security headers to every route.
        source: "/(.*)",
        headers: [
          // --- CSP (enforcement mode) ---
          // The inline theme script (layout.tsx) and Next.js runtime scripts
          // require 'unsafe-inline'. Object-src 'none' and base-uri 'self'
          // mitigate the residual XSS risk from inline scripts.
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
          // --- HSTS ---
          // 1 year max-age. Subdomains included. Preload omitted intentionally
          // — the domain must be submitted to hstspreload.org separately and
          // removing HSTS later is difficult.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // --- COOP ---
          // same-origin isolates this browsing context from cross-origin
          // popups/openers. Safe for this app because Google OAuth uses a
          // full-page redirect (window.location.href), not window.open().
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          // --- Existing headers (kept) ---
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
