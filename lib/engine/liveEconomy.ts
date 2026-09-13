/**
 * A deliberately small, transparent bank estimate for the live tracker.
 *
 * These are the start-state checkpoints shown by Element TD 2's length
 * selector. They are not a simulation of interest or creep leaks: they make
 * the coach conservative enough to stop calling an unaffordable tower a
 * "build now" action.
 */
export const LIVE_MATCH_LENGTHS = [
  "full",
  "short",
  "extra-short",
  "boss-hunt",
] as const;

export type LiveMatchLength = (typeof LIVE_MATCH_LENGTHS)[number];

export type LiveEconomyCheckpoint = {
  length: LiveMatchLength;
  label: string;
  startPhase: number;
  startWave: number;
  startingGold: number;
  startingPicks: number;
};

export const LIVE_ECONOMY_CHECKPOINTS: readonly LiveEconomyCheckpoint[] = [
  {
    length: "full",
    label: "Full",
    startPhase: 1,
    startWave: 1,
    startingGold: 300,
    startingPicks: 1,
  },
  {
    length: "short",
    label: "Short",
    startPhase: 3,
    startWave: 11,
    startingGold: 1500,
    startingPicks: 3,
  },
  {
    length: "extra-short",
    label: "Extra Short",
    startPhase: 6,
    startWave: 26,
    startingGold: 7500,
    startingPicks: 6,
  },
  {
    length: "boss-hunt",
    label: "Boss Hunt",
    startPhase: 11,
    startWave: 56,
    startingGold: 130000,
    startingPicks: 11,
  },
];

export function isLiveMatchLength(value: unknown): value is LiveMatchLength {
  return LIVE_MATCH_LENGTHS.some((length) => length === value);
}

export function economyCheckpoint(
  length: LiveMatchLength,
): LiveEconomyCheckpoint {
  return (
    LIVE_ECONOMY_CHECKPOINTS.find((point) => point.length === length) ??
    LIVE_ECONOMY_CHECKPOINTS[0]
  );
}

/** Piecewise-linear interpolation keeps every displayed phase anchored to a known game start. */
export function calibratedGrossGold(phase: number): number {
  const p = Math.max(1, phase);
  const points = LIVE_ECONOMY_CHECKPOINTS;
  if (p <= points[0].startPhase) return points[0].startingGold;
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];
    if (p <= after.startPhase) {
      const ratio =
        (p - before.startPhase) / (after.startPhase - before.startPhase);
      return Math.round(
        before.startingGold +
          ratio * (after.startingGold - before.startingGold),
      );
    }
  }
  return points.at(-1)?.startingGold ?? 0;
}

export function calibratedEconomy(
  phase: number,
  goldSpent: number,
  length: LiveMatchLength,
) {
  const checkpoint = economyCheckpoint(length);
  const effectivePhase = Math.max(phase, checkpoint.startPhase);
  const grossGold = calibratedGrossGold(effectivePhase);
  return {
    checkpoint,
    effectivePhase,
    grossGold,
    goldSpent,
    availableGold: Math.max(0, grossGold - goldSpent),
  };
}
