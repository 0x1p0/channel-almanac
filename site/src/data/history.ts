// The Whole history grid: every year as one row of 366 day slots (a leap-year calendar, so the
// columns line up across years), the same layout the extension's panel uses. On phones the
// columns are weeks instead of days.
import type { Channel } from './channel';

export const SLOT_START = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
export const slotOf = (d: Date) => SLOT_START[d.getMonth()] + d.getDate() - 1;
export function slotDate(year: number, slot: number) {
  let m = 11;
  while (m > 0 && SLOT_START[m] > slot) m--;
  const d = new Date(year, m, slot - SLOT_START[m] + 1);
  return d.getMonth() === m ? d : null; // 29 Feb in a common year
}

// Desktop geometry (viewBox units) and the phone version.
export const GRID = {
  day: { cols: 366, pitch: 4, cell: 3, row: 24, h: 15 },
  week: { cols: 53, pitch: 8, cell: 6, row: 14, h: 10 },
} as const;
export type Mode = keyof typeof GRID;

export const colOf = (d: Date, mode: Mode) => (mode === 'day' ? slotOf(d) : Math.min(52, Math.floor(slotOf(d) / 7)));

export type Cells = { years: number[]; counts: Map<string, number[]> }; // key `${row}:${col}` → upload indices

export function cells(ch: Channel, mode: Mode): Cells {
  const y0 = new Date(ch.start).getFullYear();
  const y1 = new Date(ch.now).getFullYear();
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
  const counts = new Map<string, number[]>();
  ch.uploads.forEach((u, i) => {
    const d = new Date(u.t);
    const key = `${d.getFullYear() - y0}:${colOf(d, mode)}`;
    const list = counts.get(key);
    if (list) list.push(i); else counts.set(key, [i]);
  });
  return { years, counts };
}

const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;

/** SVG paths: the faint row bands (days that exist and fall inside the channel's life) and one path per level. */
export function paths(ch: Channel, mode: Mode, sel?: (indices: number[]) => boolean) {
  const g = GRID[mode];
  const { years, counts } = cells(ch, mode);
  const start = new Date(ch.start), now = new Date(ch.now);
  let bands = '';
  years.forEach((y, r) => {
    const a = y === start.getFullYear() ? colOf(start, mode) : 0;
    const b = y === now.getFullYear() ? colOf(now, mode) : g.cols - 1;
    bands += rect(a * g.pitch, r * g.row, (b - a) * g.pitch + g.cell, g.h);
  });
  const levels = ['', '', ''];
  let picked = '';
  for (const [key, list] of counts) {
    const [r, c] = key.split(':').map(Number);
    const lv = mode === 'day' ? (list.length > 1 ? 2 : 1) : list.length > 2 ? 2 : list.length > 1 ? 1 : 0;
    const d = rect(c * g.pitch, r * g.row, g.cell, g.h);
    if (sel && sel(list)) picked += d;
    else levels[lv] += d;
  }
  return { bands, levels, picked, width: g.cols * g.pitch - (g.pitch - g.cell), height: years.length * g.row - (g.row - g.h), years };
}
