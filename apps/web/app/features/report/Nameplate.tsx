// English nameplate uses the same self-hosted type as the private reader.
const LABELS = { daily: 'AM Daily', weekly: 'AM Weekly', monthly: 'AM Monthly', archive: 'AM Archive' } as const;
export function Nameplate({ which, className = '' }: { which: keyof typeof LABELS; className?: string }) {
  return <span className={`font-bold text-ink ${className}`} aria-hidden="true" style={{ fontSize: 'clamp(28px, 5vw, 64px)', lineHeight: 1.1 }}>{LABELS[which]}</span>;
}
