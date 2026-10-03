import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.50.130', '192.168.247.1', 'localhost'],
  typescript: {
    ignoreBuildErrors: false,   // ← 保留严格检查 app 代码
  },
};

export default nextConfig;