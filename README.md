<img src="icons/icon128.png" width="96" height="96" alt="">

# Channel Almanac

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A free, open-source browser extension that lets you find anything a YouTube channel ever uploaded by its exact date, right on YouTube. No API key, no account, no outside server.

Works in Chrome, Edge, Brave, Arc and other Chromium browsers (121 or newer), and in Firefox (121 or newer).

**Website: [channel-almanac.vercel.app](https://channel-almanac.vercel.app)**

https://github.com/user-attachments/assets/bf13457a-fc3c-4b18-bd6e-f2e65214a761

The 42-second demo (with sound), recorded on NASA's public YouTube channel.

## Install

The extension isn't in the browser stores yet, so install it from this repository.

**Get the code:** clone the repo, or click **Code → Download ZIP** on GitHub and unzip it somewhere permanent (the unzipped folder is called `channel-almanac-main`).

```bash
git clone https://github.com/0x1p0/channel-almanac.git
```

**Chrome, Edge, Brave, Arc**
1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `channel-almanac` folder.
3. Reload any YouTube tabs that were already open.

**Firefox**
1. Open `about:debugging#/runtime/this-firefox` and click **Load Temporary Add-on…**.
2. Pick the `manifest.json` file inside the `channel-almanac` folder.
3. Firefox asks for site access per site: click the extensions button in the toolbar and allow it on www.youtube.com.

Temporary add-ons are removed when Firefox restarts.

**Updating:** pull the latest code (or download the ZIP again), then click the reload icon on the extension's card in `chrome://extensions`, or **Reload** in `about:debugging`.

## Open it

- The **Dates** chip next to Latest / Popular / Oldest on a channel's Videos, Shorts or Live tab
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
- **Most liked.** Sorts the current view by likes. YouTube's uploads list has no like counts, so they load when you pick this sort and the list re-sorts as they arrive. Uploads whose channel hides likes go last.
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

- At most 3 lookups at once with gaps between them; calendar and background lookups go one at a time, under two a second.
- Typical use: opening a 1,000-video channel is about 10–15 list requests, a date range about 15–30 lookups. Reopening a saved channel is 1–3 requests.
- Like counts load only while you sort by Most liked: one small request per upload in view (about 3 KB, trimmed to just the like button), two at a time. They're saved, so each is fetched once.
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

Run the tests with Node 18 or newer (no dependencies to install):

```bash
node --test
```

After editing, reload the extension (see **Updating** above) and refresh the YouTube tab.

To build a ZIP for the Chrome Web Store or Firefox Add-ons:

```bash
zip -r channel-almanac.zip manifest.json background.js content.js lib.js icons LICENSE
```

## Contributing

Bug reports and pull requests are welcome. YouTube changes its page data from time to time, so if something stops working, please open an issue with the channel URL, your browser and what you expected to see.

For pull requests, keep the extension dependency-free, add a test in `test/` for changes to `lib.js`, and run `node --test` before sending.

## Disclaimer

Channel Almanac is an independent project. It isn't affiliated with, endorsed by or sponsored by YouTube or Google. YouTube is a trademark of Google LLC.

## License

[MIT](LICENSE)
