'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { cn } from '@/lib/utils'
import {
  FixturesIcon,
  HistoryIcon,
  LogoTriangle,
  PerformanceIcon,
  PitchIcon,
  TournamentIcon,
  TableIcon,
  TeamsIcon,
} from '@/components/nav-icons'

type NavItem = {
  label: string
  href: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  iconClassName?: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Teams', href: '/teams', icon: TeamsIcon },
  { label: 'Table', href: '/table', icon: TableIcon },
  { label: 'Fixtures', href: '/fixtures', icon: FixturesIcon },
  { label: 'Tournament', href: '/tournament', icon: TournamentIcon },
  { label: 'History', href: '/history', icon: HistoryIcon },
  { label: 'Performance', href: '/performance', icon: PerformanceIcon, iconClassName: 'translate-x-0.5' },
]

type Indicator = { x: number; y: number; w: number; h: number } | null

export function AppSidebar() {
  const pathname = usePathname()
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const [indicator, setIndicator] = useState<Indicator>(null)
  const [ready, setReady] = useState(false)

  const activeIndex = NAV_ITEMS.findIndex((item) => pathname.startsWith(item.href))

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const measure = () => {
      const el = itemRefs.current[activeIndex]
      if (!el) {
        setIndicator(null)
        return
      }
      setIndicator({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })
    }

    measure()
    const frame = requestAnimationFrame(() => setReady(true))
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [activeIndex])

  return (
    <aside className="sidebar-surface relative z-20 flex h-[84px] w-full shrink-0 flex-row items-center border-t-2 border-[#d77ff0] md:h-dvh md:w-[100px] md:flex-col md:border-t-0 md:border-r-2">
      <div className="hidden flex-col items-center pt-6 md:flex">
        <span className="logo-float block w-16 text-[#f6e9f8] drop-shadow-[0_0_18px_rgba(255,120,255,0.45)]">
          <LogoTriangle className="h-auto w-full" />
          <span className="sr-only">Logo</span>
        </span>
        <span className="mt-4 block h-0.5 w-11 rounded-full bg-[#e6b7f0]/70" aria-hidden="true" />
      </div>

      <nav aria-label="Main" className="flex h-full w-full flex-1 md:mt-4 md:h-auto md:pb-4">
        <ul
          ref={listRef}
          className="relative flex w-full flex-row items-center justify-around px-2 md:h-full md:flex-col md:justify-around md:px-0"
        >
          <span
            aria-hidden="true"
            className={cn(
              'nav-indicator pointer-events-none absolute top-0 left-0 rounded-[18px] border-2 border-[#ee8fff] bg-[#7a1690]/55',
              ready ? 'transition-[transform,width,height,opacity] duration-500 ease-[cubic-bezier(0.34,1.4,0.5,1)]' : '',
              indicator ? 'opacity-100' : 'opacity-0',
            )}
            style={
              indicator
                ? {
                    width: indicator.w,
                    height: indicator.h,
                    transform: `translate(${indicator.x}px, ${indicator.y}px)`,
                  }
                : undefined
            }
          />

          {NAV_ITEMS.map((item, index) => {
            const Icon = item.icon
            const active = index === activeIndex
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  ref={(el) => {
                    itemRefs.current[index] = el
                  }}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  className={cn(
                    'group nav-button relative flex size-14 items-center justify-center rounded-[18px] outline-none transition-colors duration-300 md:size-20',
                    'focus-visible:ring-2 focus-visible:ring-[#ee8fff] focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                    active ? 'text-white' : 'text-[#a49ca6] hover:text-white',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-1 rounded-[14px] bg-white/0 transition-all duration-300',
                      !active && 'group-hover:bg-white/[0.06]',
                    )}
                  />
                  <Icon
                    className={cn(
                      'relative size-9 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-active:scale-90 md:size-[54px]',
                      active && 'nav-icon-pop drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]',
                      item.iconClassName,
                    )}
                  />
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-full z-30 ml-4 hidden -translate-x-2 rounded-md border border-[#ee8fff]/40 bg-black/80 px-3 py-1.5 font-display text-[11px] tracking-[0.18em] whitespace-nowrap text-white uppercase opacity-0 backdrop-blur-md transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 md:block"
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}

          <li className="hidden md:block">
            <span
              aria-disabled="true"
              title="Coming soon"
              className="flex size-20 items-center justify-center text-[#a49ca6]"
            >
              <PitchIcon className="size-[58px]" />
              <span className="sr-only">Coming soon</span>
            </span>
          </li>
        </ul>
      </nav>
    </aside>
  )
}
