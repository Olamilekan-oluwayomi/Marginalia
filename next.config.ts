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
};

export default nextConfig;
