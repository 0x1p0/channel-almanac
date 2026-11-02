// Channel Date Finder — content script.
// A side panel that lists a channel's uploads by exact date, plus three YouTube-wide helpers:
// exact dates on hover, a Dates chip on channel tabs, and in-order playback of a date range.
// Everything is read from YouTube itself (the same data its own pages load); no API key.

(() => {
  if (window.__cdfLoaded) return;
  window.__cdfLoaded = true;

  const C = CDF;
  const PAGE = 150;                 // rows rendered per "Show more"
  const STALE_MS = 60 * 60 * 1000;  // check for new uploads after an hour
  const CHUNK = 50;                 // YouTube's limit for a temporary playlist
  const TYPES_VERSION = 2;          // bump to re-tag Shorts / Live in saved channels

  // YouTube enforces Trusted Types on its own scripts; use a policy if this world asks for one.
  let tt = null;
  try {
    if (window.trustedTypes && trustedTypes.createPolicy) {
      tt = trustedTypes.createPolicy('channel-date-finder', { createHTML: s => s });
    }
  } catch (e) { /* not required in the extension's isolated world */ }
  const setHTML = (el, s) => { el.innerHTML = tt ? tt.createHTML(s) : s; };

  // Firefox content scripts must use content.fetch to send requests as the page does.
  const pageFetch = (typeof content !== 'undefined' && content && typeof content.fetch === 'function')
    ? content.fetch.bind(content) : window.fetch.bind(window);

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, w) => `${C.fmtCount(n)} ${w}${n === 1 ? '' : 's'}`;
  const compactNum = n => C.fmtViews(n).replace(/ views?$/, '');

  const ICON = {
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V10h16v11zm0-13H4V5h16v3zM6 12h4v4H6z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>',
    tune: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h8v8h-8v-8zm2 2v4h4v-4h-4z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4a5 5 0 0 0 0-10z"/></svg>'
  };

  // Design: an almanac for a channel. One bold element (the year view of upload days, in marigold);
  // everything around it is quiet, text-first and native to YouTube's own surfaces.
  const CSS = `
:host { all: initial; }
:host {
  --bg: #ffffff; --bg-2: #f2f2f2; --bg-3: #e6e6e6; --fg: #0f0f0f; --fg-2: #5c5c5c; --fg-3: #8d8d8d;
  --line: rgba(0,0,0,.09); --line-2: rgba(0,0,0,.18);
  --mark: #f2a516; --mark-ink: #1f1500; --mark-text: #935700; --mark-soft: rgba(242,165,22,.16);
  --h0: #ececec; --h1: #fbe2ac; --h2: #f6c35e; --h3: #ea9c25; --h4: #c47400; --bar-all: #f8d797;
  --danger: #c00; --danger-soft: rgba(204,0,0,.08);
  --shadow: 0 16px 48px rgba(0,0,0,.16), 0 1px 0 rgba(0,0,0,.04);
  --badge-bg: rgba(0,0,0,.78); --badge-fg: #fff; --live: #cc0000;
  --tip-bg: rgba(28,28,28,.95); --tip-fg: #fff;
  --display: "YouTube Sans", "Roboto", "Arial", sans-serif;
  --text: "Roboto", "Arial", sans-serif;
  color-scheme: light;
}
:host([data-theme="dark"]) {
  --bg: #181818; --bg-2: #232323; --bg-3: #2f2f2f; --fg: #f1f1f1; --fg-2: #a8a8a8; --fg-3: #717171;
  --line: rgba(255,255,255,.08); --line-2: rgba(255,255,255,.17);
  --mark: #ffb320; --mark-ink: #1f1500; --mark-text: #ffc24f; --mark-soft: rgba(255,179,32,.15);
  --h0: #262626; --h1: #4a3816; --h2: #7a5713; --h3: #bd8014; --h4: #ffb320; --bar-all: #6b4c12;
  --danger: #ff7b7b; --danger-soft: rgba(255,123,123,.12);
  --shadow: 0 16px 48px rgba(0,0,0,.6);
  --live: #e62117;
  color-scheme: dark;
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
.launch, .drawer, .tip, .qpill { font-family: var(--text); font-size: 14px; line-height: 20px; color: var(--fg); -webkit-font-smoothing: antialiased; }
svg { width: 20px; height: 20px; fill: currentColor; flex: none; }
button { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
p, h2, h3 { margin: 0; }

/* Side tab, only on channel pages without a chip row */
.launch {
  position: fixed; right: 0; top: 50%; transform: translateY(-50%); z-index: 2147483000;
  display: flex; align-items: center; gap: 6px; padding: 8px 14px 8px 10px;
  border: 1px solid var(--line-2); border-right: 0; border-radius: 18px 0 0 18px;
  background: var(--bg); color: var(--fg); font-weight: 500; cursor: pointer; box-shadow: var(--shadow);
}
.launch:hover { background: var(--bg-2); }
.launch:not([hidden]) { animation: cdf-in .18s ease-out; }
@keyframes cdf-in { from { opacity: 0; transform: translate(8px, -50%); } to { opacity: 1; transform: translate(0, -50%); } }

/* Panel */
.drawer {
  position: fixed; top: 56px; right: 0; bottom: 0; width: min(440px, 100vw); z-index: 2147483000;
  background: var(--bg); border-left: 1px solid var(--line); box-shadow: var(--shadow);
  display: flex; flex-direction: column; outline: none;
}
.drawer:not([hidden]) { animation: cdf-drawer .22s cubic-bezier(.2,.8,.2,1); }
@keyframes cdf-drawer { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }

.top { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 14px 10px 12px 16px; }
.avatar { width: 38px; height: 38px; border-radius: 50%; overflow: hidden; background: var(--bg-3); display: grid; place-items: center; font: 600 16px/1 var(--display); color: var(--fg-2); flex: none; }
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.who { min-width: 0; display: flex; flex-direction: column; }
.name { font: 600 17px/22px var(--display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -.005em; }
.sub { font-size: 12px; line-height: 16px; color: var(--fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.hd-acts { display: flex; gap: 2px; }
.icon { width: 36px; height: 36px; border-radius: 50%; border: 0; background: none; color: var(--fg); display: grid; place-items: center; cursor: pointer; }
.icon:hover { background: var(--bg-2); }
.icon:disabled { color: var(--fg-3); cursor: default; background: none; }
.icon.sm { width: 30px; height: 30px; }
.icon.sm svg { width: 18px; height: 18px; }
.icon.spinning svg { animation: cdf-spin 1s linear infinite; }
@keyframes cdf-spin { to { transform: rotate(360deg); } }
.hd-progress { position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--line); overflow: hidden; }
.hd-progress i { display: block; height: 100%; width: 0; background: var(--mark); transition: width .4s ease; }

.tabs { display: flex; gap: 22px; padding: 0 16px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tab { background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 0 9px; color: var(--fg-2); font-weight: 500; font-size: 14px; cursor: pointer; white-space: nowrap; display: inline-flex; gap: 6px; align-items: baseline; }
.tab:hover { color: var(--fg); }
.tab[aria-pressed="true"] { color: var(--fg); border-bottom-color: var(--fg); }
.tab .n { font-size: 12px; font-weight: 400; color: var(--fg-3); font-variant-numeric: tabular-nums; }
.tabs-note { font-size: 12px; color: var(--fg-3); padding: 9px 0 10px; }

.body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px 40px; scrollbar-width: thin; }

.banner { margin-top: 14px; background: var(--danger-soft); padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 18px; }

/* The readout */
.hero { padding: 20px 0 4px; }
.r-title { font: 700 30px/34px var(--display); letter-spacing: -.015em; text-wrap: balance; font-variant-numeric: tabular-nums; }
.r-count { margin-top: 6px; font-size: 14px; color: var(--fg-2); font-variant-numeric: tabular-nums; }
.r-count b { color: var(--fg); font-weight: 500; }
.r-pending { margin-top: 4px; font-size: 12px; color: var(--fg-3); display: flex; align-items: center; gap: 6px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--mark); animation: cdf-pulse 1s ease-in-out infinite; }
@keyframes cdf-pulse { 50% { opacity: .25; } }
.r-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.r-head .r-title { flex: 1; min-width: 0; }
.r-head .edit-btn { margin: -2px -6px 0 0; }
.picks { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin-top: 14px; }
.picks.fade { -webkit-mask-image: linear-gradient(90deg, #000 82%, transparent); mask-image: linear-gradient(90deg, #000 82%, transparent); }
.picks::-webkit-scrollbar { display: none; }
.pick { flex: none; height: 30px; padding: 0 11px; border-radius: 15px; border: 1px solid var(--line-2); background: transparent; color: var(--fg); font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.pick:hover { background: var(--bg-2); }
.pick.on { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.edit-btn { flex: none; }
.edit-btn[aria-expanded="true"] { background: var(--bg-2); }
.r-edit { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field > span { font-size: 12px; line-height: 16px; color: var(--fg-2); }
input, select { font: inherit; color: var(--fg); }
input[type="date"], input[type="search"] { height: 38px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--bg); padding: 0 10px; width: 100%; min-width: 0; }
input:focus { outline: none; border-color: var(--fg-2); }
input::placeholder { color: var(--fg-3); }

/* Timeline */
.timeline { margin-top: 22px; }
.tl-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px; margin-bottom: 10px; }
.tl-title { font-size: 13px; font-weight: 500; color: var(--fg-2); }
.hint { font-size: 12px; color: var(--fg-3); }
.yr-nav { display: flex; align-items: center; gap: 2px; margin-left: -8px; }
.yr { font: 700 20px/24px var(--display); min-width: 52px; text-align: center; font-variant-numeric: tabular-nums; }
.link-btn { background: none; border: 0; padding: 4px 8px; margin: -4px -8px; border-radius: 8px; color: var(--fg); font-size: 13px; font-weight: 500; cursor: pointer; text-decoration: underline; text-decoration-color: var(--line-2); text-underline-offset: 3px; white-space: nowrap; }
.link-btn:hover { text-decoration-color: currentColor; }
.bars { display: flex; align-items: stretch; gap: 3px; height: 84px; }
.bar { flex: 1 1 0; min-width: 0; border: 0; background: none; padding: 0; cursor: pointer; display: flex; flex-direction: column; gap: 5px; }
.col { flex: 1; display: flex; align-items: flex-end; border-radius: 4px; }
.fill { display: block; width: 100%; height: 0; background: var(--bg-3); border-radius: 4px 4px 2px 2px; transition: background .12s; }
.bar:hover .fill { background: var(--fg-3); }
.bars.all .fill { background: var(--bar-all); }
.bars.all .bar:hover .fill { background: var(--h3); }
.bar.in .fill { background: var(--mark); }
.lbl { font-size: 10px; line-height: 12px; color: var(--fg-3); text-align: center; white-space: nowrap; overflow: hidden; font-variant-numeric: tabular-nums; }
.bar.in .lbl { color: var(--fg); font-weight: 500; }

.months { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px 12px; }
.mo { min-width: 0; }
.mo-h { width: 100%; display: flex; justify-content: space-between; align-items: baseline; gap: 4px; background: none; border: 0; padding: 0 0 5px; cursor: pointer; font-size: 12px; font-weight: 500; color: var(--fg); }
.mo-h .n { font-size: 11px; font-weight: 400; color: var(--fg-3); font-variant-numeric: tabular-nums; }
.mo-h:hover span:first-child { text-decoration: underline; text-underline-offset: 3px; }
.mo-h.on span:first-child { color: var(--mark-text); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }
.days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.cd { aspect-ratio: 1; min-width: 0; border: 0; padding: 0; border-radius: 3px; background: var(--h0); cursor: pointer; display: block; }
.cd.l1 { background: var(--h1); } .cd.l2 { background: var(--h2); } .cd.l3 { background: var(--h3); } .cd.l4 { background: var(--h4); }
.cd.ap { opacity: .45; }
.cd.in { box-shadow: 0 0 0 1.5px var(--fg); }
.cd:hover { box-shadow: 0 0 0 1.5px var(--fg-2); }
.cd-pad { aspect-ratio: 1; }
.tl-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px 14px; flex-wrap: wrap; margin-top: 12px; font-size: 12px; color: var(--fg-3); }
.legend { display: inline-flex; align-items: center; gap: 3px; }
.legend .cd { width: 10px; height: 10px; cursor: default; }
.legend .cd:hover { box-shadow: none; }
.tl-note { display: inline-flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }

/* Filters and actions */
.filters { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--line); }
.search { position: relative; }
.search svg { position: absolute; left: 12px; top: 9px; color: var(--fg-3); pointer-events: none; }
.search input { padding-left: 40px; border-radius: 19px; background: var(--bg-2); border-color: transparent; }
.search input:focus { background: var(--bg); border-color: var(--fg-2); }
.toolbar { display: flex; align-items: center; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.grow { flex: 1; }
.sel { position: relative; display: inline-flex; }
.sel select { appearance: none; -webkit-appearance: none; height: 32px; padding: 0 30px 0 12px; border-radius: 16px; border: 1px solid var(--line-2); background: transparent; font-size: 13px; font-weight: 500; cursor: pointer; }
.sel select:hover { background: var(--bg-2); }
.sel select:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
.sel option { background: var(--bg); color: var(--fg); }
.sel svg { position: absolute; right: 8px; top: 7px; width: 18px; height: 18px; pointer-events: none; color: var(--fg-2); }
.play { height: 32px; padding: 0 14px 0 10px; border-radius: 16px; border: 0; background: var(--mark); color: var(--mark-ink); font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.play svg { width: 18px; height: 18px; }
.play:hover { filter: brightness(1.06); }
.play:disabled { background: var(--bg-2); color: var(--fg-3); cursor: default; filter: none; }
.copied { font-size: 12px; color: var(--fg-2); }

.insights { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; margin-top: 18px; }
.ins { min-width: 0; }
.ins .v { display: block; font: 600 18px/22px var(--display); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ins .k { display: block; font-size: 12px; line-height: 16px; color: var(--fg-2); }

/* Results */
.list { margin-top: 10px; }
.grp { position: sticky; top: 0; z-index: 1; background: var(--bg); display: flex; justify-content: space-between; align-items: baseline; padding: 16px 0 6px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
.grp span:first-child { font: 600 15px/20px var(--display); }
.grp .n { font-size: 12px; color: var(--fg-3); font-variant-numeric: tabular-nums; }
.row { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 12px; padding: 8px; margin: 0 -8px; border-radius: 10px; color: inherit; text-decoration: none; }
.row:hover { background: var(--bg-2); }
.thumb { position: relative; display: block; aspect-ratio: 16 / 9; max-width: 100%; border-radius: 8px; overflow: hidden; background: var(--bg-3); }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.badge { position: absolute; right: 4px; bottom: 4px; background: var(--badge-bg); color: var(--badge-fg); font-size: 12px; line-height: 16px; font-weight: 500; padding: 1px 4px; border-radius: 4px; font-variant-numeric: tabular-nums; }
.badge.live, .badge.up { background: var(--live); }
.info { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.title { font-weight: 500; line-height: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.when, .views { font-size: 12px; line-height: 16px; color: var(--fg-2); font-variant-numeric: tabular-nums; }
.when.approx { color: var(--fg-3); }
.so { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 4px; background: var(--mark-soft); color: var(--mark-text); font-size: 11px; font-weight: 600; line-height: 16px; }
.more { display: block; margin: 14px auto 0; height: 34px; padding: 0 16px; border-radius: 17px; border: 1px solid var(--line-2); background: transparent; font-size: 13px; font-weight: 500; cursor: pointer; }
.more:hover { background: var(--bg-2); }

.empty { padding: 28px 0 8px; }
.e-title { font: 600 17px/22px var(--display); }
.e-sub { margin-top: 6px; font-size: 13px; color: var(--fg-2); }
.near { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
.near.one { grid-template-columns: 1fr; }
.jump { text-align: left; border: 1px solid var(--line-2); background: transparent; border-radius: 12px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.jump:hover { background: var(--bg-2); }
.j-k { font-size: 12px; color: var(--fg-2); }
.j-v { font: 600 15px/20px var(--display); font-variant-numeric: tabular-nums; }
.j-s { font-size: 12px; color: var(--fg-3); }
.e-acts { margin-top: 16px; }

/* Other views */
.state { display: flex; flex-direction: column; gap: 12px; padding-top: 24px; }
.s-title { font: 700 22px/28px var(--display); letter-spacing: -.01em; }
.muted { color: var(--fg-2); }
.fine { font-size: 12px; line-height: 17px; color: var(--fg-2); }
.track { height: 4px; background: var(--bg-2); border-radius: 2px; overflow: hidden; }
.track .run { display: block; height: 100%; width: 0; background: var(--mark); transition: width .25s ease; }
.track.indet .run { width: 30%; animation: cdf-slide 1.1s ease-in-out infinite; }
@keyframes cdf-slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
.l-sub { color: var(--fg-2); font-size: 13px; font-variant-numeric: tabular-nums; }
.btns { display: flex; gap: 8px; flex-wrap: wrap; }
.primary, .secondary { height: 36px; padding: 0 16px; border-radius: 18px; border: 0; font-weight: 500; cursor: pointer; white-space: nowrap; }
.primary { background: var(--fg); color: var(--bg); }
.secondary { background: var(--bg-2); color: var(--fg); }
.secondary:hover { background: var(--bg-3); }
.txt { background: none; border: 0; padding: 4px 6px; margin: -4px -6px; color: var(--fg); font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; }
.txt svg { width: 18px; height: 18px; }
.txt:hover { background: var(--bg-2); }
.txt.danger { color: var(--danger); }
.set { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; padding: 18px 0; border-bottom: 1px solid var(--line); }
.set:last-child { border-bottom: 0; }
.set h3 { font: 600 16px/22px var(--display); }
.back { margin-top: 14px; }
.toggle { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; line-height: 20px; }
.toggle input { width: 18px; height: 18px; margin: 1px 0 0; flex: none; accent-color: var(--mark); }
.recents { display: flex; flex-direction: column; margin: 4px -8px 0; }
.recents-title { font-size: 13px; color: var(--fg-2); font-weight: 500; }
.recent { display: flex; justify-content: space-between; gap: 12px; padding: 9px 8px; border-radius: 10px; color: inherit; text-decoration: none; }
.recent:hover { background: var(--bg-2); }
.recent b { font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent span { color: var(--fg-3); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* Hover dates and the play queue pill */
.tip {
  position: fixed; z-index: 2147483002; pointer-events: none; max-width: 320px;
  background: var(--tip-bg); color: var(--tip-fg); font-size: 12px; line-height: 16px; font-weight: 500;
  padding: 6px 9px; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.25); white-space: nowrap;
}
.tip strong { font-weight: 600; }
.tip .t { font-weight: 400; opacity: .8; }
.qpill {
  position: fixed; left: max(16px, env(safe-area-inset-left, 0px)); bottom: max(16px, env(safe-area-inset-bottom, 0px)); z-index: 2147483000;
  display: flex; align-items: center; gap: 12px; padding: 6px 8px 6px 12px; border-radius: 20px;
  background: var(--bg); color: var(--fg); border: 1px solid var(--line-2); box-shadow: var(--shadow); font-size: 13px; line-height: 18px;
}
.qpill .ql { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
.qpill .ql svg { width: 16px; height: 16px; color: var(--mark-text); }
.qpill .qp { color: var(--fg-2); font-variant-numeric: tabular-nums; }
.qpill button { background: none; border: 0; color: var(--fg); font: inherit; font-weight: 500; cursor: pointer; padding: 4px 8px; border-radius: 12px; }
.qpill button:hover { background: var(--bg-2); }


/* Click the date to type one */
.r-title-btn { all: unset; box-sizing: border-box; display: inline-block; max-width: 100%; cursor: text; border-radius: 8px; padding: 0 6px; margin: 0 -6px; }
.r-title-btn:hover { background: var(--bg-2); }
.r-title-btn:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
.r-typing { flex: 1; min-width: 0; }
.r-input { width: 100%; height: 38px; border: 0; border-bottom: 2px solid var(--mark); background: transparent; color: var(--fg); padding: 0; border-radius: 0; font: 700 24px/34px var(--display); letter-spacing: -.01em; }
.r-input:focus { outline: none; }
.r-input::placeholder { color: var(--fg-3); font-weight: 600; }
.r-hint { margin-top: 6px; font-size: 13px; line-height: 18px; color: var(--fg-2); min-height: 18px; }
.r-hint b { color: var(--fg); font-weight: 500; }
.r-hint.bad { color: var(--fg-3); }
.num { font-variant-numeric: tabular-nums; }

/* The one transition: a range change */
.swap { animation: cdf-swap .26s cubic-bezier(.2,.8,.2,1); }
@keyframes cdf-swap { from { opacity: .15; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.list.enter { animation: cdf-fade .24s ease-out; }
@keyframes cdf-fade { from { opacity: 0; } to { opacity: 1; } }

/* Drag across days or years */
.months, .bars { user-select: none; -webkit-user-select: none; }
.days { touch-action: none; }
.cd { position: relative; }
.cd.sel { box-shadow: 0 0 0 1.5px var(--mark); }
.cd.sel.l0 { background: var(--mark-soft); }
.bar.sel .col { background: var(--mark-soft); }
.bar.sel .fill { background: var(--h3); }
.drawer.dragging, .drawer.dragging * { cursor: crosshair !important; }

/* Milestones */
.col { position: relative; }
.pin { position: absolute; left: 50%; top: 0; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 50%; background: var(--fg); }
.cd.ms::after { content: ""; position: absolute; inset: 32%; border-radius: 50%; background: var(--fg); }
.miles { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin-top: 16px; padding-bottom: 2px; }
.miles::-webkit-scrollbar { display: none; }
.mile { flex: none; text-align: left; border: 1px solid var(--line-2); background: transparent; border-radius: 10px; padding: 6px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 1px; }
.mile:hover { background: var(--bg-2); }
.mile .mk { font-size: 11px; line-height: 14px; color: var(--fg-2); white-space: nowrap; }
.mile .mv { font: 600 13px/18px var(--display); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tl-links { display: flex; gap: 16px; align-items: center; }

/* Highlighted and opened videos */
.row.hl, .row.hl:hover { background: var(--mark-soft); }
.hl-tag { align-self: flex-start; padding: 0 6px; border-radius: 4px; background: var(--mark); color: var(--mark-ink); font-size: 11px; font-weight: 600; line-height: 16px; }
.seen-tag { position: absolute; left: 4px; top: 4px; background: var(--badge-bg); color: var(--badge-fg); font-size: 11px; line-height: 16px; font-weight: 500; padding: 0 5px; border-radius: 4px; }
.row.seen .thumb img { opacity: .55; }
.row.seen .title { color: var(--fg-2); }

/* Grid view */
.icon[aria-pressed="true"] { background: var(--bg-2); }
.list.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); column-gap: 12px; row-gap: 2px; align-items: start; }
.list.grid .grp, .list.grid .empty { grid-column: 1 / -1; }
.list.grid .row { display: flex; flex-direction: column; gap: 8px; padding: 6px; margin: 0 -6px; }
.list.grid .thumb { width: 100%; }

/* Resize handle on the panel's left edge */
.resizer { position: absolute; left: -5px; top: 0; bottom: 0; width: 10px; cursor: col-resize; z-index: 3; touch-action: none; }
.resizer::after { content: ""; position: absolute; left: 4px; top: 0; bottom: 0; width: 2px; background: transparent; transition: background .12s; }
.resizer:hover::after, .resizer.on::after, .resizer:focus-visible::after { background: var(--mark); }
.resizer:focus-visible { outline: none; }
.drawer.resizing, .drawer.resizing * { user-select: none; cursor: col-resize !important; }

/* Keyboard shortcuts */
.keys-ov { position: absolute; inset: 0; z-index: 5; background: var(--bg); padding: 18px 16px 24px; overflow-y: auto; }
.keys-ov .kh { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.keys-ov h3 { font: 700 20px/26px var(--display); letter-spacing: -.01em; }
.keys-ov dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px 16px; margin: 0; align-items: baseline; }
.keys-ov dt { white-space: nowrap; display: flex; gap: 4px; }
.keys-ov dd { margin: 0; color: var(--fg-2); }
.keys-ov .fine { margin-top: 18px; }
kbd { display: inline-block; min-width: 22px; padding: 0 6px; border-radius: 6px; border: 1px solid var(--line-2); border-bottom-width: 2px; background: var(--bg-2); color: var(--fg); font: 500 12px/20px var(--text); text-align: center; }

/* Whole history */
.hist-ov { position: fixed; inset: 0; z-index: 2147483001; background: var(--bg); color: var(--fg); display: flex; flex-direction: column; font-family: var(--text); font-size: 14px; line-height: 20px; -webkit-font-smoothing: antialiased; outline: none; }
.hist-ov:not([hidden]) { animation: cdf-fade .2s ease-out; }
.ho-top { display: flex; align-items: center; gap: 14px; padding-block: 14px 12px; padding-left: max(24px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); border-bottom: 1px solid var(--line); }
.ho-title { font: 700 22px/28px var(--display); letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ho-sub { font-size: 13px; color: var(--fg-2); font-variant-numeric: tabular-nums; }
.ho-acts { margin-left: auto; display: flex; align-items: center; gap: 14px; }
.ho-note { font-size: 12px; color: var(--fg-3); text-align: right; }
.ho-body { flex: 1; overflow: auto; padding-block: 18px 12px; padding-left: max(24px, env(safe-area-inset-left, 0px)); padding-right: max(24px, env(safe-area-inset-right, 0px)); }
.ho-body canvas { display: block; touch-action: none; cursor: crosshair; }
.ho-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px 16px; flex-wrap: wrap; padding-block: 10px 14px; padding-left: max(24px, env(safe-area-inset-left, 0px)); padding-right: max(24px, env(safe-area-inset-right, 0px)); border-top: 1px solid var(--line); font-size: 12px; color: var(--fg-3); }
.tip .tl2 { display: block; max-width: 300px; overflow: hidden; text-overflow: ellipsis; font-weight: 400; opacity: .8; margin-top: 2px; }

@media (prefers-reduced-motion: reduce) {
  .launch:not([hidden]), .drawer:not([hidden]), .dot, .icon.spinning svg, .track.indet .run, .swap, .list.enter, .hist-ov:not([hidden]) { animation: none; }
  .track .run, .hd-progress i, .fill, .resizer::after { transition: none; }
}
`;
  const CSS_EXTRA = '';

  // ---------- state ----------

  const defaultFilters = () => ({ from: '', to: '', q: '', len: 'any', sort: 'new', type: 'all', otd: false });

  const S = {
    open: false,
    view: 'idle',
    ref: null,
    refK: '',
    channel: null,
    channelRefK: '',
    entry: null,       // { channel, syncedAt, typed, videos }
    videos: [],
    byId: new Map(),
    scores: new Float32Array(0),
    current: [],
    lastPending: 0,
    filters: defaultFilters(),
    shown: PAGE,
    syncing: new Set(),
    typing: new Set(),
    refining: false,
    fillAt: 0,
    focusYear: null,
    editOpen: false,
    chipShown: false,
    noChipSince: Date.now(), // when this page was last seen without a chip bar
    pendingHash: null,
    highlight: null,     // { id, label } for a video picked from a milestone or First video
    scrollToHl: false,
    around: null,        // { id, t, span } for the video being watched
    aroundActive: false, // the range is still the one around that video
    aroundReq: false,
    videoInfo: null,
    animate: false,
    lastCount: null,
    historyOpen: false,
    histSel: null,
    keysOpen: false,
    dateEditing: false,
    drag: null,
    suppressClick: false,
    progress: null,
    status: '',
    banner: null,
    fatal: null,
    loadSeq: 0
  };
  const opts = { hover: true, fill: false, view: 'list', width: 440, marks: true };

  const ss = {
    get(k) { try { return JSON.parse(sessionStorage.getItem('cdf:' + k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem('cdf:' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };

  async function storageGet(key) {
    try { return (await chrome.storage.local.get(key))[key]; } catch (e) { return undefined; }
  }
  function storageSet(obj) {
    try { return chrome.storage.local.set(obj).catch(() => {}); } catch (e) { return Promise.resolve(); }
  }

  // Videos opened on YouTube (watch pages visited) get a small mark in the list. Kept in this browser only.
  const opened = new Set();
  let openedTimer = 0;
  function markOpened(id) {
    if (!id || opened.has(id)) return;
    opened.add(id);
    clearTimeout(openedTimer);
    openedTimer = setTimeout(async () => {
      const stored = await storageGet('opened');
      let ids = [...new Set([...(Array.isArray(stored) ? stored : []), ...opened])];
      if (ids.length > 10000) ids = ids.slice(-10000);
      opened.clear();
      ids.forEach(x => opened.add(x));
      storageSet({ opened: ids });
    }, 1000);
  }

  const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Day/month order for typed numeric dates like 05/03/2019.
  const mdFirst = /^en-US$/i.test(navigator.language || '');

  // Filters as applied: the type filter only means something once uploads are tagged.
  const fx = () => (S.entry && S.entry.typed ? S.filters : Object.assign({}, S.filters, { type: 'all' }));

  // ---------- talking to YouTube ----------

  // The same internal endpoints youtube.com uses for its own pages, called from the page's origin.
  // Requests go out signed out (no cookies, no visitor id), so nothing is tied to the user's Google account.
  const YT = {
    cfg: null,
    config() {
      if (this.cfg) return this.cfg;
      let key = '', ver = '', visitor = '';
      for (const s of document.scripts) {
        const t = s.textContent;
        if (!t || t.indexOf('INNERTUBE_') < 0) continue;
        key = key || (/"INNERTUBE_API_KEY":"([^"]+)"/.exec(t) || [])[1] || '';
        ver = ver || (/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(t) || [])[1] || '';
        visitor = visitor || (/"VISITOR_DATA":"([^"]+)"/.exec(t) || [])[1] || '';
        if (key && ver && visitor) break;
      }
      this.cfg = { key, ver: ver || '2.20241101.01.00', visitor };
      return this.cfg;
    },
    async call(endpoint, payload, fieldMask) {
      const c = this.config();
      const client = { clientName: 'WEB', clientVersion: c.ver, hl: 'en', gl: 'US' };
      const headers = { 'Content-Type': 'application/json', 'X-Youtube-Client-Name': '1', 'X-Youtube-Client-Version': c.ver };
      if (fieldMask) headers['X-Goog-FieldMask'] = fieldMask;
      const url = `/youtubei/v1/${endpoint}?prettyPrint=false${c.key ? '&key=' + encodeURIComponent(c.key) : ''}`;
      let res;
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 20000) : 0; // never wait forever on one request
      try {
        res = await pageFetch(url, { method: 'POST', headers, credentials: 'omit', signal: ctl ? ctl.signal : undefined, body: JSON.stringify(Object.assign({ context: { client } }, payload)) });
      } catch (e) {
        throw { code: 'network' };
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 429) throw { code: 'rate' };
      if (!res.ok) throw { code: 'http', status: res.status };
      return res.json();
    }
  };

  // Exact publish time for one video. Several sources, tried in turn; the one that last worked goes first.
  const MASK = [
    'videoDetails.channelId', 'videoDetails.author',
    'microformat.playerMicroformatRenderer.publishDate', 'microformat.playerMicroformatRenderer.uploadDate',
    'microformat.playerMicroformatRenderer.externalChannelId', 'microformat.playerMicroformatRenderer.ownerChannelName'
  ].join(',');
  const METHODS = [
    async id => C.videoFromPlayer(await YT.call('player', { videoId: id }, MASK)),
    async id => C.videoFromPlayer(await YT.call('player', { videoId: id })),
    async id => C.videoFromNext(await YT.call('next', { videoId: id })),
    async id => {
      let res;
      try { res = await pageFetch(`/watch?v=${id}&hl=en`, { credentials: 'omit' }); } catch (e) { throw { code: 'network' }; }
      if (res.status === 429) throw { code: 'rate' };
      if (!res.ok) throw { code: 'http', status: res.status };
      return C.videoFromHtml(await res.text());
    }
  ];
  let method = 0;

  async function lookupVideo(id, need) {
    let lastErr = null;
    for (let k = 0; k < METHODS.length; k++) {
      const m = (method + k) % METHODS.length;
      try {
        const info = await METHODS[m](id);
        if (need === 'channel' ? info.channelId : info.t > 0) {
          if (need !== 'channel') method = m;
          return info;
        }
      } catch (e) {
        if (e && e.code === 'rate') throw e;
        lastErr = e;
      }
    }
    throw lastErr || { code: 'nodate' };
  }

  // Dates looked up for hover tooltips outside the open channel are kept per video.
  const dateCache = new Map();
  async function knownDate(id) {
    if (dateCache.has(id)) return dateCache.get(id);
    const rec = S.byId.get(id);
    if (rec && rec[6] > 0) return { t: rec[6], d: (rec[7] || '').includes('D') };
    const stored = await storageGet('d:' + id);
    if (stored && stored.t) { dateCache.set(id, stored); return stored; }
    return null;
  }
  function rememberDate(id, t, d) {
    const v = { t, d: !!d };
    dateCache.set(id, v);
    storageSet({ ['d:' + id]: v });
  }

  // ---------- exact-date queue ----------
  // Priority 2: range edges, rows on screen, hover. 1: the year shown in the calendar. 0: background fill.

  // Pacing: up to 3 lookups at once and at least 150 ms between starts; calendar and background lookups
  // go one at a time with 600 ms between them (under 2 a second).
  const Q = { high: [], mid: [], low: [], busy: 0, lowBusy: 0, max: 3, lowMax: 1, nextAt: 0, pausedUntil: 0, jobs: new Map(), timer: 0 };
  const GAP_HIGH = 150, GAP_LOW = 600;
  const listFor = p => (p === 2 ? Q.high : p === 1 ? Q.mid : Q.low);

  function enqueue(rec, entry, pri) {
    const id = rec[0];
    let job = Q.jobs.get(id);
    if (job) {
      if (pri > job.pri && !job.started) {
        const list = listFor(job.pri);
        const i = list.indexOf(job);
        if (i >= 0) list.splice(i, 1);
        job.pri = pri;
        listFor(pri).push(job);
      }
      return job.promise;
    }
    job = { rec, entry, pri, started: false };
    job.promise = new Promise(r => { job.resolve = r; });
    Q.jobs.set(id, job);
    listFor(pri).push(job);
    return job.promise;
  }

  function want(rec, entry, pri) {
    const p = enqueue(rec, entry, pri);
    pump();
    return p;
  }

  function topUpFill() {
    if (!opts.fill || !S.open || S.view !== 'main' || !S.entry || Q.low.length >= 6) return;
    const vids = S.videos;
    let added = 0;
    while (S.fillAt < vids.length && added < 12) {
      const r = vids[S.fillAt++];
      if (r[6] === 0 && !Q.jobs.has(r[0])) { enqueue(r, S.entry, 0); added++; }
    }
  }

  function pump() {
    const now = Date.now();
    if (now < Q.pausedUntil) {
      clearTimeout(Q.timer);
      Q.timer = setTimeout(pump, Q.pausedUntil - now + 50);
      return;
    }
    topUpFill();
    while (Q.busy < Q.max) {
      if (!Q.high.length && !(Q.lowBusy < Q.lowMax && (Q.mid.length || Q.low.length))) break;
      const wait = Q.nextAt - Date.now();
      if (wait > 0) {
        clearTimeout(Q.timer);
        Q.timer = setTimeout(pump, wait);
        break;
      }
      let job = Q.high.shift();
      if (!job) job = Q.mid.shift() || Q.low.shift();
      Q.nextAt = Date.now() + (job.pri === 2 ? GAP_HIGH : GAP_LOW);
      run(job);
    }
  }

  async function run(job) {
    const low = job.pri < 2;
    job.started = true;
    Q.busy++;
    if (low) Q.lowBusy++;
    const rec = job.rec;
    let requeue = false;
    try {
      const info = await lookupVideo(rec[0], 't');
      rec[6] = info.t;
      setFlag(rec, 'D', info.dateOnly);
      if (info.t > Date.now() + 60000) setFlag(rec, 'U', true);
      if (job.entry) markDirty(job.entry);
      else rememberDate(rec[0], info.t, info.dateOnly);
      // A hover lookup can also fill the open channel's copy of the same video.
      const twin = S.byId.get(rec[0]);
      if (twin && twin !== rec && !(twin[6] > 0)) {
        twin[6] = info.t;
        setFlag(twin, 'D', info.dateOnly);
        markDirty(S.entry);
        onDate(twin);
      }
    } catch (e) {
      if (e && e.code === 'rate') {
        requeue = true;
        Q.pausedUntil = Date.now() + 60000;
      } else {
        rec[6] = -1;
      }
    }
    Q.busy--;
    if (low) Q.lowBusy--;
    if (requeue) {
      job.started = false;
      listFor(job.pri).unshift(job);
      scheduleRefresh();
    } else {
      Q.jobs.delete(rec[0]);
      job.resolve();
      onDate(rec);
    }
    pump();
  }

  function dropForeignJobs() {
    const keep = j => j.entry === S.entry || j.entry === null;
    for (const list of [Q.high, Q.mid, Q.low]) {
      for (const j of list) if (!keep(j)) { Q.jobs.delete(j.rec[0]); j.resolve(); }
    }
    Q.high = Q.high.filter(keep);
    Q.mid = Q.mid.filter(keep);
    Q.low = Q.low.filter(keep);
  }

  function setFlag(rec, f, on) {
    const has = (rec[7] || '').includes(f);
    if (on && !has) rec[7] = (rec[7] || '') + f;
    if (!on && has) rec[7] = rec[7].replace(f, '');
  }

  // ---------- saving ----------

  const dirty = new Set();
  let saveTimer = 0;

  function markDirty(entry) {
    if (!entry) return;
    dirty.add(entry);
    if (!saveTimer) saveTimer = setTimeout(flush, 3000);
  }

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    for (const e of dirty) saveEntry(e);
    dirty.clear();
  }

  // Saves run one after another: each one reads, changes and writes the shared channel index,
  // so two at once would lose one channel's line.
  let saveChain = Promise.resolve();
  const discarded = new WeakSet(); // entries dropped by "Clear all saved data"
  function saveEntry(entry) {
    saveChain = saveChain.then(() => writeEntry(entry), () => writeEntry(entry));
    return saveChain;
  }

  async function writeEntry(entry) {
    if (discarded.has(entry)) return;
    const videos = entry.videos.map(r => (r[6] === -1 ? r.slice(0, 6).concat(0, r[7]) : r));
    const idx = (await storageGet('idx')) || {};
    idx[entry.channel.id] = { title: entry.channel.title, count: videos.length, syncedAt: entry.syncedAt };
    await storageSet({ ['up:' + entry.channel.id]: { channel: entry.channel, syncedAt: entry.syncedAt, typed: entry.typed ? TYPES_VERSION : 0, videos }, idx });
  }

  window.addEventListener('pagehide', flush);

  // ---------- DOM ----------

  const host = document.createElement('div');
  host.id = 'channel-date-finder';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS + CSS_EXTRA;
  root.appendChild(style);
  const shell = document.createElement('div');
  setHTML(shell, `
    <button class="launch" data-act="open" hidden aria-label="Browse this channel's uploads by date" title="Browse uploads by date (Alt+Shift+D)">${ICON.cal}<span>Dates</span></button>
    <aside class="drawer" role="dialog" aria-label="Uploads by date" tabindex="-1" hidden>
      <div class="resizer" id="resizer" role="separator" aria-orientation="vertical" aria-label="Resize panel" tabindex="0" title="Drag to resize · double-click to reset"></div>
      <header class="top">
        <span class="avatar" id="chAvatar" aria-hidden="true"></span>
        <div class="who"><strong class="name" id="chName">Channel Date Finder</strong><span class="sub" id="chSub"></span></div>
        <div class="hd-acts">
          <button class="icon" data-act="refresh" id="refreshBtn" title="Check for new uploads" aria-label="Check for new uploads" hidden>${ICON.refresh}</button>
          <button class="icon" data-act="settings" aria-label="Settings" title="Settings">${ICON.tune}</button>
          <button class="icon" data-act="close" aria-label="Close" title="Close (Esc)">${ICON.close}</button>
        </div>
        <span class="hd-progress" id="hdProgress" hidden><i></i></span>
      </header>
      <nav class="tabs" id="types" aria-label="Upload type" hidden></nav>
      <div class="body" id="body"></div>
      <div class="keys-ov" id="keysOv" role="dialog" aria-label="Keyboard shortcuts" hidden>
        <div class="kh"><h3>Keyboard shortcuts</h3><button class="icon sm" data-act="keys" aria-label="Close shortcuts">${ICON.close}</button></div>
        <dl>
          <dt><kbd>D</kbd></dt><dd>Type a date, like “march 2019” or “last summer”</dd>
          <dt><kbd>[</kbd><kbd>]</kbd></dt><dd>Previous or next day, month, year or range</dd>
          <dt><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd></dt><dd>Move between days, months or years in the timeline</dd>
          <dt><kbd>Enter</kbd></dt><dd>Pick the focused day, or open the focused video</dd>
          <dt><kbd>J</kbd><kbd>K</kbd></dt><dd>Next or previous video in the list</dd>
          <dt><kbd>/</kbd></dt><dd>Search titles</dd>
          <dt><kbd>G</kbd></dt><dd>Switch between list and grid</dd>
          <dt><kbd>H</kbd></dt><dd>Whole history</dd>
          <dt><kbd>Esc</kbd></dt><dd>Close</dd>
          <dt><kbd>?</kbd></dt><dd>Show this list</dd>
        </dl>
        <p class="fine">Drag across days or years to pick a range. Alt+Shift+D opens the panel anywhere on YouTube.</p>
      </div>
    </aside>
    <div class="hist-ov" id="histOv" role="dialog" aria-modal="true" aria-label="Whole history" tabindex="-1" hidden>
      <header class="ho-top">
        <span class="avatar" id="hoAvatar" aria-hidden="true"></span>
        <div class="who"><strong class="ho-title" id="hoTitle"></strong><span class="ho-sub" id="hoSub"></span></div>
        <div class="ho-acts"><span class="ho-note" id="hoNote"></span><button class="icon" data-act="historyClose" aria-label="Close whole history" title="Close (Esc)">${ICON.close}</button></div>
      </header>
      <div class="ho-body" id="hoBody"><canvas id="hoCanvas" role="img"></canvas></div>
      <footer class="ho-foot"><span class="legend">Fewer <i class="cd l0"></i><i class="cd l1"></i><i class="cd l2"></i><i class="cd l3"></i><i class="cd l4"></i> More</span><span>Click a day to open it · drag to pick a range · click a year to see it</span></footer>
    </div>
    <div class="tip" id="tip" role="tooltip" hidden></div>
    <div class="qpill" id="qpill" role="status" hidden></div>`);
  while (shell.firstChild) root.appendChild(shell.firstChild);
  (document.body || document.documentElement).appendChild(host);

  const $ = sel => root.querySelector(sel);
  const launch = $('.launch');
  const drawer = $('.drawer');
  const body = $('#body');
  const tip = $('#tip');
  const qpill = $('#qpill');
  const resizer = $('#resizer');
  const histOv = $('#histOv');

  function theme() { return document.documentElement.hasAttribute('dark') ? 'dark' : 'light'; }
  function syncTheme() {
    const t = theme();
    host.setAttribute('data-theme', t);
    document.querySelectorAll('[data-cdf-chip], [data-cdf-watch]').forEach(c => c.setAttribute('data-theme', t));
    if (S.historyOpen) renderHistory();
  }
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
  syncTheme();

  function placeDrawer() {
    const mh = document.querySelector('#masthead-container');
    const r = mh ? mh.getBoundingClientRect() : null;
    drawer.style.top = (r && r.height > 0 && r.bottom > 0 ? Math.round(r.bottom) : 0) + 'px';
    applyWidth();
  }

  // The panel's width, set by dragging its left edge and remembered.
  const MIN_W = 360, DEF_W = 440;
  const maxW = () => Math.max(MIN_W, Math.min(1000, window.innerWidth - 120));
  function applyWidth() {
    const w = Math.round(Math.min(maxW(), Math.max(MIN_W, opts.width || DEF_W)));
    drawer.style.width = `min(${w}px, 100vw)`;
    resizer.setAttribute('aria-valuenow', String(w));
  }

  function setName() { renderHeader(); }

  // Rows that come on screen without an exact date get looked up first.
  const io = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const rec = S.byId.get(en.target.dataset.id);
      if (rec && rec[6] === 0 && S.entry) want(rec, S.entry, 2);
    }
  }, { root: body, rootMargin: '300px 0px' });

  // ---------- messages ----------

  function errText(e) {
    switch (e && e.code) {
      case 'network': return "Couldn't reach YouTube. Check your connection and try again.";
      case 'rate': return 'YouTube is limiting requests right now. Wait a minute, then try again.';
      case 'http': return `YouTube returned an error (${e.status}). Reload the page and try again.`;
      case 'ext': return 'The extension was updated or reloaded. Refresh this YouTube tab to keep using it.';
      default: return (e && e.message) || 'Something went wrong while reading YouTube.';
    }
  }

  const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const hourFmt = h => new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2000, 0, 1, h));

  // ---------- views ----------

  const dateTimeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  const fullDayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  function show(view) {
    S.view = view;
    renderHeader();
    if (view !== 'main') io.disconnect();
    $('#types').hidden = view !== 'main' || !(S.entry && (S.entry.typed || S.typing.has(S.entry.channel.id)));
    if (view === 'none') return renderNone();
    if (view === 'loading') return renderLoading();
    if (view === 'error') return renderError();
    if (view === 'settings') return renderSettings();
    if (view === 'main') return renderMain();
  }

  // The channel's picture, taken from YouTube's own page when it's on screen.
  function pageAvatar() {
    const img = document.querySelector('yt-page-header-renderer yt-avatar-shape img, #channel-header-container #avatar img, ytd-video-owner-renderer #avatar img, #owner #avatar img');
    const src = img && img.getAttribute('src');
    return src && /^https:\/\//.test(src) ? src : '';
  }

  function oldestYear() {
    if (!S.videos.length) return null;
    const vw = C.view(S.videos);
    let min = Infinity;
    for (let i = 0; i < S.videos.length; i++) if (vw.est[i] < min) min = vw.est[i];
    return isFinite(min) ? new Date(min).getFullYear() : null;
  }

  function renderHeader() {
    const ch = S.channel && ['main', 'loading', 'error', 'settings'].includes(S.view) ? S.channel : null;
    $('#chName').textContent = ch && ch.title ? ch.title : 'Channel Date Finder';
    const av = $('#chAvatar');
    if (ch) {
      if (!ch.avatar) ch.avatar = pageAvatar();
      if (ch.avatar) { if (av.dataset.src !== ch.avatar) { setHTML(av, `<img alt="" src="${esc(ch.avatar)}">`); av.dataset.src = ch.avatar; } }
      else { setHTML(av, esc((ch.title || '?').trim().charAt(0).toUpperCase())); av.dataset.src = ''; }
    } else {
      setHTML(av, ICON.cal);
      av.dataset.src = '';
    }
    let sub = '';
    if (S.view === 'none') sub = 'Open a channel or video to begin';
    else if (S.view === 'loading') sub = 'Reading uploads';
    else if (S.view === 'main' || S.view === 'settings') {
      const y = oldestYear();
      sub = S.status || (S.videos.length ? `${plural(S.videos.length, 'upload')}${y ? ` since ${y}` : ''}` : 'No public uploads');
    }
    $('#chSub').textContent = sub;
    const rb = $('#refreshBtn');
    const busy = !!(S.channel && S.syncing.has(S.channel.id));
    rb.hidden = !(S.view === 'main' && S.entry);
    rb.disabled = busy;
    rb.classList.toggle('spinning', busy);
  }

  async function renderNone() {
    setHTML(body, `
      <div class="state">
        <p class="s-title">Pick a channel</p>
        <p class="muted">Open any YouTube channel or one of its videos, then open this panel to browse everything it uploaded by date.</p>
        <div id="recents"></div>
      </div>`);
    const idx = (await storageGet('idx')) || {};
    const items = Object.entries(idx).sort((a, b) => b[1].syncedAt - a[1].syncedAt).slice(0, 8);
    const el = $('#recents');
    if (!el || !items.length || S.view !== 'none') return;
    setHTML(el, `<p class="recents-title">Opened recently</p><div class="recents">${items.map(([id, c]) =>
      `<a class="recent" href="/channel/${esc(id)}/videos"><b>${esc(c.title || id)}</b><span>${plural(c.count, 'upload')}</span></a>`).join('')}</div>`);
  }

  function renderLoading() {
    setHTML(body, `
      <div class="state">
        <p class="s-title" id="lTitle">Finding the channel</p>
        <div class="track indet" id="lTrack"><span class="run" id="lRun"></span></div>
        <p class="l-sub" id="lSub"></p>
        <p class="fine">The first visit reads the channel's whole upload list once. After that it opens instantly and only fetches what's new.</p>
      </div>`);
    renderProgress();
  }

  function renderProgress() {
    if (S.view !== 'loading') return;
    const p = S.progress;
    const track = $('#lTrack'), run = $('#lRun');
    if (!p) {
      $('#lTitle').textContent = 'Finding the channel';
      $('#lSub').textContent = '';
      track.classList.add('indet');
      run.style.width = '';
      return;
    }
    $('#lTitle').textContent = 'Reading uploads';
    if (p.total) {
      track.classList.remove('indet');
      run.style.width = Math.min(100, (p.done / p.total) * 100).toFixed(1) + '%';
      $('#lSub').textContent = `${C.fmtCount(p.done)} of ${C.fmtCount(p.total)} videos`;
    } else {
      track.classList.add('indet');
      $('#lSub').textContent = `${C.fmtCount(p.done)} videos so far`;
    }
  }

  function renderError() {
    setHTML(body, `
      <div class="state">
        <p class="s-title">Couldn't load this channel</p>
        <p>${esc(errText(S.fatal))}</p>
        <div class="btns"><button class="primary" data-act="retry">Try again</button></div>
      </div>`);
  }

  function exactCount() {
    let n = 0;
    for (const r of S.videos) if (r[6] > 0) n++;
    return n;
  }

  function renderSettings() {
    const ch = S.channel;
    const n = S.videos.length;
    setHTML(body, `
      <button class="txt back" data-act="back">${ICON.back}Back</button>
      <section class="set">
        <h3>Settings</h3>
        <label class="toggle"><input type="checkbox" id="optHover"${opts.hover ? ' checked' : ''}><span>Show the exact upload date when hovering labels like “3 years ago” anywhere on YouTube</span></label>
        <label class="toggle"><input type="checkbox" id="optMarks"${opts.marks ? ' checked' : ''}><span>Mark videos I've opened</span></label>
        <label class="toggle"><input type="checkbox" id="optFill"${opts.fill ? ' checked' : ''}><span>Load exact dates for every upload while this panel is open</span></label>
        <p class="fine">Off by default. Date ranges, On this day and the videos on screen always get exact dates. Turning this on also makes the year and day counts exact. It looks up one video at a time, under two a second, signed out.</p>
      </section>
      ${ch && S.entry ? `
      <section class="set">
        <h3>${esc(ch.title || 'This channel')}</h3>
        <p class="muted">${plural(n, 'upload')} saved, ${C.fmtCount(exactCount())} with exact dates. Last checked ${C.ago(S.entry.syncedAt)}.</p>
        <button class="secondary" data-act="fullSync">Download this channel again</button>
        <p class="fine">Refreshes titles and view counts and drops deleted videos. Exact dates already found are kept.</p>
      </section>` : ''}
      <section class="set">
        <h3>Saved channels</h3>
        <p class="muted">Upload lists and exact dates stay in this browser so repeat visits are instant.</p>
        <button class="txt danger" data-act="clearAll" id="clearAll">Clear all saved data</button>
        <p class="fine">Includes remembered views and opened marks.</p>
      </section>
      <section class="set">
        <h3>Keyboard</h3>
        <p class="muted">Press <kbd>?</kbd> in the panel for shortcuts. Drag the panel's left edge to make it wider.</p>
        <button class="secondary" data-act="keys">Show shortcuts</button>
      </section>
      <section class="set">
        <h3>How it works</h3>
        <p class="fine">The panel reads a channel's public upload list from YouTube, the same data its Videos page loads, along with the channel's Shorts and Live tabs. YouTube only labels uploads with rough ages like “3 years ago”, so exact upload times are looked up a few videos at a time: the ones at the edges of your date range, the ones on screen, and the year you're looking at. Every request goes to youtube.com signed out, so none of it is tied to your Google account.</p>
      </section>`);
  }

  // Quick picks: the week/month/year around the video being watched (on a watch page), the usual ranges,
  // On this day and the channel's first upload.
  function picksHTML() {
    const around = S.around ? [['week', 'Same week'], ['month', 'Same month'], ['year', 'Same year']].map(([k, l]) =>
      `<button class="pick" data-act="around" data-span="${k}">${l}</button>`).join('') : '';
    return around + C.presets().map(p => `<button class="pick" data-act="preset" data-id="${p.id}">${p.label}</button>`).join('') +
      '<button class="pick" data-act="otd" id="otdChip" title="Uploads from today\'s date in earlier years">On this day</button>' +
      '<button class="pick" data-act="first" title="Jump to the channel\'s first public upload">First video</button>';
  }

  function renderMain() {
    setHTML(body, `
      <div class="banner" id="banner" hidden></div>
      <section class="hero" aria-live="polite">
        <div class="r-head">
          <h2 class="r-title" id="rTitleH"><button class="r-title-btn" id="rTitle" data-act="typeDate" title="Type a date, like “march 2019” or “last summer” (D)"></button></h2>
          <div class="r-typing" id="rTyping" hidden>
            <input class="r-input" id="dateQ" type="text" autocomplete="off" spellcheck="false" aria-label="Type a date" aria-describedby="dateHint" placeholder="march 2019, summer 2021, 2015–2017…">
            <p class="r-hint" id="dateHint"></p>
          </div>
          <button class="icon edit-btn" data-act="editDates" id="editBtn" aria-expanded="${S.editOpen ? 'true' : 'false'}" aria-controls="rEdit" title="Choose exact dates" aria-label="Choose exact dates">${ICON.cal}</button>
        </div>
        <p class="r-count" id="rCount"></p>
        <p class="r-pending" id="rPending" hidden><span class="dot"></span>Checking exact dates</p>
        <div class="picks" id="picks"></div>
        <div class="r-edit" id="rEdit"${S.editOpen ? '' : ' hidden'}>
          <label class="field"><span>From</span><input type="date" id="from"></label>
          <label class="field"><span>To</span><input type="date" id="to"></label>
        </div>
      </section>
      <section class="timeline" id="timeline" aria-label="Uploads over time"></section>
      <section class="filters">
        <div class="search">${ICON.search}<input type="search" id="q" placeholder="Search titles" autocomplete="off" spellcheck="false" aria-label="Search titles" title="Every word must match. Put - in front of a word to leave it out."></div>
        <div class="toolbar">
          <label class="sel" title="Length"><select id="len" aria-label="Length">${C.LENGTHS.map(([v, l]) => `<option value="${v}">${v === 'any' ? 'Length' : l}</option>`).join('')}</select>${ICON.chev}</label>
          <label class="sel" title="Sort"><select id="sort" aria-label="Sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="views">Most viewed</option><option value="standout">Standouts</option></select>${ICON.chev}</label>
          <span class="grow"></span>
          <span class="copied" id="copied" hidden>Link copied</span>
          <button class="icon sm" data-act="viewToggle" id="viewBtn" aria-pressed="${opts.view === 'grid'}" title="Grid view (G)" aria-label="Grid view">${ICON.grid}</button>
          <button class="icon sm" data-act="link" id="linkBtn" title="Copy a link to this view" aria-label="Copy a link to this view">${ICON.link}</button>
          <button class="play" data-act="play" id="playBtn" title="Play these uploads oldest first as a YouTube playlist">${ICON.play}<span id="playLabel">Play</span></button>
        </div>
        <div class="insights" id="stats" hidden></div>
      </section>
      <div class="list" id="list"></div>
      <button class="more" data-act="more" id="more" hidden></button>`);
    renderTypes();
    renderResults();
    updateMeta();
    renderBanner();
  }

  function renderTypes() {
    const el = $('#types');
    const entry = S.entry;
    if (S.view !== 'main' || !entry) { el.hidden = true; return; }
    if (!entry.typed) {
      const busy = S.typing.has(entry.channel.id);
      el.hidden = !busy;
      if (busy) setHTML(el, '<span class="tabs-note">Sorting Shorts and live streams…</span>');
      return;
    }
    const counts = { all: S.videos.length, videos: 0, shorts: 0, live: 0 };
    for (const v of S.videos) counts[C.typeOf(v)]++;
    const cur = S.filters.type || 'all';
    setHTML(el, C.TYPES.filter(([k]) => k === 'all' || k === 'videos' || counts[k] > 0 || k === cur).map(([k, label]) =>
      `<button class="tab" data-act="type" data-type="${k}" aria-pressed="${cur === k}">${label}<span class="n">${C.fmtCount(counts[k])}</span></button>`).join(''));
    el.hidden = false;
  }

  function whenText(rec) {
    const t = rec[6];
    if (t > 0) return (rec[7] || '').includes('D') ? dateTimeFmt.format(new Date(t)) : `${dateTimeFmt.format(new Date(t))}, ${C.fmtTime(t)}`;
    if ((rec[7] || '').includes('L')) return 'Live now';
    if ((rec[7] || '').includes('U')) return 'Upcoming';
    return rec[4] ? `About ${rec[4]}` : 'Date not shown';
  }

  function rowHTML(i) {
    const rec = S.videos[i];
    const [id, title, d, views, , , t, flags] = rec;
    const f = flags || '';
    let badge = '';
    if (f.includes('L')) badge = '<span class="badge live">LIVE</span>';
    else if (f.includes('U')) badge = '<span class="badge up">Upcoming</span>';
    else if (d) badge = `<span class="badge">${C.fmtDuration(d)}</span>`;
    const exact = t > 0;
    const score = S.scores[i] || 0;
    const so = score >= 2 ? `<span class="so" title="${score.toFixed(1)} times the views of this channel's nearby uploads">${score >= 10 ? Math.round(score) : score.toFixed(1)}× usual</span>` : '';
    const href = f.includes('S') ? `/shorts/${id}` : `/watch?v=${id}`;
    const hl = hlFor(id);
    const seen = !hl && opts.marks && opened.has(id);
    return `<a class="row${hl ? ' hl' : ''}${seen ? ' seen' : ''}" href="${href}" data-id="${id}"${exact ? '' : ' data-pending="1"'}>
      <span class="thumb"><img loading="lazy" decoding="async" alt="" src="https://i.ytimg.com/vi/${id}/mqdefault.jpg">${badge}${seen ? '<span class="seen-tag">Opened</span>' : ''}</span>
      <span class="info">${hl ? `<span class="hl-tag">${esc(hl)}</span>` : ''}<span class="title">${esc(title)}</span><span class="when${exact ? '' : ' approx'}"${exact ? '' : ' title="Exact date is loading"'}>${esc(whenText(rec))}</span>${views >= 0 ? `<span class="views">${C.fmtViews(views)}${so}</span>` : ''}</span>
    </a>`;
  }

  // The label on a highlighted row: a milestone or First video jump, or the video being watched.
  function hlFor(id) {
    if (S.highlight && S.highlight.id === id) return S.highlight.label;
    if (S.around && S.around.id === id) return 'Playing now';
    return '';
  }

  function setVal(id, v) {
    const el = $('#' + id);
    if (el && el.value !== v) el.value = v;
    if (el && el.tagName === 'SELECT') fitSelect(el);
  }

  // A dropdown is as wide as its longest option; size it to the one that's selected instead.
  let measureCtx = null;
  function fitSelect(sel) {
    const opt = sel.options[sel.selectedIndex];
    if (!opt) return;
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    const cs = getComputedStyle(sel);
    measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    sel.style.width = Math.ceil(measureCtx.measureText(opt.textContent).width + pad + 2) + 'px';
  }

  function filtersActive(f) {
    return !!(f.q.trim() || f.len !== 'any');
  }

  function renderResults() {
    if (S.view !== 'main') return;
    const f = fx();
    const vw = C.view(S.videos);
    const { idx, pending } = C.select(S.videos, f, vw, S.scores);
    S.current = idx;
    S.lastPending = pending;

    setVal('from', f.from); setVal('to', f.to); setVal('q', f.q); setVal('len', f.len); setVal('sort', f.sort);
    const pk = $('#picks');
    const sig = S.around ? 'a' : '-';
    if (pk.dataset.sig !== sig) {
      const focusAct = root.activeElement && root.activeElement.classList && root.activeElement.classList.contains('pick') ? (root.activeElement.dataset.span || root.activeElement.dataset.id || root.activeElement.dataset.act) : null;
      setHTML(pk, picksHTML());
      pk.dataset.sig = sig;
      if (focusAct) { const el = pk.querySelector(`[data-span="${focusAct}"], [data-id="${focusAct}"], [data-act="${focusAct}"]`); if (el) el.focus(); }
    }
    root.querySelectorAll('.pick[data-act="around"]').forEach(c => c.classList.toggle('on', !!(S.aroundActive && S.around && S.around.span === c.dataset.span)));
    const active = f.otd || S.aroundActive ? null : C.presets().find(p => p.from === f.from && p.to === f.to);
    root.querySelectorAll('.pick[data-act="preset"]').forEach(c => c.classList.toggle('on', !!active && c.dataset.id === active.id));
    $('#otdChip').classList.toggle('on', !!f.otd);
    root.querySelectorAll('[data-act="type"]').forEach(b => b.setAttribute('aria-pressed', String((S.filters.type || 'all') === b.dataset.type)));

    // The readout
    const rt = C.rangeTitle(f);
    $('#rTitle').textContent = rt.title;
    const n = idx.length;
    const countText = n ? `<b><span class="num">${C.fmtCount(n)}</span> ${n === 1 ? 'upload' : 'uploads'}</b>` : '<b>No uploads</b>';
    const matching = f.q.trim() ? ` matching “${esc(f.q.trim())}”` : '';
    const len = f.len !== 'any' ? `, ${esc((C.LENGTHS.find(x => x[0] === f.len) || ['', ''])[1].toLowerCase())}` : '';
    let line;
    if (f.otd) line = `${countText}${matching}${len} on this date in earlier years`;
    else if (S.aroundActive && S.around) line = `${countText}${matching}${len} the same ${S.around.span} as this video`;
    else if (rt.sub) line = `${esc(rt.sub)}, ${n ? plural(n, 'upload') : 'no uploads'}${matching}${len}`;
    else line = `${countText}${matching}${len}`;
    setHTML($('#rCount'), line);
    const numEl = $('#rCount .num');
    const animate = S.animate && !reduceMotion();
    if (numEl && animate) tweenCount(numEl, S.lastCount, n);
    S.lastCount = n;
    if (animate) { restartAnim($('#rTitle'), 'swap'); }
    pk.classList.toggle('fade', pk.scrollWidth > pk.clientWidth + 2 && pk.scrollLeft + pk.clientWidth < pk.scrollWidth - 2);
    $('#rPending').hidden = !pending;

    renderHist(vw);
    renderStats(idx, vw, f);

    io.disconnect();
    const list = $('#list');
    list.classList.toggle('grid', opts.view === 'grid');
    if (animate) restartAnim(list, 'enter');
    S.animate = false;
    const shown = Math.min(S.shown, n);
    if (n) {
      setHTML(list, listHTML(idx.slice(0, shown), idx, vw));
      list.querySelectorAll('.row[data-pending]').forEach(el => io.observe(el));
    } else {
      setHTML(list, emptyHTML(f, vw, pending));
    }
    const more = $('#more');
    const left = n - shown;
    more.hidden = left <= 0;
    if (left > 0) more.textContent = `Show ${C.fmtCount(Math.min(PAGE, left))} more`;
    const playable = idx.filter(i => !(S.videos[i][7] || '').includes('U')).length;
    $('#playBtn').disabled = !playable;
    $('#playLabel').textContent = playable ? `Play ${C.fmtCount(playable)}` : 'Play';

    if (S.channel) {
      ss.set('f:' + S.channel.id, S.filters);
      ss.set('n:' + S.channel.id, S.shown);
      saveView();
    }
    writeHash();
    if (S.scrollToHl) {
      S.scrollToHl = false;
      const row = list.querySelector('.row.hl');
      if (row) requestAnimationFrame(() => row.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }));
    }
  }

  function restartAnim(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function tweenCount(el, from, to) {
    if (from == null || from === to) { el.textContent = C.fmtCount(to); return; }
    const start = performance.now(), dur = 300;
    const step = now => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = C.fmtCount(Math.round(from + (to - from) * e));
      if (p < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Pick up where you left off: the last view of each channel is kept across visits.
  let viewTimer = 0;
  function saveView() {
    const id = S.channel && S.channel.id;
    if (!id) return;
    const f = Object.assign({}, S.filters);
    clearTimeout(viewTimer);
    viewTimer = setTimeout(() => storageSet({ ['v:' + id]: f }), 800);
  }

  // Results under month headings when sorted by date; a flat list for views and standouts.
  function listHTML(rows, all, vw) {
    const grouped = S.filters.sort === 'new' || S.filters.sort === 'old';
    if (!grouped) return rows.map(rowHTML).join('');
    const key = i => { const d = new Date(vw.est[i]); return d.getFullYear() * 12 + d.getMonth(); };
    const sizes = new Map();
    for (const i of all) sizes.set(key(i), (sizes.get(key(i)) || 0) + 1);
    let html = '', last = null;
    for (const i of rows) {
      const k = key(i);
      if (k !== last) {
        const d = new Date(Math.floor(k / 12), k % 12, 1);
        html += `<div class="grp"><span>${esc(monthYearFmt.format(d))}</span><span class="n">${plural(sizes.get(k), 'upload')}</span></div>`;
        last = k;
      }
      html += rowHTML(i).replace('<a class="row', `<a data-g="${k}" class="row`); // also matches "row hl" / "row seen"
    }
    return html;
  }

  // An empty result points at the closest uploads either side, so it's a step forward, not a dead end.
  function emptyHTML(f, vw, pending) {
    if (!S.videos.length) return `<div class="empty"><p class="e-title">This channel has no public uploads.</p></div>`;
    if (pending) return `<div class="empty"><p class="e-sub">Checking exact dates…</p></div>`;
    const filtered = filtersActive(f) || (f.type && f.type !== 'all');
    const typeWord = f.type && f.type !== 'all' ? { videos: 'videos', shorts: 'Shorts', live: 'live streams' }[f.type] : 'uploads';
    let title;
    if (f.otd) title = `No ${typeWord} on this date in earlier years.`;
    else if (f.from && f.to && f.from === f.to) title = `No ${typeWord} on ${fullDayFmt.format(new Date(f.from + 'T12:00:00'))}.`;
    else if (f.from || f.to) title = `No ${typeWord} in ${C.rangeTitle(f).title}.`;
    else title = `Nothing matches.`;
    let near = '';
    if (!f.otd && (f.from || f.to)) {
      const nb = C.nearest(S.videos, f, vw);
      const A = C.dayStart(f.from), B = C.dayEnd(f.to);
      const card = (p, label, side) => {
        const d = new Date(p.t);
        const days = Math.max(1, Math.round(Math.abs((side < 0 ? A : B) - p.t) / C.DAY));
        const span = days >= 730 ? plural(Math.round(days / 365.25), 'year') : days >= 60 ? plural(Math.round(days / 30.44), 'month') : plural(days, 'day');
        const dist = `${span} ${side < 0 ? 'earlier' : 'later'}`;
        return `<button class="jump" data-act="jump" data-d="${C.isoDay(d)}"><span class="j-k">${label}</span><span class="j-v">${esc(fullDayFmt.format(d))}</span><span class="j-s">${p.exact ? '' : 'About '}${dist}</span></button>`;
      };
      if (nb.before || nb.after) near = `<div class="near${nb.before && nb.after ? '' : ' one'}">${nb.before ? card(nb.before, 'Closest before', -1) : ''}${nb.after ? card(nb.after, 'Closest after', 1) : ''}</div>`;
    }
    const clear = filtered ? `<div class="e-acts"><button class="link-btn" data-act="clear">Clear search and filters</button></div>` : '';
    return `<div class="empty"><p class="e-title">${esc(title)}</p>${near}${clear}</div>`;
  }

  function renderStats(idx, vw, f) {
    const el = $('#stats');
    if (!el) return;
    if (idx.length < 2) { el.hidden = true; return; }
    const st = C.stats(S.videos, idx, vw, f);
    const allExact = idx.every(i => S.videos[i][6] > 0);
    const items = [];
    if (st.perMonth != null) items.push([st.perMonth >= 10 ? String(Math.round(st.perMonth)) : st.perMonth.toFixed(1), 'uploads a month']);
    if (st.gap && allExact) items.push([plural(st.gap.days, 'day'), `longest gap, ${C.fmtDate(st.gap.from)} to ${C.fmtDate(st.gap.to)}`]);
    if (st.slot) items.push([`${st.slot.day.slice(0, 3)}, ${hourFmt(st.slot.hour)}`, `most common upload time (${Math.round(st.slot.share * 100)}% on ${st.slot.day}s)`]);
    if (st.median != null) items.push([compactNum(st.median), 'median views']);
    setHTML(el, items.map(([v, k]) => `<div class="ins"><span class="v" title="${esc(v)}">${esc(v)}</span><span class="k">${esc(k)}</span></div>`).join(''));
    el.hidden = !items.length;
  }

  function estNote() {
    const n = S.videos.length, exact = exactCount();
    if (!n || exact >= n) return '';
    if (Date.now() < Q.pausedUntil) return '<span class="tl-note">YouTube asked to slow down. Exact dates resume in a minute.</span>';
    if (opts.fill) return `<span class="tl-note">Loading exact dates: ${C.fmtCount(exact)} of ${C.fmtCount(n)}</span>`;
    return '<span class="tl-note">Counts are estimates until exact dates load. <button class="link-btn" data-act="fillOn" title="Looks up every upload’s exact date, under two a second, while this panel is open">Load all exact dates</button></span>';
  }

  // The channel's 1st, 100th… uploads and its most viewed, with exact dates looked up on demand (a handful).
  function milestoneList(vw) {
    if (!S.videos.length) return [];
    vw = vw || C.view(S.videos);
    return C.milestones(S.videos).map(m => {
      const rec = S.videos[m.i];
      if (rec[6] === 0 && S.entry && !Q.jobs.has(rec[0])) enqueue(rec, S.entry, 1);
      return Object.assign({}, m, { rec, t: rec[6] > 0 ? rec[6] : vw.est[m.i], exact: rec[6] > 0 });
    });
  }

  function renderHist(vw) {
    const el = $('#timeline');
    if (!el) return;
    const f = fx();
    vw = vw || C.view(S.videos);
    const h = C.histogram(S.videos, f, vw);
    const ms = milestoneList(vw);
    if (ms.some(m => !m.exact)) pump();
    const focused = root.activeElement && root.activeElement.dataset ? (root.activeElement.dataset.k || root.activeElement.dataset.d || root.activeElement.dataset.from) : null;
    if (h.mode === 'months') {
      renderYear(el, h.year, f, vw, ms);
    } else {
      const byYear = new Map();
      for (const m of ms) { const y = String(new Date(m.t).getFullYear()); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(m.label); }
      const tipFor = b => {
        const n = b.count ? `${b.approx ? 'about ' : ''}${plural(b.count, 'upload')}` : 'no uploads';
        const extra = byYear.get(b.key);
        return extra ? `${n} · ${extra.join(', ')}` : n;
      };
      setHTML(el, `
        <div class="tl-head"><h3 class="tl-title">Uploads by year</h3><button class="link-btn" data-act="history" title="Every upload day across the channel's whole history (H)">Whole history</button></div>
        <div class="bars${f.from || f.to || f.otd ? '' : ' all'}" id="bars" data-mode="years">${h.bars.map(b =>
          `<button class="bar${b.inRange ? ' in' : ''}" data-act="bar" data-k="${b.key}" data-from="${b.from}" data-to="${b.to}" data-n="${b.count}" data-tip-h="${b.key}" data-tip="${esc(tipFor(b))}" aria-label="${esc(b.title)}" aria-pressed="${b.inRange}"><span class="col">${byYear.has(b.key) ? '<span class="pin"></span>' : ''}<span class="fill"></span></span><span class="lbl">${esc(b.label)}</span></button>`).join('')}</div>
        <div class="tl-foot" id="tlFoot">${estNote() || '<span class="tl-note">Drag across years to pick several</span>'}</div>
        ${ms.length ? `<div class="miles" id="miles">${ms.map(m =>
          `<button class="mile" data-act="mile" data-i="${m.i}" data-label="${esc(m.label)}"><span class="mk">${esc(m.label)}</span><span class="mv">${m.exact ? esc(C.fmtDate(m.t)) : `About ${new Date(m.t).getFullYear()}`}</span></button>`).join('')}</div>` : ''}`);
      const fills = el.querySelectorAll('.fill');
      h.bars.forEach((b, i) => { fills[i].style.height = b.count ? Math.max(4, (b.count / h.max) * 100).toFixed(1) + '%' : '0'; });
    }
    if (focused) {
      const t = root.querySelector(`[data-k="${focused}"], [data-d="${focused}"], .mo-h[data-from="${focused}"]`);
      if (t) t.focus();
    }
  }

  // Twelve small months for the year in view. Day colour is how many uploads that day had.
  function renderYear(el, year, f, vw, ms) {
    const yv = C.yearView(S.videos, f, vw, year);
    const msDays = new Map();
    for (const m of ms || []) if (m.exact) { const k = C.isoDay(new Date(m.t)); if (!msDays.has(k)) msDays.set(k, []); msDays.get(k).push(m.label); }
    const lvl = n => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);
    const minY = oldestYear() || year, maxY = new Date().getFullYear();
    // Days light up only once their uploads' exact dates are known; estimates stay at month level.
    const placed = d => d.count - d.approx;
    const label = d => `${dateTimeFmt.format(new Date(d.date + 'T12:00:00'))}: ${placed(d) ? plural(placed(d), 'upload') : 'no uploads found yet'}`;
    const total = yv.months.reduce((a, m) => a + m.count, 0);
    const dayTip = d => {
      const n = placed(d) ? plural(placed(d), 'upload') : yv.approxTotal ? 'no uploads found yet' : 'no uploads';
      return msDays.has(d.date) ? `${n} · ${msDays.get(d.date).join(', ')}` : n;
    };
    const yearNote = yv.approxTotal
      ? `<span class="tl-note">Finding exact days: ${C.fmtCount(total - yv.approxTotal)} of ${C.fmtCount(total)}</span>`
      : (total ? '' : '<span class="tl-note">No uploads this year</span>');
    setHTML(el, `
      <div class="tl-head">
        <div class="yr-nav">
          <button class="icon sm" data-act="yearStep" data-step="-1" aria-label="Previous year"${year <= minY ? ' disabled' : ''}>${ICON.left}</button>
          <h3 class="yr">${year}</h3>
          <button class="icon sm" data-act="yearStep" data-step="1" aria-label="Next year"${year >= maxY ? ' disabled' : ''}>${ICON.right}</button>
        </div>
        <span class="tl-links"><button class="link-btn" data-act="history" title="Every upload day across the channel's whole history (H)">Whole history</button><button class="link-btn" data-act="allYears">All years</button></span>
      </div>
      <div class="months">${yv.months.map(m => `
        <div class="mo">
          <button class="mo-h${m.selected ? ' on' : ''}" data-act="month" data-from="${m.from}" data-to="${m.to}" data-tip-h="${esc(monthYearFmt.format(new Date(year, m.m, 1)))}" data-tip="${m.count ? `${m.approx ? 'about ' : ''}${plural(m.count, 'upload')}` : yv.approxTotal ? 'no uploads found yet' : 'no uploads'}" aria-label="${esc(monthYearFmt.format(new Date(year, m.m, 1)))}: ${plural(m.count, 'upload')}"><span>${m.label}</span><span class="n">${m.count || ''}</span></button>
          <div class="days">${'<span class="cd-pad"></span>'.repeat(m.lead)}${m.days.map(d =>
            `<button class="cd l${lvl(placed(d))}${d.inRange ? ' in' : ''}${msDays.has(d.date) ? ' ms' : ''}" data-act="day" data-d="${d.date}" data-n="${placed(d)}" data-tip-h="${esc(dateTimeFmt.format(new Date(d.date + 'T12:00:00')))}" data-tip="${esc(dayTip(d))}" aria-label="${esc(label(d))}"></button>`).join('')}</div>
        </div>`).join('')}
      </div>
      <div class="tl-foot" id="tlFoot" data-year="1"><span class="legend">Fewer <i class="cd l0"></i><i class="cd l1"></i><i class="cd l2"></i><i class="cd l3"></i><i class="cd l4"></i> More</span>${yearNote}</div>`);
    focusYear(year, vw);
  }

  // Look up exact dates for the year in view before anything else in the background. Runs on every
  // refresh of the year: as dates arrive, other uploads' estimates shift and some move into this year.
  function focusYear(year, vw) {
    vw = vw || C.view(S.videos);
    let added = 0;
    S.videos.forEach((r, i) => {
      if (r[6] === 0 && !Q.jobs.has(r[0]) && new Date(vw.est[i]).getFullYear() === year) { enqueue(r, S.entry, 1); added++; }
    });
    if (added) pump();
  }

  // Header line, refresh state, the exact-dates progress line and the timeline note.
  function updateMeta() {
    renderHeader();
    const bar = $('#hdProgress');
    const n = S.videos.length, exact = exactCount();
    const filling = S.view === 'main' && opts.fill && n && exact < n;
    bar.hidden = !filling;
    if (filling) bar.firstElementChild.style.width = ((exact / n) * 100).toFixed(1) + '%';
    const foot = $('#tlFoot');
    if (foot && S.view === 'main' && !foot.dataset.year) {
      const legend = foot.querySelector('.legend');
      setHTML(foot, (legend ? legend.outerHTML : '') + estNote());
    }
  }

  function renderBanner() {
    const b = $('#banner');
    if (!b) return;
    if (!S.banner) { b.hidden = true; return; }
    setHTML(b, `<span>${esc(errText(S.banner))}</span>`);
    b.hidden = false;
  }

  let statusTimer = 0;
  function flashStatus(text) {
    S.status = text;
    updateMeta();
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { S.status = ''; updateMeta(); }, 6000);
  }

  // A new exact date arrived: fix that row in place, refresh the rest shortly.
  function onDate(rec) {
    if (S.view === 'main' && S.byId.get(rec[0]) === rec) {
      const el = root.querySelector(`.row[data-id="${rec[0]}"]`);
      if (el && rec[6] > 0) {
        if (el.dataset.g) {
          const d = new Date(rec[6]);
          if (String(d.getFullYear() * 12 + d.getMonth()) !== el.dataset.g) S.regroup = true;
        }
        el.removeAttribute('data-pending');
        const w = el.querySelector('.when');
        w.textContent = whenText(rec);
        w.classList.remove('approx');
        w.removeAttribute('title');
      }
    }
    scheduleRefresh();
  }

  // Throttled, not debounced: dates arrive in a steady stream, so a debounce would never fire.
  let refreshTimer = 0;
  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = 0;
      if (S.view !== 'main') return;
      if ((S.lastPending && !S.refining) || S.regroup) {
        S.regroup = false;
        const top = body.scrollTop;
        renderResults();
        body.scrollTop = top;
      } else { renderHist(); if (S.current.every(i => i < S.videos.length)) renderStats(S.current, C.view(S.videos), fx()); }
      if (S.historyOpen) renderHistory();
      updateMeta();
    }, 700);
  }

  // ---------- loading & syncing ----------

  function pageTitle() {
    return document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '').trim();
  }

  async function scrapeChannelId(path) {
    try {
      const html = await (await pageFetch(path, { credentials: 'omit' })).text();
      const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ||
        html.match(/"externalId":"(UC[\w-]{22})"/) ||
        html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  async function resolveRef(ref) {
    if (ref.kind === 'id') return { id: ref.value, title: pageTitle() };
    if (ref.kind === 'video') {
      const info = await lookupVideo(ref.value, 'channel');
      if (info.t > 0) { S.videoInfo = { id: ref.value, t: info.t }; rememberDate(ref.value, info.t, info.dateOnly); }
      return { id: info.channelId, title: info.author };
    }
    try {
      const r = await YT.call('navigation/resolve_url', { url: 'https://www.youtube.com' + ref.path });
      let id = '';
      C.walk(r, n => {
        if (!id && n.browseEndpoint && /^UC[\w-]{22}$/.test(n.browseEndpoint.browseId || '')) id = n.browseEndpoint.browseId;
        return !id;
      });
      if (id) return { id, title: pageTitle() };
    } catch (e) {
      if (e && e.code === 'network') throw e;
    }
    const id = await scrapeChannelId(ref.path);
    if (id) return { id, title: pageTitle() };
    throw { code: 'notFound', message: "Couldn't work out which channel this page belongs to." };
  }

  // Read the uploads playlist (newest first) until reaching videos we already have.
  async function listUploads(ch, known, onProgress) {
    const at = Date.now();
    const out = [];
    let res = await YT.call('browse', { browseId: 'VLUU' + ch.id.slice(2) });
    const total = C.findCount(res);
    const owner = C.findOwner(res);
    const seen = new Set();
    const again = new Map(); // uploads we already have that were listed again, with their current labels
    const tokens = new Set();
    for (let page = 0; page < 2000; page++) {
      const items = C.extractVideos(res);
      if (page === 0 && !items.length && total > 0) {
        throw { code: 'format', message: "Couldn't read this channel's uploads list. YouTube may have changed its page layout." };
      }
      let reachedKnown = false, added = 0;
      for (const it of items) {
        if (known.has(it.id)) { reachedKnown = true; again.set(it.id, it); continue; }
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        out.push([it.id, it.title, it.dur, it.views, it.rel, at, 0, it.flag]);
        added++;
      }
      onProgress(out.length, total);
      if (reachedKnown) break;
      const token = C.findContinuation(res);
      // Stop at the end, or if YouTube hands back a page we've already read.
      if (!token || tokens.has(token) || !items.length || (page > 0 && !added)) break;
      tokens.add(token);
      res = await YT.call('browse', { continuation: token });
    }
    return { fresh: out, owner, again, at };
  }

  // IDs from one of YouTube's per-type upload lists (UUSH Shorts, UULV live), newest first.
  async function listIds(prefix, ch, stop) {
    const ids = [];
    let res;
    try {
      res = await YT.call('browse', { browseId: 'VL' + prefix + ch.id.slice(2) });
    } catch (e) {
      if (e && e.code === 'http' && (e.status === 400 || e.status === 404)) return ids; // channel has none
      throw e;
    }
    const tokens = new Set();
    for (let page = 0; page < 2000; page++) {
      const got = C.extractIds(res);
      let hitStop = false;
      for (const id of got) {
        if (stop && stop.has(id)) { hitStop = true; break; }
        ids.push(id);
      }
      const token = C.findContinuation(res);
      if (hitStop || !token || tokens.has(token) || !got.length) break;
      tokens.add(token);
      res = await YT.call('browse', { continuation: token });
    }
    return ids;
  }

  // IDs from a channel tab (Shorts or Live), newest first. The tab pages through everything,
  // where the matching UUSH / UULV playlists stop at 100.
  async function listTabIds(ch, params, stop) {
    const ids = [];
    if (!params) return ids;
    let res = await YT.call('browse', { browseId: ch.id, params });
    const tokens = new Set();
    for (let page = 0; page < 2000; page++) {
      const scope = page === 0 ? C.selectedTab(res) : res;
      const got = C.extractIds(scope);
      let hitStop = false;
      for (const id of got) {
        if (stop && stop.has(id)) { hitStop = true; break; }
        ids.push(id);
      }
      const token = C.findContinuation(scope, true);
      if (hitStop || !token || tokens.has(token) || !got.length) break;
      tokens.add(token);
      res = await YT.call('browse', { continuation: token });
    }
    return ids;
  }

  // Tag uploads as Short (S) or live stream (T) from YouTube's own lists. With `known`, only new uploads.
  async function syncTypes(entry, known) {
    const id = entry.channel.id;
    if (S.typing.has(id)) return;
    S.typing.add(id);
    const isCurrent = () => S.entry === entry;
    if (isCurrent()) renderTypes();
    const stop = known && entry.typed ? known : null;
    try {
      const tabs = C.channelTabs(await YT.call('browse', { browseId: entry.channel.id }));
      const [shortsTab, livesTab, shortsList, livesList] = await Promise.all([
        listTabIds(entry.channel, tabs.shorts, stop), listTabIds(entry.channel, tabs.streams, stop),
        listIds('UUSH', entry.channel, stop), listIds('UULV', entry.channel, stop)
      ]);
      const shorts = shortsTab.concat(shortsList), lives = livesTab.concat(livesList);
      const sset = new Set(shorts), lset = new Set(lives);
      for (const r of entry.videos) {
        if (stop && stop.has(r[0])) continue;
        setFlag(r, 'S', sset.has(r[0]));
        setFlag(r, 'T', lset.has(r[0]));
      }
      entry.typed = true;
      await saveEntry(entry);
    } catch (e) {
      /* leave untagged; the type row stays hidden and filtering ignores type */
    }
    S.typing.delete(id);
    if (isCurrent()) {
      S.scores = C.standouts(entry.videos);
      if (S.view === 'main') { renderTypes(); renderResults(); }
    }
  }

  function setEntry(entry) {
    S.entry = entry;
    S.videos = entry.videos;
    S.byId = new Map(entry.videos.map(r => [r[0], r]));
    S.scores = C.standouts(entry.videos);
    S.fillAt = 0;
    S.focusYear = null;
    dropForeignJobs();
  }

  function fail(e) {
    S.fatal = e;
    show('error');
  }

  function applyPendingHash() {
    if (!S.pendingHash) return false;
    S.filters = Object.assign(defaultFilters(), S.pendingHash);
    S.pendingHash = null;
    S.shown = PAGE;
    return true;
  }

  async function load() {
    const seq = ++S.loadSeq;
    const ref = S.ref;
    if (!ref) return show('none');

    if (S.channel && S.entry && S.channelRefK === S.refK) {
      const changed = applyPendingHash();
      if (S.view !== 'main') show('main');
      else if (changed) renderResults();
      if (changed) refine();
      afterReady(seq);
      return;
    }
    // Keep the current list visible while checking whether a new page belongs to the same channel.
    if (!S.entry || S.view !== 'main') {
      S.progress = null;
      show('loading');
    }

    let ch;
    try {
      ch = await resolveRef(ref);
    } catch (e) {
      if (seq !== S.loadSeq) return;
      return fail(e);
    }
    if (seq !== S.loadSeq) return;
    S.channelRefK = S.refK;

    if (S.channel && S.channel.id === ch.id && S.entry) {
      const changed = applyPendingHash();
      if (S.view !== 'main') show('main');
      else if (changed) renderResults();
      if (changed) refine();
      afterReady(seq);
      return;
    }

    S.channel = ch;
    S.entry = null;
    S.videos = [];
    S.byId = new Map();
    S.banner = null;
    S.status = '';
    S.highlight = null;
    const remembered = ss.get('f:' + ch.id) || (await storageGet('v:' + ch.id));
    if (seq !== S.loadSeq) return;
    S.filters = Object.assign(defaultFilters(), remembered || {});
    S.shown = ss.get('n:' + ch.id) || PAGE;
    applyPendingHash();

    const cached = await storageGet('up:' + ch.id);
    if (seq !== S.loadSeq) return;
    if (cached && Array.isArray(cached.videos)) {
      if (cached.channel && cached.channel.title) ch.title = cached.channel.title;
      const typed = cached.typed === TYPES_VERSION;
      setEntry({ channel: ch, syncedAt: cached.syncedAt, typed, videos: cached.videos });
      show('main');
      const top = ss.get('s:' + ch.id);
      if (top) requestAnimationFrame(() => { body.scrollTop = top; });
      refine();
      pump();
      if (!typed) syncTypes(S.entry, null);
      if (Date.now() - cached.syncedAt > STALE_MS) startSync(false);
      afterReady(seq);
    } else {
      setName();
      startSync(true);
    }
  }

  // On a watch page, show the week around the video being watched (when opened there, or when the
  // video changes while the panel still shows the range around the previous one).
  async function afterReady(seq) {
    const ref = S.ref;
    if (!ref || ref.kind !== 'video' || !S.entry) return;
    if (S.around && S.around.id === ref.value && !S.aroundReq) return;
    const follow = S.aroundReq || (S.aroundActive && S.around && S.around.id !== ref.value);
    let t = 0;
    if (S.videoInfo && S.videoInfo.id === ref.value) t = S.videoInfo.t;
    const rec = S.byId.get(ref.value);
    if (!t && rec && rec[6] > 0) t = rec[6];
    if (!t) { const d = await knownDate(ref.value); if (d) t = d.t; }
    if (!t) { try { t = (await lookupVideo(ref.value, 't')).t; } catch (e) { t = 0; } }
    if (seq !== undefined && seq !== S.loadSeq) return;
    if (!t || !S.entry) return;
    S.aroundReq = false;
    S.around = { id: ref.value, t, span: (S.around && S.around.span) || 'week' };
    if (follow) applyAround();
    else if (S.view === 'main') renderResults();
  }

  function applyAround(span) {
    if (!S.around) return;
    if (span) S.around.span = span;
    const r = C.aroundRange(S.around.t, S.around.span);
    S.aroundActive = true;
    setFilters({ from: r.from, to: r.to, otd: false }, { keepAround: true, scroll: true });
  }

  let clearEpoch = 0; // bumped by "Clear all saved data"

  async function startSync(full) {
    const ch = S.channel;
    if (!ch || S.syncing.has(ch.id)) return;
    S.syncing.add(ch.id);
    const epoch = clearEpoch;
    S.banner = null;
    const old = S.entry ? S.entry.videos : [];
    const wasTyped = !!(S.entry && S.entry.typed);
    const firstLoad = !S.entry;
    if (firstLoad) {
      S.progress = { done: 0, total: 0 };
      show('loading');
    } else {
      S.status = full ? 're-downloading…' : 'checking for new uploads…';
      updateMeta();
      renderBanner();
    }
    const isCurrent = () => S.channel && S.channel.id === ch.id;

    try {
      const knownIds = new Set(old.map(r => r[0]));
      const { fresh, owner, again, at } = await listUploads(ch, full ? new Set() : knownIds, (done, total) => {
        if (!isCurrent()) return;
        if (S.view === 'loading') { S.progress = { done, total }; renderProgress(); }
        else if (full) { S.status = `re-downloading… ${C.fmtCount(done)}`; updateMeta(); }
      });
      if (owner) ch.title = owner;
      let videos;
      if (full) {
        const prev = new Map(old.map(r => [r[0], r]));
        videos = fresh.map(r => {
          const p = prev.get(r[0]);
          if (p) {
            if (p[6] > 0) r[6] = p[6];
            for (const fl of ['D', 'S', 'T']) if ((p[7] || '').includes(fl)) setFlag(r, fl, true);
          }
          return r;
        });
      } else {
        // Saved uploads listed again on the pages just read: refresh what changes over time.
        // Without this, a premiere or stream seen once would stay "Upcoming" or "LIVE" for good.
        for (const r of old) {
          const it = again.get(r[0]);
          if (!it) continue;
          const wasPending = /[LU]/.test(r[7] || '');
          r[1] = it.title;
          if (it.dur) r[2] = it.dur;
          if (it.views >= 0) r[3] = it.views;
          if (it.rel) { r[4] = it.rel; r[5] = at; }
          setFlag(r, 'L', it.flag === 'L');
          setFlag(r, 'U', it.flag === 'U');
          // It has gone out since: look its date up again, since schedules move.
          if (wasPending && !/[LU]/.test(r[7] || '')) r[6] = 0;
        }
        videos = fresh.concat(old);
      }
      if (epoch !== clearEpoch) { S.syncing.delete(ch.id); return; } // saved data was cleared meanwhile
      const entry = { channel: ch, syncedAt: Date.now(), typed: full ? false : wasTyped, videos };
      await saveEntry(entry);
      S.syncing.delete(ch.id);
      if (!isCurrent()) return;
      setEntry(entry);
      S.status = '';
      setName();
      if (S.view === 'loading' || S.view === 'error') show('main');
      else if (S.view === 'main') { renderTypes(); renderResults(); updateMeta(); }
      if (!firstLoad && S.view === 'main') {
        if (full) flashStatus(`re-downloaded ${plural(videos.length, 'upload')}`);
        else if (fresh.length) flashStatus(`${plural(fresh.length, 'new upload')} added`);
      }
      refine();
      pump();
      if (firstLoad) afterReady();
      if (full || !wasTyped) syncTypes(entry, null);
      else if (fresh.length) syncTypes(entry, knownIds);
    } catch (e) {
      S.syncing.delete(ch.id);
      if (!isCurrent()) return;
      const err = e && e.code ? e : { code: 'other', message: String((e && e.message) || e) };
      if (S.entry) {
        S.status = '';
        S.banner = err;
        if (S.view === 'main') { updateMeta(); renderBanner(); }
      } else {
        fail(err);
      }
    }
  }

  // Look up exact dates around the edges of the chosen range until every video is placed for sure.
  let refineSeq = 0;
  async function refine() {
    const seq = ++refineSeq;
    const entry = S.entry;
    if (!entry || !S.videos.length || (!S.filters.from && !S.filters.to && !S.filters.otd)) { S.refining = false; return; }
    S.refining = true;
    for (let round = 0; round < 120; round++) {
      if (seq !== refineSeq || entry !== S.entry) return;
      const picks = C.probes(S.videos, fx(), C.view(S.videos), 3);
      if (!picks.length) break;
      await Promise.all(picks.map(i => want(S.videos[i], entry, 2)));
    }
    if (seq !== refineSeq || entry !== S.entry) return;
    S.refining = false;
    renderResults();
  }

  // ---------- links to a view ----------

  function writeHash() {
    if (!S.open || !S.channel || S.view !== 'main') return;
    const f = S.filters;
    const plain = !f.otd && !f.from && !f.to && !f.q.trim() && f.len === 'any' && f.sort === 'new' && (!f.type || f.type === 'all');
    const cur = location.hash;
    if (cur && !/^#cdf=/.test(cur)) return; // leave YouTube's own anchors alone
    const next = plain ? '' : '#' + C.encodeFilters(f);
    if (cur === next) return;
    try { history.replaceState(history.state, '', location.pathname + location.search + next); } catch (e) { /* ignore */ }
  }

  function clearHash() {
    if (!/^#cdf=/.test(location.hash)) return;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      root.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  async function copyViewLink() {
    const url = `https://www.youtube.com/channel/${S.channel.id}/videos#${C.encodeFilters(S.filters)}`;
    const ok = await copyText(url);
    const note = $('#copied');
    if (!note) return;
    note.textContent = ok ? 'Link copied' : "Couldn't copy";
    note.hidden = false;
    clearTimeout(copyViewLink.t);
    copyViewLink.t = setTimeout(() => { note.hidden = true; }, 1800);
  }

  // ---------- play a range in order ----------
  // YouTube turns up to 50 IDs into a temporary playlist; longer ranges continue chunk by chunk.

  const chunkUrl = (ids, k) => `/watch_videos?video_ids=${ids.slice(k * CHUNK, k * CHUNK + CHUNK).join(',')}`;

  function playRange() {
    // Uploads are stored newest first, so oldest first is simply the reverse index order.
    const ids = S.current
      .filter(i => !(S.videos[i][7] || '').includes('U'))
      .sort((a, b) => b - a)
      .map(i => S.videos[i][0]);
    if (!ids.length) return;
    ss.set('queue', { ids, channel: S.channel.title || '', range: C.rangeLabel(fx()) });
    flush();
    location.assign(chunkUrl(ids, 0));
  }

  function queuePos() {
    const q = ss.get('queue');
    const ref = C.pageRef(location.href);
    if (!q || !Array.isArray(q.ids) || !ref || ref.kind !== 'video') return null;
    const i = q.ids.indexOf(ref.value);
    return i < 0 ? null : { q, i };
  }

  function updateQueuePill() {
    const p = queuePos();
    if (!p) { qpill.hidden = true; return; }
    const { q, i } = p;
    setHTML(qpill, `<span class="ql">${ICON.play}Playing in order</span><span class="qp">${C.fmtCount(i + 1)} of ${C.fmtCount(q.ids.length)}</span>${i + 1 < q.ids.length ? '<button data-act="qnext">Next</button>' : ''}<button data-act="qstop">Stop</button>`);
    qpill.title = [q.channel, q.range].filter(Boolean).join(' · ');
    qpill.hidden = false;
  }

  function queueNext() {
    const p = queuePos();
    if (!p) return;
    const { q, i } = p;
    const next = i + 1;
    if (next >= q.ids.length) return;
    if (next % CHUNK === 0) { location.assign(chunkUrl(q.ids, next / CHUNK)); return; }
    const list = new URL(location.href).searchParams.get('list');
    location.assign(`/watch?v=${q.ids[next]}${list ? '&list=' + encodeURIComponent(list) : ''}`);
  }

  // At the end of each 50-video chunk, start the next one. Ads use the same <video>, so skip those.
  document.addEventListener('ended', e => {
    if (!(e.target instanceof HTMLVideoElement)) return;
    const player = document.querySelector('#movie_player');
    if (player && /\bad-(showing|interrupting)\b/.test(player.className)) return;
    const p = queuePos();
    if (!p) return;
    const { q, i } = p;
    if (i + 1 >= q.ids.length) { ss.set('queue', null); updateQueuePill(); return; }
    if ((i + 1) % CHUNK === 0) location.assign(chunkUrl(q.ids, (i + 1) / CHUNK));
  }, true);

  // ---------- exact dates on hover, anywhere on YouTube ----------

  const HOVER_REL = /^(?:streamed\s+|premiered\s+)?\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i;
  let hoverEl = null, hoverTimer = 0, hoverSeq = 0;

  // The video a date label belongs to: the watch page's own video, or the one card around the label.
  function videoIdFor(el) {
    if (el.closest('ytd-watch-metadata, #above-the-fold, ytd-video-primary-info-renderer')) {
      const r = C.pageRef(location.href);
      if (r && r.kind === 'video') return r.value;
    }
    let e = el;
    for (let depth = 0; depth < 12 && e && e !== document.body; depth++, e = e.parentElement) {
      const links = e.querySelectorAll('a[href*="watch?v="], a[href^="/shorts/"]');
      if (!links.length) continue;
      const ids = new Set();
      for (const a of links) {
        const m = /(?:[?&]v=|\/shorts\/)([\w-]{11})/.exec(a.getAttribute('href') || '');
        if (m) ids.add(m[1]);
        if (ids.size > 1) break;
      }
      return ids.size === 1 ? [...ids][0] : null;
    }
    return null;
  }

  // Places the tooltip above an element, or above a point given as a rect-like { left, top, width, height, bottom }.
  function placeTip(el, html) {
    setHTML(tip, html);
    tip.hidden = false;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : el;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    let top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }

  function hideTip() {
    clearTimeout(hoverTimer);
    hoverSeq++;
    hoverEl = null;
    tip.hidden = true;
  }

  async function showTip(el) {
    const seq = ++hoverSeq;
    const id = videoIdFor(el);
    if (!id) return;
    let d = await knownDate(id);
    if (!d) {
      placeTip(el, '<span class="t">Looking up exact date…</span>');
      const stub = [id, '', 0, -1, '', 0, 0, ''];
      await want(stub, null, 2);
      d = stub[6] > 0 ? { t: stub[6], d: (stub[7] || '').includes('D') } : await knownDate(id);
    }
    if (seq !== hoverSeq || !el.isConnected) return;
    if (!d) { placeTip(el, "<span class=\"t\">Couldn't get the exact date</span>"); return; }
    const date = longDate.format(new Date(d.t));
    placeTip(el, d.d ? esc(date) : `${esc(date)} <span class="t">· ${esc(C.fmtTime(d.t))}</span>`);
  }

  document.addEventListener('mouseover', e => {
    if (!opts.hover) return;
    const el = e.target;
    if (!(el instanceof Element) || el === host || el === hoverEl) return;
    if (el.childElementCount !== 0) return;
    const txt = (el.textContent || '').trim();
    if (txt.length > 40 || !HOVER_REL.test(txt)) return;
    hideTip();
    hoverEl = el;
    hoverTimer = setTimeout(() => showTip(el), 200);
  }, { capture: true, passive: true });

  document.addEventListener('mouseout', e => {
    if (!hoverEl || e.target !== hoverEl) return;
    if (e.relatedTarget && hoverEl.contains(e.relatedTarget)) return;
    hideTip();
  }, { capture: true, passive: true });
  window.addEventListener('scroll', () => { if (hoverEl || watchTipOn) { watchTipOn = false; hideTip(); } }, { capture: true, passive: true });

  // ---------- Dates chip next to YouTube's Latest / Popular / Oldest ----------

  const CHIP_CSS = `
:host { display: inline-flex; }
button { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 0; border-radius: 8px;
  font: 500 14px/20px "Roboto", "Arial", sans-serif; cursor: pointer; white-space: nowrap;
  background: rgba(0,0,0,.05); color: #0f0f0f; }
button:hover { background: rgba(0,0,0,.1); }
:host([data-theme="dark"]) button { background: rgba(255,255,255,.1); color: #f1f1f1; }
:host([data-theme="dark"]) button:hover { background: rgba(255,255,255,.2); }
button:focus-visible { outline: 2px solid #3ea6ff; outline-offset: 2px; }
svg { width: 18px; height: 18px; fill: currentColor; }`;

  function makeChip() {
    const wrap = document.createElement('div');
    wrap.className = 'ytChipBarViewModelChipWrapper';
    wrap.setAttribute('data-cdf-chip', '');
    wrap.setAttribute('data-theme', theme());
    const sr = wrap.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = CHIP_CSS;
    sr.appendChild(st);
    const b = document.createElement('button');
    b.type = 'button';
    b.title = 'Filter this channel’s uploads by date (Alt+Shift+D)';
    setHTML(b, `${ICON.cal}<span>Dates</span>`);
    b.addEventListener('click', e => { e.stopPropagation(); if (S.open) closeDrawer(); else openDrawer(); });
    sr.appendChild(b);
    return wrap;
  }

  // Channel tabs with YouTube's Latest / Popular / Oldest row get the Dates chip in that row.
  // Every other channel page (Home, Playlists, Posts…) gets the side tab straight away.
  const CHIP_TABS = ['videos', 'shorts', 'streams'];
  const chipTab = () => !!(S.ref && S.ref.channelPage && CHIP_TABS.includes(S.ref.tab));

  function ensureChip() {
    let shown = false;
    if (chipTab()) {
      document.querySelectorAll('ytd-rich-grid-renderer chip-bar-view-model, ytd-rich-grid-renderer yt-chip-cloud-renderer').forEach(bar => {
        const scroller = bar.querySelector('.ytChipBarViewModelChipBarScrollContainer, #chips') || bar;
        if (!scroller.getBoundingClientRect().width) return; // a cached, hidden page
        if (!bar.querySelector('[data-cdf-chip]')) scroller.appendChild(makeChip());
        shown = true;
      });
    }
    if (shown) S.noChipSince = 0;
    else if (!S.noChipSince) S.noChipSince = Date.now();
    S.chipShown = shown;
    updateLauncher();
  }

  // On watch pages, a Dates button sits right after Share. It's built from YouTube's own button classes,
  // copied from the Share button, so it gets exactly the same size, shape, colour, hover and icon size.
  const YT_BTN = 'ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextMono ytSpecButtonShapeNextSizeM ytSpecButtonShapeNextIconButton';
  const CAL_PATH = 'M8 2v2h8V2h1.5v2H19a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1.5V2H8Zm11 7.5H5V19c0 .28.22.5.5.5h13a.5.5 0 0 0 .5-.5V9.5ZM5.5 5.5A.5.5 0 0 0 5 6v2h14V6a.5.5 0 0 0-.5-.5h-13ZM15 13h2.5v2.5H15V13Z';
  const WATCH_TIP = '<strong>Uploads around this video</strong> <span class="t">Alt+Shift+D</span>';
  let watchTipOn = false;

  function calSvg(size) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'display:block;fill:currentColor;pointer-events:none';
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', CAL_PATH);
    svg.appendChild(p);
    return svg;
  }

  function wireWatchButton(b) {
    b.type = 'button';
    b.setAttribute('aria-label', 'Uploads around this video');
    b.addEventListener('click', e => {
      e.stopPropagation();
      watchTipOn = false;
      hideTip();
      if (S.open && S.aroundActive) { closeDrawer(); return; }
      S.aroundReq = true;
      if (S.open) load(); else openDrawer();
    });
    const showT = () => { watchTipOn = true; placeTip(b, WATCH_TIP); };
    const hideT = () => { if (watchTipOn) { watchTipOn = false; hideTip(); } };
    b.addEventListener('mouseenter', showT);
    b.addEventListener('mouseleave', hideT);
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) showT(); });
    b.addEventListener('blur', hideT);
  }

  function shareButton(row) {
    return [...row.querySelectorAll('button')].find(b => /^share$/i.test(b.getAttribute('aria-label') || '') || /^share$/i.test((b.textContent || '').trim()));
  }

  function makeWatchButton(share) {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-cdf-watch', '');
    wrap.style.display = 'inline-flex';
    const b = document.createElement('button');
    b.className = share && share.className ? share.className : YT_BTN;
    // Always the round icon-only shape, like Share.
    [...b.classList].filter(c => /IconLeading|IconTrailing|Segmented/.test(c)).forEach(c => b.classList.remove(c));
    if (![...b.classList].some(c => /IconButton/.test(c))) b.classList.add('ytSpecButtonShapeNextIconButton');
    const icon = document.createElement('div');
    const shareIcon = share && share.querySelector('[class*="ButtonShapeNextIcon"]');
    icon.className = shareIcon ? shareIcon.className : 'ytSpecButtonShapeNextIcon';
    icon.appendChild(calSvg(24));
    b.appendChild(icon);
    wireWatchButton(b);
    wrap.appendChild(b);
    return wrap;
  }

  // If YouTube's classes ever stop applying, a self-styled round button that looks the same.
  const WATCH_CSS = `
:host { display: inline-flex; }
button { display: inline-grid; place-items: center; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 20px; cursor: pointer;
  background: rgba(0,0,0,.05); color: #0f0f0f; }
button:hover { background: rgba(0,0,0,.1); }
:host([data-theme="dark"]) button { background: rgba(255,255,255,.1); color: #f1f1f1; }
:host([data-theme="dark"]) button:hover { background: rgba(255,255,255,.2); }
button:focus-visible { outline: 2px solid #3ea6ff; outline-offset: 2px; }`;

  function makeWatchFallback(gap) {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-cdf-watch', '');
    wrap.setAttribute('data-theme', theme());
    wrap.style.marginLeft = gap;
    const sr = wrap.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = WATCH_CSS;
    const b = document.createElement('button');
    b.appendChild(calSvg(24));
    wireWatchButton(b);
    sr.append(st, b);
    return wrap;
  }

  function ensureWatchButton() {
    if (!S.ref || S.ref.kind !== 'video') return;
    const row = document.querySelector('ytd-watch-metadata #top-level-buttons-computed');
    if (!row || !row.getBoundingClientRect().width) return;
    if (row.querySelector(':scope > [data-cdf-watch]')) return;
    const share = shareButton(row);
    const anchor = share ? share.closest('#top-level-buttons-computed > *') : null;
    const gap = anchor ? getComputedStyle(anchor).marginLeft : '8px';
    const w = makeWatchButton(share);
    w.style.marginLeft = gap;
    if (anchor) anchor.after(w); else row.appendChild(w);
    const cs = getComputedStyle(w.firstElementChild);
    if (parseFloat(cs.height) < 28 || cs.borderTopLeftRadius === '0px') w.replaceWith(makeWatchFallback(gap));
  }

  // Add the chip or pill the moment YouTube draws its row, instead of waiting for the next check.
  let chipFrame = 0;
  new MutationObserver(() => {
    if (chipFrame) return;
    const watch = S.ref && S.ref.kind === 'video';
    if (!chipTab() && !watch) return;
    chipFrame = requestAnimationFrame(() => { chipFrame = 0; if (watch) ensureWatchButton(); else ensureChip(); });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- open / close / navigation ----------

  // The side tab shows at once on channel pages without a sort row. On Videos, Shorts and Live it only
  // appears if the row never shows up (some small channels have none), so it never jumps into the row.
  const LAUNCH_DELAY = 3000;
  let launchTimer = 0;
  function updateLauncher() {
    const channel = !!(S.ref && S.ref.channelPage);
    const chips = chipTab();
    const waited = S.noChipSince > 0 && Date.now() - S.noChipSince >= LAUNCH_DELAY;
    const show = channel && !S.open && (!chips || (!S.chipShown && waited));
    if (launch.hidden === show) launch.hidden = !show;
    clearTimeout(launchTimer);
    if (channel && chips && !S.open && !S.chipShown && !waited && S.noChipSince > 0) {
      launchTimer = setTimeout(ensureChip, LAUNCH_DELAY - (Date.now() - S.noChipSince) + 20);
    }
  }

  function openDrawer() {
    if (S.ref && S.ref.kind === 'video') S.aroundReq = true;
    S.open = true;
    ss.set('open', true);
    placeDrawer();
    drawer.hidden = false;
    updateLauncher();
    drawer.focus({ preventScroll: true });
    load();
    pump();
  }

  function closeDrawer() {
    S.open = false;
    ss.set('open', false);
    drawer.hidden = true;
    clearHash();
    updateLauncher();
  }

  function onNav() {
    hideTip();
    const hashFilters = C.decodeFilters(location.hash);
    if (hashFilters) S.pendingHash = hashFilters;
    const ref = C.pageRef(location.href);
    const k = C.refKey(ref);
    updateQueuePill();
    if (ref && ref.kind === 'video') markOpened(ref.value);
    if (!ref || ref.kind !== 'video') { S.around = null; S.aroundActive = false; S.aroundReq = false; }
    if (S.historyOpen && k !== S.refK) closeHistory();
    if (k === S.refK) {
      // Same channel, maybe a different tab: the chip or side tab follows the tab.
      if (ref && S.ref && ref.tab !== S.ref.tab) {
        S.ref = ref;
        S.chipShown = false;
        S.noChipSince = Date.now();
        ensureChip();
      }
      if (hashFilters) { if (S.open) load(); else openDrawer(); }
      return;
    }
    S.ref = ref;
    S.refK = k;
    YT.cfg = null;
    S.chipShown = false;
    S.noChipSince = Date.now(); // a new page: give its chip row time to appear before showing the side tab
    ensureChip();
    if (hashFilters && !S.open) openDrawer();
    else if (S.open) { placeDrawer(); load(); }
  }

  document.addEventListener('yt-navigate-finish', onNav);
  window.addEventListener('popstate', () => setTimeout(onNav, 50));
  // A pasted link to the page you're already on only changes the #cdf part.
  window.addEventListener('hashchange', () => {
    const f = C.decodeFilters(location.hash);
    if (!f) return;
    S.pendingHash = f;
    if (S.open) load(); else openDrawer();
  });
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      const before = lastHref.split('#')[0];
      lastHref = location.href;
      if (location.href.split('#')[0] !== before) onNav();
    }
    ensureChip();
    ensureWatchButton();
  }, 1000);
  setInterval(() => { if (S.open && S.view === 'main' && !S.status) updateMeta(); }, 30000);

  try {
    // Always answer: an unanswered message rejects in the background worker, which would then
    // inject the scripts again and send a second toggle that closes the panel it just opened.
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'toggle') { if (S.open) closeDrawer(); else openDrawer(); }
      sendResponse({ ok: true });
    });
  } catch (e) { /* extension context gone */ }

  // ---------- events ----------

  // how: { highlight: {id, label} to mark a row and scroll to it, keepAround: stays "around this video", scroll }
  function setFilters(patch, how = {}) {
    const rangeChange = 'from' in patch || 'to' in patch || 'otd' in patch;
    if (('from' in patch || 'to' in patch) && !('otd' in patch)) patch.otd = false;
    Object.assign(S.filters, patch);
    const f = S.filters;
    if (f.from && f.to && f.from > f.to) { const t = f.from; f.from = f.to; f.to = t; }
    if (rangeChange) {
      if (!how.keepAround) S.aroundActive = false;
      S.highlight = how.highlight || null;
      S.scrollToHl = !!(how.highlight || how.scroll);
    }
    S.shown = PAGE;
    S.animate = true;
    renderResults();
    refine();
  }

  // Jump to one upload's day and mark it (First video, milestones).
  async function jumpTo(rec, label) {
    if (!rec || !S.entry) return;
    if (!(rec[6] > 0)) {
      S.status = 'finding the date…';
      updateMeta();
      await want(rec, S.entry, 2);
      S.status = '';
      updateMeta();
    }
    const i = S.videos.indexOf(rec);
    if (i < 0) return;
    const t = rec[6] > 0 ? rec[6] : C.view(S.videos).est[i];
    const day = C.isoDay(new Date(t));
    setFilters({ from: day, to: day }, { highlight: { id: rec[0], label } });
  }

  // ---------- typing a date ----------

  function startDateEdit() {
    if (S.view !== 'main' || !$('#rTyping')) return;
    S.dateEditing = true;
    $('#rTitleH').hidden = true;
    $('#rTyping').hidden = false;
    $('#rCount').hidden = true;
    const inp = $('#dateQ');
    inp.value = '';
    updateDateHint();
    inp.focus();
  }

  function stopDateEdit(apply) {
    if (!S.dateEditing) return;
    const inp = $('#dateQ');
    if (apply) {
      const r = C.parseDateQuery(inp.value, new Date(), { mdFirst });
      if (!r) { updateDateHint(true); inp.focus(); return; }
      S.dateEditing = false;
      $('#rTyping').hidden = true;
      $('#rTitleH').hidden = false;
      $('#rCount').hidden = false;
      if (r.first) jumpTo(S.videos[S.videos.length - 1], 'First upload');
      else if (r.otd) setFilters({ otd: true, from: '', to: '' });
      else setFilters({ from: r.from, to: r.to });
      $('#rTitle').focus();
      return;
    }
    S.dateEditing = false;
    $('#rTyping').hidden = true;
    $('#rTitleH').hidden = false;
    $('#rCount').hidden = false;
    $('#rTitle').focus();
  }

  function updateDateHint(insist) {
    const inp = $('#dateQ'), hint = $('#dateHint');
    if (!inp || !hint) return;
    const v = inp.value.trim();
    hint.classList.remove('bad');
    if (!v) { setHTML(hint, 'Try “march 2019”, “last 3 months”, “summer 2021” or “2015–2017”'); return; }
    const r = C.parseDateQuery(v, new Date(), { mdFirst });
    if (!r) {
      hint.classList.add('bad');
      setHTML(hint, insist ? 'That isn’t a date this understands yet. Try “march 2019” or “5 mar 2019”.' : 'Keep typing…');
      return;
    }
    if (r.first) { setHTML(hint, '<b>First upload</b> · press Enter'); return; }
    const f = Object.assign({}, fx(), r.otd ? { otd: true, from: '', to: '' } : { otd: false, from: r.from, to: r.to });
    const { idx, pending } = C.select(S.videos, f, C.view(S.videos), S.scores);
    const n = idx.length;
    const count = n ? `${pending ? 'about ' : ''}${plural(n, 'upload')}` : pending ? 'checking' : 'no uploads';
    setHTML(hint, `<b>${esc(C.rangeTitle(f).title)}</b> · ${count} · press Enter`);
  }

  // ---------- dragging across days or years ----------

  function dragRange(d) {
    if (d.kind === 'day') {
      const a = d.a.dataset.d, b = d.b.dataset.d;
      return a <= b ? { from: a, to: b } : { from: b, to: a };
    }
    const a = +d.a.dataset.k, b = +d.b.dataset.k;
    return { from: `${Math.min(a, b)}-01-01`, to: `${Math.max(a, b)}-12-31` };
  }

  function paintDrag() {
    const d = S.drag;
    const r = dragRange(d);
    root.querySelectorAll('#timeline .sel').forEach(el => el.classList.remove('sel'));
    if (d.kind === 'day') {
      root.querySelectorAll('#timeline .cd[data-d]').forEach(el => el.classList.toggle('sel', el.dataset.d >= r.from && el.dataset.d <= r.to));
    } else {
      const lo = +r.from.slice(0, 4), hi = +r.to.slice(0, 4);
      root.querySelectorAll('#timeline .bar[data-k]').forEach(el => el.classList.toggle('sel', +el.dataset.k >= lo && +el.dataset.k <= hi));
    }
    drawer.classList.add('dragging');
    // Count the same way the results will: exact dates where known, estimates elsewhere.
    const f = Object.assign({}, fx(), { otd: false, from: r.from, to: r.to });
    const { idx, pending } = C.select(S.videos, f, C.view(S.videos), S.scores);
    const n = idx.length;
    const count = n ? `${pending ? 'about ' : ''}${plural(n, 'upload')}` : pending ? 'checking' : 'no uploads';
    placeTip(d.b, `<strong>${esc(C.rangeTitle(r).title)}</strong> <span class="t">${count}</span>`);
  }

  root.addEventListener('pointerdown', e => {
    if (e.button !== 0 || S.view !== 'main') return;
    const cell = e.target.closest && e.target.closest('#timeline .cd[data-d], #timeline .bar[data-k]');
    if (!cell) return;
    S.drag = { kind: cell.classList.contains('cd') ? 'day' : 'bar', a: cell, b: cell, moved: false, id: e.pointerId };
  });
  window.addEventListener('pointermove', e => {
    const d = S.drag;
    if (!d || e.pointerId !== d.id) return;
    const el = root.elementFromPoint(e.clientX, e.clientY);
    const t = el && el.closest && el.closest(d.kind === 'day' ? '#timeline .cd[data-d]' : '#timeline .bar[data-k]');
    if (!t || t === d.b) return;
    d.b = t;
    if (t !== d.a) d.moved = true;
    if (d.moved) paintDrag();
  }, true);
  window.addEventListener('pointerup', e => {
    const d = S.drag;
    if (!d || e.pointerId !== d.id) return;
    S.drag = null;
    drawer.classList.remove('dragging');
    if (!d.moved) return; // a plain click: the click handler takes it
    S.suppressClick = true;
    setTimeout(() => { S.suppressClick = false; }, 0);
    hideTip();
    const r = dragRange(d);
    setFilters({ from: r.from, to: r.to });
  }, true);
  window.addEventListener('pointercancel', () => {
    if (!S.drag) return;
    S.drag = null;
    drawer.classList.remove('dragging');
    root.querySelectorAll('#timeline .sel').forEach(el => el.classList.remove('sel'));
    hideTip();
  }, true);

  // ---------- whole history: every year as one row of days ----------

  function openHistory() {
    if (S.view !== 'main' || !S.videos.length) return;
    S.historyOpen = true;
    S.histSel = null;
    histOv.hidden = false;
    setHTML($('#hoAvatar'), $('#chAvatar').innerHTML);
    $('#hoTitle').textContent = (S.channel && S.channel.title) || 'Whole history';
    renderHistory();
    histOv.focus({ preventScroll: true });
  }

  function closeHistory() {
    if (!S.historyOpen) return;
    S.historyOpen = false;
    S.histSel = null;
    histOv.hidden = true;
    hideTip();
    if (S.open) drawer.focus({ preventScroll: true });
  }

  function renderHistory() {
    if (!S.historyOpen) return;
    const cv = $('#hoCanvas'), wrap = $('#hoBody');
    const f = fx();
    const vw = C.view(S.videos);
    const h = C.history(S.videos, f, vw);
    const n = h.years.length;
    // Titles by day, for the tooltip
    const titles = new Map();
    for (let i = 0; i < S.videos.length; i++) {
      const r = S.videos[i];
      if (!(r[6] > 0)) continue;
      const k = C.isoDay(new Date(r[6]));
      if (!titles.has(k)) titles.set(k, []);
      titles.get(k).push(r[1]);
    }
    const total = h.years.reduce((a, y) => a + y.total, 0);
    const exact = exactCount();
    $('#hoSub').textContent = n ? `${plural(total, 'upload')} · ${h.years[0].year}–${h.years[n - 1].year}` : 'No uploads';
    setHTML($('#hoNote'), exact < S.videos.length
      ? (opts.fill ? `Loading exact dates: ${C.fmtCount(exact)} of ${C.fmtCount(S.videos.length)}` : 'Faint marks are estimated. <button class="link-btn" data-act="fillOn">Load all exact dates</button>')
      : '');
    cv.setAttribute('aria-label', `Uploads per day, ${n ? `${h.years[0].year} to ${h.years[n - 1].year}` : 'none'}`);

    const css = getComputedStyle(host);
    const tok = name => css.getPropertyValue(name).trim() || '#888';
    const col = { h0: tok('--h0'), lv: [tok('--h1'), tok('--h2'), tok('--h3'), tok('--h4')], est: tok('--h2'), fg2: tok('--fg-2'), fg3: tok('--fg-3'), line: tok('--line'), mark: tok('--mark') };
    const W = Math.max(480, wrap.clientWidth - parseFloat(getComputedStyle(wrap).paddingLeft) - parseFloat(getComputedStyle(wrap).paddingRight));
    const labelW = 52, totalW = 64, top = 24, gap = 6;
    const avail = wrap.clientHeight - 36 - top;
    const rowH = Math.max(12, Math.min(34, Math.floor(avail / Math.max(1, n)) - gap));
    const gridW = W - labelW - totalW;
    const cellW = gridW / 366;
    const H = top + n * (rowH + gap);
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    // Months across the top, with faint lines down the rows
    ctx.font = '500 11px Roboto, Arial, sans-serif';
    ctx.fillStyle = col.fg3;
    C.SLOT_START.forEach((s, m) => {
      const x = labelW + s * cellW;
      ctx.fillText(C.MONTHS[m], x + 2, 10);
      if (m) { ctx.fillStyle = col.line; ctx.fillRect(Math.round(x), top - 4, 1, H - top + 4); ctx.fillStyle = col.fg3; }
    });

    const today = new Date();
    const sel = S.histSel;
    h.years.forEach((yr, r) => {
      const y = top + r * (rowH + gap);
      ctx.font = '600 13px "YouTube Sans", Roboto, Arial, sans-serif';
      ctx.fillStyle = col.fg2;
      ctx.fillText(String(yr.year), 0, y + rowH / 2);
      ctx.fillStyle = col.h0;
      ctx.fillRect(labelW, y, gridW, rowH);
      const leap = new Date(yr.year, 1, 29).getMonth() === 1;
      for (let s = 0; s < 366; s++) {
        if (s === 59 && !leap) continue;
        const x = labelW + s * cellW, w = Math.max(1, cellW - (cellW > 3 ? 0.6 : 0));
        const e = yr.exact[s];
        if (e) {
          ctx.fillStyle = col.lv[e === 1 ? 0 : e === 2 ? 1 : e <= 4 ? 2 : 3];
          ctx.fillRect(x, y, w, rowH);
        } else if (yr.est[s]) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = col.est;
          ctx.fillRect(x, y + rowH * 0.25, w, rowH * 0.5);
          ctx.globalAlpha = 1;
        }
      }
      if (sel && yr.year >= +sel.from.slice(0, 4) && yr.year <= +sel.to.slice(0, 4)) {
        const slotOfIso = s => C.SLOT_START[+s.slice(5, 7) - 1] + +s.slice(8) - 1;
        const a = yr.year === +sel.from.slice(0, 4) ? slotOfIso(sel.from) : 0;
        const b = yr.year === +sel.to.slice(0, 4) ? slotOfIso(sel.to) : 365;
        if (b >= a) {
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = col.mark;
          ctx.fillRect(labelW + a * cellW, y - 2, (b - a + 1) * cellW, rowH + 4);
          ctx.globalAlpha = 1;
        }
      }
      if (yr.year === today.getFullYear()) {
        const s = C.SLOT_START[today.getMonth()] + today.getDate();
        ctx.fillStyle = css.getPropertyValue('--bg').trim() || '#000';
        ctx.globalAlpha = 0.55;
        ctx.fillRect(labelW + s * cellW, y, gridW - s * cellW, rowH);
        ctx.globalAlpha = 1;
      }
      ctx.font = '500 12px Roboto, Arial, sans-serif';
      ctx.fillStyle = col.fg3;
      const t = C.fmtCount(yr.total);
      ctx.fillText(t, W - ctx.measureText(t).width, y + rowH / 2);
    });
    S.histLayout = { labelW, top, rowH, gap, cellW, gridW, years: h.years.map(y => y.year), titles, exactRows: h.years };
  }

  function histHit(e) {
    const L = S.histLayout;
    if (!L) return null;
    const rect = $('#hoCanvas').getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (y < L.top - 4) return null;
    const r = Math.min(L.years.length - 1, Math.max(0, Math.floor((y - L.top + L.gap / 2) / (L.rowH + L.gap))));
    const year = L.years[r];
    if (x < L.labelW) return { year, label: true, r };
    const s = Math.floor((x - L.labelW) / L.cellW);
    if (s < 0 || s >= 366) return { year, r };
    const d = C.slotDate(year, s);
    return d ? { year, r, slot: s, date: C.isoDay(d), cx: rect.left + L.labelW + (s + 0.5) * L.cellW, cy: rect.top + L.top + r * (L.rowH + L.gap) } : { year, r };
  }

  function histTip(hit) {
    const L = S.histLayout;
    if (!hit || !hit.date) { hideTip(); return; }
    const yr = L.exactRows[hit.r];
    const exactN = yr ? yr.exact[hit.slot] : 0, estN = yr ? yr.est[hit.slot] : 0;
    const names = L.titles.get(hit.date) || [];
    const what = exactN ? plural(exactN, 'upload') : estN ? `maybe ${plural(estN, 'upload')}` : 'no uploads';
    const first = names[0] ? `<span class="tl2">${esc(names[0])}${names.length > 1 ? ` +${names.length - 1} more` : ''}</span>` : '';
    placeTip({ left: hit.cx, top: hit.cy, width: 0, height: L.rowH, bottom: hit.cy + L.rowH }, `<strong>${esc(dateTimeFmt.format(new Date(hit.date + 'T12:00:00')))}</strong> <span class="t">${what}</span>${first}`);
  }

  let histDrag = null;
  const hoCanvas = $('#hoCanvas');
  hoCanvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const hit = histHit(e);
    if (!hit) return;
    hoCanvas.setPointerCapture(e.pointerId);
    histDrag = { id: e.pointerId, a: hit.date || null, b: hit.date || null, label: hit.label ? hit.year : null, moved: false };
  });
  hoCanvas.addEventListener('pointermove', e => {
    const hit = histHit(e);
    histTip(hit);
    if (!histDrag || e.pointerId !== histDrag.id || !histDrag.a || !hit || !hit.date || hit.date === histDrag.b) return;
    histDrag.b = hit.date;
    histDrag.moved = true;
    S.histSel = histDrag.a <= histDrag.b ? { from: histDrag.a, to: histDrag.b } : { from: histDrag.b, to: histDrag.a };
    renderHistory();
  });
  hoCanvas.addEventListener('pointerleave', () => { if (!histDrag) hideTip(); });
  hoCanvas.addEventListener('pointerup', e => {
    const d = histDrag;
    histDrag = null;
    if (!d || e.pointerId !== d.id) return;
    const hit = histHit(e);
    let r = null;
    if (d.moved && S.histSel) r = S.histSel;
    else if (d.label && hit && hit.label && hit.year === d.label) r = { from: `${d.label}-01-01`, to: `${d.label}-12-31` };
    else if (d.a && hit && hit.date === d.a) r = { from: d.a, to: d.a };
    S.histSel = null;
    if (!r) { renderHistory(); return; }
    closeHistory();
    setFilters({ from: r.from, to: r.to });
  });
  hoCanvas.addEventListener('pointercancel', () => { histDrag = null; S.histSel = null; renderHistory(); });
  for (const type of ['keydown', 'keypress', 'keyup']) {
    histOv.addEventListener(type, e => {
      if (type === 'keydown' && (e.key === 'Escape' || (e.key === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey))) { e.preventDefault(); closeHistory(); }
      e.stopPropagation();
    });
  }

  // ---------- grid view, shortcuts sheet ----------

  function toggleView() {
    opts.view = opts.view === 'grid' ? 'list' : 'grid';
    storageSet({ opts });
    const list = $('#list');
    if (list) list.classList.toggle('grid', opts.view === 'grid');
    const b = $('#viewBtn');
    if (b) b.setAttribute('aria-pressed', String(opts.view === 'grid'));
  }

  function toggleKeys(open) {
    S.keysOpen = open === undefined ? !S.keysOpen : open;
    $('#keysOv').hidden = !S.keysOpen;
    if (S.keysOpen) $('#keysOv .icon').focus(); else drawer.focus({ preventScroll: true });
  }

  // ---------- resizing the panel ----------

  let resizing = null;
  resizer.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    resizing = { id: e.pointerId };
    drawer.classList.add('resizing');
    resizer.classList.add('on');
  });
  resizer.addEventListener('pointermove', e => {
    if (!resizing || e.pointerId !== resizing.id) return;
    opts.width = Math.min(maxW(), Math.max(MIN_W, window.innerWidth - e.clientX));
    applyWidth();
  });
  const endResize = e => {
    if (!resizing || (e && e.pointerId !== resizing.id)) return;
    resizing = null;
    drawer.classList.remove('resizing');
    resizer.classList.remove('on');
    storageSet({ opts });
  };
  resizer.addEventListener('pointerup', endResize);
  resizer.addEventListener('pointercancel', endResize);
  resizer.addEventListener('dblclick', () => { opts.width = DEF_W; applyWidth(); storageSet({ opts }); });
  resizer.addEventListener('keydown', e => {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === 'ArrowLeft') opts.width = Math.min(maxW(), (opts.width || DEF_W) + step);
    else if (e.key === 'ArrowRight') opts.width = Math.max(MIN_W, (opts.width || DEF_W) - step);
    else return;
    e.preventDefault();
    applyWidth();
    storageSet({ opts });
  });
  window.addEventListener('resize', () => {
    if (S.open) applyWidth();
    if (S.historyOpen) renderHistory();
  });

  function onBar(btn, extend) {
    const f = S.filters;
    let from = btn.dataset.from, to = btn.dataset.to;
    const mode = $('#bars').dataset.mode;
    if (extend && !f.otd && (f.from || f.to)) {
      if (f.from && f.from < from) from = f.from;
      if (f.to && f.to > to) to = f.to;
    } else if (!f.otd && f.from === from && f.to === to) {
      if (mode === 'months') { const y = from.slice(0, 4); from = `${y}-01-01`; to = `${y}-12-31`; }
      else { from = ''; to = ''; }
    }
    setFilters({ from, to });
  }

  function onDay(btn) {
    const d = btn.dataset.d;
    const f = S.filters;
    if (f.from === d && f.to === d) { const y = d.slice(0, 4); setFilters({ from: `${y}-01-01`, to: `${y}-12-31` }); }
    else setFilters({ from: d, to: d });
  }

  async function clearAll() {
    // Lookups and syncs still running for this channel must not write it back afterwards.
    if (S.entry) discarded.add(S.entry);
    clearEpoch++;
    try {
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all).filter(k => /^(up|ch|d|v):/.test(k));
      await chrome.storage.local.remove([...keys, 'idx', 'opened']);
    } catch (e) { /* ignore */ }
    dirty.clear();
    dateCache.clear();
    opened.clear();
    S.entry = null;
    S.videos = [];
    S.byId = new Map();
    S.channelRefK = '';
    dropForeignJobs();
    const b = $('#clearAll');
    if (b) { b.textContent = 'Cleared'; b.disabled = true; }
  }

  root.addEventListener('click', e => {
    if (S.suppressClick) { S.suppressClick = false; e.preventDefault(); return; }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    switch (t.dataset.act) {
      case 'open': openDrawer(); break;
      case 'close': closeDrawer(); break;
      case 'settings': if (S.view !== 'settings') show('settings'); else load(); break;
      case 'back': load(); break;
      case 'retry': S.channelRefK = ''; S.channel = null; S.entry = null; S.videos = []; load(); break;
      case 'refresh': startSync(false); break;
      case 'fullSync': show('main'); startSync(true); break;
      case 'clearAll': clearAll(); break;
      case 'preset': {
        const p = C.presets().find(x => x.id === t.dataset.id);
        if (p) setFilters({ from: p.from, to: p.to });
        break;
      }
      case 'otd': setFilters(S.filters.otd ? { otd: false } : { otd: true, from: '', to: '' }); break;
      case 'type': setFilters({ type: t.dataset.type }); renderTypes(); break;
      case 'bar': onBar(t, e.shiftKey); break;
      case 'day': onDay(t); break;
      case 'editDates': {
        S.editOpen = !S.editOpen;
        $('#rEdit').hidden = !S.editOpen;
        t.setAttribute('aria-expanded', String(S.editOpen));
        if (S.editOpen) $('#from').focus();
        break;
      }
      case 'yearStep': {
        const y = Number(($('.yr') || {}).textContent) + Number(t.dataset.step);
        if (y) setFilters({ from: `${y}-01-01`, to: `${y}-12-31` });
        break;
      }
      case 'month': {
        const f = S.filters;
        if (f.from === t.dataset.from && f.to === t.dataset.to) { const y = t.dataset.from.slice(0, 4); setFilters({ from: `${y}-01-01`, to: `${y}-12-31` }); }
        else setFilters({ from: t.dataset.from, to: t.dataset.to });
        break;
      }
      case 'jump': setFilters({ from: t.dataset.d, to: t.dataset.d }); break;
      case 'allYears': setFilters({ from: '', to: '' }); break;
      case 'clear': setFilters({ q: '', len: 'any', type: 'all' }); renderTypes(); break;
      case 'more': S.shown += PAGE; renderResults(); break;
      case 'play': playRange(); break;
      case 'link': copyViewLink(); break;
      case 'qnext': queueNext(); break;
      case 'qstop': ss.set('queue', null); updateQueuePill(); break;
      case 'fillOn': opts.fill = true; storageSet({ opts }); S.fillAt = 0; pump(); updateMeta(); if (S.historyOpen) renderHistory(); break;
      case 'typeDate': startDateEdit(); break;
      case 'first': jumpTo(S.videos[S.videos.length - 1], 'First upload'); break;
      case 'mile': jumpTo(S.videos[+t.dataset.i], t.dataset.label); break;
      case 'around': applyAround(t.dataset.span); break;
      case 'viewToggle': toggleView(); break;
      case 'keys': if (S.view === 'settings') load().then(() => toggleKeys(true)); else toggleKeys(); break;
      case 'history': openHistory(); break;
      case 'historyClose': closeHistory(); break;
    }
  });

  // Instant labels for the timeline: hover or keyboard focus on a year, month or day.
  let panelTipEl = null;
  function showPanelTip(el) {
    panelTipEl = el;
    placeTip(el, `<strong>${esc(el.dataset.tipH || '')}</strong> <span class="t">${esc(el.dataset.tip || '')}</span>`);
  }
  function hidePanelTip(el) {
    if (panelTipEl && (!el || el === panelTipEl)) { panelTipEl = null; hideTip(); }
  }
  root.addEventListener('pointerover', e => {
    if (S.drag && S.drag.moved) return;
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t) showPanelTip(t); else hidePanelTip();
  });
  root.addEventListener('pointerout', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) hidePanelTip(t);
  });
  root.addEventListener('focusin', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && t.matches(':focus-visible')) showPanelTip(t);
  });
  root.addEventListener('focusout', e => hidePanelTip(e.target));
  root.addEventListener('scroll', e => {
    const pk = e.target;
    if (pk && pk.id === 'picks') pk.classList.toggle('fade', pk.scrollLeft + pk.clientWidth < pk.scrollWidth - 2);
  }, true);
  body.addEventListener('scroll', () => hidePanelTip(), { passive: true });

  root.addEventListener('focusout', e => {
    if (e.target.id !== 'dateQ') return;
    setTimeout(() => { if (S.dateEditing && root.activeElement !== $('#dateQ')) stopDateEdit(false); }, 120);
  });

  let qTimer = 0;
  root.addEventListener('input', e => {
    if (e.target.id === 'dateQ') { updateDateHint(); return; }
    if (e.target.id === 'q') {
      // Read the value now: after dispatch, a shadow-DOM event's target is retargeted to the host.
      const q = e.target.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(() => setFilters({ q }), 150);
    }
  });
  root.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'from' || id === 'to' || id === 'len' || id === 'sort') setFilters({ [id]: e.target.value });
    if (id === 'optFill') {
      opts.fill = e.target.checked;
      storageSet({ opts });
      if (opts.fill) { S.fillAt = 0; pump(); }
      else { for (const j of Q.low) { Q.jobs.delete(j.rec[0]); j.resolve(); } Q.low = []; }
    }
    if (id === 'optMarks') {
      opts.marks = e.target.checked;
      storageSet({ opts });
    }
    if (id === 'optHover') {
      opts.hover = e.target.checked;
      if (!opts.hover) hideTip();
      storageSet({ opts });
    }
  });

  // A tap or click anywhere outside the panel closes it. The click still goes through to YouTube,
  // so clicking a video both closes the panel and opens the video. The Dates chip toggles the panel
  // itself, and right-clicks are ignored so the context menu doesn't close it.
  document.addEventListener('pointerdown', e => {
    if (!S.open || e.button > 0) return;
    const path = e.composedPath();
    if (path.includes(host)) return;
    if (path.some(n => n instanceof Element && (n.hasAttribute('data-cdf-chip') || n.hasAttribute('data-cdf-watch')))) return;
    closeDrawer();
  }, true);

  // Keyboard shortcuts inside the panel. All keys stop here, so YouTube's own shortcuts (k, j, l, /, f…)
  // don't fire while you're using the panel.
  function moveFocus(sel, el, delta) {
    const all = [...root.querySelectorAll(sel)];
    const i = all.indexOf(el);
    const next = all[Math.min(all.length - 1, Math.max(0, (i < 0 ? (delta > 0 ? -1 : all.length) : i) + delta))];
    if (next) { next.focus(); next.scrollIntoView({ block: 'nearest' }); }
  }

  function onKey(e) {
    const t = e.target;
    const tag = (t.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (e.key === 'Escape') {
      e.preventDefault();
      if (S.keysOpen) toggleKeys(false);
      else if (S.dateEditing) stopDateEdit(false);
      else if (typing && t.id === 'q') t.blur();
      else closeDrawer();
      return;
    }
    if (t.id === 'dateQ' && e.key === 'Enter') { e.preventDefault(); stopDateEdit(true); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || S.view !== 'main' || S.keysOpen) {
      if (S.keysOpen && e.key === '?') { e.preventDefault(); toggleKeys(false); }
      return;
    }
    const arrows = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in arrows && t.classList) {
      if (t.matches('.cd[data-d]')) {
        const d = new Date(t.dataset.d + 'T12:00:00');
        d.setDate(d.getDate() + arrows[e.key]);
        const next = root.querySelector(`.cd[data-d="${C.isoDay(d)}"]`);
        if (next) next.focus();
        e.preventDefault();
        return;
      }
      if (t.matches('.mo-h')) {
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key];
        const all = [...root.querySelectorAll('.mo-h')];
        const next = all[all.indexOf(t) + step];
        if (next) next.focus();
        e.preventDefault();
        return;
      }
      if (t.matches('.bar') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { moveFocus('.bar', t, arrows[e.key]); e.preventDefault(); return; }
      if (t.matches('.row') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { moveFocus('.row', t, e.key === 'ArrowDown' ? 1 : -1); e.preventDefault(); return; }
    }
    switch (e.key) {
      case '/': e.preventDefault(); $('#q').focus(); break;
      case 'd': case 'D': e.preventDefault(); startDateEdit(); break;
      case '[': case ']': {
        const r = C.stepRange(S.filters, e.key === '[' ? -1 : 1);
        if (r) setFilters(r);
        e.preventDefault();
        break;
      }
      case 'j': case 'J': moveFocus('.row', t, 1); e.preventDefault(); break;
      case 'k': case 'K': moveFocus('.row', t, -1); e.preventDefault(); break;
      case 'g': case 'G': toggleView(); e.preventDefault(); break;
      case 'h': case 'H': openHistory(); e.preventDefault(); break;
      case '?': toggleKeys(true); e.preventDefault(); break;
    }
  }

  for (const type of ['keydown', 'keypress', 'keyup']) {
    drawer.addEventListener(type, e => {
      if (type === 'keydown') onKey(e);
      e.stopPropagation();
    });
  }

  let scrollTimer = 0;
  body.addEventListener('scroll', () => {
    if (S.view !== 'main' || !S.channel) return;
    clearTimeout(scrollTimer);
    const id = S.channel.id;
    scrollTimer = setTimeout(() => ss.set('s:' + id, body.scrollTop), 150);
  }, { passive: true });

  // ---------- start ----------

  (async () => {
    const saved = await storageGet('opts');
    if (saved) Object.assign(opts, saved);
    const ids = await storageGet('opened');
    if (Array.isArray(ids)) ids.forEach(id => opened.add(id));
    if (S.open) applyWidth();
    if (S.view === 'main') renderResults();
  })();
  S.ref = C.pageRef(location.href);
  if (S.ref && S.ref.kind === 'video') markOpened(S.ref.value);
  S.refK = C.refKey(S.ref);
  S.pendingHash = C.decodeFilters(location.hash);
  updateLauncher();
  updateQueuePill();
  ensureChip();
  if (S.pendingHash || (ss.get('open') && S.ref && S.ref.channelPage)) openDrawer();
})();
