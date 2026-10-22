import { AppBackground } from '@/components/app-background'
import { AppSidebar } from '@/components/app-sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-dvh flex-col-reverse overflow-hidden md:flex-row">
      <AppBackground />
      <AppSidebar />
      <main className="relative z-10 min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
