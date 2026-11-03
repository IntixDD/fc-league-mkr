import type { Metadata } from 'next'
import { SectionHeader } from '@/components/section-header'

export const metadata: Metadata = { title: 'Fixtures' }

export default function FixturesPage() {
  return <SectionHeader title="Fixtures" />
}
