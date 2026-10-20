export interface VisitEstimate {
  low: number;
  mid: number;
  high: number;
}

/**
 * Rough monthly-visit anchors by global rank, in log-log space.
 * These are approximations of publicly reported traffic levels, not measurements;
 * the UI always labels the output as an estimate and shows a wide range.
 */
const ANCHORS: ReadonlyArray<readonly [rank: number, visits: number]> = [
  [1, 8.0e10],
  [10, 4.0e9],
  [100, 6.5e8],
  [1e3, 9.0e7],
  [1e4, 1.3e7],
  [1e5, 1.7e6],
  [1e6, 2.2e5],
];

function roundSig(n: number, sig = 2): number {
  const p = 10 ** (Math.floor(Math.log10(n)) - sig + 1);
  return Math.round(n / p) * p;
}

/** Uncertainty factor grows as rank worsens: the long tail is far less predictable. */
function spread(rank: number): number {
  if (rank <= 100) return 2.5;
  if (rank <= 1e4) return 3;
  return 4;
}

export function estimateVisits(rank: number): VisitEstimate | null {
  if (!Number.isFinite(rank) || rank < 1 || rank > 1e6) return null;

  let i = ANCHORS.findIndex(([r]) => r >= rank);
  if (i <= 0) i = 1;
  const [r0, v0] = ANCHORS[i - 1];
  const [r1, v1] = ANCHORS[i];
  const t = (Math.log10(rank) - Math.log10(r0)) / (Math.log10(r1) - Math.log10(r0));
  const mid = 10 ** (Math.log10(v0) + t * (Math.log10(v1) - Math.log10(v0)));

  const f = spread(rank);
  return { low: roundSig(mid / f), mid: roundSig(mid), high: roundSig(mid * f) };
}

export function formatCompact(n: number): string {
  if (n >= 1e9) return `${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(Math.round(n));
}

const trim = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, '');

export function formatRange(e: VisitEstimate): string {
  return `${formatCompact(e.low)} – ${formatCompact(e.high)}`;
}
