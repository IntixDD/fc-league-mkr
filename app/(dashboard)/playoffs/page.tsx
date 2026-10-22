import type { Metadata } from 'next'
import { SectionHeader } from '@/components/section-header'

export const metadata: Metadata = { title: 'Playoffs' }

export default function PlayoffsPage() {
  return <SectionHeader title="Playoffs" />
}
