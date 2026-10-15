import type { Metadata } from 'next';
import { IssuesPage } from '@/components/Pages';

export const metadata: Metadata = { title: 'Kisko diya' };

export default function Page() {
  return <IssuesPage />;
}
