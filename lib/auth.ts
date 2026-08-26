import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { NextAuthOptions, Session } from 'next-auth';
import { getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from './db';
import { effectiveTier, tierFromString, type Tier } from './tiers';

/**
 * Auth is optional infrastructure, not the point of the product.
 *
 * When Google credentials are absent the app still runs — you simply cannot
 * sign in, and everything operates at the free tier against demo data. That
 * keeps a fresh clone one command from a working demo.
 */

export const googleConfigured = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  providers: googleConfigured()
    ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          allowDangerousEmailAccountLinking: false,
        }),
      ]
    : [],
  pages: { signIn: '/signin', error: '/signin' },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // Read the tier from the row rather than a token, so a Stripe webhook
        // upgrade — or a promo redemption — takes effect on the next request
        // instead of the next login.
        const record = await prisma.user.findUnique({
          where: { id: user.id },
          select: { tier: true, referralCode: true, stripeStatus: true, trialTier: true, trialEndsAt: true },
        });
        const activeTrial = record?.trialTier && record.trialEndsAt && record.trialEndsAt.getTime() > Date.now();
        session.user.tier = effectiveTier(tierFromString(record?.tier), record?.trialTier, record?.trialEndsAt);
        session.user.referralCode = record?.referralCode ?? null;
        session.user.trialEndsAt = activeTrial ? (record?.trialEndsAt?.toISOString() ?? null) : null;
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
}

/** The signed-in user, or null. Never throws. */
export async function getViewer(): Promise<Viewer | null> {
  if (!googleConfigured()) return null;
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
  };
}
