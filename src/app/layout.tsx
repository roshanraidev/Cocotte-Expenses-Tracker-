import type { Metadata, Viewport } from 'next';
import './globals.css';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content' };
export const metadata: Metadata = { title: 'Restaurant Food Cost Tracker', description: 'Weekly food cost management for your kitchen.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en-GB"><body>{children}</body></html>; }
