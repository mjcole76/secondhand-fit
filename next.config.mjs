import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the tracing root to this project so a stray lockfile in a parent directory cannot make
  // Next.js trace (and deploy) files from outside the repository.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // The image proxy reads the placeholder drawings from disk to burn the preview-only label into
  // them, so they must ship with that route's server bundle. The key is a glob: "*" stands for the
  // [renderId] segment, whose brackets would otherwise be read as a character class.
  outputFileTracingIncludes: {
    "/api/tryon/*/image": ["./public/mock/*.svg"],
  },
  // Provider credentials are read only inside route handlers and server modules.
  // Nothing under NEXT_PUBLIC_ is used for YouCam, so no key can reach the client bundle.
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
