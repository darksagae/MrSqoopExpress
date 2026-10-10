import Assistant from '../components/assistant/Assistant';

export const metadata = {
  title: 'Sqoop Assist',
  description: 'Shop by chat or voice: find products, see prices delivered to Uganda, order and track your parcels.',
  robots: { index: false },
};

/** Sqoop Assist on its own page: the same assistant as the shop's floating button, full size. */
export default function AssistPage() {
  return (
    <main style={{ padding: '0 16px' }}>
      <Assistant embedded />
    </main>
  );
}
