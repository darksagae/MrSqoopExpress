import './globals.css';
import { CartProvider } from './cart';
import AuthProvider from './components/AuthProvider';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import CartDrawer from './components/CartDrawer';
import Assistant from './components/assistant/Assistant';
import MetaPixel from './components/MetaPixel';

const SITE = 'https://www.mrsqoopexpress.com';

export const metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'Online Shopping & Delivery to Uganda',
    template: '%s | Mr Sqoop Express',
  },
  description:
    'Shop online with Mr Sqoop Express and get your orders delivered to Uganda. Shop from international stores, enjoy reliable shipping and easy order tracking.',
  applicationName: 'Mr Sqoop Express',
  openGraph: {
    type: 'website',
    siteName: 'Mr Sqoop Express',
    url: SITE,
    title: 'Online Shopping & Delivery to Uganda',
    description:
      'Shop from international stores and get your orders delivered to Uganda, with easy order tracking and mobile money or card payment.',
    locale: 'en_UG',
  },
  twitter: { card: 'summary_large_image', title: 'Online Shopping & Delivery to Uganda' },
  alternates: { canonical: '/' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'Mr Sqoop Express',
      url: SITE,
      slogan: 'You shop. We ship. You smile.',
      logo: `${SITE}/logo-white.png`,
      areaServed: { '@type': 'Country', name: 'Uganda' },
      email: 'support@mrsqoopexpress.com',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#site`,
      url: SITE,
      name: 'Mr Sqoop Express',
      publisher: { '@id': `${SITE}/#org` },
      inLanguage: 'en',
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <AuthProvider>
          <CartProvider>
            <SiteHeader />
            {children}
            <SiteFooter />
            <CartDrawer />
            <Assistant />
            <MetaPixel />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
