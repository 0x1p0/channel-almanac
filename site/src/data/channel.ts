// The example channel every demo on the site uses. It is invented (no real creator appears on the
// site) and generated from a fixed seed relative to "now", so the hero's "3 years ago" stays true
// whenever the site is rebuilt. Times are wall-clock (local Date parts), so 18:04 reads 18:04 in
// every timezone, on the server and in the browser.
//
// The search itself is not simulated by hand: runSearch() feeds this channel to the extension's
// own lib.js (view, probes, select) exactly the way the panel does, three lookups at a time.

export type Upload = { t: number; title: string; kind: 'video' | 'short' | 'live' };
export type Channel = {
  now: number;
  uploads: Upload[]; // oldest first
  start: number; // first upload
  target: number; // index of "the one you remembered"
  month: { from: string; to: string }; // the month typed in the hero
};

// mulberry32: tiny, deterministic, good enough for a picture.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const THINGS = ['tape echo', 'drum machine', 'reel-to-reel deck', 'spring reverb', 'valve radio', 'Walkman', 'modular case', 'cassette four-track', 'organ', 'turntable', 'theremin', 'mixing desk'];
const VIDEO = [
  (x: string, n: number) => `Restoring a 1970s ${x}, part ${n}`,
  (x: string) => `What is inside a ${x}?`,
  (x: string) => `The ${x} nobody could fix`,
  (x: string, n: number) => `Workbench diary #${n}: the ${x}`,
  (x: string) => `Recapping a ${x} from start to finish`,
];
const SHORT = [(x: string) => `This ${x} still works`, (x: string) => `One screw, one ${x}`];

/** Build the example channel for a given "now" (a timestamp). */
export function exampleChannel(nowMs: number): Channel {
  const now = new Date(nowMs);
  const r = rng(1284);
  const startYear = now.getFullYear() - 15;
  const uploads: Upload[] = [];
  let d = new Date(startYear, 4, 17, 18, 0);
  let n = 1;
  while (d.getTime() < nowMs - 2 * 864e5) {
    const y = d.getFullYear() - startYear; // 0 … 15
    // Cadence by era: a slow start, a busy middle, a hiatus, then Shorts.
    const perWeek = y < 3 ? 0.8 : y < 6 ? 1.5 : y < 9 ? 2.2 : y === 9 ? 2.8 : y < 12 ? 1.6 : 1.9;
    const gapDays = 7 / perWeek;
    const hiatus = y === 10 && d.getMonth() >= 4 && d.getMonth() <= 7;
    if (!hiatus) {
      const kind: Upload['kind'] = y >= 10 && r() < 0.28 ? 'short' : r() < 0.05 ? 'live' : 'video';
      const thing = THINGS[Math.floor(r() * THINGS.length)];
      const title = kind === 'short' ? SHORT[Math.floor(r() * SHORT.length)](thing)
        : kind === 'live' ? `Live: workbench questions, ${d.toLocaleString('en', { month: 'long' })}`
        : VIDEO[Math.floor(r() * VIDEO.length)](thing, 1 + Math.floor(r() * 4));
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 16 + Math.floor(r() * 4), Math.floor(r() * 60));
      uploads.push({ t: t.getTime(), title, kind });
      n++;
    }
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + Math.max(1, Math.round(gapDays * (0.45 + r() * 1.1))));
  }

  // The one you remembered: a Tuesday near the middle of the month 3 years 7 months back.
  const back = new Date(now.getFullYear() - 3, now.getMonth() - 7, 14);
  const day = new Date(back.getFullYear(), back.getMonth(), 14 - ((back.getDay() + 5) % 7)); // that week's Tuesday
  const tt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 4).getTime();
  const m0 = new Date(day.getFullYear(), day.getMonth(), 1).getTime();
  const m1 = new Date(day.getFullYear(), day.getMonth() + 1, 1).getTime();
  // Exactly nine uploads that month: the target plus eight around it.
  const rest = uploads.filter((u) => u.t < m0 || u.t >= m1);
  const len = (m1 - m0) / 864e5;
  const slots = [2, 5, 8, 17, 20, 23, 26, len - 2].map((k) => new Date(m0 + k * 864e5));
  const month: Upload[] = slots.map((s, i) => ({
    t: new Date(s.getFullYear(), s.getMonth(), s.getDate(), 17 + (i % 3), 10 + i * 6).getTime(),
    title: i % 3 === 2 ? SHORT[i % 2](THINGS[i]) : VIDEO[i % 5](THINGS[i], 1 + (i % 3)),
    kind: i % 3 === 2 ? 'short' : 'video',
  }));
  month.push({ t: tt, title: 'Restoring a 1970s tape echo, part 3', kind: 'video' });
  const all = [...rest, ...month].sort((a, b) => a.t - b.t);
  return {
    now: nowMs,
    uploads: all,
    start: all[0].t,
    target: all.findIndex((u) => u.t === tt),
    month: { from: isoDay(new Date(m0)), to: isoDay(new Date(m1 - 864e5)) },
  };
}

/** What YouTube prints next to an upload ("3 years ago"), the way its labels round. */
export function relativeLabel(t: number, now: number) {
  const days = Math.floor((now - t) / 864e5);
  const unit = (n: number, u: string) => `${n} ${u}${n === 1 ? '' : 's'} ago`;
  if (days < 1) return unit(Math.max(1, Math.floor((now - t) / 36e5)), 'hour');
  if (days < 7) return unit(days, 'day');
  if (days < 30) return unit(Math.floor(days / 7), 'week');
  if (days < 365) return unit(Math.floor(days / 30), 'month');
  return unit(Math.floor(days / 365), 'year');
}

type Lib = {
  view: (v: unknown[][]) => { lo: Float64Array; hi: Float64Array; est: Float64Array };
  probes: (v: unknown[][], f: object, vw: unknown, max: number) => number[];
  select: (v: unknown[][], f: object, vw: unknown) => { idx: number[]; pending: number };
  nearest: (v: unknown[][], f: object, vw: unknown) => { before: { i: number } | null; after: { i: number } | null };
};

export type Round = { probes: number[]; est: Float64Array }; // indices oldest-first; est before the round
export type Search = {
  rounds: Round[];
  final: Float64Array;
  lookups: number;
  found: number[]; // indices oldest-first
  before: number | null; // closest upload before an empty range
  after: number | null; // closest upload after it
};

/**
 * Run the panel's real search on the example channel: lib.js decides which uploads to look up
 * (at most `max` at once), the "lookup" fills in the exact time, repeat until every upload is
 * decided in or out. Returns each round's probes and the estimated positions before it.
 */
export function runSearch(lib: Lib, ch: Channel, f: object, max = 3): Search {
  const n = ch.uploads.length;
  // lib.js wants YouTube's order (newest first) and its record shape.
  const videos = ch.uploads.map((u, i) => [`v${i}`, u.title, 600, 1000, relativeLabel(u.t, ch.now), ch.now, 0, '']).reverse();
  const flip = (i: number) => n - 1 - i;
  const asc = (est: Float64Array) => Float64Array.from({ length: n }, (_, i) => est[flip(i)]);
  const rounds: Round[] = [];
  let lookups = 0;
  for (let guard = 0; guard < 80; guard++) {
    const vw = lib.view(videos);
    const p = lib.probes(videos, f, vw, max);
    if (!p.length) break;
    rounds.push({ probes: p.map(flip).sort((a, b) => a - b), est: asc(vw.est) });
    for (const i of p) videos[i][6] = ch.uploads[flip(i)].t;
    lookups += p.length;
  }
  const vw = lib.view(videos);
  const found = lib.select(videos, f, vw).idx.map(flip).sort((a, b) => a - b);
  const near = found.length ? null : lib.nearest(videos, f, vw);
  const side = (p: { i: number } | null | undefined) => (p ? flip(p.i) : null);
  return { rounds, final: asc(vw.est), lookups, found, before: side(near?.before), after: side(near?.after) };
}
