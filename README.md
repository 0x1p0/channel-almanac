# Channel Date Finder

A browser extension that lets you find anything a YouTube channel ever uploaded by its exact date, right on YouTube. No API key, account or outside server.

## Install

**Chrome, Edge, Brave, Arc**
1. Unzip `channel-date-finder.zip` somewhere permanent.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `channel-date-finder` folder. Reload any open YouTube tabs.

**Firefox** (121 or newer)
1. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `channel-date-finder-firefox.zip`. (Temporary add-ons are removed when Firefox restarts; publishing it on Firefox Add-ons makes it permanent.)
2. Firefox asks for site access per site: click the extensions button in the toolbar and allow it on www.youtube.com.

## Open it

- The **Dates** chip next to Latest / Popular / Oldest on a channel's Videos, Shorts or Live tab
- The **Dates** tab on the right edge on every other channel page (Home, Playlists, Posts…)
- The calendar button right after Share on a video (same round style as YouTube's own buttons), which opens the panel on the week around that video
- The toolbar button or **Alt+Shift+D** anywhere on YouTube (on a video, it opens that video's channel around that video)
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
3. Rows on screen and the year open in the calendar come next. Filling in every other upload is off by default; turn it on in Settings (or "Make them exact" under the upload count) to make the year, month and calendar counts exact.

## Being gentle with YouTube

- Every request goes to youtube.com signed out (no cookies, no visitor id), so nothing is tied to your Google account.
- At most 3 lookups at once with gaps between them; calendar and background lookups go one at a time, under two a second.
- Typical use: opening a 1,000-video channel is about 10–15 list requests, a date range about 15–30 lookups. Reopening a saved channel is 1–3 requests.
- If YouTube asks it to slow down, it pauses for a minute and resumes on its own.

Everything is saved in the browser, so channels you've opened before load instantly and only new uploads are fetched. Milestones add a handful of lookups per channel.

## Files

- `manifest.json` — Manifest V3 config
- `content.js` — the panel, Dates chip, hover dates, play queue and everything that talks to YouTube (Shadow DOM, follows YouTube's light/dark theme)
- `lib.js` — parsing YouTube's page data, date-range logic, timeline, calendar, stats and standouts
- `background.js` — toolbar button and shortcut
