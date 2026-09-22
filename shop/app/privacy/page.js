export const metadata = {
  title: 'Privacy Policy — MrSqoopExpress',
};

export default function PrivacyPolicy() {
  return (
    <section className="section legal-page">
      <h1 className="legal-title">Privacy Policy</h1>
      <p className="legal-updated">Last updated: {new Date().getFullYear()}</p>

      <p>
        MrSqoopExpress (&quot;we&quot;, &quot;us&quot;) sources products from AliExpress and
        delivers them to customers in Uganda. This policy explains what information we
        collect when you shop with us, and how it is used.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>Your name, delivery address and phone number, provided at checkout.</li>
        <li>Your mobile money phone number, used to send the MTN or Airtel payment prompt.</li>
        <li>Order history and order status, so you and our team can track a purchase.</li>
        <li>Account email address, if you create an account to view past orders.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To process your order, charge payment, and ship the product to your address.</li>
        <li>To contact you about your order — confirmations, delays, or delivery updates.</li>
        <li>To resolve support requests, refunds, or returns.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        Your delivery details are shared with AliExpress sellers and couriers only as far
        as needed to fulfil and ship your order. Your mobile money number is shared with
        MTN or Airtel solely to process the payment you initiate. We do not sell your
        personal information to third parties.
      </p>

      <h2>Data security</h2>
      <p>
        Payment is handled directly by MTN Mobile Money or Airtel Money — we never see or
        store your mobile money PIN. Account passwords are stored encrypted, not in plain
        text.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us to delete your account and stored order history at any time by
        contacting support. Some order records may be kept as required for tax or dispute
        purposes.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about this policy or your data can be sent to{' '}
        <a href="mailto:support@mrsqoopexpress.com">support@mrsqoopexpress.com</a>.
      </p>
    </section>
  );
}
