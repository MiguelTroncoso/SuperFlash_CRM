import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@superflash/ui',
    '@superflash/types',
    '@superflash/config',
    '@superflash/utils',
  ],
};

export default nextConfig;
