/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
    ],
  },
  serverExternalPackages: ['firebase-admin'],
  async rewrites() {
    return [
      { source: '/@vite/client', destination: '/__vite_client.js' },
    ];
  },
};

module.exports = nextConfig;
