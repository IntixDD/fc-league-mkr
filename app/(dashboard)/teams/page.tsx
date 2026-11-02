import type { Metadata } from 'next'
import { SectionHeader } from '@/components/section-header'

export const metadata: Metadata = { title: 'Teams' }

export default function TeamsPage() {
  return <SectionHeader title="Teams" />
}
