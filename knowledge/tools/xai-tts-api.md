---
type: knowledge
created: 2026-04-19
updated: 2026-04-19
tags: [tts, xai, api, audio, standalone]
---

# xAI Text-to-Speech API

Endpoint: `POST https://api.x.ai/v1/tts`
Auth: `Authorization: Bearer xai-...`
No SDK — plain fetch/requests.

## Request body

```json
{
  "text": "Hello world",
  "voice_id": "Eve",
  "language": "en",
  "output_format": { "codec": "mp3", "sample_rate": 44100, "bit_rate": 128000 }
}
```

`bit_rate` only applies to MP3. Omit for WAV.

## Voices

- `Eve` — Energetic & upbeat
- `Ara` — Warm & friendly
- `Leo` — Authoritative & strong
- `Rex` — Confident & clear
- `Sal` — Smooth & balanced

Voice IDs are case-sensitive.

## Formats

MP3: 22050/24000/44100 Hz at 32/64/128/192 kbps
WAV: 16000/44100/48000 Hz (no bitrate field)
API default (no output_format): MP3 24kHz 128kbps

## Speech tags

**Inline** (insert at cursor point):
`[pause]` `[long-pause]` `[laugh]` `[chuckle]` `[giggle]` `[breath]` `[inhale]` `[exhale]` `[sigh]` `[hum-tune]` `[cry]` `[tsk]` `[tongue-click]` `[lip-smack]`

**Wrapping** (surround text):
`<whisper>` `<soft>` `<loud>` `<emphasis>` `<slow>` `<fast>` `<sing-song>` `<singing>` `<higher-pitch>` `<lower-pitch>` `<build-intensity>` `<decrease-intensity>` `<laugh-speak>`

Example: `"I need to tell you something. <whisper>It is a secret.</whisper> [laugh] Pretty cool, right?"`

## Response

Raw audio bytes — no JSON wrapper. Use `res.arrayBuffer()` or `res.content` directly.

## Browser BYOK pattern

```js
const res = await fetch('https://api.x.ai/v1/tts', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const blob = await res.blob();
const url  = URL.createObjectURL(blob);
new Audio(url).play();
```

Store key in `localStorage`. Never proxy — for client-side BYOK tools, the key goes directly to `api.x.ai` from the browser.

## Waveform from blob (Web Audio API)

```js
const ab  = await blob.arrayBuffer();
const ctx = new OfflineAudioContext(1, 1, 44100);
const buf = await ctx.decodeAudioData(ab);
const data = buf.getChannelData(0); // Float32Array of samples
```

Draw bars by chunking samples and taking max amplitude per chunk.

## Error codes

- 400 — bad voice name, unsupported format combo, or missing field
- 401 — invalid/missing key
- 429 — rate limited; backoff and retry
