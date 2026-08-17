export const SHIPPING_WEBSITES = [
  'Amazon',
  'Shein',
  'Noon',
  'Aliexpress',
  'Temu',
  'Alibaba',
  'Ebay',
  'Other',
] as const

export type ShippingWebsite = (typeof SHIPPING_WEBSITES)[number]

export const DEFAULT_SHIPPING_WEBSITE: ShippingWebsite = 'Amazon'
