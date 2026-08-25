import { clamp, isInsider } from './coil';
import { buildLadder } from './ladder';
import type {
  AlphaSignal,
  CoilReport,
  TokenSnapshot,
  UserPosition,
  Verdict,
} from './types';

/**
 * The decision layer. Turns the coil report into one of seven calls, a
 * conviction, and the evidence behind it.
 *
 * Every verdict ships with its reasoning. A tool that tells you to sell without
 * telling you why is just a coin flip with a logo.
 */

export interface VerdictMeta {
  label: string;
  /** One line the trader can act on without reading further. */
  imperative: string;
  tone: 'apex' | 'good' | 'neutral' | 'warn' | 'danger';
}

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  APEX_ENTRY: {
    label: 'APEX ENTRY',
    imperative: 'Structure is clean and the float is trapped above you. This is the asymmetry.',
    tone: 'apex',
  },
  SCALE_IN: {
    label: 'SCALE IN',
    imperative: 'Coil is low and flow is not distributing. Build in tranches, not all at once.',
    tone: 'good',
  },
  HOLD_THROUGH_NOISE: {
    label: 'HOLD THROUGH NOISE',
    imperative: 'Nothing structural has changed. The candle is lying to you — sit still.',
    tone: 'neutral',
  },
  ARM_EXIT: {
    label: 'ARM EXIT',
    imperative: 'Pressure is building. Set the ladder now so you are not deciding mid-dump.',
    tone: 'warn',
  },
  SCALE_OUT_NOW: {
    label: 'SCALE OUT NOW',
    imperative: 'Profitable supply is converting to cash. Start taking, keep a runner.',
    tone: 'warn',
  },
  EXIT_IMMEDIATELY: {
    label: 'EXIT IMMEDIATELY',
    imperative: 'The distribution is underway. Liquidity is the only thing that matters now.',
    tone: 'danger',
  },
  NO_TOUCH: {
    label: 'NO TOUCH',
    imperative: 'The structure is built to take your money. There is no entry price that fixes this.',
    tone: 'danger',
  },
};

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/**
 * Threat ordering: the worst true statement wins. We check the severe cases
 * first so a token that is both "cheap" and "rigged" reads as rigged.
 */
export function decideVerdict(snapshot: TokenSnapshot, coil: CoilReport): Verdict {
  const insidersDistributing = coil.insiderRealized > 0.35 && coil.insiderCoil > 0.06;
  const fatalStructure =
    snapshot.mintAuthorityActive && coil.insiderCoil > 0.12;
  const noLiquidity = snapshot.liquidityUsd < 5_000;

  if (fatalStructure || noLiquidity || coil.structuralFlags.length >= 3) return 'NO_TOUCH';
  if (coil.coilScore > 0.85 || (insidersDistributing && coil.velocityOfRealization > 0.2)) {
    return 'EXIT_IMMEDIATELY';
  }
  if (coil.coilScore > 0.68 || (coil.insiderCoil > 0.1 && coil.velocityOfRealization > 0.15)) {
    return 'SCALE_OUT_NOW';
  }
  if (coil.coilScore > 0.5 || coil.velocityOfRealization > 0.35) return 'ARM_EXIT';
  if (coil.coilScore > 0.28) return 'HOLD_THROUGH_NOISE';

  const cleanStructure = coil.structuralFlags.length === 0;
  const supportHeavy = coil.trappedSupply > coil.coiledSupply;
  const accumulating = coil.velocityOfRealization < -0.15;

  if (coil.coilScore < 0.2 && cleanStructure && supportHeavy && accumulating) return 'APEX_ENTRY';
  return 'SCALE_IN';
}

/**
 * How strongly the evidence supports the call. Distinct from confidence, which
 * is about data coverage: you can be certain of a marginal read, or unsure of a
 * screaming one.
 */
export function computeConviction(coil: CoilReport, verdict: Verdict): number {
  // Distance from the neutral band, scaled — a coil of 0.5 is a shrug.
  const extremity = Math.abs(coil.coilScore - 0.45) / 0.45;
  const flowClarity = Math.abs(coil.velocityOfRealization);
  const insiderClarity = clamp(coil.insiderCoil / 0.15, 0, 1);

  let raw = 0.45 * clamp(extremity, 0, 1) + 0.3 * flowClarity + 0.25 * insiderClarity;

  // Structural verdicts do not need flow to be loud — the contract is the evidence.
  if (verdict === 'NO_TOUCH') raw = Math.max(raw, 0.8);

  // Conviction can never outrun the data it rests on.
  return clamp(raw * (0.5 + 0.5 * coil.confidence), 0, 1);
}

function buildReasoning(
  snapshot: TokenSnapshot,
  coil: CoilReport,
  position: UserPosition | null,
): string[] {
  const out: string[] = [];

  const insiderHolders = snapshot.holders.filter(isInsider);
  if (coil.insiderCoil > 0.005) {
    const avgCost = weightedAverageCost(insiderHolders);
    const multiple = avgCost && avgCost > 0 ? snapshot.priceUsd / avgCost : null;
    out.push(
      `Insider cluster: ${insiderHolders.length} linked wallets hold ${pct(coil.insiderCoil)} of tradable float` +
        (multiple ? ` at an average cost of $${avgCost!.toPrecision(3)} — currently ${multiple.toFixed(1)}× up.` : '.'),
    );
    if (coil.insiderRealized > 0.05) {
      out.push(
        `That cluster has already sold ${pct(coil.insiderRealized)} of what it held. Distribution is not a forecast here, it is in progress.`,
      );
    }
  } else if (coil.confidence > 0.4) {
    out.push('No coordinated insider cluster detected in the resolved holder set.');
  }

  out.push(
    `Coiled supply ${pct(coil.coiledSupply)} vs trapped supply ${pct(coil.trappedSupply)} — ` +
      (coil.coiledSupply > coil.trappedSupply
        ? 'more of the float is sitting in profit than is stuck underwater, so rallies get sold.'
        : 'most of the float is underwater and will not sell into weakness; that is structural support.'),
  );

  const vor = coil.velocityOfRealization;
  out.push(
    vor > 0.15
      ? `Velocity of realization is +${vor.toFixed(2)} — profitable holders are actively converting to cash.`
      : vor < -0.15
        ? `Velocity of realization is ${vor.toFixed(2)} — flow is accumulating, not distributing.`
        : `Velocity of realization is flat (${vor.toFixed(2)}) — no decisive flow in either direction.`,
  );

  if (coil.trapdoorUsd !== null) {
    out.push(
      `Trapdoor at $${coil.trapdoorUsd.toPrecision(3)}: the largest block of in-profit supply goes breakeven there. Below it, paper gains become a stampede.`,
    );
  }
  if (coil.ceilingUsd !== null) {
    out.push(
      `Ceiling at $${coil.ceilingUsd.toPrecision(3)}: trapped bags get whole at that level and will sell into the first touch.`,
    );
  }

  for (const flag of coil.structuralFlags) out.push(flag);

  if (position) {
    const mult = snapshot.priceUsd / position.entryPriceUsd;
    const aheadOfYou = snapshot.holders
      .filter((h) => !h.tags.includes('lp') && h.costBasisUsd !== null && h.costBasisUsd < position.entryPriceUsd)
      .reduce((s, h) => s + h.balance, 0);
    const share = snapshot.circulatingSupply > 0 ? aheadOfYou / snapshot.circulatingSupply : 0;
    out.push(
      `Your position is ${mult.toFixed(2)}× on entry, and ${pct(share)} of supply is held below your cost — that is the supply that can profitably exit before you.`,
    );
  }

  if (coil.confidence < 0.45) {
    // coil.supplyCovered, not snapshot.dataQuality.supplyCovered: the latter is
    // wallet-reconstructed coverage alone and reads as 0% on a token priced
    // entirely from the volume profile — which would make this line say "only
    // 0% covered" on a read that is, for example, 80% covered by candles.
    const basis =
      coil.method === 'volume-profile'
        ? `${pct(coil.supplyCovered)} of the float is priced from where volume traded, with no wallet data to confirm behaviour`
        : coil.method === 'hybrid'
          ? `${pct(coil.supplyCovered)} of the float is priced, blending trade history with the insider wallets we could resolve`
          : coil.method === 'none'
            ? 'neither trade history nor wallet data was available to price the float'
            : `${pct(coil.supplyCovered)} of the float has a reconstructed cost basis`;
    out.push(`Low confidence read: ${basis}. Treat this as directional, not precise.`);
  }

  return out;
}

function weightedAverageCost(holders: { balance: number; costBasisUsd: number | null }[]): number | null {
  let supply = 0;
  let weighted = 0;
  for (const h of holders) {
    if (h.costBasisUsd === null || h.costBasisUsd <= 0) continue;
    supply += h.balance;
    weighted += h.balance * h.costBasisUsd;
  }
  return supply > 0 ? weighted / supply : null;
}

function buildHeadline(snapshot: TokenSnapshot, coil: CoilReport, verdict: Verdict): string {
  const s = snapshot.symbol.toUpperCase();
  switch (verdict) {
    case 'NO_TOUCH':
      return `${s} is structurally rigged — ${coil.structuralFlags.length} hard flags on the contract.`;
    case 'EXIT_IMMEDIATELY':
      return `${s} is being distributed right now — insiders have sold ${pct(coil.insiderRealized)} of their bag.`;
    case 'SCALE_OUT_NOW':
      return `${s} has ${pct(coil.coiledSupply)} of float coiled in profit and flow has turned. Start taking.`;
    case 'ARM_EXIT':
      return `${s} is loading up: coil ${coil.coilScore.toFixed(2)} and climbing. Set your ladder before you need it.`;
    case 'HOLD_THROUGH_NOISE':
      return `${s} structure is unchanged — coil ${coil.coilScore.toFixed(2)}, nothing in the book says sell.`;
    case 'SCALE_IN':
      return `${s} is quiet: coil ${coil.coilScore.toFixed(2)}, ${pct(coil.trappedSupply)} of float trapped above.`;
    case 'APEX_ENTRY':
      return `${s} is the setup — clean contract, ${pct(coil.trappedSupply)} trapped overhead, flow accumulating.`;
  }
}

/**
 * How long this read stays good. Young, fast-moving tokens invalidate in
 * minutes; a settled book holds for an hour.
 */
export function computeHalfLife(snapshot: TokenSnapshot, coil: CoilReport): number {
  let minutes = 45;
  if (snapshot.ageMinutes < 60) minutes = 6;
  else if (snapshot.ageMinutes < 360) minutes = 15;

  // Loud flow decays a read faster than quiet flow.
  minutes *= 1 - 0.6 * clamp(Math.abs(coil.velocityOfRealization), 0, 1);
  return Math.max(3, Math.round(minutes));
}

/** Full pipeline: snapshot + coil -> actionable signal. */
export function buildSignal(
  snapshot: TokenSnapshot,
  coil: CoilReport,
  position: UserPosition | null = null,
): AlphaSignal {
  const verdict = decideVerdict(snapshot, coil);
  const conviction = computeConviction(coil, verdict);
  const ladder = verdict === 'NO_TOUCH' && !position ? null : buildLadder(snapshot, coil, verdict, position);

  return {
    snapshot,
    coil,
    verdict,
    conviction,
    headline: buildHeadline(snapshot, coil, verdict),
    reasoning: buildReasoning(snapshot, coil, position),
    ladder,
    halfLifeMinutes: computeHalfLife(snapshot, coil),
  };
}
