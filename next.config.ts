import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize for Amplify/CloudFront CDN
  compress: true,
  poweredByHeader: false,
  // Headers for caching static assets (Amplify uses CloudFront)
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|woff|woff2|ttf|eot)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
