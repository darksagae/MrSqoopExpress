import { TRACKING_STAGES, type Order, type TrackingStepView } from '../types/order'

const KAMPALA_TZ = 'Africa/Kampala'

export type OrderFilter = 'all' | 'inTransit' | 'atCustoms' | 'readyForPickup' | 'delivered'

const DELIVERED_STAGE = TRACKING_STAGES.length - 1

export function orderMatchesFilter(order: Order, filter: OrderFilter) {
  if (filter === 'all') return true
  if (filter === 'inTransit') {
    return order.currentStageIndex > 0 && order.currentStageIndex < 5
  }
  if (filter === 'atCustoms') {
    return order.currentStageIndex >= 5 && order.currentStageIndex <= 6
  }
  if (filter === 'readyForPickup') {
    return order.currentStageIndex === 8
  }
  return order.currentStageIndex >= DELIVERED_STAGE
}

export function filterOrdersByCategory(orders: Order[], filter: OrderFilter) {
  return orders.filter((order) => orderMatchesFilter(order, filter))
}

export function getOrderStats(orders: Order[]) {
  return {
    total: orders.length,
    inTransit: filterOrdersByCategory(orders, 'inTransit').length,
    atCustoms: filterOrdersByCategory(orders, 'atCustoms').length,
    readyForPickup: filterOrdersByCategory(orders, 'readyForPickup').length,
    delivered: filterOrdersByCategory(orders, 'delivered').length,
  }
}

function kampalaDateParts(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: KAMPALA_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return {
    day: get('day'),
    month: get('month'),
    year: get('year'),
    hour: get('hour'),
    minute: get('minute'),
    dayPeriod: get('dayPeriod'),
  }
}

export function formatTimestamp(iso: string) {
  const parts = kampalaDateParts(iso)
  if (!parts) return iso

  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod}`
}

function formatTimestampTime(iso: string) {
  const parts = kampalaDateParts(iso)
  if (!parts) return ''

  return `${parts.hour}:${parts.minute} ${parts.dayPeriod}`
}

function formatRelativeDay(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  const today = new Date()
  const dayKey = (value: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: KAMPALA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value)

  const targetDay = dayKey(date)
  const currentDay = dayKey(today)

  if (targetDay === currentDay) return 'Today'

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (targetDay === dayKey(yesterday)) return 'Yesterday'

  return null
}

function getStageTimestamp(order: Order, stageIndex: number) {
  const entries = order.statusHistory.filter((entry) => entry.stageIndex === stageIndex)
  if (entries.length > 0) {
    return entries[entries.length - 1].timestamp
  }
  if (stageIndex === 0) return order.createdAt
  return null
}

export function formatUgx(amount: number) {
  return `UGX ${amount.toLocaleString('en-UG')}`
}

export function buildTimeline(order: Order): TrackingStepView[] {
  const lastStage = TRACKING_STAGES.length - 1

  return TRACKING_STAGES.map((label, index) => {
    let status: TrackingStepView['status'] = 'pending'

    if (order.currentStageIndex >= lastStage) {
      status = 'completed'
    } else if (index < order.currentStageIndex) {
      status = 'completed'
    } else if (index === order.currentStageIndex) {
      status = 'current'
    }

    const reachedAt = getStageTimestamp(order, index)
    let date = 'Pending'

    if (reachedAt) {
      const relativeDay = formatRelativeDay(reachedAt)
      date = relativeDay
        ? `${relativeDay}, ${formatTimestampTime(reachedAt)}`
        : formatTimestamp(reachedAt)
    } else if (index === lastStage && order.expectedDelivery && status === 'pending') {
      date = `Expected ${formatTimestamp(order.expectedDelivery)}`
    }

    return { label, date, status }
  })
}

export function formatOutstandingBilling(amount: number) {
  return amount > 0 ? formatUgx(amount) : 'To be confirmed'
}

export function buildOrderDetails(order: Order) {
  return [
    { label: 'Customer Name', value: order.customerName },
    { label: 'Website Shipped From', value: order.websiteShippedFrom },
    { label: 'Contact Detail', value: order.phone },
    { label: 'Outstanding Billing', value: formatOutstandingBilling(order.billingUgx) },
  ]
}
