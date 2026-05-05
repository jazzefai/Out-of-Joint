import type { RoundCard, StatDelta, VoteTally, WeightedVoteTally, RoundResult } from "@/types";

// ============================================================
// Hardcoded deck — Out of Joint Classic (No Cross-Table)
// Rounds 1–4 only
//
// Format:  base effect → then A/B/C net effects
// Notation: E = economy, C = cohesion, A = autonomy
// ============================================================

export const CLASSIC_DECK: RoundCard[] = [
  {
    round: 1,
    title: "Total Automation",
    baseEffect: { economy: -3, cohesion: 0, autonomy: 0 },
    options: {
      A: { economy: 2, cohesion: 0, autonomy: -2 },
      B: { economy: -2, cohesion: 3, autonomy: 0 },
      C: { economy: 0, cohesion: -1, autonomy: 2 },
    },
  },
  {
    round: 2,
    title: "Predictive Governance",
    baseEffect: { economy: 0, cohesion: 0, autonomy: -2 },
    options: {
      A: { economy: 2, cohesion: -2, autonomy: -1 },
      B: { economy: -1, cohesion: 2, autonomy: 0 },
      C: { economy: -2, cohesion: 1, autonomy: 2 },
    },
  },
  {
    round: 3,
    title: "Surveillance Drift",
    baseEffect: { economy: 0, cohesion: -1, autonomy: -1 },
    options: {
      A: { economy: -2, cohesion: 0, autonomy: 2 },
      B: { economy: -1, cohesion: -2, autonomy: 3 },
      C: { economy: 3, cohesion: -2, autonomy: -2 },
    },
  },
  {
    round: 4,
    title: "Hyper-Personalization",
    baseEffect: { economy: 0, cohesion: -1, autonomy: 0 },
    options: {
      A: { economy: -1, cohesion: 0, autonomy: -2 },
      B: { economy: -2, cohesion: -1, autonomy: 2 },
      C: { economy: 2, cohesion: -1, autonomy: 1 },
    },
  },
];

export function getCard(round: number): RoundCard {
  const card = CLASSIC_DECK.find((c) => c.round === round);
  if (!card) throw new Error(`No card for round ${round}`);
  return card;
}

// ============================================================
// Stat helpers
// ============================================================

export function applyDelta(
  stats: { economy: number; cohesion: number; autonomy: number },
  delta: StatDelta
) {
  return {
    economy: stats.economy + delta.economy,
    cohesion: stats.cohesion + delta.cohesion,
    autonomy: stats.autonomy + delta.autonomy,
  };
}

export function isCollapsed(stats: {
  economy: number;
  cohesion: number;
  autonomy: number;
}) {
  return stats.economy <= 0 || stats.cohesion <= 0 || stats.autonomy <= 0;
}

// ============================================================
// Vote tallying & tie-breaking
// ============================================================

export function tallyVotes(votes: { choice: "A" | "B" | "C" }[]): VoteTally {
  const tally: VoteTally = { A: 0, B: 0, C: 0, total: votes.length };
  for (const v of votes) tally[v.choice]++;
  return tally;
}

export function resolveRound(tally: VoteTally): RoundResult {
  const max = Math.max(tally.A, tally.B, tally.C);
  const leaders = (["A", "B", "C"] as const).filter((k) => tally[k] === max);

  if (leaders.length === 1) {
    return { winner: leaders[0], tally, wasTie: false };
  }

  // Tie-break: coin flip among leaders
  const winner = leaders[Math.floor(Math.random() * leaders.length)];
  return { winner, tally, wasTie: true };
}

// ============================================================
// Velocity-Weighted Voting
// Weight formula: max(0.5, 1.0 - (elapsed / duration) * 0.5)
// Early votes count up to 1.0×, late votes floor at 0.5×
// ============================================================

export function computeVoteWeight(
  elapsedSeconds: number,
  durationSeconds: number = 60
): number {
  const clamped = Math.max(0, Math.min(elapsedSeconds, durationSeconds));
  return Math.max(0.5, 1.0 - (clamped / durationSeconds) * 0.5);
}

export function weightedTallyVotes(
  votes: { choice: "A" | "B" | "C"; created_at: string }[],
  votingOpenedAt: string,
  durationSeconds: number = 60
): WeightedVoteTally {
  const openedMs = new Date(votingOpenedAt).getTime();
  let wA = 0, wB = 0, wC = 0;
  const tally: VoteTally = { A: 0, B: 0, C: 0, total: votes.length };

  for (const v of votes) {
    tally[v.choice]++;
    const elapsed = (new Date(v.created_at).getTime() - openedMs) / 1000;
    const weight = computeVoteWeight(elapsed, durationSeconds);
    if (v.choice === "A") wA += weight;
    else if (v.choice === "B") wB += weight;
    else wC += weight;
  }

  return {
    ...tally,
    weightedA: Math.round(wA * 100) / 100,
    weightedB: Math.round(wB * 100) / 100,
    weightedC: Math.round(wC * 100) / 100,
  };
}

export function resolveWeightedRound(wtally: WeightedVoteTally): RoundResult {
  const scores = { A: wtally.weightedA, B: wtally.weightedB, C: wtally.weightedC };
  const max = Math.max(scores.A, scores.B, scores.C);
  const leaders = (["A", "B", "C"] as const).filter((k) => scores[k] === max);

  if (leaders.length === 1) {
    return { winner: leaders[0], tally: wtally, wasTie: false };
  }

  const winner = leaders[Math.floor(Math.random() * leaders.length)];
  return { winner, tally: wtally, wasTie: true };
}

// ============================================================
// Display helpers
// ============================================================

export function formatDelta(delta: StatDelta): string {
  const parts = [
    delta.economy !== 0 ? `E ${delta.economy > 0 ? "+" : ""}${delta.economy}` : null,
    delta.cohesion !== 0 ? `C ${delta.cohesion > 0 ? "+" : ""}${delta.cohesion}` : null,
    delta.autonomy !== 0 ? `A ${delta.autonomy > 0 ? "+" : ""}${delta.autonomy}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("  ") : "No change";
}

export function formatBaseEffect(card: RoundCard): string {
  return formatDelta(card.baseEffect);
}
