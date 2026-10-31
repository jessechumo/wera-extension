// What a page holds for catching or steering AI tools, in the panel. Wera
// obeyed none of it; the user sees all of it, since some of it is theirs
// to act on: a test of whether they read the posting, or an employer
// asking for no AI.
import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { trapMeaning, uniqueTraps, type Trap } from '../shared/traps';
import { Button } from './ui';

/** Lines a person may want to act on come first. */
const ORDER: Trap['kind'][] = ['ai_policy', 'attention_check', 'asks_about_ai', 'human_check', 'aimed_at_ai', 'decoy_field'];

export function Traps({ traps, onDraftAnyway }: { traps: Trap[]; onDraftAnyway?: () => void }) {
  const [open, setOpen] = useState(false);
  const all = uniqueTraps(traps);
  if (!all.length) return null;
  // Several hidden boxes are one thing to know (often a form's hidden steps).
  const decoys = all.filter((t) => t.kind === 'decoy_field');
  const lines = [...all.filter((t) => t.kind !== 'decoy_field')].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const tests = all.filter((t) => t.kind === 'attention_check').length;
  const policy = all.some((t) => t.kind === 'ai_policy');
  const title = policy ? 'This employer asks you not to use AI'
    : tests ? `This posting tests whether you read it`
    : `Wera ignored ${all.length === 1 ? 'a trap' : `${all.length} traps`} set for AI tools`;
  return (
    <div className="rounded-lg border border-warn/30 bg-warn/[0.07] text-xs">
      <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ShieldCheck className="size-3.5 shrink-0 text-warn" />
        <span className="min-w-0 flex-1 font-medium">{title}</span>
        <ChevronDown className={clsx('size-3 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {onDraftAnyway && (
        <div className="flex items-center gap-2 px-2.5 pb-2">
          <span className="min-w-0 flex-1 text-[11px] text-muted">Wera did not draft your open answers.</span>
          <Button className="px-2 py-1" onClick={onDraftAnyway}>Draft anyway</Button>
        </div>
      )}
      {open && (
        <ul className="space-y-1.5 border-t border-warn/20 px-2.5 py-2">
          {lines.map((t) => (
            <li key={`${t.kind}|${t.text}`}>
              <p className="text-[11px] text-muted">{trapMeaning(t.kind)}</p>
              <p className="text-text">“{t.text}”</p>
            </li>
          ))}
          {decoys.length > 0 && <li className="text-[11px] text-muted">{decoys.length === 1 ? 'A box set out to catch bots was left empty.' : `${decoys.length} boxes set out to catch bots were left empty.`}</li>}
        </ul>
      )}
    </div>
  );
}
