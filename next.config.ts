import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  devIndicators: false,
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: {
      // Default is 1 MB, which rejects realistic PDFs before the upload action
      // even runs. 12 MB leaves room for the multipart request overhead while
      // the per-file limit (10 MB) stays aligned with the storage bucket.
      bodySizeLimit: "12mb",
    },
  },
  // Baseline security headers. Deliberately non-CSP so the inline theme script
  // (layout.tsx) keeps working; a strict CSP would require nonce plumbing.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
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
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
