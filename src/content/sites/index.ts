// Site rules: what Wera knows about the application systems people meet
// most (Workday, Greenhouse, Lever, Ashby, Jobvite, Workable). Each knows its site's own
// field names, how its widgets behave, where its way forward is and which
// step the user is on (how it fills its widgets is in sites/fill.ts).
// Wera's general rules handle everything a site rule leaves alone, and
// every other site.
import type { FieldPurpose } from '../../shared/types';
import type { Field } from '../fields';
import { ashby } from './ashby';
import { greenhouse } from './greenhouse';
import { jobvite } from './jobvite';
import { lever } from './lever';
import { workable } from './workable';
import { workday } from './workday';

export interface Step {
  name: string;
  index: number;
  total: number;
}

export interface Site {
  name: string;
  /** This document is this site's application (or a step of it). */
  matches(doc: Document): boolean;
  /** What a field is for, from the site's own names; undefined leaves it to the general rules (null: not Wera's to fill). */
  purpose?(f: Field): FieldPurpose | null | undefined;
  /** The button that moves the application on (never Submit), when the general search would miss it. */
  next?(doc: Document): HTMLElement | null;
  /** Where the user is in a multi-step application. */
  step?(doc: Document): Step | null;
  /** A page that wants an account first (sign in or create one): what the user should do. */
  gate?(doc: Document): string | null;
  /** The way on when pressing Apply asks how to go on: Wera fills the form itself. */
  applyChoice?(doc: Document): HTMLElement | null;
  /** Time between fields: some sites need it to keep up (ms). */
  pace?: number;
  /** Time a site takes to read an attached resume and fill the form from it (ms). */
  readsResume?: number;
  /** Its job and school blocks are not Wera's to open: each needs saving by hand, and opening several breaks the page. */
  noBlocks?: boolean;
}

const SITES: Site[] = [workday, greenhouse, lever, ashby, jobvite, workable];

/** The site rules for a document, if Wera has some. Not remembered: a single-page site can change what it shows. */
export function siteFor(doc: Document): Site | null {
  return SITES.find((s) => s.matches(doc)) ?? null;
}
