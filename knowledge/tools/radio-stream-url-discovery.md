---
type: knowledge
created: 2026-04-16
updated: 2026-04-18
tags: [radio, streaming, api, tools]
---

# Finding Hidden Radio Stream URLs

Most radio station websites (including major networks like Air1/K-LOVE) deliberately hide their direct stream URLs behind JavaScript players. The open [Radio Browser](https://www.radio-browser.info/) database often has them.

## Radio Browser API

```
https://de1.api.radio-browser.info/json/stations/byname/<station-name>
```

Returns JSON with `url`, `bitrate`, `codec` fields. Example:

```bash
# Find Air1's stream URL
curl "https://de1.api.radio-browser.info/json/stations/byname/air1"
# → https://maestro.emfcdn.com/stream_for/air1/airable/aac  (AAC+ 64kbps)
```

Multiple mirror servers available: `de1`, `at1`, `nl1` — swap the subdomain if one is slow.

## EMF CDN Pattern (Air1 / K-LOVE)

Educational Media Foundation uses `maestro.emfcdn.com`. Likely pattern:

- `https://maestro.emfcdn.com/stream_for/air1/airable/aac`
- `https://maestro.emfcdn.com/stream_for/air1/airable/mp3` (untested)
- `https://maestro.emfcdn.com/stream_for/klove/airable/aac` (likely)

## StreamTheWorld (Audacy-owned stations)

Many commercial stations use StreamTheWorld. Mount point format:

```
https://playerservices.streamtheworld.com/pls/<CALLSIGN>.pls
# or
https://playerservices.streamtheworld.com/api/livestream?version=1.9&mount=<CALLSIGN>&lang=en
```

Common callsign suffixes: `AAC`, `FM`, `MP3`. Trial and error required — Radio Browser is faster.

## Radio Swiss (SRG SSR) — Reliable Direct MP3

Swiss public broadcaster. Consistent URL pattern, no auth, no redirects:

```
https://stream.srg-ssr.ch/m/<station>/mp3_128
```

Known stations:
- `rsc_de` — Radio Swiss Classic (classical)
- `rsj` — Radio Swiss Jazz
- `rsp` — Radio Swiss Pop

## SomaFM Direct URLs

Pattern: `https://ice1.somafm.com/<name>-128-mp3`

Stations worth knowing beyond Groove Salad / Lush / Drone Zone / Cliqhop / Illinois Street:
- `beatblender` — Beat Blender (downtempo/electronica, focus)
- `deepspaceone` — Deep Space One (deep ambient)
- `spacestation` — Space Station Soma (ambient electronic)
- `sonicuniverse` — Sonic Universe (jazz/fusion)
- `thetrip` — The Trip (psychedelic electronic)
- `defcon` — DEF CON Radio (electronic/metal/gaming)
- `indiepop` — Indie Pop Rocks

All SomaFM streams are direct ICY streams — no JS redirect, WebView2-safe.

## Fallback Methods

1. **Radio Browser first** — covers thousands of stations
2. **Streema / myTuner** — have stream pages but hide URLs behind players; inspect network tab
3. **TuneIn** — station page at tunein.com/radio/&lt;slug&gt; — inspect network requests for `.pls` or `.m3u8`
4. **VideoHelp forum** — community-maintained thread for stubborn stations
<!-- orphan: 0 inbound links as of 2026-04-20 -->
