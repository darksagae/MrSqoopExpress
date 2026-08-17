export const TRACKING_STAGES = [
  'Order Confirmed',
  'Order Processing',
  'Package Shipped to International Address',
  'Package Received at International Address',
  'Package in Transit to Uganda',
  'Customs Clearance Started',
  'Customs Clearance Complete',
  'Package Arrived at Kampala Office',
  'Package Ready for Pick Up',
  'Order Delivered',
] as const

export type StepStatus = 'completed' | 'current' | 'pending'

export interface StatusHistoryEntry {
  stageIndex: number
  timestamp: string
  note?: string
}

export interface Order {
  id: string
  trackingId: string
  customerName: string
  phone: string
  websiteShippedFrom: string
  billingUgx: number
  currentStageIndex: number
  statusHistory: StatusHistoryEntry[]
  expectedDelivery?: string
  createdAt: string
}

export interface TrackingStepView {
  label: string
  date: string
  status: StepStatus
}

export interface OrderDetailView {
  label: string
  value: string
}
