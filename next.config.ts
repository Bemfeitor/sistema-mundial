import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App interno 100% dinâmico (dados por usuário/loja).
  cacheComponents: false,
  // Imagem Docker enxuta (.next/standalone).
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
