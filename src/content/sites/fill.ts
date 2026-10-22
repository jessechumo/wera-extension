// How a site's own widgets are filled, for the sites whose widgets Wera's
// general filler would miss (kept apart from the site rules, which the
// field reader uses).
import type { FieldPurpose } from '../../shared/types';
import type { Field } from '../fields';
import { siteFor } from './index';
import { fillWorkday } from './workdayFill';

type SiteFill = (f: Field, purpose: FieldPurpose | null, value: string) => Promise<string | null | undefined>;

const FILLERS: Record<string, SiteFill> = { Workday: fillWorkday };

/** The site's filler for a document: the value as the page now shows it, null when it did not take, undefined to use the general filler. */
export function siteFiller(doc: Document): SiteFill | null {
  const site = siteFor(doc);
  return site ? FILLERS[site.name] ?? null : null;
}
