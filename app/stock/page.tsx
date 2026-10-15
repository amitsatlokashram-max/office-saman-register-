import type { Metadata } from 'next';
import { StockPage } from '@/components/Pages';

export const metadata: Metadata = { title: 'Stock' };

export default function Page() {
  return <StockPage />;
}
