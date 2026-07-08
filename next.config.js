/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable static HTML export conditionally (for GitHub Pages deployment)
  output: process.env.EXPORT_STATIC === 'true' ? 'export' : undefined,
  images: {
    unoptimized: true, // required for static HTML export
  },
  // Set repository name as base path for GitHub Pages asset resolution
  basePath: process.env.EXPORT_STATIC === 'true' ? '/stellarwhisper' : '',
};

module.exports = nextConfig;
