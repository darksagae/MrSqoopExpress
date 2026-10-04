import { auth } from '@/auth';

/**
 * The signed-in customer, or null. Never throws: a bad cookie or auth
 * misconfiguration reads as "not signed in" instead of a 500.
 */
export async function signedInUser() {
  try {
    const session = await auth();
    const u = session?.user;
    return u?.id ? { id: u.id, email: u.email || null, name: u.name || null } : null;
  } catch {
    return null;
  }
}
