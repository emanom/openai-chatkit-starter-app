import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // Force lightningcss to use the Windows native binding
      'lightningcss-win32-x64-msvc': require.resolve('lightningcss-win32-x64-msvc'),
    };
    
    // Ensure native modules are properly handled
    config.resolve.extensions = ['.js', '.json', '.node', ...(config.resolve.extensions || [])];
    
    return config;
  },
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
