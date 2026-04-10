/** @type {import('next').NextConfig} */
const distDir = process.env.NEXT_DIST_DIR?.trim();

const nextConfig = distDir
  ? {
      distDir,
    }
  : {};

module.exports = nextConfig;
