// next.config.js
// Path aliases (@/, @components/, …) come from tsconfig.json — Turbopack reads them directly.

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Docker image (deploy/).
  output: 'standalone',
};

module.exports = nextConfig;
