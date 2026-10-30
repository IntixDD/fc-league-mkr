import type { Metadata } from 'next'
import { SectionHeader } from '@/components/section-header'

export const metadata: Metadata = { title: 'Performance' }

export default function PerformancePage() {
  return <SectionHeader title="Performance" />
}
