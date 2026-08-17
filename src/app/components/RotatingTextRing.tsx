const GOLD = '#E8B923'
const RING_RADIUS = 80
const RING_LABELS = [
  { text: 'WE SHOP', color: '#ffffff', offset: '16.67%' },
  { text: 'WE SHIP', color: '#ffffff', offset: '50%' },
  { text: 'YOU SMILE', color: GOLD, offset: '83.33%' },
] as const

export function RotatingTextRing() {
  const pathId = 'trackTextRingPath'
  const ringPath = `M 100, 100 m -${RING_RADIUS}, 0 a ${RING_RADIUS},${RING_RADIUS} 0 1,1 ${RING_RADIUS * 2},0 a ${RING_RADIUS},${RING_RADIUS} 0 1,1 -${RING_RADIUS * 2},0`

  return (
    <div
      className="relative mx-auto mt-10 flex h-[min(70vw,260px)] w-[min(70vw,260px)] items-center justify-center"
      aria-hidden="true"
    >
      <div className="ring-spin absolute inset-0">
        <svg className="h-full w-full" viewBox="0 0 200 200" overflow="visible">
          <defs>
            <path id={pathId} d={ringPath} />
          </defs>
          {RING_LABELS.map((label) => (
            <text
              key={label.text}
              fill={label.color}
              fontWeight="700"
              className="uppercase"
              style={{ fontSize: '9px', letterSpacing: '0.12em' }}
              textAnchor="middle"
            >
              <textPath href={`#${pathId}`} startOffset={label.offset}>
                {label.text}
              </textPath>
            </text>
          ))}
        </svg>
      </div>

      <div className="relative z-10 text-center text-xs font-semibold uppercase leading-relaxed tracking-[0.18em]">
        <p className="text-white">We Shop</p>
        <p className="text-white">We Ship</p>
        <p className="relative mt-1 inline-block pb-2" style={{ color: GOLD }}>
          You Smile
          <svg
            className="absolute bottom-0 left-0 w-full"
            viewBox="0 0 100 8"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polygon fill={GOLD} points="0,0 100,6 100,8 0,8" />
          </svg>
        </p>
      </div>
    </div>
  )
}
