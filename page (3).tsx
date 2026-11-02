import type { Metadata } from 'next'
import { SectionHeader } from '@/components/section-header'

export const metadata: Metadata = { title: 'History' }

export default function HistoryPage() {
  return <SectionHeader title="History" />
}
