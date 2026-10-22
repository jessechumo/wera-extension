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
        variant === 'primary' && 'bg-accent text-bg hover:bg-accent/85',
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

/** The one main action of a view (Autofill): the dashboard's primary button, a size up. */
export function BigButton({ busy, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-bg transition-colors duration-150 hover:bg-accent/85 disabled:opacity-60',
        className,
      )}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" />}
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
/** The fit score ring, drawn as the dashboard draws it (src/components/ScoreRing.tsx, size md). */
export function ScoreRing({ score, estimate }: { score: number | null; estimate?: boolean }) {
  const box = 48;
  const stroke = 4;
  const r = (box - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  if (score != null && estimate) {
    return (
      <div className="relative shrink-0" style={{ width: box, height: box }} aria-label={`Estimated fit ${score}, AI score pending`} title="Estimated from your profile; the AI score is on its way">
        <svg width={box} height={box} className="-rotate-90">
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="var(--color-faint)" strokeWidth={stroke} strokeDasharray="3 4" className="animate-pulse" />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="font-mono text-sm font-semibold text-muted">{score}</span>
          <span className="mt-0.5 text-[9px] tracking-wide text-faint uppercase">est.</span>
        </span>
      </div>
    );
  }
  const color = score == null || score < 45 ? 'var(--color-faint)' : score >= 80 ? 'var(--color-accent)' : score >= 65 ? 'var(--color-accent-2)' : 'var(--color-muted)';
  return (
    <div className="relative shrink-0" style={{ width: box, height: box }} aria-label={score == null ? 'Not scored yet' : `fit ${score}`}>
      <svg width={box} height={box} className="-rotate-90">
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
        {score != null && (
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(Math.max(score, 0), 100) / 100)} />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold" style={{ color }}>{score ?? '—'}</span>
    </div>
  );
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
