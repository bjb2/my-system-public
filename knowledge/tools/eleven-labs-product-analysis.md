---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [tts, eleven-labs, product-analysis, ui-patterns, xai-playground, research]
---

# ElevenLabs Product Analysis

Research for informing xAI TTS playground decisions. What makes ElevenLabs feel premium, what's table stakes, what to borrow, what to skip.

---

## Product Suite Overview

ElevenLabs has reorganized under three product pillars:

**ElevenCreative** — Content generation

- Text-to-speech (playground + API)
- Voice cloning (Instant and Professional)
- Voice Design (prompt-to-voice)
- Studio (long-form audio/video editor)
- Sound effects generation
- Music generation
- Dubbing/translation
- AudioNative (reader app embed)

**ElevenAgents** — Conversational AI

- Omnichannel agents (phone, chat, email, WhatsApp)
- Built-in analytics, testing/simulation, workflow management

**ElevenAPI** — Developer surface

- TTS API, Speech-to-Text API (Scribe v2), Music API
- Python and JS SDKs
- WebSocket streaming

---

## Models

Three TTS models, each occupying a clear niche:

**Eleven v3** (`eleven_v3`)

- Most expressive, emotionally rich
- 70+ languages
- 5,000 character limit
- Latency: \~1-2s (not suitable for real-time)
- Key differentiator: Audio Tags (`[whispers]`, `[laughs]`, `[sighs]`, `[excited]`) for inline emotion control
- Multi-speaker Dialogue API (structured JSON → natural conversation with interruptions)
- Requires more prompt engineering; PVC quality lower than other models

**Eleven Multilingual v2** (`eleven_multilingual_v2`)

- Best for long-form consistency
- 29 languages
- 10,000 character limit
- Default model; most stable on long paragraphs

**Eleven Flash v2.5** (`eleven_flash_v2_5`)

- Real-time / conversational use
- \~75ms latency
- 32 languages
- 40,000 character limit
- 50% lower per-character pricing
- Used for agents and streaming applications

---

## Voice Parameters (API + Playground)

All configurable per-request via `voice_settings`:

- `stability` (0–1, default 0.5): consistency vs. emotional range. \~0.5 is recommended. Lower = more expressive, higher = monotone.
- `similarity_boost` (0–1, default 0.75): adherence to original voice. High values amplify artifacts if source audio is poor.
- `style` (0–1, default 0): voice style exaggeration. ElevenLabs themselves recommend keeping at 0. Increases compute.
- `speed` (0.7–1.2, default 1.0): speech rate.
- `use_speaker_boost` (bool, default true): enhances speaker similarity, adds latency. Not available for v3.

Additional API params:

- `seed` (int): deterministic output
- `previous_text`, `next_text`: prosody continuity across segments
- `pronunciation_dictionary_locators`: up to 3 dictionaries (CMU Arpabet or IPA)
- `apply_text_normalization`: "auto" | "on" | "off"
- `language_code`: ISO 639-1 override

---

## Output Formats

- **MP3**: `mp3_22050_32` through `mp3_44100_192`
- **PCM**: `pcm_8000` through `pcm_48000`
- **WAV**: `wav_8000` through `wav_48000`
- **Opus**: `opus_48000_32/64/96/128/192`
- **Telephony**: `alaw_8000`, `ulaw_8000`

Quality gated by plan: Free/Starter → 128kbps MP3. Pro+ → 192kbps MP3 or 44.1kHz WAV.

---

## Playground UI Patterns

### Text Input

- Plain text box; no rich editor
- Model-dependent character limits (5k, 10k, 40k)
- Audio Tags in v3 inline in text (`[whispers]`) — no separate SSML pane
- Break tags: `<break time="1.0s" />` style (up to 3s)

### Voice Selection

- Located at **bottom left** of screen — unconventional; most tools put it top-right
- Clicking opens voice picker with search + filters

### Controls Layout

- Model dropdown (Standard vs. Flash families, English vs. Multilingual)
- Speed slider (0.7–1.2)
- Voice settings panel: stability, similarity, style, speaker_boost sliders
- Docs recommend keeping style at 0; UI shows it anyway

### Generate Button

- Single action; streaming vs. batch not surfaced as explicit choice in playground
- Per-paragraph regeneration in Studio (2 free regenerations per para before credits charged)

### No visible character count or cost estimate in playground

- Studio shows credit cost before export though

---

## Voice Library

10,000+ voices, community marketplace model.

**Filters:**

- Language → Accent (nested)
- Category: Conversational, Narration, Characters, Social Media, Educational, Advertisement, Entertainment
- Gender: Male / Female / Neutral
- Age: Young / Middle Aged / Old
- Quality: Studio Quality (verified recording quality)
- Notice Period: how long before creator can remove voice
- Live Moderation: content filtering toggle

**Per-voice metadata:**

- Voice type icon: yellow tick (Pro Clone), black tick (Studio Quality Pro Clone), lightning (Instant Clone), no icon (Voice Design)
- Training language, category, notice period
- 70–150 char preview sample set by creator

**Key insight:** Voices saved from Voice Library don't use voice slots. Personal clones do.

**Sorting:** Trending, Latest, Most Users, Character Usage

---

## Voice Cloning

**Instant Voice Cloning (IVC)** — Starter+

- Upload audio → clone in seconds
- Lower quality, good for prototyping

**Professional Voice Cloning (PVC)** — Creator+

- Higher quality, longer training process
- Dedicated voice slot

**Voice Design**

- Text prompt → Guidance Scale (prompt adherence) + Loudness
- Generates 3 options simultaneously, charged only for preview text characters
- Pick one → saves to voice slot
- Prompt format: language, gender, age, quality, persona, emotion, delivery characteristics
- Avoid: "accent" (use intonation patterns instead), reverb/echo terminology

---

## Studio (Long-Form Editor)

Full DAW-like editor for audiobooks, podcasts, narrated video.

**Timeline & Tracks:**

- Narration, Music, SFX, Video tracks visible simultaneously
- Waveforms show loudness for level matching
- Trim, split, duplicate, zoom/pan controls
- Timing control between paragraphs and sentences

**Chapters Sidebar:**

- Auto-detected from imported documents
- Add, rename, remove, reorder (drag-and-drop)

**Paragraph-Level Controls:**

- Status bars: pale grey (not generated), dark grey (generated)
- Delivery settings per paragraph: stability, similarity, speed, volume, style
- Lock paragraph (prevents accidental changes)
- 2 free regenerations before credits charged (as long as voice/text unchanged)
- Actor Mode: provide reference recording for specific delivery target

**Generation History per paragraph:**

- Listen, download, restore any previous generation
- Delete is permanent (no undo)
- Narration only (not imported media)

**Collaboration:**

- Read-only share links
- Comments anchored to playhead position, threaded, email notifications

**Export:**

- Chapter or full project
- MP3 or WAV (quality gated by plan)
- Video format when video tracks present
- If all paragraphs already generated: no additional credits consumed

---

## Audio Player Component (Open Source)

ElevenLabs publishes `@elevenlabs/ui` on GitHub — shadcn/ui-based component library.

**AudioPlayer component:**

- Card-based design
- Left sidebar: track list
- Right: player controls
- Play/pause (with loading spinner during buffering)
- Progress slider (Radix UI Slider under hood)
- Current time / total duration display
- Speed dropdown (0.25x–2x, displays "Normal" at 1x)
- State managed via `AudioPlayerProvider` context

**Separate Waveform component** — not part of AudioPlayer

- Visualizes amplitude over time
- Live Waveform variant for real-time agent use cases

**Design stack:** React + Next.js + Tailwind + shadcn/ui + TypeScript

---

## Pricing & Credit Model

- 1 character = 1 credit (some models/plans 0.5x)
- Unused credits roll over up to 2 months

Plan$/moCreditsNotesFree010k3 Studio projectsStarter630kCommercial license, IVC, DubbingCreator11121kPVCPro99600k44.1kHz PCM, 192kbpsScale2991.8M3 seatsBusiness9906M10 seats, 5¢/min low-latency TTSEnterprisecustomcustomSSO, HIPAA, elevated concurrency

**What's free:** TTS, STT, Sound Effects, Voice Design, Music, basic Studio (3 projects) **Starter paywall:** Commercial license, IVC, Dubbing, 20 projects **Creator paywall:** PVC **Pro paywall:** High-quality audio output (PCM/192kbps) **Business paywall:** Per-minute pricing (not per-character), team seats

---

## BYOK / API Key UX

ElevenLabs doesn't implement BYOK in their own product — they ARE the API. Their key management is:

- Navigate sidebar → Developers → API Keys tab
- Standard create/revoke UI, no BYOK patterns

For an xAI BYOK playground, ElevenLabs gives no template to copy because the relationship is inverted (user brings xAI key to your tool vs. user managing their ElevenLabs key).

---

## Design System Observations

**What makes it feel premium:**

- **Dark-first UI**: Consistent across all surfaces, reduces fatigue for creators
- **shadcn/ui base**: Components are tight, well-spaced, not bloated
- **Contextual sidebar pattern**: Sidebar adapts to selection context (narration vs. media) — clean alternative to static settings panels
- **Loading states**: Spinner inside play button during buffering is a nice small touch
- **Voice type iconography**: Yellow/black ticks + lightning bolt — quick-scan signals without needing text labels
- **Card-based voice browsing**: Each voice as a card with preview button inline

**Notable design decisions:**

- Voice selection at bottom-left (unconventional — breaks expected top/right convention)
- Style slider always visible even though they recommend keeping it at 0 (honest about capability without hiding it)
- Two free regenerations then credit charge — prevents abuse without blocking iteration
- Comments anchored to playhead time — elegant for async review workflows

**Motion/animation:** Minimal — spinner on buffer, no gratuitous transitions. Feels tool-like, not marketing-like.

**Typography:** Clean sans-serif, tight hierarchy — legibility-first.

**Color palette:** Dark background, muted accents, with orange/amber brand color for CTAs. Not aggressive.

---

## What to Borrow for xAI TTS Playground

**High value, directly applicable:**

- **Speed slider** (0.7–1.2) — simple, maps directly to xAI/EL API params
- **Per-request voice settings** (stability, similarity) — surfaced as sliders even if advanced
- **Model dropdown** — simple selector showing name + latency/quality tradeoff
- **Output format selector** — expose MP3/PCM/WAV/Opus explicitly
- **Contextual defaults** with explanatory tooltips (e.g. "recommend 0" for style)
- **Speed dropdown on player** (0.25x–2x) — standard but done well
- **Loading state in play button** — small touch, high perceived quality

**Structural patterns worth borrowing:**

- Separate Waveform component from Audio Player (different jobs)
- Generation history per request (playback + download + re-generate from any prior)
- Character count display tied to model limit

**Audio tags (v3 style):** If xAI TTS supports emotion/tone tags, surfacing them inline in the text editor (not a separate SSML pane) is cleaner.

---

## Features That Are Overkill / Skip

- **Studio (full DAW)**: Way too heavy for a BYOK playground. Overkill unless you're building an audiobook product.
- **Voice Library / marketplace**: Requires a community. N/A for single-user BYOK tool.
- **Voice cloning**: Separate product, out of scope.
- **Dubbing**: Separate product, out of scope.
- **ElevenAgents**: Conversational AI infrastructure, different use case.
- **Collaboration / comments**: Team feature, overkill for personal BYOK.
- **PVC / IVC**: Voice management, not TTS playground.
- **Music / SFX generation**: Different product line.

---

## Gaps / Weaknesses in ElevenLabs' Approach

- **No cost estimate before generation in playground**: Studio shows it before export; playground doesn't. A simple "\~X credits" display would reduce surprises.
- **Voice selection UX is fragmented**: Playground voice picker is separate from Voice Library; managing personal vs. library voices requires navigating different sections.
- **Style slider at 0 is confusing**: Showing a control with a recommendation to keep it at 0 undermines trust. Better to hide it behind an "Advanced" toggle.
- **Character limit confusion**: Three models with three different limits (5k, 10k, 40k) isn't surfaced clearly until you hit the wall.
- **Speaker Boost unavailable for v3**: Creates inconsistency — settings change depending on model selection with no clear explanation in the UI.
- **PVC quality regression on v3**: Their most expressive model doesn't work well with their highest-quality voice clones. Acknowledged but unresolved.
- **Pricing page complexity**: 7 tiers with nested feature gates is hard to parse. A "what do I actually need" calculator would help.