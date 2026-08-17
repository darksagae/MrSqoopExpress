'use client';

import { SessionProvider } from 'next-auth/react';

// Makes useSession() available to client components (header user menu, etc.).
export default function AuthProvider({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}
