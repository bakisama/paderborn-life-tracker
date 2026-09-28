# M.Sc. Life Tracker — Universität Paderborn

A week-by-week productivity tracker for master's students at Paderborn University. Score each week of your programme honestly — not to judge yourself, but to stay aware.

Paderborn edition of [PG Life Tracker — IIT Hyderabad](https://github.com/bakisama/pglife-tracker).

## Features

- **German semester model** — Winter (Oct–Mar) and Summer (Apr–Sep) semesters, each split into lecture period, Christmas break and lecture-free period (exams)
- **Official dates** — NRW lecture periods (set by MKW NRW) through SS 2030 and Paderborn's WS 2026/27 Christmas break; later Christmas breaks marked *(est.)* until published
- **Programme length** — M.Sc. standard 4 semesters, or 5 / 6 if you run over
- **Winter or summer intake** — the calendar starts from whichever semester your first day falls in; late arrivals (visa delays) start at the arrival date
- **Weekly scoring** — Rate each past week 1–5 by mouse or keyboard (Tab, Enter, 1–5)
- **Stats dashboard** — Weeks elapsed, scored, average score, remaining
- **Current week indicator** — Pulsing marker + info bar
- **Advanced settings** — Override any period's start/end date
- **Fully local** — All data stored in localStorage, nothing leaves your device

## Dates used (WS 2026/27 start)

| Semester | Lecture period | Christmas break |
|---|---|---|
| WS 2026/27 | 12 Oct 2026 – 5 Feb 2027 | 23 Dec – 6 Jan |
| SS 2027 | 5 Apr – 16 Jul 2027 | — |
| WS 2027/28 | 11 Oct 2027 – 4 Feb 2028 | 23 Dec – 6 Jan *(est.)* |
| SS 2028 | 17 Apr – 28 Jul 2028 | — |

Campus Orientation is 5–9 Oct 2026 (the default first day). Sources: [MKW NRW Vorlesungszeiten](https://www.mkw.nrw/hochschule-und-forschung/studium-und-lehre/vorlesungszeiten), [Uni Paderborn Termine](https://www.uni-paderborn.de/zv/3-3/studienorganisation/termine). When Paderborn publishes a new Christmas break, add it to `OFFICIAL_TERMS` in `calendar.js`.

## Tech

Pure HTML + CSS + JS. No frameworks, no build step, no dependencies. Date logic lives in `calendar.js`; `node check.js` runs its self-check.

## Credits

Inspired by [UG Life Tracker](https://uglife-tracker.netlify.app) and supporting [video](https://youtu.be/3RnuueCaTgU).
