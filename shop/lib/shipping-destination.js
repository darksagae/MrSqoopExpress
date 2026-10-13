import { currentSettings } from './settings.js';

/**
 * Two countries are involved in every order, and they answer different
 * questions.
 *
 * CUSTOMER_DESTINATION (Uganda) is what the shopper is told: every page,
 * message and order says delivery to Uganda. It is the only country a
 * customer ever sees.
 *
 * WAREHOUSE (Dubai) is where the supplier actually ships and bills, and from
 * where we take the goods on to Uganda. So it is also where every supplier
 * figure is asked for (SOURCING): product prices, the shipping cost, and
 * whether a product can be delivered at all. The customer pays exactly what
 * the supplier will charge when the order is placed to the warehouse, so the
 * two can't disagree. Our own leg on to Uganda is paid from the handling fee.
 *
 * The warehouse's country, address and figures are internal. They never
 * appear in a quote, a summary, or any page a customer loads.
 */
export const CUSTOMER_DESTINATION = {
  countryCode: 'UG',
  country: 'Uganda',
};

/** How delivery is described to a customer. */
export const CUSTOMER_DESTINATION_LABEL = 'Uganda';

export const WAREHOUSE = {
  countryCode: 'AE',
  country: 'United Arab Emirates',
  province: 'Dubai',
  city: 'Dubai',
  district: 'Al Zarooni',
  addressLine: '12 B Street, AL ZAROONI 4 101',
  zip: '00000',
  contactName: 'Ronnie NTEGE',
  phoneCountry: '+971',
  phone: '588164478',
};

/** Operator-facing only — never render this to a customer. */
export const WAREHOUSE_LABEL = '12 B Street, Al Zarooni, Dubai — United Arab Emirates';

/**
 * Where supplier prices, shipping quotes and availability are asked for: the
 * warehouse. The UAE needs the province and city too, or the supplier refuses
 * to quote shipping (DELIVERY_SERVICE_EXCEPTION).
 */
export const SOURCING = {
  countryCode: WAREHOUSE.countryCode,
  provinceCode: WAREHOUSE.province,
  cityCode: WAREHOUSE.city,
};

/**
 * The delivery time promised to customers, in working days, door to door in
 * Uganda. The supplier's own estimate only covers the trip to the warehouse,
 * so it is never shown.
 */
export const DELIVERY_PROMISE = { minDays: 7, maxDays: 15 };

/**
 * Handling fee, charged as a percentage of the product price. The percentage is
 * set from the admin (see settings.js).
 *
 * This is the shop's own charge for taking the goods the rest of the way, and
 * it is shown to the customer as its own line rather than folded into the
 * product price — the product price is meant to match AliExpress exactly, so
 * burying a margin inside it would make that claim false.
 */
export const handlingPercent = () => currentSettings().handlingPercent;

/** Handling fee for a given product price, in the same currency. */
export function handlingFee(amount) {
  return Math.round((Number(amount) || 0) * (handlingPercent() / 100));
}
