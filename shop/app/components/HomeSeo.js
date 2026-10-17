import Link from 'next/link';

const WHY = [
  ['International shopping', 'Browse thousands of products from trusted international suppliers, priced in Uganda shillings.'],
  ['Delivery to Uganda', 'Only products that can be delivered to Uganda are listed, each with its shipping cost and delivery window.'],
  ['Clear prices', 'You see the item price, the shipping and our handling fee before you pay. No surprises at checkout.'],
  ['Order tracking', 'Follow your order from payment to delivery in Track Order, with live status updates.'],
  ['Convenient payment', 'Pay with MTN Mobile Money or Airtel Money, or by Visa or Mastercard bank card.'],
];

const STEPS = [
  ['Choose what you want', 'Search or browse the categories and open any product to see its options, price and shipping to Uganda.'],
  ['Place your order', 'Add to cart, sign in or create an account, and pay securely with mobile money or card.'],
  ['We handle the shipping', 'We confirm your payment, order your items and arrange their journey to Uganda.'],
  ['Track your package', 'Open Track Order any time to see where your package is.'],
  ['Receive it in Uganda', 'Collect or receive your order and enjoy it. You shop, we ship, you smile.'],
];

/** Server-rendered text for the home page: what the shop is, and how it works. */
export default function HomeSeo() {
  return (
    <>
      <section className="section seo-block" aria-labelledby="why-title">
        <h2 id="why-title" className="section-title">Why shop with Mr Sqoop Express?</h2>
        <ul className="seo-grid">
          {WHY.map(([t, d]) => (
            <li key={t}><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ul>
      </section>

      <section className="section seo-block" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">How it works</h2>
        <ol className="seo-steps">
          {STEPS.map(([t, d], i) => (
            <li key={t}><span className="seo-n">{i + 1}</span><div><h3>{t}</h3><p>{d}</p></div></li>
          ))}
        </ol>
      </section>

      <section className="section seo-block" aria-labelledby="intl-title">
        <h2 id="intl-title" className="section-title">International shopping and shipping to Uganda</h2>
        <p className="seo-lead">
          Mr Sqoop Express lets you shop products from international suppliers online and have them delivered to
          Uganda, paying in shillings with mobile money.{' '}
          <Link href="/international-shopping-uganda">Read our guide to international shopping in Uganda</Link>.
        </p>
      </section>
    </>
  );
}
