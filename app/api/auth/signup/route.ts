import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { hashIp, jsonError, jsonOk } from '@/lib/api';
import { databaseConfigured, prisma } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  name: z.string().trim().max(100).optional(),
});

export async function POST(request: Request) {
  if (!databaseConfigured()) {
    return jsonError('Sign-up is unavailable — no database is configured on this deployment.', 503);
  }

  // Cheap to grind through email/password combinations otherwise: cap how
  // many accounts one caller can create per hour.
  if (!rateLimit(`signup:${hashIp(request)}`, 5, 60 * 60 * 1000)) {
    return jsonError('Too many attempts. Try again in a bit.', 429);
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError('Enter a valid email and a password of at least 8 characters.', 400);
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return jsonError('An account with that email already exists — sign in instead.', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, passwordHash, name: name || null } });

  return jsonOk({});
}
