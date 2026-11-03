// Channel Almanac — pure helpers shared by the content script (and tests).
//
// A video record is an array:
//   [0 id, 1 title, 2 durationSec, 3 views, 4 relativeText, 5 seenAtMs, 6 exactMs, 7 flags, 8 likes]
// exactMs: >0 exact publish time, 0 unknown, -1 lookup failed (memory only)
// likes:   >=0 like count, null/absent not looked up, -1 hidden by the channel, -2 lookup failed (memory only)
// flags:   'L' live now, 'U' upcoming, 'D' exact date has no time-of-day
// Lists are kept in YouTube's uploads order: newest first.

var CDF = (() => {
  const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const UNIT = { second: SEC, minute: MIN, hour: HOUR, day: DAY, week: 7 * DAY, month: 30.44 * DAY, year: 365.25 * DAY };

  const pad = n => String(n).padStart(2, '0');
  const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayStart = s => (s ? new Date(s + 'T00:00:00').getTime() : -Infinity);
  const dayEnd = s => (s ? new Date(s + 'T23:59:59.999').getTime() : Infinity);

  // ---------- URLs ----------

  function pageRef(href) {
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    const p = u.pathname;
    let m;
    const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
    const tab = rest => (rest || '').split('/').filter(Boolean)[0] || '';
    if ((m = p.match(/^\/channel\/(UC[\w-]{22})(?:\/(.*))?$/))) return { kind: 'id', value: m[1], channelPage: true, tab: tab(m[2]).toLowerCase() };
    if ((m = p.match(/^\/(@[^/]+)(?:\/(.*))?$/))) return { kind: 'handle', value: dec(m[1]), path: '/' + m[1], channelPage: true, tab: tab(m[2]).toLowerCase() };
    if ((m = p.match(/^\/user\/([^/]+)(?:\/(.*))?$/))) return { kind: 'user', value: dec(m[1]), path: '/user/' + m[1], channelPage: true, tab: tab(m[2]).toLowerCase() };
    if ((m = p.match(/^\/c\/([^/]+)(?:\/(.*))?$/))) return { kind: 'custom', value: dec(m[1]), path: '/c/' + m[1], channelPage: true, tab: tab(m[2]).toLowerCase() };
    if (p === '/watch' && /^[\w-]{11}$/.test(u.searchParams.get('v') || '')) return { kind: 'video', value: u.searchParams.get('v'), channelPage: false };
    if ((m = p.match(/^\/(?:shorts|live)\/([\w-]{11})(?:\/|$)/))) return { kind: 'video', value: m[1], channelPage: false };
    return null;
  }

  const refKey = r => (r ? `${r.kind}:${r.kind === 'handle' ? r.value.toLowerCase() : r.value}` : '');

  // ---------- reading YouTube's page data ----------

  function walk(root, visit) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      if (!Array.isArray(n) && visit(n) === false) continue;
      const vals = Array.isArray(n) ? n : Object.values(n);
      for (let i = vals.length - 1; i >= 0; i--) {
        const v = vals[i];
        if (v && typeof v === 'object') stack.push(v);
      }
    }
  }

  function textOf(x) {
    if (!x) return '';
    if (typeof x === 'string') return x;
    if (typeof x.simpleText === 'string') return x.simpleText;
    if (typeof x.content === 'string') return x.content;
    if (Array.isArray(x.runs)) return x.runs.map(r => r.text || '').join('');
    return '';
  }

  function strings(node, skip) {
    const out = [];
    walk(node, n => {
      for (const v of Object.values(n)) if (typeof v === 'string' && v !== skip && v.length < 80) out.push(v.trim());
      return out.length < 600;
    });
    return out;
  }

  // YouTube writes these long ("3 years ago") or, on newer cards, short ("3y ago", "2 wk ago", "11 mo ago").
  // A bare "m" is left out: it could mean minutes or months, and a wrong unit would give bounds
  // that miss the real date.
  const REL = /^(?:streamed\s+|premiered\s+|updated\s+)?(\d+)\s*(seconds?|secs?|s|minutes?|mins?|hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?|years?|yrs?|y)\.?\s+ago$/i;
  const UNIT_WORD = { s: 'second', sec: 'second', second: 'second', min: 'minute', minute: 'minute', h: 'hour', hr: 'hour', hour: 'hour', d: 'day', day: 'day', w: 'week', wk: 'week', week: 'week', mo: 'month', month: 'month', y: 'year', yr: 'year', year: 'year' };
  const relUnit = word => { const w = word.toLowerCase(); return UNIT[UNIT_WORD[w] || UNIT_WORD[w.replace(/s$/, '')]]; };
  const DUR = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/;
  const VIEWS = /^([\d][\d.,]*)\s*([KMB])?\s+views?$/i;

  function parseDur(s) {
    const m = DUR.exec(s || '');
    return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
  }

  function parseViews(s) {
    if (/^no views$/i.test(s)) return 0;
    const m = VIEWS.exec(s || '');
    if (!m) return null;
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
    const num = mult > 1 ? parseFloat(m[1].replace(/,/g, '')) : parseInt(m[1].replace(/[.,]/g, ''), 10);
    return Math.round(num * mult);
  }

  // Pull video entries out of a browse response, whatever renderer YouTube currently uses.
  function extractVideos(json) {
    const out = [];
    const seen = new Set();
    walk(listRoot(json), n => {
      let id = null, title = '';
      if (typeof n.videoId === 'string' && /^[\w-]{11}$/.test(n.videoId) && (n.title || n.headline)) {
        id = n.videoId;
        title = textOf(n.title) || textOf(n.headline);
      } else if (typeof n.contentId === 'string' && /^[\w-]{11}$/.test(n.contentId) && n.metadata && n.metadata.lockupMetadataViewModel) {
        id = n.contentId;
        title = textOf(n.metadata.lockupMetadataViewModel.title);
      }
      if (!id || !title) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      let rel = '', views = -1, dur = 0, flag = '';
      for (const s of strings(n, title)) {
        if (!rel && REL.test(s)) rel = s;
        else if (views < 0 && VIEWS.test(s)) views = parseViews(s);
        else if (views < 0 && /^no views$/i.test(s)) views = 0;
        else if (!dur && DUR.test(s)) dur = parseDur(s);
        else if (!flag && (/^(LIVE|LIVE NOW)$/i.test(s) || /\bwatching$/i.test(s))) flag = 'L';
        else if (!flag && (/^(Scheduled for|Premieres)\b/i.test(s) || /^UPCOMING$/i.test(s))) flag = 'U';
      }
      if (!dur && n.lengthSeconds) dur = parseInt(n.lengthSeconds, 10) || 0;
      out.push({ id, title, dur, views, rel, flag });
      return false;
    });
    return out;
  }

  // Just the video IDs from a list page, including Shorts lockups (used for the Shorts / Live lists).
  function extractIds(json) {
    const out = [];
    const seen = new Set();
    const add = id => { if (id && /^[\w-]{11}$/.test(id) && !seen.has(id)) { seen.add(id); out.push(id); } };
    walk(listRoot(json), n => {
      if (n.shortsLockupViewModel || n.reelItemRenderer) {
        const node = n.shortsLockupViewModel || n.reelItemRenderer;
        let id = node.videoId || null;
        if (!id) walk(node, m => { if (!id && m.reelWatchEndpoint && m.reelWatchEndpoint.videoId) id = m.reelWatchEndpoint.videoId; return !id; });
        add(id);
        return false;
      }
      if (typeof n.contentId === 'string' && n.metadata && n.metadata.lockupMetadataViewModel) { add(n.contentId); return false; }
      if (typeof n.videoId === 'string' && (n.title || n.headline)) { add(n.videoId); return false; }
      return true;
    });
    return out;
  }

  // Continuation responses carry new items in onResponseReceivedActions; read only that part
  // so any page furniture repeated in `contents` isn't mistaken for the next page.
  const listRoot = json => (json && json.onResponseReceivedActions) || json;

  const ITEM_KEYS = ['playlistVideoRenderer', 'lockupViewModel', 'richItemRenderer', 'shortsLockupViewModel', 'reelItemRenderer', 'videoRenderer', 'gridVideoRenderer'];
  const isItem = x => !!x && typeof x === 'object' && ITEM_KEYS.some(k => k in x);
  const tokenIn = node => {
    let t = null;
    walk(node, m => {
      if (!t && m.continuationCommand && typeof m.continuationCommand.token === 'string') t = m.continuationCommand.token;
      return !t;
    });
    return t;
  };

  // The "load more" marker (continuationItemViewModel, or continuationItemRenderer on older pages).
  // Channel tabs carry other markers too (side panels), so the one at the end of the video list wins.
  function findContinuation(json, strict) {
    let sibling = null, marked = null, any = null;
    walk(listRoot(json), n => {
      for (const [k, v] of Object.entries(n)) {
        if (!sibling && Array.isArray(v) && v.length) {
          const last = v[v.length - 1];
          if (last && (last.continuationItemRenderer || last.continuationItemViewModel) && v.some(isItem)) sibling = tokenIn(last);
        }
        if (!marked && /^continuationItem(ViewModel|Renderer)$/.test(k)) marked = tokenIn(v);
      }
      if (!any && n.continuationCommand && typeof n.continuationCommand.token === 'string') any = n.continuationCommand.token;
      return true;
    });
    return strict ? sibling : (sibling || marked || any);
  }

  // The selected tab's content on a channel page, so headers and side panels aren't read as videos.
  function selectedTab(json) {
    let found = null;
    walk(json, n => {
      if (found) return false;
      if (n.tabRenderer && n.tabRenderer.selected && n.tabRenderer.content) { found = n.tabRenderer.content; return false; }
      return true;
    });
    return found || json;
  }

  // Browse params for a channel's Shorts and Live tabs (absent when the channel has none).
  function channelTabs(json) {
    const out = {};
    walk(json, n => {
      if (n.tabRenderer) {
        const ep = n.tabRenderer.endpoint || {};
        const url = (ep.commandMetadata && ep.commandMetadata.webCommandMetadata && ep.commandMetadata.webCommandMetadata.url) || '';
        const params = ep.browseEndpoint && ep.browseEndpoint.params;
        if (params && /\/shorts$/.test(url)) out.shorts = params;
        if (params && /\/streams$/.test(url)) out.streams = params;
        return false;
      }
      return true;
    });
    return out;
  }

  // "640 videos" from the uploads playlist header, used for progress only.
  function findCount(json) {
    let count = 0;
    walk(json, n => {
      if (count) return false;
      for (const v of Object.values(n)) {
        const s = typeof v === 'string' ? v : (v && typeof v === 'object' && !Array.isArray(v) ? textOf(v) : '');
        const m = /^([\d,.]+)\s+videos?$/i.exec((s || '').trim());
        if (m) { count = parseInt(m[1].replace(/[.,]/g, ''), 10); break; }
      }
      return !count;
    });
    return count;
  }

  function findOwner(json) {
    let name = '';
    walk(json, n => {
      if (name) return false;
      if (n.playlistMetadataRenderer && n.playlistMetadataRenderer.title) {
        const m = /^Uploads from (.+)$/.exec(n.playlistMetadataRenderer.title);
        if (m) name = m[1];
      }
      return !name;
    });
    return name;
  }

  function parseDateStr(s) {
    if (!s) return null;
    s = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { t: new Date(s + 'T12:00:00').getTime(), dateOnly: true };
    const t = Date.parse(s);
    if (isNaN(t)) return null;
    return { t, dateOnly: !/\d:\d\d/.test(s) };
  }

  function videoFromPlayer(json) {
    const mf = (json && json.microformat && json.microformat.playerMicroformatRenderer) || {};
    const vd = (json && json.videoDetails) || {};
    const d = parseDateStr(mf.publishDate || mf.uploadDate);
    return {
      t: d ? d.t : 0,
      dateOnly: d ? d.dateOnly : false,
      channelId: vd.channelId || mf.externalChannelId || '',
      author: vd.author || mf.ownerChannelName || ''
    };
  }

  function videoFromNext(json, now = Date.now()) {
    let dateText = '', channelId = '', author = '';
    walk(json, n => {
      if (!dateText && n.videoPrimaryInfoRenderer) dateText = textOf(n.videoPrimaryInfoRenderer.dateText);
      if (!channelId && n.videoOwnerRenderer) {
        author = textOf(n.videoOwnerRenderer.title);
        walk(n.videoOwnerRenderer, m => {
          if (!channelId && m.browseEndpoint && /^UC[\w-]{22}$/.test(m.browseEndpoint.browseId || '')) channelId = m.browseEndpoint.browseId;
          return !channelId;
        });
      }
      return !(dateText && channelId);
    });
    const clean = dateText.replace(/^(Premiered|Streamed live on|Started streaming on|Streamed live|Published on|Uploaded on|Scheduled for)\s*/i, '');
    let d = parseDateStr(clean);
    if (!d) {
      const m = REL.exec(clean);
      if (m) d = { t: now - (+m[1]) * relUnit(m[2]), dateOnly: true };
    }
    return { t: d ? d.t : 0, dateOnly: d ? d.dateOnly : false, channelId, author };
  }

  function videoFromHtml(html) {
    const pick = re => { const m = re.exec(html); return m ? m[1] : ''; };
    const raw = pick(/"publishDate":"([^"]+)"/) || pick(/<meta itemprop="datePublished" content="([^"]+)"/) || pick(/"uploadDate":"([^"]+)"/);
    const d = parseDateStr(raw);
    let author = pick(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/);
    try { author = JSON.parse('"' + author + '"'); } catch (e) { /* keep raw */ }
    return {
      t: d ? d.t : 0,
      dateOnly: d ? d.dateOnly : false,
      channelId: pick(/"channelId":"(UC[\w-]{22})"/) || pick(/<meta itemprop="channelId" content="(UC[\w-]{22})"/),
      author
    };
  }

  // ---------- dates: bounds, estimates, classification ----------

  // A relative label like "3 years ago" seen at time `at` → a window that surely contains the date.
  function relBounds(rel, at) {
    const m = REL.exec((rel || '').trim());
    if (!m) return [-Infinity, Infinity];
    const n = +m[1], u = relUnit(m[2]);
    return [at - (n + 1) * u - DAY, at - Math.max(0, n - 1) * u + DAY];
  }

  // Uploads are ordered newest first, so every exact date also bounds its neighbours.
  function view(videos) {
    const n = videos.length;
    const lo = new Float64Array(n), hi = new Float64Array(n), est = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const v = videos[i];
      if (v[6] > 0) { lo[i] = hi[i] = v[6]; continue; }
      const b = relBounds(v[4], v[5]);
      lo[i] = b[0];
      hi[i] = b[1];
      if (v[7] && v[7].includes('U')) lo[i] = Math.max(lo[i], v[5] - DAY);
    }
    for (let i = n - 2; i >= 0; i--) if (!(videos[i][6] > 0) && lo[i + 1] > lo[i]) lo[i] = lo[i + 1];
    for (let i = 1; i < n; i++) if (!(videos[i][6] > 0) && hi[i - 1] < hi[i]) hi[i] = hi[i - 1];

    const newer = new Int32Array(n);
    let last = -1;
    for (let i = 0; i < n; i++) { newer[i] = last; if (videos[i][6] > 0) last = i; }
    let older = -1;
    for (let i = n - 1; i >= 0; i--) {
      const v = videos[i];
      if (v[6] > 0) { est[i] = v[6]; older = i; continue; }
      const a = newer[i], b = older;
      let e;
      if (a >= 0 && b >= 0) e = videos[a][6] + (videos[b][6] - videos[a][6]) * (i - a) / (b - a);
      else {
        const l = isFinite(lo[i]) ? lo[i] : null, h = isFinite(hi[i]) ? hi[i] : null;
        e = l !== null && h !== null ? (l + h) / 2 : (l !== null ? l : (h !== null ? h : v[5]));
      }
      if (isFinite(lo[i]) && e < lo[i]) e = lo[i];
      if (isFinite(hi[i]) && e > hi[i]) e = hi[i];
      est[i] = e;
    }
    return { lo, hi, est };
  }

  // Date ranges the filter asks for: one range, one day per past year ("On this day"), or none.
  function rangesFor(f, videos, vw, now = new Date()) {
    if (f.otd) {
      const m = now.getMonth(), d = now.getDate();
      let minY = now.getFullYear() - 1;
      for (let i = 0; i < videos.length; i++) {
        const y = new Date(vw.est[i]).getFullYear();
        if (y < minY) minY = y;
      }
      const out = [];
      for (let y = now.getFullYear() - 1; y >= minY; y--) {
        const day = new Date(y, m, d);
        if (day.getMonth() !== m) continue; // 29 Feb in a non-leap year
        out.push([day.getTime(), new Date(y, m, d, 23, 59, 59, 999).getTime()]);
      }
      return out;
    }
    if (f.from || f.to) return [[dayStart(f.from), dayEnd(f.to)]];
    return null;
  }

  // 1 = in range, 0 = out, 2 = unsure (needs an exact lookup), 3 = lookup failed, judged by estimate
  function status(videos, vw, i, R) {
    const t = videos[i][6];
    if (t > 0) { for (const [A, B] of R) if (t >= A && t <= B) return 1; return 0; }
    const lo = vw.lo[i], hi = vw.hi[i];
    if (lo <= hi) {
      let overlaps = false;
      for (const [A, B] of R) {
        if (lo >= A && hi <= B) return 1;
        if (!(hi < A || lo > B)) overlaps = true;
      }
      if (!overlaps) return 0;
    }
    return t === -1 ? 3 : 2;
  }

  const inAny = (t, R) => R.some(([A, B]) => t >= A && t <= B);

  // Length buckets mirror YouTube's own search filter.
  const LENGTHS = [
    ['any', 'Any length'],
    ['under4', 'Under 4 min'],
    ['4to20', '4–20 min'],
    ['over20', 'Over 20 min']
  ];

  function lenMatch(d, len) {
    if (!len || len === 'any') return true;
    if (!d) return false;
    switch (len) {
      case 'under4': return d < 240;
      case '4to20': return d >= 240 && d <= 1200;
      case 'over20': return d > 1200;
      default: return true;
    }
  }

  // Upload type from YouTube's own per-channel lists: S = Short, T = live stream, otherwise a video.
  const TYPES = [['all', 'All'], ['videos', 'Videos'], ['shorts', 'Shorts'], ['live', 'Live']];
  const typeOf = v => ((v[7] || '').includes('S') ? 'shorts' : (v[7] || '').includes('T') ? 'live' : 'videos');
  const typeMatch = (v, t) => !t || t === 'all' || typeOf(v) === t;

  // "react hooks -shorts" → must contain react and hooks, must not contain shorts
  function queryMatcher(q) {
    const terms = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const inc = terms.filter(t => !(t.startsWith('-') && t.length > 1));
    const exc = terms.filter(t => t.startsWith('-') && t.length > 1).map(t => t.slice(1));
    if (!inc.length && !exc.length) return () => true;
    return title => {
      const s = title.toLowerCase();
      return inc.every(t => s.includes(t)) && !exc.some(t => s.includes(t));
    };
  }

  const baseMatch = f => {
    const qm = queryMatcher(f.q);
    return v => typeMatch(v, f.type) && lenMatch(v[2], f.len) && qm(v[1]);
  };

  // Indices to show, sorted. Unsure videos are included by estimate until their exact date arrives.
  function select(videos, f, vw, scores) {
    const R = rangesFor(f, videos, vw);
    const ok = baseMatch(f);
    const idx = [];
    let pending = 0;
    for (let i = 0; i < videos.length; i++) {
      if (!ok(videos[i])) continue;
      if (!R) { idx.push(i); continue; }
      const s = status(videos, vw, i, R);
      if (s === 1) idx.push(i);
      else if (s >= 2) {
        if (inAny(vw.est[i], R)) idx.push(i);
        if (s === 2) pending++;
      }
    }
    if (f.sort === 'old') idx.reverse();
    else if (f.sort === 'views') idx.sort((a, b) => videos[b][3] - videos[a][3] || a - b);
    else if (f.sort === 'standout' && scores) idx.sort((a, b) => scores[b] - scores[a] || a - b);
    else if (f.sort === 'likes') idx.sort((a, b) => likesOf(videos[b]) - likesOf(videos[a]) || a - b);
    return { idx, pending };
  }

  // The known like count, or -1 when there's none to show (unknown, hidden or failed). Not `v[8] >= 0`:
  // a saved record holds null for "not looked up", and null >= 0 is true.
  const likesOf = v => (typeof v[8] === 'number' && v[8] >= 0 ? v[8] : -1);

  // The like count from a watch-page ("next") response. YouTube's like button says
  // "like this video along with 11,671 other people"; it has no number when likes are hidden.
  function likesFrom(json) {
    let n = null;
    walk(json, node => {
      for (const v of Object.values(node)) {
        const m = typeof v === 'string' && /along with ([\d,.]+) other (?:people|person)\b/i.exec(v);
        if (m) { n = parseInt(m[1].replace(/[.,]/g, ''), 10); return false; }
      }
      return n === null;
    });
    return n;
  }

  // Which videos to look up next so the range edges become exact: a few evenly spaced
  // picks inside each stretch of unsure videos (a parallel binary search).
  function probes(videos, f, vw, max) {
    const R = rangesFor(f, videos, vw);
    if (!R) return [];
    const ok = baseMatch(f);
    const runs = [];
    let run = [];
    for (let i = 0; i < videos.length; i++) {
      const s = status(videos, vw, i, R);
      if (s === 0 || s === 1) { if (run.length) runs.push(run); run = []; continue; }
      if (s === 2 && ok(videos[i])) run.push(i);
    }
    if (run.length) runs.push(run);
    if (!runs.length) return [];
    const per = Math.max(1, Math.floor(max / runs.length));
    const out = [];
    for (const r of runs) {
      const k = Math.min(per, r.length);
      for (let j = 0; j < k; j++) out.push(r[Math.floor(((j + 1) * r.length) / (k + 1))]);
      if (out.length >= max) break;
    }
    return [...new Set(out)].slice(0, max);
  }

  // How each upload did against its neighbours of the same type: views ÷ median views of the
  // nearest uploads either side. 3 means three times the channel's usual for that period.
  function standouts(videos, half = 15) {
    const scores = new Float32Array(videos.length);
    const groups = new Map();
    videos.forEach((v, i) => {
      if (v[3] < 0) return;
      const g = typeOf(v);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(i);
    });
    for (const list of groups.values()) {
      for (let k = 0; k < list.length; k++) {
        const near = [];
        for (let j = Math.max(0, k - half); j <= Math.min(list.length - 1, k + half); j++) if (j !== k) near.push(videos[list[j]][3]);
        if (near.length < 4) continue;
        near.sort((a, b) => a - b);
        const mid = near.length >> 1;
        const med = near.length % 2 ? near[mid] : (near[mid - 1] + near[mid]) / 2;
        if (med > 0) scores[list[k]] = videos[list[k]][3] / med;
      }
    }
    return scores;
  }

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Summary numbers for the uploads currently shown.
  function stats(videos, idx, vw, f, now = Date.now()) {
    const out = { count: idx.length, perMonth: null, gap: null, slot: null, median: null };
    if (!idx.length) return out;
    const ts = idx.map(i => vw.est[i]).sort((a, b) => a - b);
    if (!f.otd) {
      const start = f.from ? dayStart(f.from) : ts[0];
      const end = f.to ? Math.min(dayEnd(f.to), now) : (f.from ? now : ts[ts.length - 1]);
      const months = Math.max(1, (end - start) / (30.44 * DAY));
      out.perMonth = idx.length / months;
      if (ts.length >= 2) {
        let best = 0, at = 0;
        for (let k = 1; k < ts.length; k++) if (ts[k] - ts[k - 1] > best) { best = ts[k] - ts[k - 1]; at = k; }
        if (at > 0) out.gap = { days: Math.round(best / DAY), from: ts[at - 1], to: ts[at] };
      }
    }
    const timed = idx.filter(i => videos[i][6] > 0 && !(videos[i][7] || '').includes('D'));
    if (timed.length >= 5) {
      const wd = new Array(7).fill(0), hr = new Array(24).fill(0);
      for (const i of timed) { const d = new Date(videos[i][6]); wd[d.getDay()]++; hr[d.getHours()]++; }
      const day = wd.indexOf(Math.max(...wd)), hour = hr.indexOf(Math.max(...hr));
      out.slot = { day: WEEKDAYS[day], hour, share: wd[day] / timed.length, n: timed.length };
    }
    const views = idx.map(i => videos[i][3]).filter(v => v >= 0).sort((a, b) => a - b);
    if (views.length) {
      const mid = views.length >> 1;
      out.median = views.length % 2 ? views[mid] : (views[mid - 1] + views[mid]) / 2;
    }
    return out;
  }

  // GitHub-style year grid: one cell per day, weeks as columns starting Monday.
  function calendar(videos, f, vw, year) {
    const ok = baseMatch(f);
    const counts = new Map(), approx = new Map();
    for (let i = 0; i < videos.length; i++) {
      if (!ok(videos[i])) continue;
      const d = new Date(vw.est[i]);
      if (d.getFullYear() !== year) continue;
      const k = isoDay(d);
      counts.set(k, (counts.get(k) || 0) + 1);
      if (!(videos[i][6] > 0)) approx.set(k, (approx.get(k) || 0) + 1);
    }
    const R = (f.from || f.to) ? [[dayStart(f.from), dayEnd(f.to)]] : null;
    const first = new Date(year, 0, 1);
    const lead = (first.getDay() + 6) % 7; // Monday = 0
    const cells = [];
    const monthCols = [];
    let max = 1;
    for (let d = new Date(first); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
      const k = isoDay(d);
      const dayIndex = Math.round((d - first) / DAY);
      const col = Math.floor((dayIndex + lead) / 7), row = (d.getDay() + 6) % 7;
      if (d.getDate() === 1) monthCols.push({ month: MONTHS[d.getMonth()], col });
      const count = counts.get(k) || 0;
      if (count > max) max = count;
      const mid = new Date(year, d.getMonth(), d.getDate(), 12).getTime();
      cells.push({ date: k, col, row, count, approx: approx.get(k) || 0, inRange: !!R && inAny(mid, R) });
    }
    const cols = Math.max(...cells.map(c => c.col)) + 1;
    return { year, cells, cols, monthCols, max, approxTotal: [...approx.values()].reduce((a, b) => a + b, 0) };
  }

  // Twelve small month grids for one year (weeks start Monday), with upload counts per day and month.
  function yearView(videos, f, vw, year) {
    const ok = baseMatch(f);
    const counts = new Map(), approx = new Map(), monthCounts = new Array(12).fill(0), monthApprox = new Array(12).fill(0);
    let approxTotal = 0;
    for (let i = 0; i < videos.length; i++) {
      if (!ok(videos[i])) continue;
      const d = new Date(vw.est[i]);
      if (d.getFullYear() !== year) continue;
      const k = isoDay(d);
      counts.set(k, (counts.get(k) || 0) + 1);
      monthCounts[d.getMonth()]++;
      if (!(videos[i][6] > 0)) { approx.set(k, (approx.get(k) || 0) + 1); monthApprox[d.getMonth()]++; approxTotal++; }
    }
    const ranged = (f.from || f.to) && !f.otd;
    const R = ranged ? [[dayStart(f.from), dayEnd(f.to)]] : null;
    const wholeYear = f.from === `${year}-01-01` && f.to === `${year}-12-31`;
    let max = 1;
    const months = [];
    for (let m = 0; m < 12; m++) {
      const first = new Date(year, m, 1), last = new Date(year, m + 1, 0);
      const days = [];
      for (let day = 1; day <= last.getDate(); day++) {
        const date = new Date(year, m, day);
        const k = isoDay(date);
        const count = counts.get(k) || 0;
        if (count > max) max = count;
        days.push({ date: k, day, count, approx: approx.get(k) || 0, inRange: !!R && !wholeYear && inAny(new Date(year, m, day, 12).getTime(), R) });
      }
      const from = isoDay(first), to = isoDay(last);
      months.push({
        m, label: MONTHS[m], count: monthCounts[m], approx: monthApprox[m], lead: (first.getDay() + 6) % 7, days, from, to,
        selected: !!R && !wholeYear && f.from === from && f.to === to
      });
    }
    return { year, months, max, approxTotal };
  }

  // The nearest uploads before and after an empty range, so an empty result can point somewhere.
  function nearest(videos, f, vw) {
    const ok = baseMatch(f);
    const A = dayStart(f.from), B = dayEnd(f.to);
    let before = -1, after = -1;
    for (let i = 0; i < videos.length; i++) {
      if (!ok(videos[i])) continue;
      const t = vw.est[i];
      if (t < A && (before < 0 || t > vw.est[before])) before = i;
      if (t > B && (after < 0 || t < vw.est[after])) after = i;
    }
    const pack = i => (i < 0 ? null : { i, t: vw.est[i], exact: videos[i][6] > 0 });
    return { before: pack(before), after: pack(after) };
  }

  // The big readout at the top of the panel: what range is showing, in words.
  const longDayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  const rangeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
  const dayMonthFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' });

  function rangeTitle(f, now = new Date()) {
    const day = s => new Date(s + 'T12:00:00');
    if (f.otd) return { title: `On ${dayMonthFmt.format(now)}`, sub: 'in earlier years' };
    if (!f.from && !f.to) return { title: 'All time', sub: '' };
    if (f.from && !f.to) return { title: `Since ${longDayFmt.format(day(f.from))}`, sub: '' };
    if (!f.from && f.to) return { title: `Until ${longDayFmt.format(day(f.to))}`, sub: '' };
    const a = day(f.from), b = day(f.to);
    if (f.from === f.to) return { title: longDayFmt.format(a), sub: weekdayFmt.format(a) };
    const y = a.getFullYear();
    if (f.from === `${y}-01-01` && f.to === `${y}-12-31`) return { title: String(y), sub: '' };
    const lastOfMonth = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    if (a.getDate() === 1 && isoDay(lastOfMonth) === f.to) return { title: monthYearFmt.format(a), sub: '' };
    return { title: rangeFmt.formatRange(a, b), sub: '' };
  }

  // Filters in the page URL (#cdf=2019-03-01..2019-03-31&q=…) so a view can be bookmarked or shared.
  function encodeFilters(f) {
    const p = new URLSearchParams();
    if (f.otd) p.set('cdf', 'today');
    else p.set('cdf', `${f.from || ''}..${f.to || ''}`);
    if (f.type && f.type !== 'all') p.set('type', f.type);
    if (f.q && f.q.trim()) p.set('q', f.q.trim());
    if (f.len && f.len !== 'any') p.set('len', f.len);
    if (f.sort && f.sort !== 'new') p.set('sort', f.sort);
    return p.toString();
  }

  function decodeFilters(hash) {
    const p = new URLSearchParams((hash || '').replace(/^#/, ''));
    const cdf = p.get('cdf');
    if (cdf === null) return null;
    const f = {};
    if (cdf === 'today') { f.otd = true; f.from = ''; f.to = ''; }
    else {
      // Only real calendar days: "2019-02-30" or "2019-13-01" would break every date shown.
      const real = s => {
        const d = s && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        return d && mk(+d[1], +d[2] - 1, +d[3]) ? s : '';
      };
      const m = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/.exec(cdf);
      f.from = real(m && m[1]);
      f.to = real(m && m[2]);
      if (f.from && f.to && f.from > f.to) [f.from, f.to] = [f.to, f.from];
      f.otd = false;
    }
    const type = p.get('type'), len = p.get('len'), sort = p.get('sort');
    if (TYPES.some(t => t[0] === type)) f.type = type;
    if (LENGTHS.some(l => l[0] === len)) f.len = len;
    if (['new', 'old', 'views', 'likes', 'standout'].includes(sort)) f.sort = sort;
    if (p.get('q')) f.q = p.get('q');
    return f;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Years across the channel's history, or months when the range sits inside one year.
  function histogram(videos, f, vw) {
    const hasRange = !!(f.from || f.to);
    const lo = dayStart(f.from), hi = dayEnd(f.to);
    const ok = baseMatch(f);
    const fromY = f.from ? new Date(lo).getFullYear() : null;
    const toY = f.to ? new Date(hi).getFullYear() : null;

    if (f.from && f.to && fromY === toY) {
      const year = fromY;
      const counts = new Array(12).fill(0);
      for (let i = 0; i < videos.length; i++) {
        if (!ok(videos[i])) continue;
        const d = new Date(vw.est[i]);
        if (d.getFullYear() === year) counts[d.getMonth()]++;
      }
      const bars = counts.map((count, m) => {
        const start = new Date(year, m, 1), end = new Date(year, m + 1, 0);
        return {
          key: `${year}-${m}`, label: MONTHS[m],
          title: `${MONTHS[m]} ${year}: ${count} upload${count === 1 ? '' : 's'}`,
          count, from: isoDay(start), to: isoDay(end),
          inRange: hasRange && start.getTime() <= hi && end.getTime() + DAY - 1 >= lo
        };
      });
      return { mode: 'months', year, bars, max: Math.max(1, ...counts) };
    }

    if (!videos.length) return { mode: 'years', bars: [], max: 1 };
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < videos.length; i++) {
      const y = new Date(vw.est[i]).getFullYear();
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const counts = new Map(), approx = new Map();
    for (let i = 0; i < videos.length; i++) {
      if (!ok(videos[i])) continue;
      const y = new Date(vw.est[i]).getFullYear();
      counts.set(y, (counts.get(y) || 0) + 1);
      if (!(videos[i][6] > 0)) approx.set(y, (approx.get(y) || 0) + 1);
    }
    const many = maxY - minY + 1 > 10;
    const bars = [];
    for (let y = minY; y <= maxY; y++) {
      const count = counts.get(y) || 0;
      const start = new Date(y, 0, 1).getTime(), end = new Date(y, 11, 31, 23, 59, 59, 999).getTime();
      bars.push({
        key: String(y), label: many ? `’${String(y).slice(2)}` : String(y),
        title: `${y}: ${count} upload${count === 1 ? '' : 's'}`,
        count, approx: approx.get(y) || 0, from: `${y}-01-01`, to: `${y}-12-31`,
        inRange: hasRange && start <= hi && end >= lo
      });
    }
    return { mode: 'years', bars, max: Math.max(1, ...bars.map(b => b.count)) };
  }

  function presets(now = new Date()) {
    const y = now.getFullYear();
    const today = isoDay(now);
    const ago30 = isoDay(addDays(now, -29)); // calendar days, so a DST change can't shift it
    return [
      { id: 'all', label: 'All', from: '', to: '' },
      { id: '30d', label: '30 days', from: ago30, to: today },
      { id: 'year', label: 'This year', from: `${y}-01-01`, to: today },
      { id: 'last', label: 'Last year', from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    ];
  }

  // ---------- dates typed in plain words ----------

  const MONTH_WORDS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function monthOf(word) {
    const w = (word || '').replace(/\.$/, '');
    if (w.length < 3) return -1;
    const i = MONTH_WORDS.findIndex(m => m.startsWith(w) || (w === 'sept' && m === 'september'));
    return i;
  }
  const mk = (y, m, d) => {
    const dt = new Date(y, m, d);
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
  };
  const dayRange = (a, b) => ({ from: isoDay(a), to: isoDay(b || a) });
  const monthRange = (y, m) => dayRange(new Date(y, m, 1), new Date(y, m + 1, 0));
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
  const fullYear = s => { const n = +s; return s.length === 2 ? (n > 50 ? 1900 + n : 2000 + n) : n; };
  const okYear = y => y >= 1990 && y <= 2100;

  // One date or period on its own: "2019", "march 2019", "5 mar 2019", "q2 2020", "summer 2021", "christmas 2020"…
  // defYear fills in a missing year (used for "march to june 2019"); without it, the most recent one that has begun.
  function parsePiece(s, now, opts = {}) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mdFirst = !!opts.mdFirst;
    const pickYear = (m, d = 1) => {
      if (opts.defYear) return opts.defYear;
      const y = now.getFullYear();
      return new Date(y, m, d) <= today ? y : y - 1;
    };
    let m;
    if (!s) return null;
    if (s === 'today') return dayRange(today);
    if (s === 'yesterday') return dayRange(addDays(today, -1));
    if ((m = /^(this|last|previous|past) (week|month|year)$/.exec(s))) {
      const cur = m[1] === 'this';
      if (m[2] === 'week') { const mon = mondayOf(today); return cur ? dayRange(mon, today) : dayRange(addDays(mon, -7), addDays(mon, -1)); }
      if (m[2] === 'month') {
        if (cur) return dayRange(new Date(today.getFullYear(), today.getMonth(), 1), today);
        const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        return monthRange(prev.getFullYear(), prev.getMonth());
      }
      return cur ? dayRange(new Date(today.getFullYear(), 0, 1), today) : dayRange(new Date(today.getFullYear() - 1, 0, 1), new Date(today.getFullYear() - 1, 11, 31));
    }
    if ((m = /^(?:last|past) (\d{1,3}) (day|week|month|year)s?$/.exec(s))) {
      const n = +m[1];
      if (!n) return null;
      const start = m[2] === 'day' ? addDays(today, -(n - 1))
        : m[2] === 'week' ? addDays(today, -(n * 7 - 1))
        : m[2] === 'month' ? addDays(new Date(today.getFullYear(), today.getMonth() - n, today.getDate()), 1)
        : addDays(new Date(today.getFullYear() - n, today.getMonth(), today.getDate()), 1);
      return dayRange(start, today);
    }
    if ((m = /^week of (.+)$/.exec(s))) {
      const r = parsePiece(m[1], now, opts);
      if (!r) return null;
      const mon = mondayOf(new Date(r.from + 'T12:00:00'));
      return dayRange(mon, addDays(mon, 6));
    }
    if ((m = /^(?:the )?(\d{3})0s$/.exec(s))) { const y = +(m[1] + '0'); return okYear(y) || okYear(y + 9) ? dayRange(new Date(y, 0, 1), new Date(y + 9, 11, 31)) : null; }
    if ((m = /^(\d{4})$/.exec(s))) { const y = +m[1]; return okYear(y) ? dayRange(new Date(y, 0, 1), new Date(y, 11, 31)) : null; }
    if ((m = /^q([1-4]) (\d{4})$/.exec(s) || /^(\d{4}) q([1-4])$/.exec(s))) {
      const q = +(m[1].length === 1 ? m[1] : m[2]), y = +(m[1].length === 4 ? m[1] : m[2]);
      return okYear(y) ? dayRange(new Date(y, (q - 1) * 3, 1), new Date(y, q * 3, 0)) : null;
    }
    if ((m = /^h([12]) (\d{4})$/.exec(s))) { const y = +m[2]; return okYear(y) ? (m[1] === '1' ? dayRange(new Date(y, 0, 1), new Date(y, 5, 30)) : dayRange(new Date(y, 6, 1), new Date(y, 11, 31))) : null; }
    if ((m = /^(spring|summer|autumn|fall|winter)(?: (?:of )?(\d{4}))?$/.exec(s))) {
      const start = { spring: 2, summer: 5, autumn: 8, fall: 8, winter: 11 }[m[1]];
      const y = m[2] ? +m[2] : pickYear(start, 1);
      if (!okYear(y)) return null;
      return dayRange(new Date(y, start, 1), new Date(y, start + 3, 0));
    }
    const holiday = (name, y) => {
      switch (name) {
        case 'christmas': case 'xmas': return dayRange(new Date(y, 11, 24), new Date(y, 11, 26));
        case 'christmas eve': return dayRange(new Date(y, 11, 24));
        case 'christmas day': return dayRange(new Date(y, 11, 25));
        case 'new year': case "new year's": case 'new years': case "new year's day": case 'new years day': return dayRange(new Date(y - 1, 11, 31), new Date(y, 0, 1));
        case "new year's eve": case 'new years eve': case 'nye': return dayRange(new Date(y, 11, 31));
        case 'halloween': return dayRange(new Date(y, 9, 31));
        case "valentine's": case 'valentines': case "valentine's day": case 'valentines day': return dayRange(new Date(y, 1, 14));
        case 'thanksgiving': { const nov1 = new Date(y, 10, 1); const first = 1 + ((4 - nov1.getDay() + 7) % 7); return dayRange(new Date(y, 10, first + 21)); }
        default: return null;
      }
    };
    if ((m = /^(christmas eve|christmas day|christmas|xmas|new year's eve|new years eve|nye|new year's day|new years day|new year's|new years|new year|halloween|valentine's day|valentines day|valentine's|valentines|thanksgiving)(?: (\d{4}))?$/.exec(s))) {
      const name = m[1];
      let y;
      if (m[2]) y = +m[2];
      else {
        y = now.getFullYear();
        const r = holiday(name, y);
        if (r && new Date(r.from + 'T00:00:00') > today) y--;
      }
      return okYear(y) ? holiday(name, y) : null;
    }
    // ISO and numeric forms
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { const d = mk(+m[1], +m[2] - 1, +m[3]); return d ? dayRange(d) : null; }
    if ((m = /^(\d{4})-(\d{1,2})$/.exec(s))) { const y = +m[1], mo = +m[2] - 1; return okYear(y) && mo >= 0 && mo < 12 ? monthRange(y, mo) : null; }
    if ((m = /^(\d{1,2})\/(\d{4})$/.exec(s))) { const y = +m[2], mo = +m[1] - 1; return okYear(y) && mo >= 0 && mo < 12 ? monthRange(y, mo) : null; }
    if ((m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2}|\d{4})$/.exec(s))) {
      const a = +m[1], b = +m[2], y = fullYear(m[3]);
      let day, mo;
      if (a > 12) { day = a; mo = b; } else if (b > 12) { day = b; mo = a; } else if (mdFirst) { mo = a; day = b; } else { day = a; mo = b; }
      const d = mk(y, mo - 1, day);
      return d ? dayRange(d) : null;
    }
    // Words: "march 2019", "2019 march", "march", "5 march 2019", "march 5th, 2019", "5th of march"
    const words = s.replace(/(\d+)(st|nd|rd|th)\b/g, '$1').replace(/\bof\b/g, ' ').replace(/\s+/g, ' ').trim();
    if ((m = /^([a-z.]+) (\d{4})$/.exec(words)) && monthOf(m[1]) >= 0) { const y = +m[2]; return okYear(y) ? monthRange(y, monthOf(m[1])) : null; }
    if ((m = /^(\d{4}) ([a-z.]+)$/.exec(words)) && monthOf(m[2]) >= 0) { const y = +m[1]; return okYear(y) ? monthRange(y, monthOf(m[2])) : null; }
    if ((m = /^([a-z.]+)$/.exec(words)) && monthOf(m[1]) >= 0) { const mo = monthOf(m[1]); return monthRange(pickYear(mo), mo); }
    let day = null, mo = -1, y = null;
    if ((m = /^(\d{1,2}) ([a-z.]+)(?: (\d{4}))?$/.exec(words)) && monthOf(m[2]) >= 0) { day = +m[1]; mo = monthOf(m[2]); y = m[3] ? +m[3] : null; }
    else if ((m = /^([a-z.]+) (\d{1,2})(?: (\d{4}))?$/.exec(words)) && monthOf(m[1]) >= 0) { day = +m[2]; mo = monthOf(m[1]); y = m[3] ? +m[3] : null; }
    if (mo >= 0) {
      if (y === null) y = pickYear(mo, day);
      const d = okYear(y) ? mk(y, mo, day) : null;
      return d ? dayRange(d) : null;
    }
    return null;
  }

  // A whole phrase: a piece, a range between two pieces, or an open range. Returns a filter patch or null.
  //   "2019" · "march 2019" · "5 mar 2019" · "2015-2017" · "march to june 2019" · "since 2020" · "before 2015"
  //   "last 3 months" · "summer 2021" · "q3 2019" · "christmas 2020" · "2010s" · "on this day" · "first video"
  function parseDateQuery(text, now = new Date(), opts = {}) {
    let s = String(text || '').toLowerCase().replace(/[–—]/g, '-').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    for (let k = 0; k < 4; k++) s = s.replace(/^(uploads?|videos?|shorts|streams|show me|show|posted|in|on|during)\s+/, '').trim();
    s = s.replace(/^from (.+ (?:to|until|till|through|thru) .+)$/, '$1');
    if (!s) return null;
    if (/^(all|all time|everything|any time|anytime)$/.test(s)) return { from: '', to: '' };
    if (/^(on this day|this day|otd|today in history)$/.test(s)) return { otd: true };
    if (/^(first|first video|first upload|oldest|their first video|the first video)$/.test(s)) return { first: true };
    let m;
    if ((m = /^(since|after|from) (.+)$/.exec(s))) {
      const r = parseRange(m[2], now, opts);
      if (!r || !r.from) return null;
      return m[1] === 'after' ? { from: isoDay(addDays(new Date(r.to + 'T12:00:00'), 1)), to: '' } : { from: r.from, to: '' };
    }
    if ((m = /^(before|until|till|up to|up until) (.+)$/.exec(s))) {
      const r = parseRange(m[2], now, opts);
      if (!r || !r.to) return null;
      return m[1] === 'before' ? { from: '', to: isoDay(addDays(new Date(r.from + 'T12:00:00'), -1)) } : { from: '', to: r.to };
    }
    return parseRange(s, now, opts);
  }

  function parseRange(s, now, opts) {
    let m;
    if ((m = /^between (.+) and (.+)$/.exec(s))) return joinPieces(m[1], m[2], now, opts);
    // 2015-2017, 2015-17 (but 2019-03 is March 2019)
    if ((m = /^(\d{4})\s*-\s*(\d{2}|\d{4})$/.exec(s))) {
      const a = +m[1];
      let b = m[2].length === 2 ? Math.floor(a / 100) * 100 + +m[2] : +m[2];
      if (m[2].length === 4 || +m[2] > 12) {
        if (b < a || !okYear(a) || !okYear(b)) return null;
        return { from: `${a}-01-01`, to: `${b}-12-31` };
      }
    }
    // mar-jun 2019
    if ((m = /^([a-z.]+)\s*-\s*([a-z.]+) (\d{4})$/.exec(s)) && monthOf(m[1]) >= 0 && monthOf(m[2]) >= 0) return joinPieces(m[1], `${m[2]} ${m[3]}`, now, opts);
    const parts = s.split(/ (?:to|until|till|through|thru) | - /);
    if (parts.length === 2) return joinPieces(parts[0], parts[1], now, opts);
    return parsePiece(s, now, opts);
  }

  function joinPieces(a, b, now, opts) {
    const right = parsePiece(b.trim(), now, opts);
    if (!right) return null;
    const ry = +right.to.slice(0, 4);
    const hasYear = /\b\d{4}\b|^\d{4}-/.test(a);
    let left = parsePiece(a.trim(), now, Object.assign({}, opts, hasYear ? {} : { defYear: ry }));
    if (!left) return null;
    if (left.from > right.to && !hasYear) left = parsePiece(a.trim(), now, Object.assign({}, opts, { defYear: ry - 1 }));
    if (!left || left.from > right.to) return null;
    return { from: left.from, to: right.to };
  }

  // The same length of time just before or after the current range: a day, a whole number of months, or N days.
  function stepRange(f, dir) {
    if (f.otd || !f.from || !f.to) return null;
    const a = new Date(f.from + 'T12:00:00'), b = new Date(f.to + 'T12:00:00');
    const lastOf = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (a.getDate() === 1 && b.getDate() === lastOf(b)) {
      const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1;
      const s = new Date(a.getFullYear(), a.getMonth() + dir * months, 1);
      return { from: isoDay(s), to: isoDay(new Date(s.getFullYear(), s.getMonth() + months, 0)) };
    }
    const len = Math.round((b - a) / DAY) + 1;
    return { from: isoDay(addDays(a, dir * len)), to: isoDay(addDays(b, dir * len)) };
  }

  // The week, month or year around an upload.
  function aroundRange(t, span) {
    const d = new Date(t);
    if (span === 'month') return monthRange(d.getFullYear(), d.getMonth());
    if (span === 'year') return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
    const mon = mondayOf(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    return dayRange(mon, addDays(mon, 6));
  }

  // The channel's 1st, 100th, 500th… public uploads and its most viewed. Index into the newest-first list.
  function milestones(videos) {
    const n = videos.length;
    const out = [];
    for (const k of [1, 100, 500, 1000, 2500, 5000, 10000]) {
      if (k > n) break;
      out.push({ key: 'n' + k, k, i: n - k, label: k === 1 ? 'First upload' : `${k.toLocaleString()}th upload` });
    }
    let best = -1;
    for (let i = 0; i < n; i++) if (videos[i][3] >= 0 && (best < 0 || videos[i][3] > videos[best][3])) best = i;
    if (best >= 0 && videos[best][3] > 0) out.push({ key: 'top', i: best, label: 'Most viewed' });
    return out;
  }

  // Every year as one row of 366 day slots (a leap-year calendar, so columns line up across years).
  const SLOT_START = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const slotOf = d => SLOT_START[d.getMonth()] + d.getDate() - 1;
  function slotDate(year, slot) {
    let m = 11;
    while (m > 0 && SLOT_START[m] > slot) m--;
    const day = slot - SLOT_START[m] + 1;
    return mk(year, m, day);
  }
  function history(videos, f, vw) {
    const ok = baseMatch(f);
    const rows = new Map();
    let maxCount = 1;
    for (let i = 0; i < videos.length; i++) {
      if (!ok(videos[i])) continue;
      const d = new Date(vw.est[i]);
      const y = d.getFullYear();
      if (!rows.has(y)) rows.set(y, { year: y, exact: new Uint8Array(366), est: new Uint8Array(366), total: 0 });
      const r = rows.get(y);
      const s = slotOf(d);
      if (videos[i][6] > 0) { r.exact[s] = Math.min(255, r.exact[s] + 1); if (r.exact[s] > maxCount) maxCount = r.exact[s]; }
      else r.est[s] = Math.min(255, r.est[s] + 1);
      r.total++;
    }
    if (!rows.size) return { years: [], max: 1 };
    const ys = [...rows.keys()];
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const years = [];
    for (let y = minY; y <= maxY; y++) years.push(rows.get(y) || { year: y, exact: new Uint8Array(366), est: new Uint8Array(366), total: 0 });
    return { years, max: maxCount };
  }

  // ---------- formatting ----------

  function fmtDuration(s) {
    if (!s) return '';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  }

  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const fmtViews = n => (n < 0 ? '' : `${compact.format(n)} view${n === 1 ? '' : 's'}`);
  const fmtLikes = n => (n < 0 ? '' : `${compact.format(n)} like${n === 1 ? '' : 's'}`);
  const fmtCount = n => n.toLocaleString();

  const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const fmtDate = ms => dateFmt.format(new Date(ms));
  const fmtTime = ms => timeFmt.format(new Date(ms));
  const fmtDay = s => dateFmt.format(new Date(s + 'T12:00:00'));

  const otdFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' });

  function rangeLabel(f, now = new Date()) {
    if (f.otd) return `on ${otdFmt.format(now)} in past years`;
    if (f.from && f.to) return f.from === f.to ? `on ${fmtDay(f.from)}` : `${fmtDay(f.from)} – ${fmtDay(f.to)}`;
    if (f.from) return `since ${fmtDay(f.from)}`;
    if (f.to) return `until ${fmtDay(f.to)}`;
    return 'all time';
  }

  function ago(ms, now = Date.now()) {
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.round(h / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }

  return {
    DAY, pageRef, refKey, walk, textOf, extractVideos, extractIds, findContinuation, findCount, findOwner,
    parseDateStr, videoFromPlayer, videoFromNext, videoFromHtml, parseDur, parseViews, likesFrom, likesOf,
    relBounds, view, rangesFor, status, select, probes, histogram, calendar, yearView, nearest, rangeTitle, standouts, stats,
    selectedTab, channelTabs, MONTHS, parseDateQuery, stepRange, aroundRange, milestones, history, slotDate, SLOT_START,
    encodeFilters, decodeFilters, LENGTHS, TYPES, typeOf, lenMatch, queryMatcher, presets, WEEKDAYS,
    fmtDuration, fmtViews, fmtLikes, fmtCount, fmtDate, fmtTime, fmtDay, rangeLabel, ago, isoDay, dayStart, dayEnd
  };
})();

if (typeof module !== 'undefined') module.exports = CDF;
