const isElectron = process.env.ELECTRON_BUILD === 'true' || 
                   process.env.npm_lifecycle_event === 'build:electron' || 
                   process.env.npm_lifecycle_event === 'build:export';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: isElectron ? 'export' : undefined,
  webpack: (config, {dev}) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};
export default nextConfig;
