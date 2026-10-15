import type { Metadata } from 'next';
import { HisaabPage } from '@/components/Pages';

export const metadata: Metadata = { title: 'Hisaab' };

export default function Page() {
  return <HisaabPage />;
}
