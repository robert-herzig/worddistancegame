import withPWA from 'next-pwa';

const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const baseConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    }
  },
  reactStrictMode: true,
  images: { unoptimized: true }
};

export default withPWA({
  dest: 'public',
  disable: !isProd,
  register: true,
  skipWaiting: true
})(baseConfig);
