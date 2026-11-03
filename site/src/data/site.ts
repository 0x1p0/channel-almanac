// Every visible string on the site lives here, so it can change without touching markup.
// Facts come from the extension's README and code. Nothing here is invented except:
// Assumptions (placeholders the owner should confirm or replace):
//   - url: the production domain is a placeholder until a host is chosen (placeholder: true).
//   - The example channel used by every demo is invented and labelled as such (src/data/channel.ts).
//   - No screenshots or screen recordings of the panel exist yet; the site shows the extension's
//     own code running instead. A real recording would be the biggest single upgrade.

export const site = {
  name: 'Channel Almanac',
  role: 'Find any YouTube upload by its exact date',
  url: 'https://channel-almanac.vercel.app', // placeholder: true
  description:
    'A free, open-source browser extension that finds anything a YouTube channel ever uploaded by its exact date, right on YouTube. No API key, no account, no server.',
  repo: 'https://github.com/0x1p0/channel-almanac',
  zip: 'https://github.com/0x1p0/channel-almanac/archive/refs/heads/main.zip',
  issues: 'https://github.com/0x1p0/channel-almanac/issues',
  license: 'https://github.com/0x1p0/channel-almanac/blob/main/LICENSE',
  version: '1.0.0',
  browsers: 'Chrome, Edge, Brave, Arc and Firefox 121 or newer',
  nav: [
    { href: '/guide/', label: 'Guide' },
    { href: '/install/', label: 'Install' },
    { href: '/privacy/', label: 'Privacy' },
  ],
};

export type Feature = { name: string; line: string; key?: string; slug: string };

// The index on the home page and the entries on the guide share these names and lines.
export const features: Feature[] = [
  { slug: 'type', name: 'Type a date', key: 'D', line: 'Plain words: “march 2019”, “summer 2021”, “christmas 2020”, “first video”. A preview counts the uploads before you press Enter.' },
  { slug: 'around', name: 'Around this video', line: 'On a watch page, see what the channel posted the same week. The video you are watching is marked Playing now.' },
  { slug: 'history', name: 'Whole history', key: 'H', line: 'Every year as one row of days, so a whole career fits on one screen. Drag across days to pick a range.' },
  { slug: 'milestones', name: 'First upload and milestones', line: 'Jump to the first public upload. The 100th, 500th and 1,000th, and the most viewed, are marked on the timeline.' },
  { slug: 'dead-end', name: 'Never a dead end', line: 'When a range is empty, the closest uploads before and after are one click away.' },
  { slug: 'standouts', name: 'Standouts', line: 'Uploads that beat the channel’s usual views for their period get a tag, like “4.2× usual”.' },
  { slug: 'likes', name: 'Most liked', line: 'Sort any range by likes. Counts load as you sort and are saved, so each is fetched once.' },
  { slug: 'play', name: 'Play in order', line: 'Play the whole view oldest first. When YouTube’s 50‑video playlist cap is reached, the next 50 start on their own.' },
  { slug: 'hover', name: 'Exact dates on hover', line: 'Point at any “3 years ago” anywhere on YouTube to read the exact date and time.' },
];

export const facts = [
  { n: '100', unit: 'uploads per request', text: 'The uploads list comes from YouTube’s own page data. A 1,000‑video channel opens in 10 to 15 requests.' },
  { n: '≈20', unit: 'lookups', text: 'Uploads are in date order, so only the ones at the edges of a range need an exact date. That decides every upload in or out, even on big channels.' },
  { n: '3', unit: 'at once, at most', text: 'Lookups leave gaps between them; background ones go one at a time, under two a second. Asked to slow down, it pauses for a minute.' },
  { n: '1 to 3', unit: 'requests to reopen', text: 'Channels you opened before load from your browser’s storage. Only new uploads are fetched.' },
];

export const privacy = [
  'No analytics, no tracking, no accounts, no servers of its own.',
  'Every request goes to youtube.com signed out: no cookies, no visitor id, nothing tied to your Google account.',
  'What it saves stays in your browser. Settings → Clear all saved data removes all of it.',
];

export const permissions = [
  { name: 'https://www.youtube.com/*', why: 'Show the panel on YouTube and read channel data from YouTube’s own endpoints.' },
  { name: 'storage, unlimitedStorage', why: 'Save upload lists and exact dates so channels you opened before load instantly. Big channels can pass the default quota.' },
  { name: 'activeTab, scripting', why: 'Let the toolbar button and the shortcut work in YouTube tabs that were open before you installed it.' },
];

export const keys = [
  { k: ['D'], does: 'Type a date' },
  { k: ['[', ']'], does: 'Previous or next day, month, year or range' },
  { k: ['←', '→'], does: 'Move between days, months or years in the timeline' },
  { k: ['Enter'], does: 'Pick the focused day, or open the focused video' },
  { k: ['J', 'K'], does: 'Next or previous video' },
  { k: ['/'], does: 'Search titles' },
  { k: ['G'], does: 'List or grid' },
  { k: ['H'], does: 'Whole history' },
  { k: ['Esc'], does: 'Close' },
  { k: ['?'], does: 'Show shortcuts' },
];

export const openWays: { name: string; text: string; shortcut?: boolean }[] = [
  { name: 'The Dates chip', text: 'Next to Latest, Popular and Oldest on a channel’s Videos, Shorts or Live tab.' },
  { name: 'The Dates tab', text: 'On the right edge of every other channel page: Home, Playlists, Posts.' },
  { name: 'The calendar button', text: 'Right after Share on a video. It opens the panel on the week around that video.' },
  { name: 'Keyboard shortcut', text: 'anywhere on YouTube, or click the toolbar button. On a video, it opens that video’s channel around it.', shortcut: true },
  { name: 'A copied view link', text: 'Anyone who opens a link made with Copy link lands on the same filtered view.' },
];

export const examples = ['march 2019', 'summer 2021', '2015-2017', 'last 3 months', 'christmas 2020', 'since 2020', 'first video', 'on this day'];

export type Entry = { id: string; name: string; key?: string; text: string };
export type Chapter = { id: string; title: string; entries: Entry[] };

// The guide: every feature in the README, grouped by what you are trying to do.
export const guide: Chapter[] = [
  {
    id: 'dates',
    title: 'Pick dates',
    entries: [
      { id: 'type', name: 'Type a date', key: 'D', text: 'Click the big date, or press D, and type it the way you would say it: “march 2019”, “summer 2021”, “2015-2017”, “last 3 months”, “christmas 2020”, “since 2020” or “first video”. A preview shows the range and how many uploads it has before you press Enter.' },
      { id: 'drag', name: 'Drag to pick dates', text: 'Drag across days in a year, or across year bars, to select that range.' },
      { id: 'range', name: 'Any date range', text: 'Quick picks, exact From and To dates (the calendar button next to the date), or click a year in the timeline. A year opens as twelve small months, and days light up as their exact upload dates load. Click a day or a month name to see it; step between years with the arrows.' },
      { id: 'around', name: 'Around this video', text: 'On a watch page, the Dates button shows what the channel posted the same week, with the video you are watching marked Playing now. Same month and Same year widen it. Move to another video and the panel follows.' },
      { id: 'milestones', name: 'First upload and milestones', text: 'First video jumps to the channel’s first public upload. Under the year bars: the 100th, 500th and 1,000th uploads and the most viewed one, also marked on the timeline.' },
      { id: 'history', name: 'Whole history', key: 'H', text: 'Every year as one row of days, so a creator’s entire career fits on one screen. Point at a day for its uploads, click to open it, drag to pick a range, click a year to see it.' },
      { id: 'dead-end', name: 'Never a dead end', text: 'When a range has no uploads, the panel shows the closest uploads before and after, one click away.' },
      { id: 'otd', name: 'On this day', text: 'What the channel posted on today’s date in earlier years.' },
    ],
  },
  {
    id: 'narrow',
    title: 'Narrow it down',
    entries: [
      { id: 'types', name: 'Videos, Shorts, Live', text: 'Exact, read from the channel’s own Shorts and Live tabs.' },
      { id: 'search', name: 'Search and length', key: '/', text: 'Several words must all match; put a minus in front of a word to leave it out. Length buckets match YouTube’s own search filter.' },
      { id: 'standouts', name: 'Standouts', text: 'Uploads that beat the channel’s usual views for their period are tagged, for example “4.2× usual”, and the Standouts sort puts them first.' },
      { id: 'likes', name: 'Most liked', text: 'Sorts the current view by likes. YouTube’s uploads list has no like counts, so they load when you pick this sort, a couple at a time, and the list re-sorts as they arrive. Uploads whose channel hides likes go last.' },
      { id: 'stats', name: 'Stats for the range', text: 'Uploads per month, the longest gap, the usual upload day and time, and median views.' },
    ],
  },
  {
    id: 'watch',
    title: 'Watch and share',
    entries: [
      { id: 'play', name: 'Play in order', text: 'Plays everything in the current view oldest first as a YouTube playlist. YouTube caps these at 50 videos, so the next 50 start automatically; a small pill shows your place and has Next and Stop.' },
      { id: 'link', name: 'Copy link', text: 'Copies a link to the channel with your filters in it. Opening it opens the panel on that exact view.' },
      { id: 'hover', name: 'Exact dates on hover', text: 'Point at any “3 years ago” label anywhere on YouTube for the exact date and time. Can be turned off in Settings.' },
      { id: 'grid', name: 'Grid view', key: 'G', text: 'Switch the results between a list and a grid of thumbnails.' },
      { id: 'opened', name: 'Opened marks', text: 'Videos you have opened on YouTube are marked Opened, so you can work through a range. Settings can switch the marks off.' },
      { id: 'resume', name: 'Picks up where you left off', text: 'Each channel reopens on the last range you looked at.' },
      { id: 'resize', name: 'Resizable', text: 'Drag the panel’s left edge to make it wider; double-click it to reset.' },
    ],
  },
];

// The problem, said plainly, then how the fix is used. Screenshots are real, from NASA's public channel.
export const problem = {
  title: 'YouTube can’t take you to a date.',
  text: 'A channel’s Videos tab sorts three ways: Latest, Popular, Oldest. Every upload is labelled “3 years ago” or “7 years ago”, never a day. Looking for one video from spring 2019 on a channel with thousands of uploads means scrolling past everything newer and guessing from thumbnails.',
  points: [
    { k: 'No date filter', v: 'Latest, Popular and Oldest are the only ways to sort a channel.' },
    { k: 'Vague labels', v: '“3 years ago” covers a whole year of uploads, sometimes hundreds of them.' },
    { k: 'Endless scroll', v: 'Older uploads only appear after you scroll through every newer one.' },
  ],
  fix: 'Channel Almanac adds a fourth chip, Dates, and a panel that knows the exact day of every upload.',
};

export const steps = [
  { shot: 'chip.webp', title: 'Click Dates', text: 'It sits next to Latest, Popular and Oldest on any channel’s Videos, Shorts or Live tab.', alt: 'YouTube’s Latest, Popular and Oldest chips with the Dates chip added after them.', fit: 'chip' },
  { shot: 'type-panel.webp', title: 'Say when', text: 'Type “february 2021”, “summer 2019” or “first video”. The preview counts the uploads before you press Enter.', alt: 'The Channel Almanac panel on NASA’s channel with “february 2021” typed and the preview “32 uploads, press Enter”.', fit: 'top' },
  { shot: 'range-panel.webp', title: 'Get every upload from then', text: 'Exact dates and times, ready to play in order or share as a link.', alt: 'February 2021 on NASA’s channel: 32 uploads listed with exact dates such as Sun, Feb 28, 2021, 2:43 PM.', fit: 'bottom' },
];

export const extras = [
  { shot: 'history-panel.webp', title: 'Whole history', text: 'All 6,197 of NASA’s uploads since 2008, a row of days per year.', alt: 'Whole history of NASA’s channel: one row of days per year from 2008 to 2026, darker where more videos went up.' },
  { shot: 'hover-tip.webp', title: 'Exact dates on hover', text: 'Point at any “5y ago” on YouTube for the day and time.', alt: 'A tooltip reading Mon, Feb 22, 2021, 2:16 PM above a NASA video labelled 5y ago.' },
];
