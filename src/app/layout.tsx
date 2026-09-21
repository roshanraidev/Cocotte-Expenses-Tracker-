import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Restaurant Food Cost Tracker', description: 'Weekly food cost management for your kitchen.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en-GB"><body>{children}</body></html>; }
