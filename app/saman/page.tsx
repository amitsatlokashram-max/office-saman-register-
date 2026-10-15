import type { Metadata } from 'next';
import { SamanPage } from '@/components/Pages';

export const metadata: Metadata = { title: 'Saman ki list' };

export default function Page() {
  return <SamanPage />;
}
