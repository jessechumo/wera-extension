// Places as forms name them: US states by code or name, countries by
// name, short name or the word for their people ("a Singapore citizen",
// "a Canadian citizen"), and the United States under all its names.

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/** The United States under the names forms use (normalized: lowercase, no punctuation). */
export const US_NAMES = ['united states', 'united states of america', 'usa', 'us', 'u s', 'u s a', 'america'];

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

/** "TX" -> "Texas" (other values as they are). */
export const stateName = (s: string) => US_STATES[s.trim().toUpperCase()] ?? s.trim();

// Countries a form may name, each with its other names and its people's word.
const COUNTRIES: [string, string[]][] = [
  ['United States', ['united states of america', 'usa', 'u s a', 'u s', 'america', 'american']],
  ['Canada', ['canadian']], ['Mexico', ['mexican']], ['United Kingdom', ['uk', 'u k', 'great britain', 'britain', 'british', 'england']],
  ['Ireland', ['irish']], ['Germany', ['german']], ['France', ['french']], ['Spain', ['spanish']], ['Portugal', ['portuguese']],
  ['Italy', ['italian']], ['Netherlands', ['the netherlands', 'holland', 'dutch']], ['Belgium', ['belgian']], ['Switzerland', ['swiss']],
  ['Austria', ['austrian']], ['Sweden', ['swedish']], ['Norway', ['norwegian']], ['Denmark', ['danish']], ['Finland', ['finnish']],
  ['Poland', ['polish']], ['Czech Republic', ['czechia', 'czech']], ['Romania', ['romanian']], ['Bulgaria', ['bulgarian']],
  ['Greece', ['greek']], ['Turkey', ['turkish', 'turkiye']], ['Israel', ['israeli']], ['United Arab Emirates', ['uae', 'emirati']],
  ['Saudi Arabia', ['saudi']], ['India', ['indian']], ['Pakistan', ['pakistani']], ['Bangladesh', ['bangladeshi']],
  ['China', ['chinese']], ['Hong Kong', []], ['Taiwan', ['taiwanese']], ['Japan', ['japanese']], ['South Korea', ['korea', 'korean']],
  ['Singapore', ['singaporean']], ['Malaysia', ['malaysian']], ['Indonesia', ['indonesian']], ['Philippines', ['filipino']],
  ['Vietnam', ['vietnamese']], ['Thailand', ['thai']], ['Australia', ['australian']], ['New Zealand', ['new zealander', 'kiwi']],
  ['Brazil', ['brazilian']], ['Argentina', ['argentine', 'argentinian']], ['Chile', ['chilean']], ['Colombia', ['colombian']],
  ['Peru', ['peruvian']], ['South Africa', ['south african']], ['Nigeria', ['nigerian']], ['Kenya', ['kenyan']], ['Egypt', ['egyptian']],
  ['Ukraine', ['ukrainian']], ['Estonia', ['estonian']], ['Lithuania', ['lithuanian']], ['Latvia', ['latvian']], ['Serbia', ['serbian']],
  ['Croatia', ['croatian']], ['Hungary', ['hungarian']], ['Luxembourg', []],
];

/** The country a name stands for ("USA", "American", "uk"), or '' when Wera does not know it. */
export function countryNamed(name: string): string {
  const n = norm(name);
  if (!n) return '';
  return COUNTRIES.find(([c, other]) => norm(c) === n || other.includes(n))?.[0] ?? '';
}

/** Whether two names mean the same country ("US" and "United States of America"). */
export function sameCountry(a: string, b: string): boolean {
  const x = countryNamed(a) || norm(a);
  const y = countryNamed(b) || norm(b);
  return !!x && x === y;
}

/**
 * The one country a question names ("Are you currently located in the
 * US?", "Are you a Singapore citizen?"), or '' when it names none or
 * several. "us" counts only written as a name ("US", "U.S."), never the
 * word ("join us").
 */
export function countryIn(question: string): string {
  const found = new Set<string>();
  const text = ` ${norm(question)} `;
  for (const [c, other] of COUNTRIES) {
    for (const name of [norm(c), ...other]) {
      if (name === 'us' || name === 'u s') continue;
      if (text.includes(` ${name} `)) found.add(c);
    }
  }
  if (/\bU\.?S\.?A?\b(?!\w)/.test(question.replace(/\bus\b/g, ''))) found.add('United States');
  return found.size === 1 ? [...found][0]! : '';
}

/**
 * The answer to "are you in / a citizen of <country>?": "yes" when it
 * names the user's country, "no" when another; '' when Wera can't tell.
 */
export function countryAnswer(question: string, mine: string): string {
  const asked = countryIn(question);
  if (!asked || !mine.trim()) return '';
  return sameCountry(asked, mine) ? 'yes' : 'no';
}
