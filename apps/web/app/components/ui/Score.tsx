/**
 * The AI score as a small pill, tinted by tier instead of drawn as a bar: strong picks (85+) in a wash of
 * warm red, solid ones (70+) in the accent, the rest as quiet text. The score itself is unchanged.
 */
const TIERS = [
  { min: 85, className: "bg-hot/10 text-hot ring-hot/25" },
  { min: 70, className: "bg-accent-soft text-accent ring-accent/20" },
  { min: 0, className: "text-ink-4 ring-line-soft" },
];

/** "Relevance score (provisional) · 88" on desktop cards; `compact` keeps only the number (phones). */
export function ScoreLabel({ score, compact = false }: { score: number | null; compact?: boolean }) {
  if (score === null) return null;
  const value = Math.round(score);
  const tier = TIERS.find((t) => value >= t.min)!;
  return (
    <span
      title={`Relevance score (provisional) ${value}/100`}
      aria-label={`Relevance score (provisional) ${value} points`}
      className={`inline-flex min-h-[20px] min-w-0 max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 ring-1 ring-inset ${tier.className}`}
    >
      {!compact && (
        <>
          <span className="min-w-0 text-[11px] font-medium leading-snug opacity-80 [overflow-wrap:anywhere]">Relevance score (provisional)</span>
          <span className="h-2.5 w-px shrink-0 bg-current opacity-25" aria-hidden="true" />
        </>
      )}
      <span className="mono shrink-0 text-[12.5px] font-bold leading-none tabular-nums">{value}</span>
    </span>
  );
}
