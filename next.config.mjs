const isElectron = process.env.ELECTRON_BUILD === 'true' || 
                   process.env.npm_lifecycle_event === 'build:electron' || 
                   process.env.npm_lifecycle_event === 'build:export';

let basePath = '';
if (process.env.GITHUB_ACTIONS) {
  // Extrahiert den Repository-Namen (z.B. "Domain-Masker-MAIN-Tool" aus "LyrasW0rld/Domain-Masker-MAIN-Tool")
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (repoName) {
    basePath = `/${repoName}`;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: (isElectron || process.env.GITHUB_ACTIONS) ? 'export' : undefined,
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
