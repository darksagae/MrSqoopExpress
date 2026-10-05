import Link from 'next/link';

export const metadata = {
  title: 'International Shopping & Shipping to Uganda',
  description:
    'Shop products from international suppliers and get them shipped to Uganda with Mr Sqoop Express. Pay with mobile money or card and track delivery to Uganda.',
  alternates: { canonical: '/international-shopping-uganda' },
};

const FAQ = [
  ['Can I shop from international suppliers in Uganda?', 'Yes. Many international suppliers ship to Uganda, but not all. Mr Sqoop Express only lists products that can be delivered to Uganda, so you never pay for something that cannot arrive.'],
  ['How much does shipping to Uganda cost?', 'Shipping is quoted for each product and shown on the product page and at checkout. Some items ship free. Our handling fee is shown separately.'],
  ['How do I pay?', 'Pay with MTN Mobile Money or Airtel Money. Card payment by Visa or Mastercard is added once it is available.'],
  ['How long does delivery take?', 'Every product shows its estimated delivery window to Uganda. It depends on the seller and shipping method.'],
  ['How do I track my order?', 'Sign in and open Track Order to follow your order from payment to delivery.'],
];

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
};

export default function InternationalShoppingUganda() {
  return (
    <section className="section legal-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <h1 className="legal-title">International shopping with delivery to Uganda</h1>
      <p>
        Mr Sqoop Express makes it simple to buy from international suppliers from Uganda. Pick what you want, pay with
        mobile money, and we take care of ordering and shipping it to you.
      </p>
      <p><Link href="/#shop" className="btn-dark" style={{ display: 'inline-block', padding: '12px 22px' }}>Shop now</Link></p>

      <h2>How international shopping to Uganda works</h2>
      <ol>
        <li>Find a product and check its option, price and shipping to Uganda.</li>
        <li>Add it to your cart and pay with MTN Mobile Money or Airtel Money.</li>
        <li>We confirm your payment and place your order.</li>
        <li>Follow the journey in Track Order until it reaches Uganda.</li>
      </ol>

      <h2>Frequently asked questions</h2>
      {FAQ.map(([q, a]) => (
        <div key={q}>
          <h3>{q}</h3>
          <p>{a}</p>
        </div>
      ))}
    </section>
  );
}
