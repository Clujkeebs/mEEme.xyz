import type { Tier } from '@/lib/tiers';
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      tier: Tier;
      referralCode: string | null;
    };
  }
}
