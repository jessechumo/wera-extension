import { useId } from 'react';

/** The briefcase mark, drawn exactly as the dashboard draws it. */
export function LogoMark({ size = 22 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id} x1="3" y1="6" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="color-mix(in oklab, var(--color-accent) 70%, #ff3d6e)" />
        </linearGradient>
      </defs>
      <path d="M8.75 7V5.25A2.25 2.25 0 0 1 11 3h2a2.25 2.25 0 0 1 2.25 2.25V7" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
      <rect x="2" y="6.5" width="20" height="14.5" rx="4" fill={`url(#${id})`} />
      <path d="M2 12.75h20" stroke="var(--color-bg)" strokeOpacity="0.35" strokeWidth="1.25" />
      <rect x="10" y="11" width="4" height="3.5" rx="1.25" fill="var(--color-bg)" />
    </svg>
  );
}

/** Mark plus the "wera" wordmark. */
export function Logo({ small }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={small ? 20 : 26} />
      <span className={`font-mono font-semibold tracking-tight text-text ${small ? 'text-[15px]' : 'text-xl'}`}>
        wera
      </span>
    </span>
  );
}
