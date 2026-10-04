import { auth } from '@/auth';

/**
 * The signed-in customer, or null for a guest.
 *
 * Never throws: an auth hiccup (missing secret, bad cookie) must not stop
 * someone from paying. They simply check out as a guest.
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
