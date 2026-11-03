# Channel Almanac site: design notes

## Brief

- **Subject:** Channel Almanac, a free, MIT-licensed browser extension (Chromium 121+, Firefox 121+)
  that finds anything a YouTube channel ever uploaded by its exact date. Not in the stores yet:
  it installs from GitHub.
- **Audience:** people who dig through back catalogs. Fans looking for that one video,
  researchers, journalists, video essayists, archivists, creators checking their own history.
  Second audience: developers who might contribute.
- **Job:** in 3 seconds, say what it does; earn trust (no server, no account, no tracking);
  get it installed from GitHub.
- **Assets:** the marigold icon (a calendar page with one day found), the README, and `lib.js`,
  the extension's own pure helpers. The site runs `lib.js` for real (typed dates, the lookup
  search) instead of faking a UI.
- **Constraints:** no screenshots exist yet and real creators' videos must not appear, so every
  example uses one invented, clearly labelled example channel. No invented metrics, users or
  reviews. Not affiliated with YouTube.

### Assumptions (also in `src/data/site.ts`)
- Production URL `https://channel-almanac.vercel.app` (placeholder until a host is chosen).
- The example channel (1,284 uploads since 2011) is generated from a fixed seed relative to the
  build date, so "3 years ago" stays true whenever the site is rebuilt.

## Concepts

| | Idea | Anchor | Signature | O/F/Fe/P |
|---|---|---|---|---|
| A. Name | The site is printed like an almanac for one channel: year tables, a spot colour, "March hath 31 days" | the product's name | the whole-history grid inks itself in day by day | 3 / 4 / 4 / 3 |
| **B. Material** | **YouTube says "3 years ago". The page starts there and narrows, lookup by lookup, until it lands on the exact minute** | **YouTube's relative labels, and the parallel binary search `lib.js` really runs (about 20 lookups decide every upload)** | **a sticky hero that plays the real search: piles of "years ago" uploads spread into their true days while the headline widens from vague to exact** | **5 / 5 / 4 / 1** |
| C. Formal | The whole site is one Whole history grid, a row per year; every section is a range you drag across | the Whole history view | drag a range and the page filters | 4 / 4 / 2 / 2 |

**Pick B.** Only this product turns "3 years ago" into a minute, and the mechanism is honest
and visual. From A: two-colour print discipline (ink plus a marigold spot) and the icon's day
cells as the heat ramp. From the product itself: the 404 is "Never a dead end".

## Direction change: minimal (owner feedback, 2 Nov 2026)

The first build had a scroll-scrubbed hero, text reveals, a page-transition curtain and smooth
scroll. The owner's verdict: "too many weird animations, keep it minimal and on point". So:

- No GSAP, no Lenis, no scroll effects, no page transitions, no reveals. JS is only the demo,
  the install tabs and copy buttons (about 15 KB gzipped, most of it `lib.js`).
- The concept stays, carried by type alone: the hero is a still poster. "3 years ago" is set
  condensed, light and struck; the exact date under it is expanded and heavy, at the same size.
- Hovers are short colour or underline changes (0.2 s). The page is still at rest by decision.
- The live demo (the real `lib.js` parser and search) is the one thing that moves, and only
  when the visitor types.

## Concept card

```
Idea:        YouTube says "3 years ago". Channel Almanac says the exact minute.
Metaphor:    precision as width: vague is narrow and light, exact is wide and heavy.
Signature:   the hero poster (static), then the "Type a date" demo: the extension's own parser
             and search running on an example channel, with its Whole history grid.
Emotion:     recognition ("I know that label"), then relief: precision.
Motion:      none at rest; short colour/underline hovers; the demo answers as you type.
Screenshot:  the struck "3 years ago" over "11 April 2023, 18:04" on marigold.
```

## System

**Palette** (all from the icon):

| Role | Hex | Use |
|---|---|---|
| marigold | `#F2A516` | field: hero, footer, curtain, primary button |
| ink | `#1F1500` | text, the found day, the "How it works" chapter ground |
| paper | `#FFF6E3` | the calendar page: content ground |
| muted | `#73591F` on paper (6.2:1), `#4D3700` on marigold (5.5:1), `#B8A27A` on ink (7.3:1) | secondary text |
| line | ink at 16% | hairlines |
| heat 1 to 3 | `#FBE2AC` `#F6C35E` `#EA9C25` | the icon's own day cells: 1, 2, 3+ uploads a day |

Cream ground is on the avoid list; it stays because it is the icon's calendar page, paired with a
grotesk and marigold, never a serif and terracotta.

**Type:** Archivo variable (Google, OFL), width 62 to 125, weight 100 to 900: one family, two
voices. *Vague* is condensed and light; *exact* is expanded and heavy, after the extended
grotesques of printed almanacs and timetables. Text is Archivo 100% at 400/500. Fragment Mono only
for real data: timestamps, counts, keys, commands.
Scale: mega `clamp(4rem, 1rem + 13vw, 15rem)`, display tracking -0.02em (expanded) to -0.045em
(condensed), leading 0.86 to 0.95. Body 17 px / 1.55.

**Grid:** 12 columns, fluid gutter. Three hang lines: column 1, column 5, column 9. Text blocks
start on them. Rhythm moods: tight (8u), normal (16u), airy (28u), full viewport.

**Shape:** one radius, `0.375rem`, from the icon's rounded day cells: on cells, keys, buttons and
inputs. Sections are full bleed and square.

**Interaction (after the minimal pass):** buttons invert their fill, nav and footer links show an
underline, feature rows tint marigold and underline the name, chips fill ink when chosen. All
0.2 s, all also on `:focus-visible`. No idle motion: a still page is the decision.

## Composition plan

```
HOME
1 Hero, poster                     marigold
  | mark Channel Almanac                 Guide  Install  Privacy  GitHub |
  | YouTube says                                                         |
  | 3̶ ̶y̶e̶a̶r̶s̶ ̶a̶g̶o̶          (62% light, muted, struck)                     |
  | Channel Almanac says                                                 |
  | 11 April 2023, 18:04  (125% black, same size, full width)            |
  | h1 Find anything a channel ever uploaded,    [Install free] [Source] |
  | example note                                                         |

3 Type a date, asymmetric pair     paper  (opens with "Latest, Popular, Oldest. ... adds Dates.")
  | col 1-5: input (real parser) + examples | col 6-12: result title, range, |
  |                                         | lookups, uploads              |
  | full width: whole history grid, a row per year, range highlighted     |

3b Most liked, asymmetric pair     ink
  | col 1-4: kicker, title, real chip strip, note | col 6-12: NASA's top five by    |
  |                                               | likes as a table: rank, title + |
  |                                               | views (mono), count (marigold)  |
  |                                               | "Popular puts The Year of Pluto |
  |                                               | first ... By likes it's #15."   |

4 Feature index, index list        paper
  | name                one line                    key |  x 9 rows

5 How it works, data/facts         ink
  | 100 / per request | ~20 / lookups decide | 3 / at once | 1 to 3 / to reopen |

6 Privacy, split frame             marigold rule, paper
  | The only site it talks to is youtube.com. | three plain lines + link |

7 Footer finale                    marigold
  | Install Channel Almanac (mega) | steps link | GitHub | MIT | disclaimer |

GUIDE      sticky narrative: TOC column 1-3, entries 5-12, keyboard table
INSTALL    sequence: big step numbers (a real sequence), Chromium / Firefox tabs, commands
PRIVACY    statement + permissions table + "Being gentle with YouTube" facts
404        "Never a dead end": nothing here, closest before and after
```

**Genericness test.** A generic model would ship a dark hero, a laptop mockup, three feature
cards and a purple glow. Changed: no mockup (the real parser and search run instead), no cards
(an index list and a facts row), the hero is a label every YouTube user knows rather than a
slogan, and the type itself carries the concept (width = precision).
