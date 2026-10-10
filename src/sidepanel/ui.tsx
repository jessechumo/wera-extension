import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'secondary', busy, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-150 disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent/85',
        variant === 'secondary' && 'border border-border bg-surface-2 text-text hover:border-accent/40',
        variant === 'ghost' && 'text-muted hover:text-text',
        className,
      )}
    >
      {busy && <LoaderCircle className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('anim-rise rounded-card border border-border bg-surface p-3.5', className)}>{children}</div>;
}

export const INPUT =
  'w-full rounded-lg border border-border bg-surface-2/60 px-2.5 py-1.5 text-[13px] text-text placeholder:text-faint focus:border-accent/60 focus:outline-none';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode }) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={clsx(
        'rounded-lg border px-3 py-2 text-xs leading-relaxed',
        tone === 'info' && 'border-accent-2/25 bg-accent-2/[0.06] text-muted',
        tone === 'warn' && 'border-warn/30 bg-warn/[0.08] text-text',
        tone === 'bad' && 'border-bad/30 bg-bad/[0.08] text-text',
        tone === 'good' && 'border-good/30 bg-good/[0.08] text-text',
      )}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

/** The fit score ring (dashed and marked "est." for estimates). */
export function ScoreRing({ score, estimate }: { score: number | null; estimate?: boolean }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const color = score == null ? 'var(--color-faint)' : score >= 80 ? 'var(--color-accent)' : score >= 65 ? 'var(--color-accent-2)' : 'var(--color-muted)';
  return (
    <div className="relative size-12 shrink-0" aria-label={score == null ? 'Not scored yet' : `${estimate ? 'Estimated ' : ''}fit ${score}`}>
      <svg viewBox="0 0 44 44" className="size-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={estimate ? '3 3' : `${c * pct} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center font-mono text-sm font-semibold leading-none" style={{ color }}>
        {score ?? '–'}
        {estimate && <span className="mt-0.5 text-[8px] font-sans font-medium tracking-wide text-faint">EST.</span>}
      </span>
    </div>
  );
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
