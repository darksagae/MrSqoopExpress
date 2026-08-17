import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { getUserByEmail, verifyPassword, upsertGoogleUser, isEmailVerified } from '@/lib/users';
import { isEmailConfigured } from '@/lib/email';

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Session strategy is JWT — required because the Credentials (email+password)
 * provider is incompatible with database sessions. User rows still live in
 * Postgres (see lib/users.js); the JWT just carries the id/name/email.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await getUserByEmail(email);
        if (!user) return null;

        const ok = await verifyPassword(user, password);
        if (!ok) return null;

        // Block sign-in until the email is confirmed — but only once email
        // delivery is actually configured. Before the Resend key is set there's
        // no way for anyone to verify, so enforcing it would lock everyone out.
        if (isEmailConfigured() && !isEmailVerified(user)) {
          const err = new Error('EMAIL_NOT_VERIFIED');
          err.code = 'EMAIL_NOT_VERIFIED';
          throw err;
        }

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    // On Google sign-in, create/refresh the account in our own users table.
    async signIn({ account, profile, user }) {
      if (account?.provider === 'google') {
        try {
          const dbUser = await upsertGoogleUser({
            email: profile?.email || user?.email,
            name: profile?.name || user?.name,
            image: profile?.picture || user?.image,
            googleSub: profile?.sub,
          });
          user.id = dbUser.id; // carry our id, not Google's
        } catch (e) {
          console.error('Google upsert failed:', e);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token?.uid && session.user) session.user.id = token.uid;
      return session;
    },
  },
});
