import type { MetadataRoute } from 'next';

// Opens like an app when added to a phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Office Supplies Register',
    short_name: 'Office Supplies',
    description: 'Track office purchases, deliveries, receipts, and stock.',
    start_url: '/',
    display: 'standalone',
    background_color: '#070B16',
    theme_color: '#0B1020',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
