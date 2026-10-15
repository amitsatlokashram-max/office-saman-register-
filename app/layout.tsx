import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter/index.css';
import './globals.css';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: { default: 'Office Saman Register', template: '%s · Office Saman Register' },
  description: 'Office ke liye mangaye saman ka register: kab aaya, kisne laya, kitne ka, kisko diya, bill, stock aur mera paisa.',
  applicationName: 'Office Saman Register',
  appleWebApp: { capable: true, title: 'Saman Register', statusBarStyle: 'black-translucent' },
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
    <html lang="hi-Latn">
      <body>
        {/* Login, menu, data aur saare form ek hi jagah: page badalne pe register dobara load nahi hota */}
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
