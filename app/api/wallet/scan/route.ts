import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api';
import { getViewer } from '@/lib/auth';
import { fetchSolPriceUsd } from '@/lib/providers/birdeye';
import { heliusConfigured } from '@/lib/providers/helius';
import { isPlausibleWalletAddress, scanWallet } from '@/lib/providers/wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FALLBACK_SOL_PRICE_USD = 150;

const bodySchema = z.object({ address: z.string().min(32).max(64) });

/**
 * Scan a public wallet for positions worth tracking.
 *
 * Signed-in only — not for gating's sake, but because the entire point is to
 * populate a watchtower, and there is nowhere to put the result otherwise.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError('Sign in first — the scan populates your watchtower.', 401);

  if (!heliusConfigured()) {
    return jsonError(
      'Wallet scanning needs a Helius key on this deployment. You can still add positions by hand.',
      503,
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('Paste a Solana wallet address.', 400);

  const address = parsed.data.address.trim();
  if (!isPlausibleWalletAddress(address)) {
    return jsonError('That does not look like a Solana wallet address.', 400);
  }

  const solPrice = (await fetchSolPriceUsd()) ?? FALLBACK_SOL_PRICE_USD;
  const scan = await scanWallet(address, solPrice);

  if (!scan) return jsonError('Could not read that wallet. Try again in a moment.', 502);

  return jsonOk({
    address,
    entriesUnavailable: scan.entriesUnavailable,
    holdings: scan.holdings,
  });
}
