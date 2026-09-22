import type { NextConfig } from 'next';
const config: NextConfig = {
  // Explicit LAN hosts for browser review only; never a production trust wildcard.
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? '').split(',').map(host => host.trim()).filter(Boolean),
  serverExternalPackages: ['argon2', 'pg', 'tesseract.js', '@tesseract.js-data/eng', 'pdfjs-dist', '@napi-rs/canvas'],
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
    ] }];
  },
};
export default config;
