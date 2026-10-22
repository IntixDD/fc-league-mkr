export function AppBackground() {
  const w = 102.5
  const h = w * (Math.sqrt(3) / 2)
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
      <div className="glow-layer absolute inset-0" />
      <svg className="absolute inset-0 size-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="tri-grid" width={w} height={h * 2} patternUnits="userSpaceOnUse" x="-0.5" y="5">
            <g stroke="rgba(255,255,255,0.075)" strokeWidth="1" fill="none">
              <line x1="0" y1="0" x2={w} y2="0" />
              <line x1="0" y1={h} x2={w} y2={h} />
              <line x1="0" y1="0" x2={w} y2={h * 2} />
              <line x1={w} y1="0" x2="0" y2={h * 2} />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tri-grid)" />
      </svg>
    </div>
  )
}
