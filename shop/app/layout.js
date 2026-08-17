import './globals.css';
import { CartProvider } from './cart';
import AuthProvider from './components/AuthProvider';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import CartDrawer from './components/CartDrawer';

export const metadata = {
  title: 'MrSqoopExpress — Express Tech Shop',
  description: 'Quality tech and lifestyle products, delivered in Uganda.',
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
        <AuthProvider>
          <CartProvider>
            <SiteHeader />
            {children}
            <SiteFooter />
            <CartDrawer />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
