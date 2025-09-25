// next.config.js
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  webpack(config) {
    // 🔹 existing aliases
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@app'      : path.resolve(__dirname, 'src/app'),
      '@components': path.resolve(__dirname, 'src/app/components'),
      '@hooks'    : path.resolve(__dirname, 'src/hooks'),
      '@utils'    : path.resolve(__dirname, 'src/utils'),
      '@lib'      : path.resolve(__dirname, 'src/lib'),
      '@context'  : path.resolve(__dirname, 'src/app/context'),
      '@static'   : path.resolve(__dirname, 'src/app/static'),

      /* 👇 **new** – point every import/require("async_hooks") to the stub */
      async_hooks : path.resolve(__dirname, 'async_hooks.js'),
    };

    /* keep any other tweaks you already have … */
    return config;
  },
};

module.exports = nextConfig;
