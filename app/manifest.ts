import type { MetadataRoute } from 'next';

// Phone pe "Add to Home screen" karne par app ki tarah khulta hai
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Office Saman Register',
    short_name: 'Saman Register',
    description: 'Office ke saman ka register',
    start_url: '/',
    display: 'standalone',
    background_color: '#070B16',
    theme_color: '#0B1020',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
