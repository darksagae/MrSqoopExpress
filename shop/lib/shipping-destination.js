import { currentSettings } from './settings.js';

/**
 * Two countries are involved in every order, and they answer different
 * questions.
 *
 * CUSTOMER_DESTINATION (Uganda) is what the shopper chooses and what every
 * price they see is quoted against: the product price and whether AliExpress
 * ships it to Uganda free or for a fee. This is the only country whose figures
 * appear anywhere customer-facing.
 *
 * WAREHOUSE (Deira, Dubai) is where goods are actually sent and collected from,
 * and delivery onward to Uganda is done by us. That routing — and the different
 * cost it carries — is internal. It never appears in a quote, a summary, or any
 * page a customer loads.
 *
 * Keeping the two apart matters in both directions: quoting the customer the
 * warehouse's numbers would show them the wrong country's prices, and ordering
 * against the customer's country would send the goods somewhere we don't
 * collect from.
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
  district: 'Deira',
  addressLine: 'Deira, Dubai',
};

/** Operator-facing only — never render this to a customer. */
export const WAREHOUSE_LABEL = 'Deira, Dubai — United Arab Emirates';

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
