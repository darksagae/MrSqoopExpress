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

/** One purchased line. Only present on the admin's order list, never on public tracking. */
export interface OrderItem {
  productId: string
  skuId: string | null
  name: string
  qty: number
  unitUgx: number
  shipUgx: number
  handlingUgx: number
}

export type PaymentMethod = 'mtn' | 'airtel' | 'card'

export interface OrderPayment {
  method: PaymentMethod | null
  ref: string | null
  paidAt: string | null
}

export type ReviewStatus = 'pending' | 'confirmed' | 'on_hold' | 'cancelled'
export type ReviewAction = 'confirm' | 'hold' | 'cancel'

/** The operator's decision on a paid order. Admin only. */
export interface OrderReview {
  status: ReviewStatus
  at: string | null
  note: string | null
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
  payment?: OrderPayment | null
  items?: OrderItem[]
  review?: OrderReview | null
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
