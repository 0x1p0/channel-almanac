<img src="icons/icon128.png" width="96" height="96" alt="">

# Channel Almanac

[![Firefox Add-ons](https://img.shields.io/amo/v/channel-almanac?label=Firefox%20Add-ons&logo=firefoxbrowser)](https://addons.mozilla.org/addon/channel-almanac/)
[![Test](https://github.com/0x1p0/channel-almanac/actions/workflows/test.yml/badge.svg)](https://github.com/0x1p0/channel-almanac/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A free, open-source browser extension that lets you find anything a YouTube channel ever uploaded by its exact date, right on YouTube. No API key, no account, no outside server.

Works in Chrome, Edge, Brave, Arc and other Chromium browsers (121 or newer), and in Firefox (121 or newer).

**Website: [channel-almanac.vercel.app](https://channel-almanac.vercel.app)**

https://github.com/user-attachments/assets/6475fe88-58b0-436d-9d39-f9d1e9f7169f

The 48-second demo (with sound), recorded on NASA's public YouTube channel.

## Install

**Firefox:** get it on **[Firefox Add-ons](https://addons.mozilla.org/addon/channel-almanac/)**. Click **Add to Firefox**, then allow it on www.youtube.com when Firefox asks for site access. Firefox keeps it up to date.

**Chrome, Edge, Brave, Arc:** it isn't in the Chrome Web Store yet, so install it from this repository.

**Get the code:** clone the repo, or click **Code → Download ZIP** on GitHub and unzip it somewhere permanent (the unzipped folder is called `channel-almanac-main`).

```bash
git clone https://github.com/0x1p0/channel-almanac.git
```

**Load it:**
1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `channel-almanac` folder.
3. Reload any YouTube tabs that were already open.

**Updating:** pull the latest code (or download the ZIP again), then click the reload icon on the extension's card in `chrome://extensions`. Firefox Add-ons updates itself.

## Open it

- The **Dates** chip next to Latest / Popular / Oldest on a channel's Videos, Shorts or Live tab
- The **Most liked** chip just before it, which opens the panel on the whole channel sorted by likes
- The **Dates** tab on the right edge on every other channel page (Home, Playlists, Posts…)
- The calendar button right after Share on a video (same round style as YouTube's own buttons), which opens the panel on the week around that video
- The toolbar button or **Alt+Shift+D** (**⌥⇧D** on a Mac) anywhere on YouTube (on a video, it opens that video's channel around that video). You can change it in your browser's extension shortcut settings, e.g. `chrome://extensions/shortcuts`
- A copied view link (see below)

## What it does

- **Type a date in plain words.** Click the big date (or press **D**) and type "march 2019", "summer 2021", "2015–2017", "last 3 months", "christmas 2020", "since 2020" or "first video". A preview shows the range and how many uploads it has before you press Enter.
- **Drag to pick dates.** Drag across days in a year, or across year bars, to select that range.
- **Any date range.** Quick picks, exact From / To dates (calendar button next to the date), or click a year in the timeline. A year opens as twelve small months; days light up as their exact upload dates load. Click a day or a month name to see it, and step between years with the arrows.
- **Around this video.** On a watch page, the Dates button shows what the channel posted the same week, with the video you're watching marked "Playing now". Same month and Same year widen it. If you move to another video, the panel follows.
- **First upload and milestones.** A First video pick jumps to the channel's first public upload. Under the year bars: the 100th, 500th and 1,000th uploads and the most viewed one, also marked on the timeline.
- **Whole history.** Every year as one row of days, so a creator's entire career fits on one screen. Hover a day for its uploads, click to open it, drag to pick a range, click a year to see it.
- **Never a dead end.** When a range has no uploads, the panel shows the closest uploads before and after, one click away.
- **On this day.** What the channel posted on today's date in earlier years.
- **Videos / Shorts / Live.** Exact, read from the channel's own Shorts and Live tabs.
- **Search and length.** Several words must all match; put `-` in front of a word to exclude it.
- **Standouts.** Uploads that beat the channel's usual views for their period are tagged (e.g. "4.2× usual"), and the Standouts sort puts them first.
- **Most liked.** Sorts by likes: pick it in the Sort menu, or click the Most liked chip next to Latest / Popular / Oldest to see the whole channel (in that tab's type) by likes. YouTube's uploads list has no like counts, so they load for the uploads on screen and the next page, most viewed first: the top of the list is usually right within a few seconds, and Show more loads more. Uploads whose channel hides likes go last.
- **Stats for the range.** Uploads per month, longest gap, usual upload day and time, median views.
- **Play in order.** Plays everything in the current view oldest first as a YouTube playlist. YouTube caps these at 50 videos, so the extension starts the next 50 automatically; a small pill shows your place and has Next / Stop.
- **Copy link.** Copies a link to the channel with your filters in it (`…/videos#cdf=2019-03-01..2019-03-31&type=shorts`). Opening it opens the panel with that exact view.
- **Exact dates on hover.** Hover any "3 years ago" label anywhere on YouTube for the exact date and time. Can be turned off in Settings.
- **Grid view.** Switch the results between a list and a grid of thumbnails (**G**).
- **Opened marks.** Videos you've opened on YouTube are marked "Opened" in the list, so you can work through a range. Can be turned off in Settings.
- **Picks up where you left off.** Each channel reopens on the last range you looked at.
- **Resizable.** Drag the panel's left edge to make it wider; double-click it to reset.

## Keyboard

| Key | Does |
| --- | --- |
| D | Type a date |
| [ ] | Previous or next day, month, year or range |
| Arrow keys | Move between days, months or years in the timeline |
| Enter | Pick the focused day, or open the focused video |
| J K | Next or previous video |
| / | Search titles |
| G | List or grid |
| H | Whole history |
| Esc | Close |
| ? | Show shortcuts |

## How it gets exact dates

1. It reads the channel's uploads list from YouTube's own page data, 100 videos per request.
2. That list only says "3 years ago", so exact upload times are looked up per video. Uploads are in date order, so only the videos at the edges of your range need checking: about 20 lookups decide every video in or out, even on big channels.
3. Rows on screen and the year open in the calendar come next. Filling in every other upload is off by default; turn it on in Settings (or "Load all exact dates" under the timeline) to make the year, month and calendar counts exact.

## Privacy

- No analytics, no tracking, no accounts, and no servers of its own. The only site it talks to is youtube.com.
- Every request goes to youtube.com signed out (no cookies, no visitor id), so nothing is tied to your Google account.
- Everything it saves (upload lists, exact dates, opened marks, settings) stays in your browser's extension storage. **Settings → Clear all saved data** removes it.

### Permissions

| Permission | Why |
| --- | --- |
| `https://www.youtube.com/*` | Show the panel on YouTube and read channel data from YouTube's own endpoints |
| `storage`, `unlimitedStorage` | Save upload lists and exact dates so channels you've opened before load instantly (big channels can exceed the default quota) |
| `activeTab`, `scripting` | Let the toolbar button and shortcut work in YouTube tabs opened before the extension was installed |

## Being gentle with YouTube

- At most 3 exact-date lookups at once with gaps between them; calendar and background lookups go one at a time, under two a second.
- Typical use: opening a 1,000-video channel is about 10–15 list requests, a date range about 15–30 lookups. Reopening a saved channel is 1–3 requests.
- Like counts load only while you sort by Most liked, and only for the uploads on screen and the next page: one small request each (about 3 KB, trimmed to just the like button), at most 10 a second and 12 at once. If YouTube asks it to slow down, likes stop for 10 minutes and come back at half the rate. Counts are saved, so each is fetched once.
- If YouTube asks it to slow down, it pauses for a minute and resumes on its own.

Channels you've opened before load instantly and only new uploads are fetched. Milestones add a handful of lookups per channel.

## Development

There's no build step: the files in this folder are the extension.

| File | What's in it |
| --- | --- |
| `manifest.json` | Manifest V3 config (one manifest for Chromium and Firefox) |
| `content.js` | The panel, Dates chip, hover dates, play queue and everything that talks to YouTube (Shadow DOM, follows YouTube's light/dark theme) |
| `lib.js` | Pure helpers: parsing YouTube's page data, date-range logic, typed dates, timeline, calendar, stats and standouts |
| `background.js` | Toolbar button and shortcut |
| `icons/` | Toolbar and store icons. `icon.svg` is the source for the 48 and 128 px PNGs; `icon-16.svg` and `icon-32.svg` are pixel-aligned versions for the small sizes |
| `site/` | The website, [channel-almanac.vercel.app](https://channel-almanac.vercel.app) (Astro). It runs `lib.js` for its live demo; see `site/README.md` |
| `test/` | Unit tests for `lib.js` |
| `.github/workflows/` | The test check GitHub runs on every push and pull request |

Run the tests with Node 18 or newer (no dependencies to install):

```bash
node --test
```

GitHub Actions runs the same tests on every push and pull request, along with a syntax check of the extension's scripts and a check that `manifest.json` parses (`.github/workflows/test.yml`).

After editing, reload the extension (see **Updating** above) and refresh the YouTube tab. To try changes in Firefox, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `manifest.json`; temporary add-ons are removed when Firefox restarts.

To build a ZIP for the Chrome Web Store or Firefox Add-ons:

```bash
zip -r channel-almanac.zip manifest.json background.js content.js lib.js icons LICENSE
```

## Contributing

Bug reports and pull requests are welcome. YouTube changes its page data from time to time, so if something stops working, please open an issue with the channel URL, your browser and what you expected to see.

For pull requests, keep the extension dependency-free, add a test in `test/` for changes to `lib.js`, and run `node --test` before sending. The same checks run on your pull request automatically.

## Disclaimer

Channel Almanac is an independent project. It isn't affiliated with, endorsed by or sponsored by YouTube or Google. YouTube is a trademark of Google LLC.

## License

[MIT](LICENSE)
