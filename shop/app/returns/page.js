export const metadata = {
  title: 'Return Policy — MrSqoopExpress',
};

export default function ReturnPolicy() {
  return (
    <section className="section legal-page">
      <h1 className="legal-title">Return &amp; Refund Policy</h1>
      <p className="legal-updated">Last updated: {new Date().getFullYear()}</p>

      <p>
        Every order is sourced from AliExpress and shipped to Uganda, so returns work a
        little differently from a local shop. This page explains what&apos;s covered and how
        to request a refund or replacement.
      </p>

      <h2>Cancelling before it ships</h2>
      <p>
        You can cancel an order for a full refund at any time before it has been forwarded
        to the seller for shipping. Once it has shipped, it can no longer be cancelled —
        the options below apply instead.
      </p>

      <h2>Damaged, wrong, or faulty items</h2>
      <p>
        If what arrives is damaged, defective, or not what you ordered, contact us within
        <strong> 7 days of delivery</strong> with:
      </p>
      <ul>
        <li>Your order number.</li>
        <li>Clear photos (or a short video) of the item and its packaging.</li>
        <li>A description of the problem.</li>
      </ul>
      <p>
        We will arrange a replacement or a refund, whichever the seller&apos;s resolution
        allows. This is at no extra cost to you.
      </p>

      <h2>Changed your mind</h2>
      <p>
        Because each item is sourced individually per order, we generally cannot accept a
        return simply because you no longer want an item, unless the specific seller&apos;s
        listing states otherwise. Check with support before assuming an item is returnable.
      </p>

      <h2>Not eligible for return</h2>
      <ul>
        <li>Items without a fault, once used or with removed tags/seals.</li>
        <li>Underwear, swimwear, and other intimate or hygiene items.</li>
        <li>Custom, personalised, or made-to-order items.</li>
        <li>Any claim made more than 7 days after delivery.</li>
      </ul>

      <h2>Refunds</h2>
      <p>
        Approved refunds are sent back to the mobile money number used at checkout.
        Refund processing typically takes 3–10 business days after approval, depending on
        the seller&apos;s response time and your network provider.
      </p>

      <h2>Shipping costs</h2>
      <p>
        For faulty, damaged, or wrongly sent items, MrSqoopExpress covers the cost of
        putting it right. For all other approved returns, return shipping is the
        customer&apos;s responsibility.
      </p>

      <h2>Request a return or refund</h2>
      <p>
        Email <a href="mailto:support@mrsqoopexpress.com">support@mrsqoopexpress.com</a>{' '}
        with your order number, or use{' '}
        <a href="https://order.mrsqoopexpress.com" target="_blank" rel="noopener noreferrer">
          Track Order
        </a>{' '}
        to check your order status first.
      </p>
    </section>
  );
}
