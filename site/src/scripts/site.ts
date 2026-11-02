// The only scripts on the site: the "Type a date" demo and its grid, the install tabs, and copy
// buttons. The parser, range titles, search and empty-range neighbours are the extension's own
// lib.js; the hint and empty-range wording is the panel's own copy.
import lib from 'virtual:almanac-lib';
import { exampleChannel, runSearch } from '../data/channel';
import { paths, cells, GRID, slotDate, type Mode } from '../data/history';
import { fmt } from '../data/fmt';

const DAY = 864e5;

function demo(root: HTMLElement) {
  const now = Number(root.dataset.now);
  const ch = exampleChannel(now);
  const form = root.querySelector<HTMLFormElement>('[data-demo-form]')!;
  const input = root.querySelector<HTMLInputElement>('#demo-q')!;
  const hint = root.querySelector<HTMLElement>('#demo-hint')!;
  const q = (k: string) => root.querySelector<HTMLElement>(`[data-r-${k}]`)!;
  const title = q('title'), from = q('from'), to = q('to'), count = q('count'), lookups = q('lookups'), note = q('note');
  const svgs = [...root.querySelectorAll<SVGSVGElement>('.history__svg')];
  const total = fmt.count(ch.uploads.length);
  const HINT = 'Try one of these, or your own:';

  function select(list: number[]) {
    const set = new Set(list);
    for (const svg of svgs) {
      const p = paths(ch, svg.dataset.mode as Mode, set.size ? (l) => l.some((i) => set.has(i)) : undefined);
      svg.querySelectorAll<SVGPathElement>('[class^="h-l"]').forEach((el) => el.setAttribute('d', p.levels[+el.getAttribute('class')!.slice(3)]));
      svg.querySelector('[data-sel]')!.setAttribute('d', p.picked);
      svg.classList.toggle('has-sel', set.size > 0);
    }
  }

  function show(t: string, rows: [string, string, string, string], text: string) {
    title.textContent = t;
    [from.textContent, to.textContent, count.textContent, lookups.textContent] = rows;
    note.replaceChildren(text);
  }

  function jump(label: string, t: number, side: string) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'jump';
    const d = new Date(t);
    b.dataset.example = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'long' }).toLowerCase()} ${d.getFullYear()}`;
    b.innerHTML = `<span class="jump__k">${label}</span><span class="jump__v">${fmt.shortDay(t)}</span><span class="jump__s">${side}</span>`;
    return b;
  }

  function run(insist = false) {
    const v = input.value.trim();
    hint.classList.remove('is-bad');
    if (!v) { hint.textContent = 'Try “march 2019”, “last 3 months”, “summer 2021” or “2015-2017”'; return; }
    const f = lib.parseDateQuery(v, new Date(now));
    if (!f) {
      hint.classList.add('is-bad');
      hint.textContent = insist ? 'That isn’t a date this understands yet. Try “march 2019” or “5 mar 2019”.' : 'Keep typing…';
      return;
    }
    hint.textContent = HINT;
    if (f.first) {
      const u = ch.uploads[0];
      show('First upload', [fmt.shortDay(u.t), fmt.time(u.t), '1', '1'], `The channel’s first public upload: “${u.title}”.`);
      return select([0]);
    }
    const s = runSearch(lib, ch, f);
    const rt = lib.rangeTitle(f, new Date(now));
    const day = (iso: string) => fmt.shortDay(new Date(iso + 'T12:00:00').getTime());
    const rows: [string, string, string, string] = f.otd
      ? ['Every year', fmt.shortDay(now).split(' ').slice(1, 3).join(' '), fmt.count(s.found.length), String(s.lookups)]
      : [f.from ? day(f.from) : 'First upload', f.to ? day(f.to) : 'Today', fmt.count(s.found.length), String(s.lookups)];
    const t = rt.sub ? `${rt.title}, ${rt.sub}` : rt.title;
    if (s.found.length) {
      show(t, rows, `${s.lookups} lookups decided every one of the ${total} uploads in or out.`);
    } else {
      show(t, rows, `No uploads in ${rt.title}. `);
      const A = f.from ? new Date(f.from + 'T00:00:00').getTime() : -Infinity;
      const B = f.to ? new Date(f.to + 'T23:59:59').getTime() : Infinity;
      const dist = (ms: number) => {
        const d = Math.max(1, Math.round(ms / DAY));
        return d >= 730 ? fmt.plural(Math.round(d / 365.25), 'year') : d >= 60 ? fmt.plural(Math.round(d / 30.44), 'month') : fmt.plural(d, 'day');
      };
      const near = document.createElement('span');
      near.className = 'demo__near';
      if (s.before != null) near.append(jump('Closest before', ch.uploads[s.before].t, `${dist(A - ch.uploads[s.before].t)} earlier`));
      if (s.after != null) near.append(jump('Closest after', ch.uploads[s.after].t, `${dist(ch.uploads[s.after].t - B)} later`));
      note.append(near);
    }
    select(s.found);
  }

  let timer = 0;
  input.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(() => run(false), 140); });
  form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); run(true); });
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-example]');
    if (!b) return;
    input.value = b.dataset.example!;
    clearTimeout(timer);
    run(true);
    root.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === b));
  });
  root.querySelector(`.chip[data-example="${input.value}"]`)?.classList.add('is-on');

  // The grid: point at (or tap) a day.
  const tip = root.querySelector<HTMLElement>('[data-tip]')!;
  const plots = root.querySelector<HTMLElement>('.history__plots')!;
  const grids = { day: cells(ch, 'day'), week: cells(ch, 'week') };
  for (const svg of svgs) {
    const mode = svg.dataset.mode as Mode;
    const g = GRID[mode];
    const hov = svg.querySelector<SVGRectElement>('[data-hover]')!;
    const hide = () => { tip.classList.remove('is-on'); svg.classList.remove('is-hover'); };
    const move = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const ux = ((e.clientX - r.left) / r.width) * vb.width;
      const uy = ((e.clientY - r.top) / r.height) * vb.height;
      const col = Math.floor(ux / g.pitch), row = Math.floor(uy / g.row);
      const year = grids[mode].years[row];
      if (year == null || col < 0 || col >= g.cols || uy - row * g.row > g.h + 3) return hide();
      const list = grids[mode].counts.get(`${row}:${col}`) || [];
      let label: string;
      if (mode === 'day') {
        const d = slotDate(year, col);
        if (!d) return hide();
        label = fmt.shortDay(d.getTime());
      } else {
        const a = slotDate(year, col * 7) ?? new Date(year, 0, 1 + col * 7);
        label = `Week of ${fmt.shortDay(a.getTime())}`;
      }
      const first = list.length ? ch.uploads[list[0]] : null;
      const b = document.createElement('b');
      b.textContent = `${label}: ${list.length ? fmt.plural(list.length, 'upload') : 'no uploads'}`;
      tip.replaceChildren(b);
      if (first) tip.append(document.createTextNode(`“${first.title}”, ${fmt.time(first.t)}`));
      hov.setAttribute('x', String(col * g.pitch));
      hov.setAttribute('y', String(row * g.row));
      svg.classList.add('is-hover');
      const pr = plots.getBoundingClientRect();
      const w = tip.offsetWidth;
      const x = Math.max(0, Math.min(pr.width - w, e.clientX - pr.left - w / 2));
      tip.style.translate = `${x}px ${(row * g.row * r.height) / vb.height - tip.offsetHeight - 8}px`;
      tip.classList.add('is-on');
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', hide);
  }
}

// Install page: Chromium / Firefox tabs (both panels show without JS).
function tabs(list: HTMLElement) {
  const all = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const pick = (t: HTMLButtonElement, focus = false) => {
    all.forEach((x) => {
      const on = x === t;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute('aria-controls')!)!.hidden = !on;
    });
    if (focus) t.focus();
  };
  list.addEventListener('click', (e) => { const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]'); if (t) pick(t); });
  list.addEventListener('keydown', (e) => {
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const j = e.key === 'ArrowRight' ? (i + 1) % all.length : e.key === 'ArrowLeft' ? (i - 1 + all.length) % all.length : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    pick(all[j], true);
  });
  list.classList.add('is-live');
  pick(all.find((t) => t.getAttribute('aria-selected') === 'true') ?? all[0]);
}

function copy(b: HTMLButtonElement) {
  b.hidden = false;
  b.addEventListener('click', async () => {
    const code = document.getElementById(b.dataset.copy!)?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code.trim());
      b.textContent = 'Copied';
    } catch {
      b.textContent = 'Select and copy';
    }
    setTimeout(() => (b.textContent = 'Copy'), 1800);
  });
}

const demoRoot = document.querySelector<HTMLElement>('[data-demo]');
if (demoRoot) demo(demoRoot);
document.querySelectorAll<HTMLElement>('[role="tablist"]').forEach(tabs);
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(copy);
