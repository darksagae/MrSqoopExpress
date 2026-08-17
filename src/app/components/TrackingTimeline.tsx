import { Check } from './icons'
import type { TrackingStepView } from '../types/order'

const GOLD = '#E8B923'
const LINE_DONE = '#C9A020'
const LINE_PENDING = '#3A3A3A'
const CIRCLE_PENDING = '#2A2A2A'

function StepIcon({ status }: { status: TrackingStepView['status'] }) {
  const isActive = status === 'completed' || status === 'current'

  return (
    <div
      className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: isActive ? GOLD : CIRCLE_PENDING }}
    >
      <Check className="h-3.5 w-3.5" style={{ color: isActive ? '#000' : '#666' }} />
    </div>
  )
}

export function TrackingTimeline({ steps }: { steps: TrackingStepView[] }) {
  return (
    <ol className="mt-8 space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1
        const lineActive =
          step.status === 'completed' && steps[index + 1]?.status === 'completed'
        const isPending = step.status === 'pending'

        return (
          <li key={`${step.label}-${index}`} className="flex gap-4">
            <div className="flex flex-col items-center">
              <StepIcon status={step.status} />
              {!isLast && (
                <div
                  className="my-1 w-0.5 flex-1 min-h-[36px]"
                  style={{ backgroundColor: lineActive ? LINE_DONE : LINE_PENDING }}
                />
              )}
            </div>

            <div className={`pb-5 ${isLast ? 'pb-0' : ''}`}>
              <p
                className="text-[15px] font-semibold leading-snug"
                style={{ color: isPending ? '#666' : '#fff' }}
              >
                {step.label}
              </p>
              <p className="mt-1 text-sm text-neutral-500">{step.date}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
