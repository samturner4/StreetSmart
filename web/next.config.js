/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['csv-parse']
  },
  webpack: (config, { isServer }) => {
    // Add a fallback for the 'fs' module
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@data': path.resolve(__dirname, '..', 'data')
      };
    }
    config.externals = [...(config.externals || []), { canvas: "canvas" }];
    return config;
  },
  // This is needed for Mapbox GL to work in Next.js
  transpilePackages: ['mapbox-gl', '@walksafe/shared'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig; 