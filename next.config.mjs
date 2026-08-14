/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  logging: { fetches: { fullUrl: false } },
};
export default nextConfig;
