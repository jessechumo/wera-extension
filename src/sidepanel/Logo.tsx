export function Logo({ small }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold tracking-tight" style={{ fontSize: small ? 15 : 20 }}>
      <svg viewBox="0 0 24 24" className={small ? 'size-4' : 'size-5'} aria-hidden>
        <rect x="3" y="7" width="18" height="13" rx="2.5" fill="var(--color-accent)" />
        <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
        <rect x="10.5" y="11.5" width="3" height="2" rx="0.6" fill="var(--color-bg)" />
      </svg>
      <span className="font-mono">wera<span className="text-accent">.</span></span>
    </span>
  );
}
