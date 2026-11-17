import type { NextConfig } from 'next';
const config: NextConfig = {
  // Explicit LAN hosts for browser review only; never a production trust wildcard.
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? '').split(',').map(host => host.trim()).filter(Boolean),
  serverExternalPackages: ['pdfkit', 'argon2', 'pg', 'tesseract.js', '@tesseract.js-data/eng', 'pdfjs-dist', '@napi-rs/canvas'],
  outputFileTracingIncludes: { '/orders': ['./scripts/zonal/delivery-worker.mjs', './src/lib/zonal/delivery-reader.mjs', './src/lib/zonal/browser-session.mjs', './src/lib/zonal/network-policy.mjs', './node_modules/playwright/**/*', './node_modules/playwright-core/**/*'], '/{dashboard,admin/integrations/zonal,admin/stock-food-cost}': ['./src/lib/zonal/stock-discovery.mjs', './scripts/zonal/worker.mjs', './src/lib/zonal/browser-session.mjs', './src/lib/zonal/network-policy.mjs', './src/lib/zonal/financial-detail.mjs', './src/lib/zonal/financial-parser.mjs', './src/lib/zonal/report-dates.mjs', './node_modules/playwright/**/*', './node_modules/playwright-core/**/*'] },
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
