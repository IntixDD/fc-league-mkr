import { useId, type ReactNode, type SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function MaskedIcon({
  children,
  shape,
  overlay,
  ...props
}: IconProps & { shape: ReactNode; overlay?: ReactNode; children?: ReactNode }) {
  const id = useId()
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <g fill="white" stroke="white">
            {shape}
          </g>
          <g fill="black" stroke="black">
            {children}
          </g>
        </mask>
      </defs>
      <rect width="48" height="48" fill="currentColor" mask={`url(#${id})`} />
      {overlay}
    </svg>
  )
}

function BallCutout({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const inner = r * 0.38
  const points = Array.from({ length: 5 }, (_, i) => {
    const a = (-90 + i * 72) * (Math.PI / 180)
    return { x: cx + inner * Math.cos(a), y: cy + inner * Math.sin(a), a }
  })
  const pentagon = points.map((p) => `${p.x},${p.y}`).join(' ')
  const sw = r * 0.2
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <circle cx={cx} cy={cy} r={r - sw / 2} fill="none" strokeWidth={sw} />
      <polygon points={pentagon} strokeWidth={sw * 0.6} />
      {points.map((p, i) => (
        <line
          key={i}
          x1={p.x}
          y1={p.y}
          x2={cx + (r - sw / 2) * Math.cos(p.a)}
          y2={cy + (r - sw / 2) * Math.sin(p.a)}
          strokeWidth={sw * 0.8}
        />
      ))}
    </g>
  )
}

export function TeamsIcon(props: IconProps) {
  return (
    <MaskedIcon
      {...props}
      shape={
        <path
          d="M10 4h28a3 3 0 0 1 3 3v24.5a2 2 0 0 1-1 1.7L25 42.4a2 2 0 0 1-2 0L8 33.2a2 2 0 0 1-1-1.7V7a3 3 0 0 1 3-3z"
          stroke="none"
        />
      }
    >
      <BallCutout cx={24} cy={21} r={12} />
    </MaskedIcon>
  )
}

export function TableIcon(props: IconProps) {
  return (
    <MaskedIcon {...props} shape={<rect x="4" y="5" width="40" height="38" rx="5" stroke="none" />}>
      <g stroke="none">
        <rect x="0" y="14.5" width="48" height="2.6" />
        <rect x="0" y="23.4" width="48" height="2.6" />
        <rect x="0" y="32.3" width="48" height="2.6" />
        <rect x="16.2" y="16" width="2.6" height="30" />
        <rect x="29.2" y="16" width="2.6" height="30" />
      </g>
    </MaskedIcon>
  )
}

function CalendarShape() {
  return (
    <>
      <rect x="5" y="9" width="38" height="34" rx="5" stroke="none" />
      <rect x="13" y="3" width="5" height="10" rx="2.5" stroke="none" />
      <rect x="30" y="3" width="5" height="10" rx="2.5" stroke="none" />
    </>
  )
}

function CalendarRingGaps() {
  return (
    <g fill="none" strokeWidth="2.2">
      <rect x="11.9" y="1.9" width="7.2" height="12.2" rx="3.6" />
      <rect x="28.9" y="1.9" width="7.2" height="12.2" rx="3.6" />
    </g>
  )
}

export function FixturesIcon(props: IconProps) {
  return (
    <MaskedIcon {...props} shape={<CalendarShape />}>
      <CalendarRingGaps />
      <g stroke="none">
        <rect x="0" y="16" width="48" height="2.4" />
        {[12, 24, 36].map((x) =>
          [24.5, 34].map((y) => (
            <rect key={`${x}-${y}`} x={x - 3.2} y={y - 3} width="6.4" height="6" rx="2" />
          )),
        )}
      </g>
    </MaskedIcon>
  )
}

export function TournamentIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 5h24v12c0 7-5 12-12 12S12 24 12 17V5z" />
      <path
        d="M12.5 9H7c0 7 3 11.5 8 13M35.5 9H41c0 7-3 11.5-8 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M21 28h6l1 8h-8l1-8z" />
      <path d="M16 36.5h16a1 1 0 0 1 1 1V43H15v-5.5a1 1 0 0 1 1-1z" />
      <rect x="11" y="3.5" width="26" height="3" rx="1.5" />
    </svg>
  )
}

export function HistoryIcon(props: IconProps) {
  return (
    <MaskedIcon {...props} shape={<CalendarShape />}>
      <CalendarRingGaps />
      <rect x="0" y="16" width="48" height="2.4" stroke="none" />
      <BallCutout cx={24} cy={30.5} r={10.5} />
    </MaskedIcon>
  )
}

export function PerformanceIcon(props: IconProps) {
  return (
    <MaskedIcon
      {...props}
      overlay={
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="34" cy="35" r="9.5" strokeWidth="3" />
          <path d="M31.5 35.5l2.2 2.2 2.8-6" strokeWidth="2.6" />
        </g>
      }
      shape={
        <g fill="none" strokeWidth="3">
          <rect x="3.5" y="3.5" width="33" height="34" rx="4" />
          <line x1="3.5" y1="13" x2="36.5" y2="13" />
          <line x1="3.5" y1="25" x2="36.5" y2="25" />
          <line x1="14.5" y1="13" x2="14.5" y2="37.5" />
          <line x1="25.5" y1="13" x2="25.5" y2="37.5" />
        </g>
      }
    >
      <circle cx="34" cy="35" r="13" stroke="none" />
    </MaskedIcon>
  )
}

export function PitchIcon(props: IconProps) {
  return (
    <MaskedIcon {...props} shape={<rect x="3" y="8" width="42" height="32" rx="2.5" stroke="none" />}>
      <g fill="none" strokeWidth="2.2">
        <line x1="24" y1="6" x2="24" y2="42" />
        <circle cx="24" cy="24" r="5.5" />
        <path d="M3 18.5h3.5a5.5 5.5 0 0 1 0 11H3" />
        <path d="M45 18.5h-3.5a5.5 5.5 0 0 0 0 11H45" />
      </g>
    </MaskedIcon>
  )
}

export function LogoTriangle(props: IconProps) {
  return (
    <svg viewBox="0 0 64 52" aria-hidden="true" {...props}>
      <path d="M0 0h64L32 52z" fill="currentColor" />
    </svg>
  )
}
