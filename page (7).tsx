import type { Metadata } from 'next'
import { SectionHeader } from '@/components/section-header'

export const metadata: Metadata = { title: 'Table' }

export default function TablePage() {
  return <SectionHeader title="Table" />
}
