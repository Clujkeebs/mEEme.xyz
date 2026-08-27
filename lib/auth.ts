import bcrypt from 'bcryptjs';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { NextAuthOptions, Session } from 'next-auth';
import { getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { isAdmin } from './admin';
import { getAffiliateForViewer } from './affiliate';
import { databaseConfigured, prisma } from './db';
import { rateLimit } from './ratelimit';
import { effectiveTier, tierFromString, type Tier } from './tiers';

/**
 * Auth is optional infrastructure, not the point of the product.
 *
 * When there is no database the app still runs — you simply cannot sign in,
 * and everything operates at the free tier against demo data. That keeps a
 * fresh clone one command from a working demo. Google is a bonus sign-in
 * method on top of that, not a requirement: email/password (below) is the
 * one that always works once a database exists.
 */

export const googleConfigured = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// The Credentials provider only supports JWT sessions in NextAuth v4 — it has
// no adapter-backed row to key a database session off of. The adapter is kept
// for Google (account linking, user creation) even though sessions themselves
// now live in the JWT rather than the Session table.
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  // A secure, httpOnly cookie — not localStorage — is what actually keeps
  // someone signed in: httpOnly means client-side JS (and anything an XSS bug
  // might inject) can't read or exfiltrate it, which localStorage can't
  // offer. 60 days so "stay signed in" means something.
  session: { strategy: 'jwt', maxAge: 60 * 24 * 60 * 60 },
  providers: [
    ...(googleConfigured()
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        // Keyed by email, not IP: this is what actually stops someone from
        // grinding through passwords against one account.
        if (!rateLimit(`login:${email}`, 8, 15 * 60 * 1000)) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  pages: { signIn: '/signin', error: '/signin' },
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present on the request that just signed in — carry its
      // id forward in the token for every request after that.
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
        // Read the tier from the row on every request rather than caching it
        // in the token, so a Stripe webhook upgrade — or a promo redemption —
        // takes effect on the next request instead of the next login.
        const record = await prisma.user.findUnique({
          where: { id: token.id },
          select: { tier: true, referralCode: true, stripeStatus: true, trialTier: true, trialEndsAt: true },
        });
        const activeTrial = record?.trialTier && record.trialEndsAt && record.trialEndsAt.getTime() > Date.now();
        session.user.tier = effectiveTier(tierFromString(record?.tier), record?.trialTier, record?.trialEndsAt);
        session.user.referralCode = record?.referralCode ?? null;
        session.user.trialEndsAt = activeTrial ? (record?.trialEndsAt?.toISOString() ?? null) : null;
        session.user.isAdmin = isAdmin({ email: session.user.email ?? null });
        session.user.isAffiliate = Boolean(await getAffiliateForViewer({ email: session.user.email ?? null }));
      }
      return session;
    },
  },
};

export interface Viewer {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  tier: Tier;
  referralCode: string | null;
  /** ISO timestamp, set only while a promo trial is what is granting `tier`. */
  trialEndsAt: string | null;
  isAdmin: boolean;
  isAffiliate: boolean;
}

/** The signed-in user, or null. Never throws. */
export async function getViewer(): Promise<Viewer | null> {
  if (!databaseConfigured()) return null;
  let session: Session | null = null;
  try {
    session = await getServerSession(authOptions);
  } catch {
    return null;
  }
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    tier: session.user.tier ?? 'FREE',
    referralCode: session.user.referralCode ?? null,
    trialEndsAt: session.user.trialEndsAt ?? null,
    isAdmin: session.user.isAdmin ?? false,
    isAffiliate: session.user.isAffiliate ?? false,
  };
}
