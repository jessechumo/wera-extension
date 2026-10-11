import { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import type { JobH1B, WeraApi } from '../shared/api';

const k = (n: number | null) => (n == null ? '—' : `$${Math.round(n / 1000)}k`);

/** The company's certified H-1B applications and pay for similar titles. */
export function H1BCard({ api, jobId, company }: { api: WeraApi; jobId: number; company: string }) {
  const [d, setD] = useState<JobH1B | null>(null);
  useEffect(() => {
    let live = true;
    api.h1b(jobId).then((x) => live && setD(x)).catch(() => {});
    return () => { live = false; };
  }, [api, jobId]);
  if (!d) return null;
  return (
    <div className="mt-3 border-t border-border pt-2.5 text-xs">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
        <Landmark className="size-3.5" /> H-1B filings
      </div>
      {!d.matched ? (
        <p className="text-[11px] text-faint">None found under {company}'s name (it may file under a parent company).</p>
      ) : (
        <>
          <p className="text-muted">
            <span className="font-mono text-text">{d.filings.toLocaleString()}</span> certified applications ({d.new_hires.toLocaleString()} new hires), median <span className="font-mono text-text">{k(d.wage_median)}</span>.
          </p>
          {d.similar.length > 0 && (
            <p className="mt-1 text-muted">
              Titles like this: <span className="font-mono text-text">{d.similar_low !== d.similar_high ? `${k(d.similar_low)} – ${k(d.similar_high)}` : k(d.similar_low)}</span>
              <span className="text-faint"> ({d.similar.length} filing{d.similar.length === 1 ? '' : 's'}, e.g. {d.similar[0]!.title})</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
