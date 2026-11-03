import type { Metadata } from 'next'
import { SectionHeader } from '@/components/section-header'

export const metadata: Metadata = { title: 'Tournament' }

export default function TournamentPage() {
  return <SectionHeader title="Tournament" />
}
