import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter/index.css';
import './globals.css';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: { default: 'Office Supplies Register', template: '%s · Office Supplies Register' },
  description: 'Track office purchases, deliveries, receipts, stock, handovers, and reimbursements in one place.',
  applicationName: 'Office Supplies Register',
  appleWebApp: { capable: true, title: 'Office Supplies', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B1020',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
