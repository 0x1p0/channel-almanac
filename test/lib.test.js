// Tests for lib.js (the pure helpers). Run with: node --test
// A fixed time zone with daylight saving keeps the date maths deterministic.
process.env.TZ = 'America/Los_Angeles';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib.js');

const NOW = new Date(2026, 10, 2, 12, 0); // 2 Nov 2026, noon
const q = (text, opts) => C.parseDateQuery(text, NOW, opts);

test('pageRef reads channel, handle, watch and Shorts URLs', () => {
  assert.deepEqual(C.pageRef('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv/videos'),
    { kind: 'id', value: 'UCabcdefghijklmnopqrstuv', channelPage: true, tab: 'videos' });
  const h = C.pageRef('https://www.youtube.com/@SomeOne/streams');
  assert.equal(h.kind, 'handle');
  assert.equal(h.value, '@SomeOne');
  assert.equal(h.tab, 'streams');
  assert.equal(C.refKey(h), 'handle:@someone');
  assert.deepEqual(C.pageRef('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), { kind: 'video', value: 'dQw4w9WgXcQ', channelPage: false });
  assert.equal(C.pageRef('https://www.youtube.com/shorts/dQw4w9WgXcQ').kind, 'video');
  assert.equal(C.pageRef('https://www.youtube.com/feed/subscriptions'), null);
  assert.equal(C.pageRef('not a url'), null);
});

test('parseDateQuery understands plain-word dates', () => {
  assert.deepEqual(q('march 2019'), { from: '2019-03-01', to: '2019-03-31' });
  assert.deepEqual(q('2019'), { from: '2019-01-01', to: '2019-12-31' });
  assert.deepEqual(q('2015-2017'), { from: '2015-01-01', to: '2017-12-31' });
  assert.deepEqual(q('2015–17'), { from: '2015-01-01', to: '2017-12-31' });
  assert.deepEqual(q('2019-03'), { from: '2019-03-01', to: '2019-03-31' });
  assert.deepEqual(q('march to june 2019'), { from: '2019-03-01', to: '2019-06-30' });
  assert.deepEqual(q('mar-jun 2019'), { from: '2019-03-01', to: '2019-06-30' });
  assert.deepEqual(q('q2 2020'), { from: '2020-04-01', to: '2020-06-30' });
  assert.deepEqual(q('summer 2021'), { from: '2021-06-01', to: '2021-08-31' });
  assert.deepEqual(q('christmas 2020'), { from: '2020-12-24', to: '2020-12-26' });
  assert.deepEqual(q('5 mar 2019'), { from: '2019-03-05', to: '2019-03-05' });
  assert.deepEqual(q('march 5th, 2019'), { from: '2019-03-05', to: '2019-03-05' });
  assert.deepEqual(q('the 2010s'), { from: '2010-01-01', to: '2019-12-31' });
});

test('parseDateQuery handles open ranges, relative ranges and special words', () => {
  assert.deepEqual(q('since 2020'), { from: '2020-01-01', to: '' });
  assert.deepEqual(q('after 2020'), { from: '2021-01-01', to: '' });
  assert.deepEqual(q('before 2015'), { from: '', to: '2014-12-31' });
  assert.deepEqual(q('until march 2015'), { from: '', to: '2015-03-31' });
  assert.deepEqual(q('last 3 months'), { from: '2026-08-03', to: '2026-11-02' });
  assert.deepEqual(q('last month'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(q('yesterday'), { from: '2026-11-01', to: '2026-11-01' });
  assert.deepEqual(q('christmas'), { from: '2025-12-24', to: '2025-12-26' }); // most recent one that has begun
  assert.deepEqual(q('all time'), { from: '', to: '' });
  assert.deepEqual(q('on this day'), { otd: true });
  assert.deepEqual(q('first video'), { first: true });
});

test('parseDateQuery rejects what it does not understand', () => {
  assert.equal(q('nonsense'), null);
  assert.equal(q('2019-02-30'), null);
  assert.equal(q('2017-2015'), null);
  assert.equal(q(''), null);
});

test('numeric dates follow the locale order when ambiguous', () => {
  assert.deepEqual(q('5/3/2019'), { from: '2019-03-05', to: '2019-03-05' });
  assert.deepEqual(q('5/3/2019', { mdFirst: true }), { from: '2019-05-03', to: '2019-05-03' });
  assert.deepEqual(q('25/3/2019', { mdFirst: true }), { from: '2019-03-25', to: '2019-03-25' });
});

test('filters survive a round trip through the URL', () => {
  const f = { from: '2019-03-01', to: '2019-03-31', q: 'react -shorts', len: 'over20', sort: 'old', type: 'shorts', otd: false };
  const back = C.decodeFilters('#' + C.encodeFilters(f));
  assert.deepEqual(back, f);
  assert.deepEqual(C.decodeFilters('#cdf=today'), { otd: true, from: '', to: '' });
  assert.equal(C.decodeFilters('#something-else'), null);
});

test('decodeFilters drops impossible days and puts a reversed range in order', () => {
  assert.deepEqual(C.decodeFilters('#cdf=2019-13-01..2019-02-30'), { from: '', to: '', otd: false });
  assert.deepEqual(C.decodeFilters('#cdf=2019-02-29..2019-03-31'), { from: '', to: '2019-03-31', otd: false });
  assert.deepEqual(C.decodeFilters('#cdf=2020-02-29..'), { from: '2020-02-29', to: '', otd: false });
  assert.deepEqual(C.decodeFilters('#cdf=2020-05-01..2019-01-01'), { from: '2019-01-01', to: '2020-05-01', otd: false });
  assert.deepEqual(C.decodeFilters('#cdf=garbage&type=bogus&sort=old'), { from: '', to: '', otd: false, sort: 'old' });
  // Every decoded view can be titled without throwing.
  for (const h of ['#cdf=2019-13-01..2019-02-30', '#cdf=2020-05-01..2019-01-01', '#cdf=..2019-01-01']) {
    assert.doesNotThrow(() => C.rangeTitle(C.decodeFilters(h)));
  }
});

test('the 30 days preset counts calendar days across a DST change', () => {
  // DST began on 8 Mar 2026 in Los Angeles; just after midnight, subtracting 29×24 h lands a day early.
  const p = C.presets(new Date(2026, 2, 20, 0, 30)).find(x => x.id === '30d');
  assert.deepEqual([p.from, p.to], ['2026-02-19', '2026-03-20']);
});

test('stepRange moves by whole months or by the same number of days', () => {
  assert.deepEqual(C.stepRange({ from: '2019-01-01', to: '2019-01-31' }, 1), { from: '2019-02-01', to: '2019-02-28' });
  assert.deepEqual(C.stepRange({ from: '2019-01-01', to: '2019-12-31' }, -1), { from: '2018-01-01', to: '2018-12-31' });
  assert.deepEqual(C.stepRange({ from: '2019-03-10', to: '2019-03-16' }, 1), { from: '2019-03-17', to: '2019-03-23' });
  assert.equal(C.stepRange({ from: '', to: '' }, 1), null);
});

test('parseViews and parseDur read YouTube labels', () => {
  assert.equal(C.parseViews('1.2K views'), 1200);
  assert.equal(C.parseViews('3M views'), 3000000);
  assert.equal(C.parseViews('1,234 views'), 1234);
  assert.equal(C.parseViews('1 view'), 1);
  assert.equal(C.parseViews('No views'), 0);
  assert.equal(C.parseViews('soon'), null);
  assert.equal(C.parseDur('1:02:03'), 3723);
  assert.equal(C.parseDur('4:05'), 245);
  assert.equal(C.parseDur(''), 0);
});

test('extractVideos pulls uploads and their labels out of a playlist page', () => {
  const item = (id, title, len, info) => ({
    playlistVideoRenderer: {
      videoId: id, title: { runs: [{ text: title }] }, lengthText: { simpleText: len },
      videoInfo: { runs: info.map(text => ({ text })) },
      navigationEndpoint: { watchEndpoint: { videoId: id } }
    }
  });
  const page = {
    contents: [{
      items: [
        item('aaaaaaaaaaa', 'Newest', '10:00', ['1.2K views', ' • ', '2 days ago']),
        item('bbbbbbbbbbb', 'Older', '1:02:03', ['15 views', ' • ', 'Streamed 3 years ago']),
        { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'NEXT' } } } }
      ]
    }]
  };
  const vids = C.extractVideos(page);
  assert.deepEqual(vids.map(v => [v.id, v.title, v.dur, v.views, v.rel]), [
    ['aaaaaaaaaaa', 'Newest', 600, 1200, '2 days ago'],
    ['bbbbbbbbbbb', 'Older', 3723, 15, 'Streamed 3 years ago']
  ]);
  assert.equal(C.findContinuation(page), 'NEXT');
});

test('select places uploads by exact date and by estimate', () => {
  const t = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
  const seen = t(2026, 11, 1);
  // Newest first: [id, title, dur, views, rel, seenAt, exact, flags]
  const videos = [
    ['v3aaaaaaaaa', 'c', 60, 10, '1 month ago', seen, t(2026, 10, 1), ''],
    ['v2aaaaaaaaa', 'b', 60, 50, '1 year ago', seen, 0, ''],
    ['v1aaaaaaaaa', 'a', 60, 20, '3 years ago', seen, t(2023, 6, 1), '']
  ];
  const vw = C.view(videos);
  // The middle upload has no exact date, but its neighbours bound it.
  assert.ok(vw.lo[1] >= t(2023, 6, 1) && vw.hi[1] <= t(2026, 10, 1));
  const base = { q: '', len: 'any', sort: 'new', type: 'all', otd: false };
  assert.deepEqual(C.select(videos, Object.assign({}, base, { from: '2026-10-01', to: '2026-10-31' }), vw).idx, [0]);
  assert.deepEqual(C.select(videos, Object.assign({}, base, { from: '2023-01-01', to: '2023-12-31' }), vw).idx, [2]);
  assert.deepEqual(C.select(videos, Object.assign({}, base, { from: '', to: '', sort: 'views' }), vw).idx, [1, 2, 0]);
  assert.deepEqual(C.select(videos, Object.assign({}, base, { from: '', to: '', q: '-b' }), vw).idx, [0, 2]);
});

test('milestones count from the oldest upload', () => {
  const videos = Array.from({ length: 120 }, (_, i) => [`v${String(i).padStart(10, '0')}`, '', 0, i === 7 ? 999 : 1, '', 0, 0, '']);
  const ms = C.milestones(videos);
  assert.deepEqual(ms.map(m => [m.key, m.i]), [['n1', 119], ['n100', 20], ['top', 7]]);
});
